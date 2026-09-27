import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  dialog,
  shell,
  globalShortcut,
  nativeImage,
  Menu,
  Tray,
} from "electron";
import path from "path";
import fs from "fs-extra";
import log from "electron-log";
import {
  autoUpdater,
  type ProgressInfo,
  type UpdateDownloadedEvent,
  type UpdateInfo,
} from "electron-updater";
import { spawn } from "child_process";
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
  DEFAULT_SERVER_PORT,
  getStorageDir,
  getRandomWallpaperImagePaths,
  patchSettings as patchSharedSettings,
  readSettings as readSharedSettings,
  setStorageRoot,
  stopServer as stopApiServer,
  warmupVectorService,
  type RendererChannel,
} from "../backend/server";
import { configureSettingsStore } from "../backend/settingsStore";
import {
  ensurePythonRuntime,
  getManagedPythonRuntimeDir,
} from "../backend/pythonRuntime";
import { t as translate } from "../shared/i18n/t";
import { normalizeLocale } from "../shared/i18n/locale";
import type { I18nKey, I18nParams, Locale } from "../shared/i18n/types";
import { debounce } from "radash";
import { WallpaperService } from "./wallpaperService";

const DEFAULT_WINDOW_ALWAYS_ON_TOP = false;

let mainWindow: BrowserWindow | null = null;
let galleryPreviewWindow: BrowserWindow | null = null;
let wallpaperTray: Tray | null = null;
let isAppHidden = false;
let localServerApiBaseUrl = `http://localhost:${DEFAULT_SERVER_PORT}`;
let isLocalServerReady = false;
const DEFAULT_TOGGLE_WINDOW_SHORTCUT =
  process.platform === "darwin" ? "Command+L" : "Ctrl+L";
const APP_ID = "com.picaptain.app";
const UPDATE_FEED_URL =
  "https://xget-5sd.pages.dev/gh/moayuisuda/OnlyRef/releases/latest/download";
const DEV_APP_UPDATE_CONFIG_FILE = "dev-app-update.yml";
const DEV_UPDATER_CACHE_DIR_NAME = "picaptain-updater";
const WINDOW_ICON_PATH = path.join(__dirname, "../resources/icon.png");
const STORAGE_ROOT_CONFIG_PATH = path.join(
  app.getPath("userData"),
  "picaptain_config.json",
);

let toggleWindowShortcut = DEFAULT_TOGGLE_WINDOW_SHORTCUT;

let isSettingsOpen = false;
let hasPendingSecondInstanceRestore = false;
let windowAlwaysOnTop = DEFAULT_WINDOW_ALWAYS_ON_TOP;
let cachedWindowBounds: Electron.Rectangle | null = null;
let isUpdaterInitialized = false;
let hasTriggeredStartupUpdateCheck = false;
let isQuitPrepared = false;
let quitPreparationPromise: Promise<void> | null = null;

function getLoginItemTarget(): { path: string; args: string[] } | undefined {
  if (!process.defaultApp) return undefined;
  return {
    path: process.execPath,
    args: [app.getAppPath()],
  };
}

function isLaunchAtLoginEnabled(): boolean {
  const settings = app.getLoginItemSettings(getLoginItemTarget());
  if (process.platform === "win32") {
    return settings.openAtLogin && settings.executableWillLaunchAtLogin;
  }
  return settings.openAtLogin;
}

function setLaunchAtLogin(enabled: boolean): boolean {
  if (process.platform !== "win32" && process.platform !== "darwin") {
    throw new Error("Launch at login is unsupported on this platform");
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
    enabled,
    ...getLoginItemTarget(),
  });
  return isLaunchAtLoginEnabled();
}

const wallpaperService = new WallpaperService({
  getDisplays: () => screen.getAllDisplays(),
  getPrimaryDisplay: () => screen.getPrimaryDisplay(),
  getStorageDir,
  getRandomImagePaths: getRandomWallpaperImagePaths,
  readSettings: readSharedSettings,
  patchSettings: patchSharedSettings,
  onStateChange: (state) => {
    mainWindow?.webContents.send("wallpaper-state", state);
    syncWallpaperTray(state.settings.enabled && state.supported);
  },
});

function syncWallpaperTray(enabled: boolean): void {
  if (!enabled) {
    wallpaperTray?.destroy();
    wallpaperTray = null;
    return;
  }
  if (wallpaperTray || !app.isReady()) return;

  const locale = normalizeLocale(app.getLocale());
  wallpaperTray = new Tray(WINDOW_ICON_PATH);
  wallpaperTray.setToolTip("PiCaptain");
  wallpaperTray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: translate(locale, "wallpaper.tray.open"),
        click: () => restoreMainWindowVisibility(),
      },
      {
        label: translate(locale, "wallpaper.tray.refresh"),
        click: () => {
          void wallpaperService.refresh();
        },
      },
      { type: "separator" },
      {
        label: translate(locale, "wallpaper.tray.quit"),
        click: () => app.quit(),
      },
    ]),
  );
  wallpaperTray.on("click", () => restoreMainWindowVisibility());
}

const NORMAL_WINDOW_MIN_WIDTH = 400;
const NORMAL_WINDOW_MIN_HEIGHT = 300;

type UpdaterStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "not-published"
  | "downloading"
  | "downloaded"
  | "error"
  | "unsupported";

type UpdaterState = {
  enabled: boolean;
  status: UpdaterStatus;
  currentVersion: string;
  latestVersion: string;
  downloadProgress: number;
  errorMessage: string;
};

