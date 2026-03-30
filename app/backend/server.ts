import { app } from "electron";
import path from "path";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs-extra";
import https from "https";
import http from "http";
import { spawn, ChildProcess } from "child_process";
import readline from "readline";
import { createDatabase, StorageIncompatibleError, type ImageDb } from "./db";
import { debounce } from "radash";
import { createImagesRouter } from "./routes/images";
import { createTagsRouter } from "./routes/tags";
import { createSettingsRouter } from "./routes/settings";
import { createModelRouter } from "./routes/model";
import { lockedFs, withFileLock } from "./fileLock";
import { getDominantColor, calculateTone } from "./imageAnalysis";

export type RendererChannel =
  | "image-updated"
  | "search-updated"
  | "model-download-progress"
  | "indexing-progress"
  | "env-init-progress"
  | "toast";
export type SendToRenderer = (channel: RendererChannel, data: unknown) => void;

export const SERVER_PORT = 30001;
const CONFIG_FILE = path.join(app.getPath("userData"), "picaptain_config.json");

const DEFAULT_STORAGE_DIR = path.join(app.getPath("userData"), "picaptain_storage");

const loadStorageRoot = async (): Promise<string> => {
  // 1. Try reading from config file in userData
  try {
    if (await lockedFs.pathExists(CONFIG_FILE)) {
      const raw = await lockedFs
        .readJson<{ storageDir?: string }>(CONFIG_FILE)
        .catch(() => null);
      if (raw && typeof raw.storageDir === "string" && raw.storageDir.trim()) {
        return raw.storageDir;
      }
    }
  } catch {
    // ignore and fallback
  }

  // 2. Check if we are packaged and if the installation directory is writable
  // If so, default to using a "data" folder next to the executable
  // Skip on macOS to avoid modifying signed app bundles
  if (app.isPackaged && process.platform !== "darwin") {
    try {
      const exeDir = path.dirname(app.getPath("exe"));
      const portableDataDir = path.join(exeDir, "data");
      
      // If it already exists, use it
      if (await lockedFs.pathExists(portableDataDir)) {
        return portableDataDir;
      }

      // If not, check if we can write to the exe directory
      // We try to write a temporary file
      const testFile = path.join(exeDir, ".write_test");
      const writable = await withFileLock(testFile, async () => {
        try {
          await fs.writeFile(testFile, "test");
          await fs.remove(testFile);
          return true;
        } catch {
          return false;
        }
      });
      if (writable) {
        return portableDataDir;
      }
    } catch {
      // Ignore errors during detection
    }
  }

  // 3. Fallback to default userData storage
  return DEFAULT_STORAGE_DIR;
};

let STORAGE_DIR = DEFAULT_STORAGE_DIR;
let IMAGE_DIR = path.join(STORAGE_DIR, "images");
let SETTINGS_FILE = path.join(STORAGE_DIR, "settings.json");
let settingsCache: Record<string, unknown> | null = null;

const updateStoragePaths = (root: string) => {
  STORAGE_DIR = root;
  IMAGE_DIR = path.join(STORAGE_DIR, "images");
  SETTINGS_FILE = path.join(STORAGE_DIR, "settings.json");
};

const ensureStorageDirs = async (root: string) => {
  await Promise.all([
    lockedFs.ensureDir(root),
    lockedFs.ensureDir(path.join(root, "images")),
    lockedFs.ensureDir(path.join(root, "model")),
  ]);
};

export const getStorageDir = (): string => STORAGE_DIR;

export const setStorageRoot = async (root: string) => {
  const trimmed = root.trim();
  if (!trimmed) return;

  updateStoragePaths(trimmed);
  settingsCache = null;

  await ensureStorageDirs(STORAGE_DIR);
  await withFileLock(CONFIG_FILE, async () => {
    await fs.writeJson(CONFIG_FILE, { storageDir: STORAGE_DIR });
  });
  initDatabase();
};

const readSettings = async (): Promise<Record<string, unknown>> => {
  if (settingsCache) return settingsCache;

  return withFileLock(SETTINGS_FILE, async () => {
    if (!(await fs.pathExists(SETTINGS_FILE))) {
      settingsCache = {};
      return settingsCache;
    }
    try {
      const raw = await fs.readJson(SETTINGS_FILE);
      if (raw && typeof raw === "object") {
        settingsCache = raw as Record<string, unknown>;
        return settingsCache;
      }
    } catch (error) {
      console.error("Failed to read settings file", error);
    }
    settingsCache = {};
    return settingsCache;
  });
};

