import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  dialog,
  shell,
  globalShortcut,
} from "electron";
import path from "path";
import fs from "fs-extra";
import log from "electron-log";
import { autoUpdater } from "electron-updater";
import { spawn, type ChildProcess } from "child_process";
import { lockedFs, withFileLock } from "../backend/fileLock";

// Ensure app name is correct for log paths
if (!app.isPackaged) {
  // In development, electron might use 'Electron' or 'app' as name
  app.setName("PiCaptain");
}

Object.assign(console, log.functions);
log.transports.file.level = "info";
// Set max log size to 5MB
log.transports.file.maxSize = 5 * 1024 * 1024;
// Explicitly define archive strategy: keep only one backup file
log.transports.file.archiveLog = (file) => {
  const filePath = file.toString();
  const info = path.parse(filePath);
  const dest = path.join(info.dir, info.name + ".old" + info.ext);

  // Use async lock even though callback is void
  lockedFs.rename(filePath, dest).catch((e) => {
    console.warn("Could not rotate log", e);
  });
};

import readline from "readline";
import https from "https";
import zlib from "zlib";
import {
  startServer as startApiServer,
  getStorageDir,
  setStorageRoot,
  type RendererChannel,
} from "../backend/server";
import { t as translate } from "../shared/i18n/t";
import type { I18nKey, I18nParams, Locale } from "../shared/i18n/types";
import { debounce } from "radash";

let mainWindow: BrowserWindow | null = null;
let isAppHidden = false;
let localeCache: { locale: Locale; mtimeMs: number } | null = null;
const DEFAULT_TOGGLE_WINDOW_SHORTCUT =
  process.platform === "darwin" ? "Command+L" : "Ctrl+L";

let toggleWindowShortcut = DEFAULT_TOGGLE_WINDOW_SHORTCUT;

let isSettingsOpen = false;

const isLocale = (value: unknown): value is Locale =>
  value === "en" || value === "zh";

async function getLocale(): Promise<Locale> {
  try {
    const settingsPath = path.join(getStorageDir(), "settings.json");
    const stat = await lockedFs.stat(settingsPath).catch(() => null);
    if (!stat) return "en";
    if (localeCache && localeCache.mtimeMs === stat.mtimeMs)
      return localeCache.locale;
    const settings = await lockedFs.readJson(settingsPath).catch(() => null);
    const raw =
      settings && typeof settings === "object"
        ? (settings as { language?: unknown }).language
        : undefined;
    const locale = isLocale(raw) ? raw : "en";
    localeCache = { locale, mtimeMs: stat.mtimeMs };
    return locale;
  } catch {
    return "en";
  }
}

async function loadShortcuts(): Promise<void> {
  try {
    const settingsPath = path.join(getStorageDir(), "settings.json");
    const settings = await lockedFs.readJson(settingsPath).catch(() => null);
    if (!settings || typeof settings !== "object") return;

    const rawToggle = (settings as Record<string, unknown>)
      .toggleWindowShortcut;
    if (typeof rawToggle === "string" && rawToggle.trim()) {
      toggleWindowShortcut = rawToggle.trim();
    }
  } catch {
    // ignore
  }
}

function loadMainWindow() {
  if (!mainWindow) return;
  if (!app.isPackaged) {
    log.info("Loading renderer from localhost");
    void mainWindow.loadURL("http://localhost:5173");
  } else {
    const filePath = path.join(__dirname, "../dist-renderer/index.html");
    log.info("Loading renderer from file:", filePath);
    void mainWindow.loadFile(filePath);
  }
}

function setupAutoUpdater() {
  autoUpdater.logger = log;
  // autoUpdater.logger.transports.file.level = 'info';

  // 自动下载更新
  autoUpdater.autoDownload = true;

  autoUpdater.on("checking-for-update", () => {
    log.info("Checking for update...");
  });

  autoUpdater.on("update-available", (info) => {
    log.info("Update available.", info);
    // 可以在这里通知渲染进程显示更新提示
    if (mainWindow) {
      mainWindow.webContents.send("update-available", info);
    }
  });

  autoUpdater.on("update-not-available", (info) => {
    log.info("Update not available.", info);
  });

  autoUpdater.on("error", (err) => {
    log.error("Error in auto-updater.", err);
  });

  autoUpdater.on("download-progress", (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + " - Downloaded " + progressObj.percent + "%";
    log_message =
      log_message +
      " (" +
      progressObj.transferred +
      "/" +
      progressObj.total +
      ")";
    log.info(log_message);
    if (mainWindow) {
      mainWindow.webContents.send("download-progress", progressObj);
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info("Update downloaded", info);
    // 可以在这里通知渲染进程提示用户重启
    if (mainWindow) {
      mainWindow.webContents.send("update-downloaded", info);
    }
    // 自动安装（可选，或者等待用户触发）
    // autoUpdater.quitAndInstall();
  });

  // 在打包环境下才检查更新
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }
}