const updaterState: UpdaterState = {
  enabled: false,
  status: "idle",
  currentVersion: "",
  latestVersion: "",
  downloadProgress: 0,
  errorMessage: "",
};

type PersistedSettings = Record<string, unknown> & {
  windowBounds?: Partial<Electron.Rectangle>;
  windowAlwaysOnTop?: boolean;
};

type GalleryPreviewWindowImage = {
  id: string;
  filename: string;
  imagePath: string;
};

type GalleryPreviewWindowPayload = {
  images: GalleryPreviewWindowImage[];
  activeImageId: string;
};

let galleryPreviewPayload: GalleryPreviewWindowPayload | null = null;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

const ensureSettingsStoreConfigured = (): void => {
  configureSettingsStore(path.join(getStorageDir(), "settings.json"));
};

async function hasPersistedStorageRoot(): Promise<boolean> {
  if (!(await lockedFs.pathExists(STORAGE_ROOT_CONFIG_PATH))) {
    return false;
  }

  try {
    const raw = await lockedFs.readJson<{ storageDir?: unknown }>(
      STORAGE_ROOT_CONFIG_PATH,
    );
    return typeof raw?.storageDir === "string" && raw.storageDir.trim().length > 0;
  } catch (error) {
    log.warn("Failed to read storage root config", error);
    return false;
  }
}