const persistSettings = debounce({ delay: 500 }, async (settings: Record<string, unknown>) => {
  await withFileLock(SETTINGS_FILE, async () => {
    try {
      await fs.writeJson(SETTINGS_FILE, settings);
    } catch (error) {
      console.error("Failed to write settings file", error);
    }
  });
});

const writeSettings = async (settings: Record<string, unknown>): Promise<void> => {
  settingsCache = settings;
  persistSettings(settings);
};

let imageDb: ImageDb | null = null;
let incompatibleError: StorageIncompatibleError | null = null;
let dbHandle: { close: () => void } | null = null;

const initDatabase = () => {
  const result = createDatabase(STORAGE_DIR);
  incompatibleError = result.incompatibleError;
  imageDb = result.imageDb;
  if (dbHandle && dbHandle !== result.db) {
    dbHandle.close();
  }
  dbHandle = result.db;
};

const initializeStorage = async () => {
  const root = await loadStorageRoot();
  updateStoragePaths(root);
  settingsCache = null;
  await ensureStorageDirs(STORAGE_DIR);
  initDatabase();
};

class BasePythonService {
  protected process: ChildProcess | null = null;
  protected queue: {
    resolve: (val: unknown) => void;
    reject: (err: Error) => void;
  }[] = [];
  protected serviceName: string = "Python Service";

  protected getManagedUvPath(): string {
    return path.join(
      app.getPath("userData"),
      "uv",
      process.platform === "win32" ? "uv.exe" : "uv",
    );
  }

  protected getBundledUvPath(): string {
    const executable = process.platform === "win32" ? "uv.exe" : "uv";
    const target = `${process.platform}-${process.arch}`;
    const root = app.isPackaged
      ? path.join(process.resourcesPath, "uv")
      : path.join(__dirname, "../resources/uv");
    return path.join(root, target, executable);
  }

  protected getUvCandidates(): string[] {
    const candidates: string[] = [];

    candidates.push(this.getBundledUvPath());

    const env = process.env.PROREF_UV_PATH?.trim();
    if (env) candidates.push(env);

    candidates.push(this.getManagedUvPath());

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

  protected attachProcess(proc: ChildProcess) {
    if (!proc.stdout) {
      console.error(`Failed to spawn ${this.serviceName} stdout`);
      return;
    }

    const rl = readline.createInterface({ input: proc.stdout });

    rl.on("line", (line: string) => {
      const task = this.queue.shift();
      if (task) {
        try {
          const res = JSON.parse(line) as unknown;
          task.resolve(res);
        } catch (e) {
          console.error(`JSON parse error from ${this.serviceName}:`, e);
          task.resolve({ error: "invalid-json" });
        }
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const output = data.toString();
      const lines = output.split(/\r?\n/).filter((l) => l.trim().length > 0);

      for (const line of lines) {
        const normalized = line.trim();
        const lower = normalized.toLowerCase();
        const cleaned = normalized.replace(/^\[(info|warn|warning|error)\]\s*/i, "");
        const cleanedWarning = cleaned.replace(/^warning:\s*/i, "");

        const isInfo =
          normalized.startsWith("[INFO]") ||
          normalized.includes("Python vector service started") ||
          normalized.includes("Model loaded");
        const isWarning =
          normalized.startsWith("[WARN]") ||
          normalized.startsWith("[WARNING]") ||
          lower.startsWith("warning:") ||
          lower.includes("warning:");
        const isError =
          normalized.startsWith("[ERROR]") ||
          lower.startsWith("error:") ||
          lower.includes("traceback") ||
          lower.includes("exception") ||
          lower.includes("os error");

        if (isError) {
          console.error(`[${this.serviceName} Error]`, cleaned);
        } else if (isWarning) {
          console.warn(`[${this.serviceName} Warning]`, cleanedWarning);
        } else if (isInfo) {
          console.log(`[${this.serviceName}]`, cleaned);
        } else {
          console.log(`[${this.serviceName}]`, normalized);
        }
      }
    });

    proc.on("exit", (code: number) => {
      console.log(`${this.serviceName} exited with code`, code);
      const pending = this.queue.splice(0, this.queue.length);
      for (const task of pending) {
        task.resolve(null);
      }
      if (this.process === proc) {
        this.process = null;
      }
      rl.close();
    });
  }

  protected spawnProcess(
    command: string,
    args: string[],
    cwd: string
  ): ChildProcess {
    const env = {
      ...process.env,
      PROREF_MODEL_DIR: path.join(getStorageDir(), "model"),
      // Use Aliyun mirror for PyPI (often more stable/accessible)
      UV_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
      // Also set PIP_INDEX_URL as fallback/standard
      PIP_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
      // Use HF mirror for model downloads
      HF_ENDPOINT: "https://hf-mirror.com",
    };

    const proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd,
      env,
    });
    this.attachProcess(proc);
    return proc;
  }