async function saveWindowBounds() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized() || mainWindow.isMaximized()) return;
  try {
    const bounds = mainWindow.getBounds();
    const settingsPath = path.join(getStorageDir(), "settings.json");
    const settings = (await lockedFs
      .readJson(settingsPath)
      .catch(() => ({}))) as object;

    await lockedFs.writeJson(settingsPath, {
      ...settings,
      windowBounds: bounds,
    });
  } catch (e) {
    log.error("Failed to save window bounds", e);
  }
}

const debouncedSaveWindowBounds = debounce({ delay: 1000 }, saveWindowBounds);

async function createWindow(options?: { load?: boolean }) {
  log.info("Creating main window...");
  isAppHidden = false;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  let windowState: Partial<Electron.Rectangle> = {};
  try {
    const settingsPath = path.join(getStorageDir(), "settings.json");
    if (await lockedFs.pathExists(settingsPath)) {
      const settingsRaw = await lockedFs.readJson(settingsPath);
      if (settingsRaw && typeof settingsRaw === "object") {
        const settings = settingsRaw as {
          windowBounds?: Electron.Rectangle;
        };
        if (settings.windowBounds) {
          windowState = settings.windowBounds;
        }
      }
    }
  } catch (e) {
    log.error("Failed to load window bounds", e);
  }

  mainWindow = new BrowserWindow({
    width: windowState.width || Math.floor(width * 0.6),
    height: windowState.height || Math.floor(height * 0.8),
    x: windowState.x,
    y: windowState.y,
    icon: path.join(__dirname, "../resources/icon.svg"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
    frame: false,
    transparent: false,
    backgroundColor: "#0a0a0a",
    alwaysOnTop: false,
    hasShadow: true,
  });

  mainWindow.on("resize", debouncedSaveWindowBounds);
  mainWindow.on("move", debouncedSaveWindowBounds);

  mainWindow.webContents.on("did-finish-load", () => {
    log.info("Renderer process finished loading");
  });

  // Open DevTools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription, validatedURL) => {
      log.error(
        "Renderer process failed to load:",
        errorCode,
        errorDescription,
        validatedURL,
      );
    },
  );

  mainWindow.webContents.on("render-process-gone", (event, details) => {
    log.error("Renderer process gone:", details.reason, details.exitCode);
  });

  if (options?.load !== false) {
    loadMainWindow();
  }

  // 初始化自动更新
  setupAutoUpdater();

  ipcMain.on("window-min", () => mainWindow?.minimize());
  ipcMain.on("window-max", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on("window-close", () => mainWindow?.close());
  ipcMain.on("window-focus", () => mainWindow?.focus());

  ipcMain.on(
    "set-window-bounds",
    (_event, bounds: Partial<Electron.Rectangle>) => {
      if (!mainWindow) return;
      const current = mainWindow.getBounds();
      mainWindow.setBounds({
        x: bounds.x ?? current.x,
        y: bounds.y ?? current.y,
        width: bounds.width ?? current.width,
        height: bounds.height ?? current.height,
      });
    },
  );

  ipcMain.on("log-message", (_event, level: string, ...args: unknown[]) => {
    if (typeof log[level as keyof typeof log] === "function") {
      // @ts-expect-error dynamic log level access
      log[level](...args);
    } else {
      log.info(...args);
    }
  });

  ipcMain.handle("get-log-content", async () => {
    try {
      const logPath = log.transports.file.getFile().path;
      if (await lockedFs.pathExists(logPath)) {
        // Read last 50KB or so to avoid reading huge files
        const stats = await lockedFs.stat(logPath);
        const size = stats.size;
        const READ_SIZE = 50 * 1024; // 50KB
        const start = Math.max(0, size - READ_SIZE);

        return await withFileLock(logPath, () => {
          return new Promise<string>((resolve, reject) => {
            const stream = fs.createReadStream(logPath, {
              start,
              encoding: "utf8",
            });
            const chunks: string[] = [];
            stream.on("data", (chunk) => chunks.push(chunk.toString()));
            stream.on("end", () => resolve(chunks.join("")));
            stream.on("error", reject);
          });
        });
      }
      return "No log file found.";
    } catch (error) {
      log.error("Failed to read log file:", error);
      return `Failed to read log file: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  ipcMain.handle("open-external", async (_event, rawUrl: string) => {
    try {
      if (typeof rawUrl !== "string") {
        return { success: false, error: "Invalid URL" };
      }
      const url = new URL(rawUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { success: false, error: "Unsupported URL protocol" };
      }
      await shell.openExternal(url.toString());
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

function toggleMainWindowVisibility() {
  if (!mainWindow) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
    isAppHidden = false;
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.webContents.send("renderer-event", "app-visibility", true);
    mainWindow.focus();
    return;
  }

  if (isAppHidden) {
    isAppHidden = false;
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.webContents.send("renderer-event", "app-visibility", true);
    mainWindow.show();
    mainWindow.focus();
  } else {
    isAppHidden = true;
    mainWindow.setIgnoreMouseEvents(true, { forward: false });
    mainWindow.webContents.send("renderer-event", "app-visibility", false);
  }
}

function registerShortcut(
  accelerator: string,
  currentVar: string,
  updateVar: (val: string) => void,
  action: () => void,
  checkSettingsOpen: boolean = false,
): { success: boolean; error?: string; accelerator: string } {
  const next = typeof accelerator === "string" ? accelerator.trim() : "";
  if (!next) {
    return { success: false, error: "Empty shortcut", accelerator: currentVar };
  }

  const prev = currentVar;

  // Create a handler wrapper to check for settings open
  const handler = () => {
    if (checkSettingsOpen && isSettingsOpen && mainWindow?.isFocused()) {
      return;
    }
    action();
  };

  try {
    // If the new shortcut is different from old one, unregister old one
    if (prev !== next) {
      globalShortcut.unregister(prev);
    } else {
      // If same, we still might need to re-register to update handler if logic changed (unlikely here but safe)
      globalShortcut.unregister(prev);
    }

    const ok = globalShortcut.register(next, handler);
    if (!ok) {
      // If failed, try to restore old one
      if (prev !== next) {
        globalShortcut.unregister(next);
        globalShortcut.register(prev, handler); // Note: we re-register prev with SAME handler
      }
      return {
        success: false,
        error: "Shortcut registration failed",
        accelerator: prev,
      };
    }
    updateVar(next);
    return { success: true, accelerator: next };
  } catch (e) {
    if (prev !== next) {
      globalShortcut.unregister(next);
      globalShortcut.register(prev, handler);
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      accelerator: prev,
    };
  }
}

function registerToggleWindowShortcut(accelerator: string) {
  return registerShortcut(
    accelerator,
    toggleWindowShortcut,
    (v) => {
      toggleWindowShortcut = v;
    },
    toggleMainWindowVisibility,
    true,
  );
}

function getModelDir(): string {
  return path.join(getStorageDir(), "model");
}

async function hasRequiredModelFiles(modelDir: string): Promise<boolean> {
  const hasConfig = await lockedFs.pathExists(
    path.join(modelDir, "config.json"),
  );
  const hasWeights = await lockedFs.pathExists(
    path.join(modelDir, "model.safetensors"),
  );
  const hasProcessor = await lockedFs.pathExists(
    path.join(modelDir, "preprocessor_config.json"),
  );
  const hasTokenizer = await lockedFs.pathExists(
    path.join(modelDir, "tokenizer.json"),
  );
  return hasConfig && hasWeights && hasProcessor && hasTokenizer;
}

function getUvCandidates(): string[] {
  const candidates: string[] = [];

  const bundled = getBundledUvPath();
  if (bundled) candidates.push(bundled);

  const env = process.env.PROREF_UV_PATH?.trim();
  if (env) candidates.push(env);

  // 保留用户目录下的已管理 uv 作为次级来源
  candidates.push(getManagedUvPath());

  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (!c) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    uniq.push(c);
  }
  return uniq;
}

function spawnUvPython(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<ChildProcess> {
  const candidates = getUvCandidates();
  return new Promise((resolve, reject) => {
    const trySpawn = async (index: number) => {
      if (index >= candidates.length) {
        reject(new Error("uv not found"));
        return;
      }
      const command = candidates[index];
      if (path.isAbsolute(command)) {
        const exists = await lockedFs.pathExists(command);
        if (!exists) {
          trySpawn(index + 1);
          return;
        }
      }

      const proc = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        cwd,
        env,
      });
      proc.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") {
          trySpawn(index + 1);
          return;
        }
        reject(err);
      });
      resolve(proc);
    };
    trySpawn(0);
  });
}

function getManagedUvPath(): string {
  return path.join(
    app.getPath("userData"),
    "uv",
    process.platform === "win32" ? "uv.exe" : "uv",
  );
}

function getBundledUvPath(): string | null {
  const executable = process.platform === "win32" ? "uv.exe" : "uv";
  const target = `${process.platform}-${process.arch}`;
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "uv")
    : path.join(__dirname, "../resources/uv");
  return path.join(root, target, executable);
}

const UV_VERSION = "latest"; // Set to a specific tag like 'v0.5.5' to lock version

function resolveUvReleaseAsset(): { url: string; kind: "tar.gz" | "zip" } {
  const baseUrl = "https://xget-5sd.pages.dev/gh/astral-sh/uv/releases";
  const downloadPath =
    UV_VERSION === "latest" ? "latest/download" : `download/${UV_VERSION}`;
  const base = `${baseUrl}/${downloadPath}`;

  if (process.platform === "darwin") {
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
    return { url: `${base}/uv-${arch}-apple-darwin.tar.gz`, kind: "tar.gz" };
  }
  if (process.platform === "linux") {
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
    return {
      url: `${base}/uv-${arch}-unknown-linux-gnu.tar.gz`,
      kind: "tar.gz",
    };
  }
  if (process.platform === "win32") {
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
    return { url: `${base}/uv-${arch}-pc-windows-msvc.zip`, kind: "zip" };
  }
  throw new Error(`Unsupported platform: ${process.platform}`);
}

function extractTarFile(
  buffer: Buffer,
  predicate: (name: string) => boolean,
): Buffer | null {
  const block = 512;
  let offset = 0;
  while (offset + block <= buffer.length) {
    const header = buffer.subarray(offset, offset + block);
    let allZero = true;
    for (let i = 0; i < block; i++) {
      if (header[i] !== 0) {
        allZero = false;
        break;
      }
    }
    if (allZero) return null;

    const nameRaw = header.subarray(0, 100);
    const name = nameRaw.toString("utf8").replace(/\0.*$/, "");
    const sizeRaw = header
      .subarray(124, 136)
      .toString("utf8")
      .replace(/\0.*$/, "")
      .trim();
    const size = sizeRaw ? Number.parseInt(sizeRaw, 8) : 0;

    const contentOffset = offset + block;
    const contentEnd = contentOffset + size;
    if (contentEnd > buffer.length) return null;

    if (name && predicate(name)) {
      return buffer.subarray(contentOffset, contentEnd);
    }

    const padded = Math.ceil(size / block) * block;
    offset = contentOffset + padded;
  }
  return null;
}

function extractZipFile(
  buffer: Buffer,
  predicate: (name: string) => boolean,
): Buffer | null {
  const sigEOCD = 0x06054b50;
  const sigCD = 0x02014b50;
  const sigLFH = 0x04034b50;

  const readU16 = (o: number) => buffer.readUInt16LE(o);
  const readU32 = (o: number) => buffer.readUInt32LE(o);

  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 65557; i--) {
    if (readU32(i) === sigEOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const cdSize = readU32(eocd + 12);
  const cdOffset = readU32(eocd + 16);
  let ptr = cdOffset;
  const cdEnd = cdOffset + cdSize;
  while (ptr + 46 <= buffer.length && ptr < cdEnd) {
    if (readU32(ptr) !== sigCD) return null;
    const compression = readU16(ptr + 10);
    const compSize = readU32(ptr + 20);
    const uncompSize = readU32(ptr + 24);
    const nameLen = readU16(ptr + 28);
    const extraLen = readU16(ptr + 30);
    const commentLen = readU16(ptr + 32);
    const lfhOffset = readU32(ptr + 42);
    const name = buffer.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    ptr += 46 + nameLen + extraLen + commentLen;

    if (!predicate(name)) continue;
    if (readU32(lfhOffset) !== sigLFH) return null;
    const lfhNameLen = readU16(lfhOffset + 26);
    const lfhExtraLen = readU16(lfhOffset + 28);
    const dataOffset = lfhOffset + 30 + lfhNameLen + lfhExtraLen;
    const dataEnd = dataOffset + compSize;
    if (dataEnd > buffer.length) return null;
    const data = buffer.subarray(dataOffset, dataEnd);
    if (compression === 0) {
      if (uncompSize !== data.length) return data;
      return data;
    }
    if (compression === 8) {
      return zlib.inflateRawSync(data);
    }
    return null;
  }
  return null;
}

function downloadBuffer(
  url: string,
  onProgress?: (current: number, total: number) => void,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const visited = new Set<string>();
    const fetch = (u: string, depth: number) => {
      if (depth > 8) {
        reject(new Error("Too many redirects"));
        return;
      }
      if (visited.has(u)) {
        reject(new Error("Redirect loop"));
        return;
      }
      visited.add(u);

      const req = https.get(u, (res) => {
        const status = res.statusCode || 0;
        const loc = res.headers.location;
        if ([301, 302, 303, 307, 308].includes(status) && loc) {
          const next = loc.startsWith("http")
            ? loc
            : new URL(loc, u).toString();
          res.resume();
          fetch(next, depth + 1);
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }

        const total = parseInt(res.headers["content-length"] || "0", 10);
        let current = 0;
        const chunks: Buffer[] = [];
        res.on("data", (d: Buffer) => {
          chunks.push(d);
          current += d.length;
          if (total > 0 && onProgress) {
            onProgress(current, total);
          }
        });
        res.on("end", () => resolve(Buffer.concat(chunks)));
      });
      req.on("error", reject);
    };
    fetch(url, 0);
  });
}

type EnvInitProgressPayload = {
  isOpen: boolean;
  statusKey: I18nKey;
  progress: number;
  percentText: string;
  statusParams?: I18nParams;
};

function sendEnvInitProgress(
  parent: BrowserWindow,
  payload: EnvInitProgressPayload,
): void {
  if (parent.isDestroyed()) return;
  parent.webContents.send("env-init-progress", payload);
}

function makeEnvInitReporter(parent: BrowserWindow) {
  return (
    statusKey: I18nKey,
    progress: number,
    statusParams?: I18nParams,
  ) => {
    const normalized = Math.max(0, Math.min(1, progress));
    sendEnvInitProgress(parent, {
      isOpen: true,
      statusKey,
      statusParams,
      progress: normalized,
      percentText: `${Math.round(normalized * 100)}%`,
    });
  };
}

function closeEnvInitProgress(parent: BrowserWindow): void {
  if (parent.isDestroyed()) return;
  parent.webContents.send("env-init-progress", { isOpen: false });
}

function createStageReporter(
  report: (statusKey: I18nKey, progress: number, statusParams?: I18nParams) => void,
  start: number,
  end: number,
) {
  const span = Math.max(0, end - start);
  return (
    statusKey: I18nKey,
    progress: number,
    statusParams?: I18nParams,
  ) => {
    const normalized = Math.max(0, Math.min(1, progress));
    report(statusKey, start + span * normalized, statusParams);
  };
}

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function ensureUvInstalled(
  onProgress?: (statusKey: I18nKey, progress: number) => void,
): Promise<string> {
  const candidates = getUvCandidates();
  let existing = "";
  onProgress?.("envInit.checkingUv", 0.08);
  for (const c of candidates) {
    if (path.isAbsolute(c) && (await lockedFs.pathExists(c))) {
      existing = c;
      break;
    }
  }
  if (existing) return existing;

  const uvPath = getManagedUvPath();
  if (await lockedFs.pathExists(uvPath)) {
    process.env.PROREF_UV_PATH = uvPath;
    return uvPath;
  }

  await lockedFs.ensureDir(path.dirname(uvPath));
  const { url, kind } = resolveUvReleaseAsset();
  log.info(`Downloading uv from: ${url}`);
  onProgress?.("envInit.downloadingUv", 0.18);
  const buf = await downloadBuffer(url, (current, total) => {
    if (total <= 0) {
      onProgress?.("envInit.downloadingUv", 0.26);
      return;
    }
    const ratio = current / total;
    onProgress?.("envInit.downloadingUv", 0.18 + ratio * 0.22);
  });

  let binary: Buffer | null = null;
  if (kind === "tar.gz") {
    const tar = zlib.gunzipSync(buf);
    binary = extractTarFile(
      tar,
      (name) => name === "uv" || name.endsWith("/uv"),
    );
  } else {
    binary = extractZipFile(
      buf,
      (name) => name === "uv.exe" || name.endsWith("/uv.exe"),
    );
  }
  if (!binary) {
    throw new Error("Failed to extract uv binary");
  }

  await lockedFs.writeFile(uvPath, binary);
  if (process.platform !== "win32") {
    await withFileLock(uvPath, () => fs.chmod(uvPath, 0o755));
  }
  process.env.PROREF_UV_PATH = uvPath;
  return uvPath;
}

function getUnpackedPath(originalPath: string): string {
  if (app.isPackaged) {
    return originalPath.replace("app.asar", "app.asar.unpacked");
  }
  return originalPath;
}

async function preparePythonRuntime(
  parent: BrowserWindow,
  reportEnvInit: (
    statusKey: I18nKey,
    progress: number,
    statusParams?: I18nParams,
  ) => void,
): Promise<void> {
  const modelDir = getModelDir();
  process.env.PROREF_MODEL_DIR = modelDir; // Ensure env is set for sync if needed
  const scriptPath = getUnpackedPath(
    path.join(__dirname, "../backend/python/tagger.py"),
  );
  const pythonDir = path.dirname(scriptPath);

  reportEnvInit("envInit.preparing", 0);

  // 1. Ensure uv
  console.log("Ensuring uv installation...");
  await ensureUvInstalled((statusKey, progress) => {
    reportEnvInit(statusKey, progress);
  });

  // Check if we have a pre-packaged environment
  const venvPath = path.join(pythonDir, ".venv");
  if (app.isPackaged && (await lockedFs.pathExists(venvPath))) {
    console.log("Found pre-packaged python environment, skipping uv sync");
    reportEnvInit("envInit.pythonEnvReady", 1);
    await new Promise((resolve) => setTimeout(resolve, 200));
    return;
  }

  reportEnvInit("envInit.initializingPythonEnv", 0.42);

  // 2. uv sync
  const syncProc = await spawnUvPython(["sync", "--frozen"], pythonDir, {
    ...process.env,
    PROREF_MODEL_DIR: modelDir,
    UV_NO_COLOR: "1",
  });

  if (syncProc.stderr) {
    syncProc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      const lower = text.toLowerCase();
      console.log({ text: lower });

      if (lower.includes("resolved")) {
        reportEnvInit("envInit.resolvingDependencies", 0.58);
        return;
      }
      if (lower.includes("downloading")) {
        reportEnvInit("envInit.downloadingPackages", 0.72);
        return;
      }
      if (
        lower.includes("installed") ||
        lower.includes("installing") ||
        lower.includes("prepared")
      ) {
        reportEnvInit("envInit.installingPackages", 0.88);
        return;
      }
    });
  }

  const syncExit: number = await new Promise((resolve) =>
    syncProc.once("exit", resolve),
  );

  if (syncExit !== 0) {
    const locale = await getLocale();
    closeEnvInitProgress(parent);
    await dialog.showMessageBox(parent, {
      type: "error",
      title: translate(locale, "dialog.pythonSetupFailedTitle"),
      message: translate(locale, "dialog.pythonSetupFailedMessage"),
      detail: translate(locale, "dialog.pythonSetupFailedDetail", {
        code: syncExit,
        dir: pythonDir,
      }),
    });
    throw new Error("Python setup failed");
  }

  reportEnvInit("envInit.verifyingEnvironment", 0.96);
  reportEnvInit("envInit.pythonEnvReady", 1);
}

type EnsureModelReadyOptions = {
  force?: boolean;
  reportProgress?: (
    statusKey: I18nKey,
    progress: number,
    statusParams?: I18nParams,
  ) => void;
};

async function ensureModelReady(
  parent: BrowserWindow,
  options: EnsureModelReadyOptions = {},
): Promise<void> {
  const { force = false, reportProgress } = options;
  const modelDir = getModelDir();
  process.env.PROREF_MODEL_DIR = modelDir;
  const debug = process.env.PROREF_DEBUG_MODEL === "1";
  if (debug) console.log("[model] dir:", modelDir);

  const modelMissing = !(await hasRequiredModelFiles(modelDir));

  // Check if vector search is enabled
  if (!force) {
    try {
      const settingsPath = path.join(getStorageDir(), "settings.json");
      if (await lockedFs.pathExists(settingsPath)) {
        const settingsRaw = await lockedFs.readJson(settingsPath);
        if (settingsRaw && typeof settingsRaw === "object") {
          const settings = settingsRaw as {
            enableVectorSearch?: boolean;
          };
          if (!settings.enableVectorSearch) {
            if (debug)
              console.log(
                "[model] Vector search disabled, skipping model check",
              );
            return;
          }
        }
      } else {
        // Default is disabled if no settings file
        if (debug)
          console.log("[model] No settings file, skipping model check");
        return;
      }
    } catch (e) {
      console.error("[model] Failed to read settings:", e);
      if (!modelMissing) return;
    }
  }

  if (!modelMissing) {
    if (debug) console.log("[model] ok");
    reportProgress?.("model.ready", 1);
    return;
  }
  if (debug) console.log("[model] missing, start download");

  // Notify renderer to show modal
  const sendProgress = (
    statusKey: I18nKey,
    percentText: string,
    progress: number,
    filename?: string,
    statusParams?: I18nParams,
  ) => {
    if (reportProgress) {
      reportProgress(statusKey, progress, statusParams);
      return;
    }
    if (parent.isDestroyed()) return;
    parent.webContents.send("model-download-progress", {
      isOpen: true,
      statusKey,
      statusParams,
      percentText,
      progress,
      filename,
    });
  };

  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(precision)} ${units[index]}`;
  };

  sendProgress("model.preparingDownload", "0%", 0);
  parent.setProgressBar(0);

  const scriptPath = getUnpackedPath(
    path.join(__dirname, "../backend/python/tagger.py"),
  );
  const pythonDir = path.dirname(scriptPath);

  let percentText = "0%";
  let progress = 0;

  sendProgress("model.downloading", percentText, progress);

  const proc = await spawnUvPython(
    ["run", "python", scriptPath, "--download-model"],
    pythonDir,
    {
      ...process.env,
      PROREF_MODEL_DIR: modelDir,
    },
  );

  if (proc.stderr) {
    proc.stderr.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (debug && msg) console.log("[model] py:", msg);
    });
  }

  let lastProgress = 0;
  let lastError = "";

  if (proc.stdout) {
    const rl = readline.createInterface({ input: proc.stdout });
    rl.on("line", (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (debug) console.log("[model] evt:", trimmed);
      const evt = (() => {
        try {
          return JSON.parse(trimmed) as {
            type?: string;
            current?: number;
            total?: number;
            totalFiles?: number;
            filename?: string;
            ok?: boolean;
            message?: string;
            currentBytes?: number;
            totalBytes?: number;
            stepIndex?: number;
            totalSteps?: number;
          };
        } catch {
          return null;
        }
      })();
      if (!evt?.type) return;

      if (evt.type === "verify") {
        // verify event is just for checking if existing model is ok
        return;
      }

      if (
        evt.type === "file-progress" &&
        typeof evt.currentBytes === "number" &&
        typeof evt.totalBytes === "number" &&
        typeof evt.stepIndex === "number" &&
        typeof evt.totalSteps === "number"
      ) {
        const perFile =
          evt.totalBytes > 0 ? evt.currentBytes / evt.totalBytes : 0;
        const mapped = Math.max(
          0,
          Math.min(1, (evt.stepIndex - 1 + perFile) / evt.totalSteps),
        );
        progress = mapped;
        percentText = `${Math.round(mapped * 100)}%`;
        lastProgress = mapped;
        sendProgress(
          "model.downloadingFraction",
          percentText,
          progress,
          evt.filename,
          {
            current: formatBytes(evt.currentBytes),
            total: formatBytes(evt.totalBytes),
          },
        );
        return;
      }

      if (
        evt.type === "file" &&
        typeof evt.current === "number" &&
        typeof evt.total === "number"
      ) {
        const p = Math.max(0, Math.min(1, evt.current / evt.total));
        const mapped = p; // 0-1
        progress = mapped;
        percentText = `${Math.round(mapped * 100)}%`;
        lastProgress = p;
      }

      if (evt.type === "done" && evt.ok) {
        progress = 1;
        percentText = "100%";
      }

      if (evt.type === "error" && typeof evt.message === "string") {
        progress = Math.max(progress, 0);
        lastError = evt.message;
      }

      if (
        evt.type === "file" &&
        typeof evt.current === "number" &&
        typeof evt.total === "number"
      ) {
        sendProgress(
          "model.downloadingFraction",
          percentText,
          progress,
          evt.filename,
          { current: evt.current, total: evt.total },
        );
        return;
      }

      if (evt.type === "done" && evt.ok) {
        sendProgress("model.ready", percentText, progress, evt.filename);
        return;
      }

      if (evt.type === "error") {
        const reason = typeof evt.message === "string" ? evt.message : "";
        sendProgress(
          reason ? "model.downloadFailedWithReason" : "model.downloadFailed",
          percentText,
          progress,
          evt.filename,
          reason ? { reason } : undefined,
        );
        return;
      }

      if (evt.type === "start") {
        sendProgress(
          "model.preparingDownload",
          percentText,
          progress,
          evt.filename,
        );
        return;
      }

      sendProgress("model.downloading", percentText, progress, evt.filename);
    });
  }

  const exitCode: number = await new Promise((resolve) =>
    proc.once("exit", resolve),
  );
  parent.setProgressBar(-1);
  if (!reportProgress) {
    parent.webContents.send("model-download-progress", { isOpen: false });
  }

  const ok = await hasRequiredModelFiles(modelDir);
  if (debug) console.log("[model] download exit:", exitCode, "ok:", ok);

  if (exitCode !== 0 || !ok) {
    const locale = await getLocale();
    await dialog.showMessageBox(parent, {
      type: "error",
      title: translate(locale, "dialog.modelDownloadFailedTitle"),
      message: translate(locale, "dialog.modelDownloadFailedMessage"),
      detail:
        (lastError ? `Error: ${lastError}\n\n` : "") +
        translate(locale, "dialog.modelDownloadFailedDetail", {
          code: exitCode,
          progress: Math.round(lastProgress * 100),
          dir: modelDir,
        }),
    });
    throw new Error("Model download failed");
  }
}