const normalizeComparablePath = (targetPath: string): string => {
  const resolved = path.resolve(targetPath).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

const isSameOrNestedPath = (parentPath: string, childPath: string): boolean => {
  const normalizedParent = normalizeComparablePath(parentPath);
  const normalizedChild = normalizeComparablePath(childPath);

  if (normalizedParent === normalizedChild) {
    return true;
  }

  const relative = path.relative(normalizedParent, normalizedChild);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const validateStorageRoot = (
  candidatePath: string,
): { valid: true } | { valid: false; installDir: string } => {
  const installDir = path.dirname(app.getPath("exe"));
  if (isSameOrNestedPath(installDir, candidatePath)) {
    return { valid: false, installDir };
  }
  return { valid: true };
};

async function chooseStorageRoot(
  locale: Locale = normalizeLocale(app.getLocale()),
  defaultPath?: string,
): Promise<string | null> {
  let nextDefaultPath = defaultPath;

  while (true) {
    const result = await dialog.showOpenDialog({
      title: translate(locale, "dialog.chooseStorageFolderTitle"),
      defaultPath: nextDefaultPath,
      properties: ["openDirectory", "createDirectory"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const dir = result.filePaths[0];
    const validation = validateStorageRoot(dir);
    if (!validation.valid) {
      await dialog.showMessageBox({
        type: "error",
        title: translate(locale, "dialog.invalidStorageFolderTitle"),
        message: translate(locale, "dialog.invalidStorageFolderMessage"),
        detail: translate(locale, "dialog.invalidStorageFolderDetail", {
          dir: validation.installDir,
        }),
      });
      nextDefaultPath = dir;
      continue;
    }

    await setStorageRoot(dir);
    return dir;
  }
}

async function getLocale(): Promise<Locale> {
  const systemLocale = normalizeLocale(app.getLocale());
  try {
    const settings = await readPersistedSettings();
    const raw = settings.language;
    return normalizeLocale(raw, systemLocale);
  } catch {
    return systemLocale;
  }
}

async function loadShortcuts(): Promise<void> {
  try {
    const settings = await readPersistedSettings();
    const rawToggle = settings.toggleWindowShortcut;
    if (typeof rawToggle === "string" && rawToggle.trim()) {
      toggleWindowShortcut = rawToggle.trim();
    }
  } catch {
    // ignore
  }
}

async function readPersistedSettings(): Promise<PersistedSettings> {
  try {
    ensureSettingsStoreConfigured();
    const settings = await readSharedSettings();
    if (settings && typeof settings === "object") {
      return settings as PersistedSettings;
    }
  } catch {
    // ignore
  }
  return {};
}

async function writePersistedSettings(
  patch: Partial<PersistedSettings>,
): Promise<void> {
  try {
    ensureSettingsStoreConfigured();
    await patchSharedSettings(patch);
  } catch (error) {
    log.error("Failed to write settings", error);
  }
}

function normalizeWindowBounds(
  bounds: Partial<Electron.Rectangle> | undefined,
): Electron.Rectangle {
  const workArea = screen.getPrimaryDisplay().workArea;
  const width = Math.max(
    NORMAL_WINDOW_MIN_WIDTH,
    Math.min(
      typeof bounds?.width === "number" ? bounds.width : Math.floor(workArea.width * 0.6),
      workArea.width,
    ),
  );
  const height = Math.max(
    NORMAL_WINDOW_MIN_HEIGHT,
    Math.min(
      typeof bounds?.height === "number" ? bounds.height : Math.floor(workArea.height * 0.8),
      workArea.height,
    ),
  );
  const fallbackX = workArea.x + Math.floor((workArea.width - width) / 2);
  const fallbackY = workArea.y + Math.floor((workArea.height - height) / 2);
  const display = screen.getDisplayMatching({
    x: typeof bounds?.x === "number" ? bounds.x : fallbackX,
    y: typeof bounds?.y === "number" ? bounds.y : fallbackY,
    width,
    height,
  });
  const area = display.workArea;
  const maxX = area.x + Math.max(0, area.width - width);
  const maxY = area.y + Math.max(0, area.height - height);

  return {
    width,
    height,
    x: Math.min(Math.max(typeof bounds?.x === "number" ? bounds.x : fallbackX, area.x), maxX),
    y: Math.min(Math.max(typeof bounds?.y === "number" ? bounds.y : fallbackY, area.y), maxY),
  };
}

const resolveDragImagePath = (imagePath: string): string => {
  if (path.isAbsolute(imagePath)) {
    return path.normalize(imagePath);
  }
  const normalizedRelativePath = imagePath.replace(/^[/\\]+/, "");
  return path.join(getStorageDir(), normalizedRelativePath);
};

const createDragPreviewIcon = (iconPath: string) => {
  const maxSide = 72;
  const source = nativeImage.createFromPath(iconPath);
  const icon = source.isEmpty()
    ? nativeImage.createFromPath(WINDOW_ICON_PATH)
    : source;
  const size = icon.getSize();

  if (size.width <= 0 || size.height <= 0) {
    return icon.resize({
      width: maxSide,
      height: maxSide,
      quality: "good",
    });
  }

  const scale = Math.min(maxSide / size.width, maxSide / size.height, 1);
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));

  return icon.resize({
    width,
    height,
    quality: "good",
  });
};

function cacheWindowBounds(bounds: Electron.Rectangle): Electron.Rectangle {
  const sourceBounds = mainWindow?.isMaximized()
    ? mainWindow.getNormalBounds()
    : bounds;
  const normalized = normalizeWindowBounds(sourceBounds);
  cachedWindowBounds = normalized;
  return normalized;
}

function resolveWindowBounds(settings: PersistedSettings): Electron.Rectangle {
  return normalizeWindowBounds(cachedWindowBounds ?? settings.windowBounds);
}

/*
// 当前只保留主窗口形态，窗口位置与尺寸始终按主窗口规则归一化。
function resolveWindowBounds(settings: PersistedSettings): Electron.Rectangle {
  return normalizeWindowBounds(cachedWindowBounds ?? settings.windowBounds);
}

*/

async function saveWindowBounds(
  bounds: Electron.Rectangle,
): Promise<Electron.Rectangle> {
  const nextBounds = cacheWindowBounds(bounds);
  await writePersistedSettings({
    windowBounds: nextBounds,
  });
  return nextBounds;
}

const debouncedSaveWindowBounds = debounce(
  { delay: 1000 },
  (bounds: Electron.Rectangle) => {
    void saveWindowBounds(bounds);
  },
);

function notifyWindowAlwaysOnTop(): void {
  if (!mainWindow) return;
  mainWindow.webContents.send(
    "renderer-event",
    "window-always-on-top",
    windowAlwaysOnTop,
  );
}

function syncWindowAppearance(alwaysOnTop: boolean): void {
  if (!mainWindow) return;

  // 使用 Electron 默认的浮层级别即可，过高层级会影响原生拖拽投放。
  mainWindow.setAlwaysOnTop(alwaysOnTop);
  mainWindow.setAlwaysOnTop(alwaysOnTop);
  mainWindow.setVisibleOnAllWorkspaces(alwaysOnTop, {
    visibleOnFullScreen: alwaysOnTop,
  });
  mainWindow.setResizable(true);
  mainWindow.setMaximizable(true);
  mainWindow.setFullScreenable(true);
  mainWindow.setMinimizable(true);
  mainWindow.setMinimumSize(
    NORMAL_WINDOW_MIN_WIDTH,
    NORMAL_WINDOW_MIN_HEIGHT,
  );
}

function applyWindowAlwaysOnTop(alwaysOnTop: boolean): void {
  if (!mainWindow || windowAlwaysOnTop === alwaysOnTop) return;

  windowAlwaysOnTop = alwaysOnTop;
  syncWindowAppearance(alwaysOnTop);
  notifyWindowAlwaysOnTop();
}

function loadMainWindow() {
  if (!mainWindow) return;
  const query = new URLSearchParams({
    apiBaseUrl: localServerApiBaseUrl,
  }).toString();
  if (!app.isPackaged) {
    log.info("Loading renderer from localhost");
    void mainWindow.loadURL(`http://localhost:5173/?${query}`);
  } else {
    const filePath = path.join(__dirname, "../dist-renderer/index.html");
    log.info("Loading renderer from file:", filePath);
    void mainWindow.loadFile(filePath, {
      query: {
        apiBaseUrl: localServerApiBaseUrl,
      },
    });
  }
}

function loadGalleryPreviewWindow(targetWindow: BrowserWindow) {
  const query = new URLSearchParams({
    apiBaseUrl: localServerApiBaseUrl,
    windowType: "gallery-preview",
  }).toString();

  if (!app.isPackaged) {
    void targetWindow.loadURL(`http://localhost:5173/?${query}`);
    return;
  }

  const filePath = path.join(__dirname, "../dist-renderer/index.html");
  void targetWindow.loadFile(filePath, {
    query: {
      apiBaseUrl: localServerApiBaseUrl,
      windowType: "gallery-preview",
    },
  });
}

function resolveGalleryPreviewBounds(): Electron.Rectangle {
  const sourceBounds = mainWindow?.getBounds();
  const display = sourceBounds
    ? screen.getDisplayMatching(sourceBounds)
    : screen.getPrimaryDisplay();
  const area = display.workArea;
  const width = Math.min(1280, Math.max(960, Math.floor(area.width * 0.72)));
  const height = Math.min(860, Math.max(680, Math.floor(area.height * 0.8)));

  return {
    width,
    height,
    x: area.x + Math.floor((area.width - width) / 2),
    y: area.y + Math.floor((area.height - height) / 2),
  };
}

function sendGalleryPreviewPayload(): void {
  if (!galleryPreviewWindow || galleryPreviewWindow.isDestroyed()) {
    return;
  }

  galleryPreviewWindow.webContents.send(
    "renderer-event",
    "gallery-preview-data",
    galleryPreviewPayload,
  );
}

function createGalleryPreviewWindow(): BrowserWindow {
  const bounds = resolveGalleryPreviewBounds();
  const previewWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 720,
    minHeight: 520,
    icon: WINDOW_ICON_PATH,
    show: false,
    center: true,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: "#0a0a0a",
    hasShadow: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  previewWindow.on("closed", () => {
    if (galleryPreviewWindow === previewWindow) {
      galleryPreviewWindow = null;
      galleryPreviewPayload = null;
    }
  });

  previewWindow.webContents.on("did-finish-load", () => {
    previewWindow.show();
    sendGalleryPreviewPayload();
  });

  previewWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      log.error(
        "Gallery preview failed to load:",
        errorCode,
        errorDescription,
        validatedURL,
      );
    },
  );

  loadGalleryPreviewWindow(previewWindow);
  return previewWindow;
}

function setupAutoUpdater() {
  void prepareAutoUpdater();
  return;
  /*
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
  */
}

function normalizeVersion(version: string) {
  return version.trim().replace(/^v/i, "");
}

function isAutoUpdateSupported() {
  return process.platform === "darwin" || process.platform === "win32";
}

function getDevAppUpdateConfigPath() {
  return path.join(app.getAppPath(), DEV_APP_UPDATE_CONFIG_FILE);
}

function buildDevAppUpdateConfig() {
  return [
    "provider: generic",
    `url: ${UPDATE_FEED_URL}`,
    `updaterCacheDirName: ${DEV_UPDATER_CACHE_DIR_NAME}`,
    "",
  ].join("\n");
}

async function ensureDevAppUpdateConfig() {
  if (app.isPackaged) return;
  const configPath = getDevAppUpdateConfigPath();
  const nextConfig = buildDevAppUpdateConfig();
  const currentConfig = await lockedFs
    .readFile(configPath, "utf-8")
    .then((content) => String(content))
    .catch(() => "");

  if (currentConfig === nextConfig) return;

  // electron-updater 开发模式固定读取 app 根目录下的 dev-app-update.yml。
  await lockedFs.writeFile(configPath, nextConfig, "utf-8");
}

function syncUpdaterCurrentVersion() {
  updaterState.currentVersion = normalizeVersion(app.getVersion());
}

function getUpdaterErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isMissingMacUpdateChannelError(message: string) {
  if (process.platform !== "darwin") return false;
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes("404") && normalizedMessage.includes("latest-mac.yml");
}

function emitToast(
  key: string,
  type: "success" | "error" | "warning" | "info",
  params?: Record<string, string | number>,
) {
  mainWindow?.webContents.send("toast", { key, type, params });
}

function emitUpdaterState() {
  syncUpdaterCurrentVersion();
  mainWindow?.webContents.send("updater-state", { ...updaterState });
}

function setUpdaterState(next: Partial<UpdaterState>) {
  Object.assign(updaterState, next);
  emitUpdaterState();
}

function applyUpdateInfoStatus(status: UpdaterStatus, info?: UpdateInfo) {
  const nextVersion =
    info && typeof info.version === "string" ? normalizeVersion(info.version) : "";
  setUpdaterState({
    enabled: true,
    status,
    latestVersion: nextVersion || updaterState.latestVersion,
    errorMessage: "",
  });
}

function applyUpdaterError(error: unknown) {
  const message = getUpdaterErrorMessage(error);

  if (isMissingMacUpdateChannelError(message)) {
    log.info("[updater] latest-mac.yml is not published yet");
    setUpdaterState({
      enabled: true,
      status: "not-published",
      latestVersion: "",
      downloadProgress: 0,
      errorMessage: "",
    });
    return { handled: true, message: "" };
  }

  log.error("[updater] error", message);
  setUpdaterState({
    enabled: true,
    status: "error",
    errorMessage: message,
  });
  return { handled: false, message };
}

function initializeAutoUpdater() {
  if (isUpdaterInitialized) {
    emitUpdaterState();
    return;
  }

  syncUpdaterCurrentVersion();
  const enabled = isAutoUpdateSupported();
  updaterState.enabled = enabled;
  updaterState.status = enabled ? "idle" : "unsupported";

  if (!enabled) {
    emitUpdaterState();
    return;
  }

  isUpdaterInitialized = true;
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.forceDevUpdateConfig = !app.isPackaged;
  autoUpdater.setFeedURL({
    provider: "generic",
    url: UPDATE_FEED_URL,
  });

  autoUpdater.on("checking-for-update", () => {
    setUpdaterState({
      enabled: true,
      status: "checking",
      errorMessage: "",
      downloadProgress: 0,
    });
  });

  autoUpdater.on("update-available", (info) => {
    applyUpdateInfoStatus("available", info);
  });

  autoUpdater.on("update-not-available", (info) => {
    applyUpdateInfoStatus("not-available", info);
    setUpdaterState({ downloadProgress: 0 });
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    setUpdaterState({
      enabled: true,
      status: "downloading",
      downloadProgress: Math.max(0, Math.min(100, progress.percent || 0)),
      errorMessage: "",
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateDownloadedEvent) => {
    applyUpdateInfoStatus("downloaded", info);
    setUpdaterState({ downloadProgress: 100 });
    emitToast("toast.updateDownloaded", "success", {
      version: normalizeVersion(info.version),
    });
  });

  autoUpdater.on("error", (error) => {
    applyUpdaterError(error);
  });

  emitUpdaterState();
}

async function prepareAutoUpdater() {
  initializeAutoUpdater();
  if (!updaterState.enabled) return;
  await ensureDevAppUpdateConfig();
}

async function checkForAppUpdates() {
  await prepareAutoUpdater();
  if (!updaterState.enabled) {
    return { success: false, error: "Auto update is unavailable" };
  }
  try {
    await autoUpdater.checkForUpdates();
    return { success: true };
  } catch (error) {
    const result = applyUpdaterError(error);
    if (result.handled) {
      return { success: true };
    }
    return { success: false, error: result.message };
  }
}

async function downloadAppUpdate() {
  await prepareAutoUpdater();
  if (!updaterState.enabled) {
    return { success: false, error: "Auto update is unavailable" };
  }
  if (updaterState.status === "downloaded") {
    return { success: true };
  }
  if (updaterState.status === "downloading") {
    return { success: true };
  }
  if (updaterState.status !== "available") {
    return { success: false, error: "No update is ready to download" };
  }
  try {
    setUpdaterState({
      enabled: true,
      status: "downloading",
      downloadProgress: 0,
      errorMessage: "",
    });
    log.info("[updater] download started");
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    const result = applyUpdaterError(error);
    return { success: false, error: result.message };
  }
}

async function quitAndInstallAppUpdate() {
  await prepareAutoUpdater();
  if (!updaterState.enabled) {
    return { success: false, error: "Auto update is unavailable" };
  }
  if (updaterState.status !== "downloaded") {
    return { success: false, error: "Downloaded update is unavailable" };
  }
  try {
    await prepareForAppQuit();
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true);
    });
  } catch (error) {
    const result = applyUpdaterError(error);
    return { success: false, error: result.message };
  }
  return { success: true };
}