  start() {
    if (this.process) return;
    let scriptPath = path.join(__dirname, "../backend/python/tagger.py");
    if (app.isPackaged) {
      scriptPath = scriptPath.replace("app.asar", "app.asar.unpacked");
    }
    const pythonDir = path.dirname(scriptPath);

    const uvArgs = ["run", "python", scriptPath];
    const uvCandidates = this.getUvCandidates();

    const trySpawn = async (index: number) => {
      console.log(`Trying uv candidate ${index}: ${uvCandidates[index]}`);
      if (index >= uvCandidates.length) {
        console.error(`Failed to spawn ${this.serviceName}: uv not found`);
        this.process = null;
        return;
      }

      const command = uvCandidates[index];
      if (path.isAbsolute(command)) {
        const exists = await lockedFs.pathExists(command);
        if (!exists) {
          await trySpawn(index + 1);
          return;
        }
      }

      const proc = this.spawnProcess(command, uvArgs, pythonDir);
      this.process = proc;
      proc.once("error", (err) => {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          if (this.process === proc) {
            this.process = null;
          }
          trySpawn(index + 1);
          return;
        }
        console.error(`Failed to spawn ${this.serviceName}`, err);
        if (this.process === proc) {
          this.process = null;
        }
      });
    };

    void trySpawn(0);
  }

  protected async sendRequest(req: unknown): Promise<unknown> {
    if (!this.process) {
      this.start();
    }
    return new Promise<unknown>((resolve, reject) => {
      this.queue.push({ resolve, reject });
      if (this.process?.stdin) {
        this.process.stdin.write(JSON.stringify(req) + "\n");
      } else {
        resolve({ error: "stdin-unavailable" });
      }
    });
  }
}

class PythonVectorService extends BasePythonService {
  constructor() {
    super();
    this.serviceName = "Python Vector Service";
  }