async function ensureStartupInitialization(parent: BrowserWindow): Promise<void> {
  const reportEnvInit = makeEnvInitReporter(parent);
  const reportPythonInit = createStageReporter(reportEnvInit, 0, 0.68);
  const reportModelInit = createStageReporter(reportEnvInit, 0.68, 1);

  try {
    await preparePythonRuntime(parent, reportPythonInit);
    await ensureModelReady(parent, {
      force: true,
      reportProgress: reportModelInit,
    });
    await delay(250);
  } finally {
    closeEnvInitProgress(parent);
  }
}

async function startServer() {
  return startApiServer((channel: RendererChannel, data: unknown) => {
    mainWindow?.webContents.send(channel, data);
  });
}

ipcMain.handle("get-storage-dir", async () => {
  return getStorageDir();
});

ipcMain.handle("choose-storage-dir", async () => {
  const locale = await getLocale();
  const result = await dialog.showOpenDialog({
    title: translate(locale, "dialog.chooseStorageFolderTitle"),
    properties: ["openDirectory", "createDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const dir = result.filePaths[0];
  await setStorageRoot(dir);
  app.relaunch();
  app.exit(0);
});

app.whenReady().then(async () => {
  log.info("App starting...");
  log.info("Log file location:", log.transports.file.getFile().path);
  log.info("App path:", app.getAppPath());
  log.info("User data:", app.getPath("userData"));

  const taskLoadShortcuts = loadShortcuts();
  const taskCreateWindow = createWindow();
  // Start server early, but handle errors later
  const taskStartServer = startServer();

  await Promise.all([taskLoadShortcuts, taskCreateWindow]);

  registerToggleWindowShortcut(toggleWindowShortcut);

  if (mainWindow) {
    try {
      await taskStartServer;
      log.info("Ensuring startup initialization...");
      await ensureStartupInitialization(mainWindow);
      log.info("Startup initialization ready.");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[startup] initialization failed:", message);
      log.error("[startup] initialization failed:", message);
      app.quit();
      return;
    }
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

ipcMain.handle(
  "set-toggle-window-shortcut",
  async (_event, accelerator: string) => {
    return registerToggleWindowShortcut(accelerator);
  },
);

ipcMain.on("settings-open-changed", (_event, open: boolean) => {
  isSettingsOpen = Boolean(open);
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
// restart trigger 3