async function prepareForAppQuit(): Promise<void> {
  if (isQuitPrepared) return;
  if (quitPreparationPromise) {
    await quitPreparationPromise;
    return;
  }

  quitPreparationPromise = (async () => {
    log.info("[shutdown] preparing application resources");
    globalShortcut.unregisterAll();
    wallpaperService.stop();
    wallpaperTray?.destroy();
    wallpaperTray = null;
    await stopApiServer();
    isQuitPrepared = true;
    log.info("[shutdown] application resources released");
  })();

  await quitPreparationPromise;
}

async function createWindow(options?: { load?: boolean }) {
  log.info("Creating main window...");
  isAppHidden = false;
  const settings = await readPersistedSettings();
  cachedWindowBounds = settings.windowBounds
    ? normalizeWindowBounds(settings.windowBounds)
    : null;
  windowAlwaysOnTop = settings.windowAlwaysOnTop === true;
  const windowState = resolveWindowBounds(settings);

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    icon: WINDOW_ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
    frame: false,
    transparent: false,
    backgroundColor: "#0a0a0a",
    alwaysOnTop: windowAlwaysOnTop,
    hasShadow: true,
  });

  syncWindowAppearance(windowAlwaysOnTop);

  mainWindow.on("close", (event) => {
    const wallpaperState = wallpaperService.getState();
    if (
      isQuitPrepared ||
      !wallpaperState.supported ||
      !wallpaperState.settings.enabled
    ) {
      return;
    }
    event.preventDefault();
    isAppHidden = true;
    mainWindow?.hide();
    mainWindow?.webContents.send("renderer-event", "app-visibility", false);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("resize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized() || mainWindow.isMaximized()) {
      return;
    }
    const bounds = mainWindow.getBounds();
    cacheWindowBounds(bounds);
    debouncedSaveWindowBounds(bounds);
  });
  mainWindow.on("move", () => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    cacheWindowBounds(bounds);
    debouncedSaveWindowBounds(bounds);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    log.info("Renderer process finished loading");
    notifyWindowAlwaysOnTop();
    emitUpdaterState();
  });

  // Open DevTools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      log.error(
        "Renderer process failed to load:",
        errorCode,
        errorDescription,
        validatedURL,
      );
    },
  );

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log.error("Renderer process gone:", details.reason, details.exitCode);
  });

  if (options?.load !== false) {
    loadMainWindow();
  }

  setupAutoUpdater();

  // 初始化自动更新
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
      const nextBounds = {
        x: bounds.x ?? current.x,
        y: bounds.y ?? current.y,
        width: bounds.width ?? current.width,
        height: bounds.height ?? current.height,
      };

      const normalized = normalizeWindowBounds(nextBounds);
      mainWindow.setBounds(normalized);
      cacheWindowBounds(normalized);
    },
  );

  ipcMain.handle("set-window-always-on-top", async (_event, value: unknown) => {
    try {
      if (typeof value !== "boolean") {
        throw new Error("Invalid always-on-top value");
      }

      applyWindowAlwaysOnTop(value);
      await writePersistedSettings({
        windowAlwaysOnTop: windowAlwaysOnTop,
      });
      return { success: true, alwaysOnTop: windowAlwaysOnTop };
    } catch (error) {
      log.error("Failed to switch always-on-top state", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        alwaysOnTop: windowAlwaysOnTop,
      };
    }
  });

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

  ipcMain.on("close-current-window", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
}