  downloadModel(onProgress: (data: unknown) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      let scriptPath = path.join(__dirname, "../backend/python/tagger.py");
      if (app.isPackaged) {
        scriptPath = scriptPath.replace("app.asar", "app.asar.unpacked");
      }
      const pythonDir = path.dirname(scriptPath);

      const uvArgs = ["run", "python", scriptPath, "--download-model"];
      const uvCandidates = this.getUvCandidates();

      const trySpawn = async (index: number) => {
        if (index >= uvCandidates.length) {
          reject(new Error("Failed to spawn python service: uv not found"));
          return;
        }

        const command = uvCandidates[index];
        if (path.isAbsolute(command)) {
          const exists = await lockedFs.pathExists(command);
          if (!exists) {
            await trySpawn(index + 1);
            return;
          }
        }

        const env = {
          ...process.env,
          PROREF_MODEL_DIR: path.join(getStorageDir(), "model"),
          UV_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
          PIP_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
          HF_ENDPOINT: "https://hf-mirror.com",
        };

        const proc = spawn(command, uvArgs, {
          stdio: ["pipe", "pipe", "pipe"],
          cwd: pythonDir,
          env,
        });

        if (proc.stdout) {
          const rl = readline.createInterface({ input: proc.stdout });
          rl.on("line", (line: string) => {
            try {
              const res = JSON.parse(line);
              onProgress(res);
            } catch {
              // ignore non-json output
            }
          });
        }
        
        proc.stderr?.on("data", (data: Buffer) => {
          console.log("[Python Download]", data.toString());
        });

        proc.on("exit", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Download process exited with code ${code}`));
          }
        });

        proc.on("error", (err) => {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "ENOENT") {
            void trySpawn(index + 1);
            return;
          }
          reject(err);
        });
      };

      void trySpawn(0);
    });
  }

  async run(
    mode: "encode-image" | "encode-text",
    arg: string
  ): Promise<number[] | null> {
    const raw = await this.sendRequest({ mode, arg });

    if (!raw || typeof raw !== "object") {
      throw new Error("Invalid vector response");
    }
    const res = raw as { vector?: unknown; error?: unknown };
    if (res.error) {
      throw new Error(`Python error: ${String(res.error)}`);
    }
    if (Array.isArray(res.vector)) {
      const vector = res.vector as number[];
      return vector;
    }
    throw new Error("Vector missing");
  }
}

const mapModelDownloadProgress = (data: unknown): unknown => {
  if (!data || typeof data !== "object") return data;
  const d = data as Record<string, unknown>;
  const type = d.type;
  if (type === "error") {
    return { type: "error", reason: typeof d.message === "string" ? d.message : String(d.message ?? "") };
  }
  if (type === "weight-failed") {
    return {
      type: "weight-failed",
      filename: typeof d.filename === "string" ? d.filename : undefined,
      reason: typeof d.message === "string" ? d.message : String(d.message ?? ""),
    };
  }
  if (type === "retry") {
    return {
      type: "retry",
      filename: typeof d.filename === "string" ? d.filename : undefined,
      reason: typeof d.message === "string" ? d.message : String(d.message ?? ""),
      attempt: typeof d.attempt === "number" ? d.attempt : undefined,
      nextWaitSeconds: typeof d.nextWaitSeconds === "number" ? d.nextWaitSeconds : undefined,
    };
  }
  return data;
};

function downloadImage(url: string, dest: string): Promise<void> {
  return withFileLock(dest, () => new Promise((resolve, reject) => {
    if (url.startsWith("file://") || url.startsWith("/")) {
      let srcPath = url;
      if (url.startsWith("file://")) {
        srcPath = new URL(url).pathname;
        if (
          process.platform === "win32" &&
          srcPath.startsWith("/") &&
          srcPath.includes(":")
        ) {
          srcPath = srcPath.substring(1);
        }
      }

      srcPath = decodeURIComponent(srcPath);

      fs.copy(srcPath, dest)
        .then(() => resolve())
        .catch((err) => {
          fs.unlink(dest, () => {});
          reject(err);
        });
      return;
    }

    const file = fs.createWriteStream(dest);
    const client = url.startsWith("https") ? https : http;

    const request = client.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      } else {
        file.close();
        fs.unlink(dest, () => {});
        reject(
          new Error(
            `Server responded with ${response.statusCode}: ${response.statusMessage}`
          )
        );
      }
    });

    request.on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });

    file.on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  }));
}

export async function startServer(sendToRenderer?: SendToRenderer) {
  await initializeStorage();
  const server = express();
  server.use(cors());
  server.use(bodyParser.json({ limit: "25mb" }));

  const vectorService = new PythonVectorService();
  // Start vector service first and wait for it to be ready (includes env installation)
  await vectorService.start();

  const runPythonVector = async (
    mode: "encode-image" | "encode-text",
    arg: string
  ) => {
    return vectorService.run(mode, arg);
  };

  const runPythonDominantColor = async (arg: string) => {
    return getDominantColor(arg);
  };

  const runPythonTone = async (arg: string) => {
    return calculateTone(arg);
  };

  const sendRenderer = sendToRenderer;

  const logErrorToFile = async (
    error: unknown,
    req?: express.Request
  ) => {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    const payload = {
      timestamp: new Date().toISOString(),
      message,
      stack,
      method: req?.method,
      url: req?.originalUrl,
    };
    const logFile = path.join(STORAGE_DIR, "server.log");
    await withFileLock(logFile, async () => {
      await fs.ensureFile(logFile);
      await fs.appendFile(logFile, `${JSON.stringify(payload)}\n`);
    });
  };

  const getImageDb = () => {
    if (!imageDb) {
      initDatabase();
    }
    if (!imageDb) {
      throw new Error("Database is not initialized");
    }
    return imageDb;
  };

  server.use(createSettingsRouter({ readSettings, writeSettings }));
  server.use(
    createModelRouter({
      downloadModel: (onProgress) =>
        vectorService.downloadModel((data) => {
          onProgress(mapModelDownloadProgress(data));
        }),
      sendToRenderer: sendRenderer,
    })
  );
  server.use(
    createTagsRouter({
      getImageDb,
      getIncompatibleError: () => incompatibleError,
      readSettings,
      writeSettings,
    })
  );
  server.use(
    createImagesRouter({
      getImageDb,
      getIncompatibleError: () => incompatibleError,
      getStorageDir: () => STORAGE_DIR,
      getImageDir: () => IMAGE_DIR,
      readSettings,
      writeSettings,
      runPythonVector,
      runPythonDominantColor,
      runPythonTone,
      downloadImage,
      sendToRenderer: sendRenderer,
    })
  );

  server.use("/images", express.static(STORAGE_DIR));

  server.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const message = err instanceof Error ? err.message : String(err);
      void _next;
      void logErrorToFile(err, req);
      res.status(500).json({ error: "Unexpected error", details: message });
    }
  );

  server.listen(SERVER_PORT, () => {
    console.log(`Local server running on port ${SERVER_PORT}`);
  });

  return;
}