function toggleMainWindowVisibility() {
  if (!mainWindow) return;

  if (mainWindow.isMinimized() || isAppHidden) {
    restoreMainWindowVisibility();
    return;
  }

  isAppHidden = true;
  mainWindow.setIgnoreMouseEvents(true, { forward: false });
  mainWindow.webContents.send("renderer-event", "app-visibility", false);
}

function restoreMainWindowVisibility() {
  if (!mainWindow) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  isAppHidden = false;
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.webContents.send("renderer-event", "app-visibility", true);
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.focus();
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
  detailText?: string;
  mode?: "progress" | "selectStorage";
};

let currentEnvInitProgress: EnvInitProgressPayload = {
  isOpen: false,
  statusKey: "envInit.preparing",
  progress: 0,
  percentText: "0%",
  mode: "progress",
};

let startupInitializationPromise: Promise<void> | null = null;

function sendEnvInitProgress(
  parent: BrowserWindow,
  payload: EnvInitProgressPayload,
): void {
  currentEnvInitProgress = payload;
  if (parent.isDestroyed()) return;
  parent.webContents.send("env-init-progress", payload);
}

function makeEnvInitReporter(parent: BrowserWindow) {
  return (
    statusKey: I18nKey,
    progress: number,
    statusParams?: I18nParams,
    detailText?: string,
  ) => {
    const normalized = Math.max(0, Math.min(1, progress));
    sendEnvInitProgress(parent, {
      isOpen: true,
      statusKey,
      statusParams,
      detailText,
      progress: normalized,
      percentText: `${Math.round(normalized * 100)}%`,
      mode: "progress",
    });
  };
}

function closeEnvInitProgress(parent: BrowserWindow): void {
  currentEnvInitProgress = {
    isOpen: false,
    statusKey: "envInit.preparing",
    progress: 0,
    percentText: "0%",
    mode: "progress",
  };
  if (parent.isDestroyed()) return;
  parent.webContents.send("env-init-progress", currentEnvInitProgress);
}

function openStorageSelectionProgress(parent: BrowserWindow): void {
  sendEnvInitProgress(parent, {
    isOpen: true,
    statusKey: "envInit.selectStorage",
    progress: 0,
    percentText: "",
    detailText: "",
    mode: "selectStorage",
  });
}

function createStageReporter(
  report: (
    statusKey: I18nKey,
    progress: number,
    statusParams?: I18nParams,
    detailText?: string,
  ) => void,
  start: number,
  end: number,
) {
  const span = Math.max(0, end - start);
  return (
    statusKey: I18nKey,
    progress: number,
    statusParams?: I18nParams,
    detailText?: string,
  ) => {
    const normalized = Math.max(0, Math.min(1, progress));
    report(statusKey, start + span * normalized, statusParams, detailText);
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
  reportEnvInit("envInit.preparing", 0);

  // 1. Ensure uv
  console.log("Ensuring uv installation...");
  const uvPath = await ensureUvInstalled((statusKey, progress) => {
    reportEnvInit(statusKey, progress);
  });
  log.info("[python-init] uv ready:", uvPath);

  try {
    log.info("[python-init] ensuring managed runtime...");
    await ensurePythonRuntime(uvPath, reportEnvInit);
    log.info("[python-init] managed runtime ready.");
  } catch (error) {
    const locale = await getLocale();
    const pythonDir = getManagedPythonRuntimeDir();
    const detail =
      error instanceof Error && error.message
        ? `${error.message}\nDir: ${pythonDir}`
        : translate(locale, "dialog.pythonSetupFailedDetail", {
            code: -1,
            dir: pythonDir,
          });
    log.error("[python-init] runtime setup failed", error);
    closeEnvInitProgress(parent);
    await dialog.showMessageBox(parent, {
      type: "error",
      title: translate(locale, "dialog.pythonSetupFailedTitle"),
      message: translate(locale, "dialog.pythonSetupFailedMessage"),
      detail,
    });
    throw error instanceof Error ? error : new Error("Python setup failed");
  }

}

type EnsureModelReadyOptions = {
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
  const { reportProgress } = options;
  const modelDir = getModelDir();
  process.env.PROREF_MODEL_DIR = modelDir;
  const debug = process.env.PROREF_DEBUG_MODEL === "1";
  if (debug) console.log("[model] dir:", modelDir);

  const modelMissing = !(await hasRequiredModelFiles(modelDir));

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

  const uvPath = await ensureUvInstalled();
  const { runtimeDir: pythonDir, scriptPath, pythonPath } =
    await ensurePythonRuntime(uvPath);

  let percentText = "0%";
  let progress = 0;

  sendProgress("model.downloading", percentText, progress);

  const proc = spawn(
    pythonPath,
    [scriptPath, "--download-model"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: pythonDir,
      env: {
        ...process.env,
        PROREF_MODEL_DIR: modelDir,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
        TRANSFORMERS_VERBOSITY: "error",
        HF_HUB_DISABLE_PROGRESS_BARS: "1",
        HF_ENDPOINT: "https://hf-mirror.com",
        // Fix CUDA out of memory by avoiding fragmentation
        PYTORCH_ALLOC_CONF: "expandable_segments:True",
      },
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
      reportProgress: reportModelInit,
    });
    await delay(250);
  } finally {
    closeEnvInitProgress(parent);
  }
}

async function runStartupInitialization(parent: BrowserWindow): Promise<void> {
  if (startupInitializationPromise) {
    await startupInitializationPromise;
    return;
  }

  startupInitializationPromise = (async () => {
    log.info("Ensuring startup initialization...");
    await ensureStartupInitialization(parent);
    log.info("Startup initialization ready.");
    scheduleVectorServiceWarmup();
  })();

  try {
    await startupInitializationPromise;
  } finally {
    startupInitializationPromise = null;
  }
}

function scheduleVectorServiceWarmup(): void {
  void (async () => {
    try {
      await warmupVectorService();
      log.info("[vector-service] warmup ready.");
    } catch (error) {
      log.warn("[vector-service] warmup failed:", error);
    }
  })();
}

async function startServer() {
  const port = await startApiServer(
    (channel: RendererChannel, data: unknown) => {
      mainWindow?.webContents.send(channel, data);
    },
    {
      getState: () => wallpaperService.getState(),
      updateSettings: (settings) => wallpaperService.updateSettings(settings),
      refresh: () => wallpaperService.refresh(),
    },
  );
  localServerApiBaseUrl = `http://localhost:${port}`;
  isLocalServerReady = true;
  await wallpaperService.start();
  return port;
}

app.on("second-instance", () => {
  const restoreOrCreateWindow = () => {
    if (!mainWindow) {
      if (!isLocalServerReady) {
        hasPendingSecondInstanceRestore = true;
        return;
      }
      void createWindow();
      return;
    }
    restoreMainWindowVisibility();
  };

  if (!app.isReady()) {
    if (hasPendingSecondInstanceRestore) return;
    hasPendingSecondInstanceRestore = true;
    app.once("ready", () => {
      hasPendingSecondInstanceRestore = false;
      restoreOrCreateWindow();
    });
    return;
  }

  restoreOrCreateWindow();
});

ipcMain.handle("get-storage-dir", async () => {
  return getStorageDir();
});

ipcMain.handle("get-updater-state", async () => {
  initializeAutoUpdater();
  return { ...updaterState };
});

ipcMain.handle("check-app-update", async () => {
  return checkForAppUpdates();
});

ipcMain.handle("download-app-update", async () => {
  return downloadAppUpdate();
});

ipcMain.handle("quit-and-install-app-update", async () => {
  return quitAndInstallAppUpdate();
});

ipcMain.handle("get-env-init-progress", async () => {
  return currentEnvInitProgress;
});

ipcMain.handle("has-persisted-storage-root", async () => {
  return hasPersistedStorageRoot();
});

ipcMain.handle("open-storage-dir", async () => {
  const target = getStorageDir();
  const result = await shell.openPath(target);
  if (result) {
    return { success: false, error: result };
  }
  return { success: true };
});

ipcMain.handle("choose-storage-dir", async () => {
  const locale = await getLocale();
  const dir = await chooseStorageRoot(locale, getStorageDir());
  if (!dir) {
    return null;
  }

  app.relaunch();
  app.exit(0);
});

ipcMain.handle("choose-initial-storage-dir", async () => {
  const locale = normalizeLocale(app.getLocale());
  const dir = await chooseStorageRoot(locale);
  if (!dir) {
    if (mainWindow) {
      openStorageSelectionProgress(mainWindow);
    }
    return null;
  }

  if (!isLocalServerReady) {
    await startServer();
    if (mainWindow) {
      loadMainWindow();
    }
  }

  if (mainWindow) {
    void runStartupInitialization(mainWindow).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[startup] initialization failed:", message);
      log.error("[startup] initialization failed:", message);
      app.quit();
    });
  }

  return dir;
});

ipcMain.handle("choose-search-image", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      {
        name: "Images",
        extensions: [
          "jpg",
          "jpeg",
          "png",
          "webp",
          "gif",
          "bmp",
          "tiff",
          "tif",
          "heic",
          "heif",
          "avif",
        ],
      },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  return {
    path: filePath,
    name: path.basename(filePath),
  };
});

ipcMain.handle(
  "open-gallery-preview-window",
  async (_event, payload: unknown) => {
    try {
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid preview payload");
      }

      const raw = payload as {
        images?: unknown;
        activeImageId?: unknown;
      };

      if (
        !Array.isArray(raw.images) ||
        typeof raw.activeImageId !== "string" ||
        !raw.activeImageId.trim()
      ) {
        throw new Error("Invalid preview payload");
      }

      const images = raw.images.filter(
        (item): item is GalleryPreviewWindowImage =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as GalleryPreviewWindowImage).id === "string" &&
          typeof (item as GalleryPreviewWindowImage).filename === "string" &&
          typeof (item as GalleryPreviewWindowImage).imagePath === "string",
      );

      if (images.length === 0) {
        throw new Error("Preview images are empty");
      }

      if (!images.some((image) => image.id === raw.activeImageId)) {
        throw new Error("Active preview image is missing");
      }

      galleryPreviewPayload = {
        images,
        activeImageId: raw.activeImageId,
      };

      if (!galleryPreviewWindow || galleryPreviewWindow.isDestroyed()) {
        galleryPreviewWindow = createGalleryPreviewWindow();
      } else {
        sendGalleryPreviewPayload();
        if (!galleryPreviewWindow.isVisible()) {
          galleryPreviewWindow.show();
        }
        galleryPreviewWindow.focus();
      }

      return { success: true };
    } catch (error) {
      log.error("Failed to open gallery preview window", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

ipcMain.handle("get-gallery-preview-data", async () => {
  return galleryPreviewPayload;
});

ipcMain.handle("search-main-window-by-image", async (_event, payload: unknown) => {
  try {
    if (
      !payload ||
      typeof payload !== "object" ||
      typeof (payload as { imageId?: unknown }).imageId !== "string" ||
      typeof (payload as { previewUrl?: unknown }).previewUrl !== "string" ||
      typeof (payload as { previewName?: unknown }).previewName !== "string"
    ) {
      throw new Error("Invalid search payload");
    }

    const data = payload as {
      imageId: string;
      previewUrl: string;
      previewName: string;
    };

    if (mainWindow && !mainWindow.isDestroyed()) {
      restoreMainWindowVisibility();
      mainWindow.webContents.send(
        "renderer-event",
        "gallery-preview-search-image",
        data,
      );
    }

    return { success: true };
  } catch (error) {
    log.error("Failed to sync preview image search", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle(
  "start-image-drag",
  async (
    event,
    payload: { imagePath?: string; fallbackIconPath?: string } | null,
  ) => {
    try {
      const rawImagePath = payload?.imagePath?.trim();
      if (!rawImagePath) {
        return { success: false, error: "Missing image path" };
      }

      const filePath = resolveDragImagePath(rawImagePath);
      const fileExists = await lockedFs.pathExists(filePath);
      if (!fileExists) {
        return { success: false, error: "Image file does not exist" };
      }

      const preferredIconPath = payload?.fallbackIconPath?.trim()
        ? resolveDragImagePath(payload.fallbackIconPath.trim())
        : filePath;
      const iconPath = (await lockedFs.pathExists(preferredIconPath))
        ? preferredIconPath
        : WINDOW_ICON_PATH;
      const icon = createDragPreviewIcon(iconPath);

      event.sender.startDrag({
        file: filePath,
        icon,
      });

      return { success: true };
    } catch (error) {
      log.error("Failed to start image drag", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

app.whenReady().then(async () => {
  log.info("App starting...");
  log.info("Log file location:", log.transports.file.getFile().path);
  log.info("App path:", app.getAppPath());
  log.info("User data:", app.getPath("userData"));
  await prepareAutoUpdater();

  if (process.platform === "win32") {
    app.setAppUserModelId(APP_ID);
  }

  const hasStorageRoot = await hasPersistedStorageRoot();
  const taskLoadShortcuts = loadShortcuts();
  try {
    if (hasStorageRoot) {
      await Promise.all([taskLoadShortcuts, startServer()]);
    } else {
      await taskLoadShortcuts;
    }

    await createWindow();
    registerToggleWindowShortcut(toggleWindowShortcut);
    screen.on("display-added", () => wallpaperService.handleDisplaysChanged());
    screen.on("display-removed", () => wallpaperService.handleDisplaysChanged());
    screen.on("display-metrics-changed", () =>
      wallpaperService.handleDisplaysChanged(),
    );

    if (mainWindow) {
      if (hasStorageRoot) {
        await runStartupInitialization(mainWindow);
      } else {
        openStorageSelectionProgress(mainWindow);
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[startup] initialization failed:", message);
    log.error("[startup] initialization failed:", message);
    app.quit();
    return;
  }

  if (hasPendingSecondInstanceRestore) {
    hasPendingSecondInstanceRestore = false;
    restoreMainWindowVisibility();
  }

  if (!hasTriggeredStartupUpdateCheck) {
    hasTriggeredStartupUpdateCheck = true;
    void checkForAppUpdates();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().then(() => {
        emitUpdaterState();
      });
      return;
    }
    restoreMainWindowVisibility();
  });
});

ipcMain.handle(
  "set-toggle-window-shortcut",
  async (_event, accelerator: string) => {
    return registerToggleWindowShortcut(accelerator);
  },
);

ipcMain.handle("get-launch-at-login", () => {
  try {
    return { success: true, enabled: isLaunchAtLoginEnabled() };
  } catch (error) {
    log.error("Failed to read launch-at-login state", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      enabled: false,
    };
  }
});

ipcMain.handle("set-launch-at-login", (_event, enabled: unknown) => {
  let currentEnabled = false;
  try {
    currentEnabled = isLaunchAtLoginEnabled();
    if (typeof enabled !== "boolean") {
      throw new Error("Invalid launch-at-login value");
    }
    const appliedEnabled = setLaunchAtLogin(enabled);
    if (appliedEnabled !== enabled) {
      throw new Error("The operating system did not apply the requested state");
    }
    return { success: true, enabled: appliedEnabled };
  } catch (error) {
    log.error("Failed to update launch-at-login state", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      enabled: currentEnabled,
    };
  }
});

ipcMain.on("settings-open-changed", (_event, open: boolean) => {
  isSettingsOpen = Boolean(open);
});

app.on("before-quit", (event) => {
  if (isQuitPrepared) return;

  event.preventDefault();
  void prepareForAppQuit()
    .then(() => {
      app.quit();
    })
    .catch((error) => {
      log.error("[shutdown] failed to prepare app quit", error);
      app.exit(1);
    });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  const wallpaperState = wallpaperService.getState();
  if (
    process.platform !== "darwin" &&
    (!wallpaperState.supported || !wallpaperState.settings.enabled)
  ) {
    app.quit();
  }
});
// restart trigger 3
