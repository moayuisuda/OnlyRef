import { app, net } from "electron";
import path from "path";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs-extra";
import { spawn, ChildProcess } from "child_process";
import readline from "readline";
import { createDatabase, StorageIncompatibleError, type ImageDb } from "./db";
import { createImagesRouter } from "./routes/images";
import { createTagsRouter } from "./routes/tags";
import { createSettingsRouter } from "./routes/settings";
import { createModelRouter } from "./routes/model";
import { lockedFs, withFileLock } from "./fileLock";
import {
  configureSettingsStore,
  readSettings,
  writeSettings,
} from "./settingsStore";
import { getDominantColor, calculateTone } from "./imageAnalysis";
import { ensurePythonRuntime } from "./pythonRuntime";

export type RendererChannel =
  | "image-updated"
  | "search-updated"
  | "model-download-progress"
  | "indexing-progress"
  | "env-init-progress"
  | "toast";
export type SendToRenderer = (channel: RendererChannel, data: unknown) => void;

export const DEFAULT_SERVER_PORT = 30003;
const MAX_SERVER_PORT = 65535;
const API_HOSTNAME = "localhost";

const CONFIG_FILE = path.join(app.getPath("userData"), "picaptain_config.json");

const DEFAULT_STORAGE_DIR = path.join(
  app.getPath("userData"),
  "picaptain_storage",
);

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
configureSettingsStore(SETTINGS_FILE);

const updateStoragePaths = (root: string) => {
  STORAGE_DIR = root;
  IMAGE_DIR = path.join(STORAGE_DIR, "images");
  SETTINGS_FILE = path.join(STORAGE_DIR, "settings.json");
  configureSettingsStore(SETTINGS_FILE);
};

const ensureStorageDirs = async (root: string) => {
  await Promise.all([
    lockedFs.ensureDir(root),
    lockedFs.ensureDir(path.join(root, "images")),
    lockedFs.ensureDir(path.join(root, "model")),
  ]);
};

const persistStorageRootConfig = async (root: string) => {
  await withFileLock(CONFIG_FILE, async () => {
    await fs.writeJson(CONFIG_FILE, { storageDir: root });
  });
};

export const getStorageDir = (): string => STORAGE_DIR;
export { readSettings, writeSettings };

export const setStorageRoot = async (root: string) => {
  const trimmed = root.trim();
  if (!trimmed) return;

  updateStoragePaths(trimmed);

  await ensureStorageDirs(STORAGE_DIR);
  await persistStorageRootConfig(STORAGE_DIR);
  initDatabase();
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
  await ensureStorageDirs(STORAGE_DIR);
  // 固化当前存储根目录，避免后续启动再次依赖安装目录位置做推断。
  await persistStorageRootConfig(STORAGE_DIR);
  initDatabase();
};

class BasePythonService {
  protected process: ChildProcess | null = null;
  protected startupPromise: Promise<void> | null = null;
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

  protected async resolveUvCommand(): Promise<string> {
    const candidates = this.getUvCandidates();

    for (const candidate of candidates) {
      if (!path.isAbsolute(candidate)) {
        return candidate;
      }
      if (await lockedFs.pathExists(candidate)) {
        return candidate;
      }
    }

    throw new Error(`Failed to spawn ${this.serviceName}: uv not found`);
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
        const cleaned = normalized.replace(
          /^\[(info|warn|warning|error)\]\s*/i,
          "",
        );
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
    cwd: string,
    envOverrides: NodeJS.ProcessEnv = {},
    attachListeners: boolean = true,
  ): ChildProcess {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PROREF_MODEL_DIR: path.join(getStorageDir(), "model"),
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
      TRANSFORMERS_VERBOSITY: "error",
      HF_HUB_DISABLE_PROGRESS_BARS: "1",
      // Use Aliyun mirror for PyPI (often more stable/accessible)
      UV_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
      // Also set PIP_INDEX_URL as fallback/standard
      PIP_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
      // Use HF mirror for model downloads
      HF_ENDPOINT: "https://hf-mirror.com",
      ...envOverrides,
    };

    const proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd,
      env,
    });
    if (attachListeners) {
      this.attachProcess(proc);
    }
    return proc;
  }

  protected async spawnUvProcess(
    args: string[],
    cwd: string,
    envOverrides: NodeJS.ProcessEnv = {},
    attachListeners: boolean = true,
  ): Promise<ChildProcess> {
    const uvCandidates = this.getUvCandidates();

    const trySpawn = async (index: number): Promise<ChildProcess> => {
      console.log(`Trying uv candidate ${index}: ${uvCandidates[index]}`);
      if (index >= uvCandidates.length) {
        throw new Error(`Failed to spawn ${this.serviceName}: uv not found`);
      }

      const command = uvCandidates[index];
      if (path.isAbsolute(command)) {
        const exists = await lockedFs.pathExists(command);
        if (!exists) {
          return trySpawn(index + 1);
        }
      }

      return new Promise<ChildProcess>((resolve, reject) => {
        const proc = this.spawnProcess(
          command,
          args,
          cwd,
          envOverrides,
          attachListeners,
        );
        let settled = false;

        proc.once("spawn", () => {
          settled = true;
          resolve(proc);
        });

        proc.once("error", (err) => {
          const code = (err as NodeJS.ErrnoException).code;
          if (!settled && code === "ENOENT") {
            void trySpawn(index + 1).then(resolve).catch(reject);
            return;
          }
          reject(err);
        });
      });
    };

    return trySpawn(0);
  }

  async start(): Promise<void> {
    if (this.process) return;
    if (this.startupPromise) {
      await this.startupPromise;
      return;
    }

    this.startupPromise = (async () => {
      const uvPath = await this.resolveUvCommand();
      const { runtimeDir, scriptPath, pythonPath } = await ensurePythonRuntime(
        uvPath,
      );
      const proc = this.spawnProcess(pythonPath, [scriptPath], runtimeDir);
      this.process = proc;
    })();

    try {
      await this.startupPromise;
    } finally {
      this.startupPromise = null;
      if (!this.process) {
        // Keep the next start attempt retryable when spawn failed.
        this.startupPromise = null;
      }
    }
  }

  protected async sendRequest(req: unknown): Promise<unknown> {
    if (!this.process) {
      await this.start();
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
  private warmupPromise: Promise<void> | null = null;
  private warmedUp = false;

  constructor() {
    super();
    this.serviceName = "Python Vector Service";
  }

  protected override attachProcess(proc: ChildProcess) {
    super.attachProcess(proc);
    proc.once("exit", () => {
      this.warmedUp = false;
      this.warmupPromise = null;
    });
  }

  async warmup(): Promise<void> {
    if (this.warmedUp) {
      return;
    }
    if (this.warmupPromise) {
      await this.warmupPromise;
      return;
    }

    this.warmupPromise = (async () => {
      await this.start();
      await this.run("encode-text", "warmup");
      this.warmedUp = true;
    })();

    try {
      await this.warmupPromise;
    } finally {
      if (!this.warmedUp) {
        this.warmupPromise = null;
      }
    }
  }

  downloadModel(onProgress: (data: unknown) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const startDownload = async () => {
        const uvPath = await this.resolveUvCommand();
        const { runtimeDir, scriptPath, pythonPath } = await ensurePythonRuntime(
          uvPath,
        );
        const proc = this.spawnProcess(
          pythonPath,
          [scriptPath, "--download-model"],
          runtimeDir,
          {},
          false,
        );

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
      };

      void startDownload().catch(reject);
    });
  }

  async run(
    mode: "encode-image" | "encode-text",
    arg: string,
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

  async runBatchImages(
    paths: string[],
  ): Promise<{ vector: number[] | null; error?: string }[]> {
    if (paths.length === 0) return [];
    const raw = await this.sendRequest({ mode: "encode-images", arg: paths });

    if (!raw || typeof raw !== "object") {
      throw new Error("Invalid vector batch response");
    }

    const res = raw as { items?: unknown; error?: unknown };
    if (res.error) {
      throw new Error(`Python error: ${String(res.error)}`);
    }
    if (!Array.isArray(res.items)) {
      throw new Error("Vector batch items missing");
    }
    if (res.items.length !== paths.length) {
      throw new Error("Vector batch item count mismatch");
    }

    return res.items.map((item) => {
      if (!item || typeof item !== "object") {
        return { vector: null, error: "invalid-batch-item" };
      }
      const record = item as { vector?: unknown; error?: unknown };
      if (Array.isArray(record.vector)) {
        return { vector: record.vector as number[] };
      }
      return {
        vector: null,
        error:
          typeof record.error === "string"
            ? record.error
            : "vector-missing",
      };
    });
  }
}

const mapModelDownloadProgress = (data: unknown): unknown => {
  if (!data || typeof data !== "object") return data;
  const d = data as Record<string, unknown>;
  const type = d.type;
  if (type === "error") {
    return {
      type: "error",
      reason:
        typeof d.message === "string" ? d.message : String(d.message ?? ""),
    };
  }
  if (type === "weight-failed") {
    return {
      type: "weight-failed",
      filename: typeof d.filename === "string" ? d.filename : undefined,
      reason:
        typeof d.message === "string" ? d.message : String(d.message ?? ""),
    };
  }
  if (type === "retry") {
    return {
      type: "retry",
      filename: typeof d.filename === "string" ? d.filename : undefined,
      reason:
        typeof d.message === "string" ? d.message : String(d.message ?? ""),
      attempt: typeof d.attempt === "number" ? d.attempt : undefined,
      nextWaitSeconds:
        typeof d.nextWaitSeconds === "number" ? d.nextWaitSeconds : undefined,
    };
  }
  return data;
};

let vectorServiceSingleton: PythonVectorService | null = null;

const getVectorService = (): PythonVectorService => {
  if (!vectorServiceSingleton) {
    vectorServiceSingleton = new PythonVectorService();
  }
  return vectorServiceSingleton;
};

export const warmupVectorService = async (): Promise<void> => {
  await getVectorService().warmup();
};

function downloadImage(url: string, dest: string): Promise<void> {
  const REQUEST_TIMEOUT_MS = 15000;
  const MAX_RETRY_ATTEMPTS = 3;

  const copyFromLocalPath = async (targetUrl: string): Promise<void> => {
    let srcPath = targetUrl;
    if (targetUrl.startsWith("file://")) {
      srcPath = new URL(targetUrl).pathname;
      if (
        process.platform === "win32" &&
        srcPath.startsWith("/") &&
        srcPath.includes(":")
      ) {
        srcPath = srcPath.substring(1);
      }
    }
    await fs.copy(decodeURIComponent(srcPath), dest);
  };

  const isRetryableDownloadError = (error: Error): boolean => {
    const code = (error as NodeJS.ErrnoException).code;
    if (
      code === "ECONNRESET" ||
      code === "ETIMEDOUT" ||
      code === "ECONNABORTED" ||
      code === "EAI_AGAIN" ||
      code === "EPIPE" ||
      code === "ENETUNREACH"
    ) {
      return true;
    }
    return /socket hang up|timeout|network/i.test(error.message);
  };

  const requestRemoteOnce = async (targetUrl: string): Promise<void> => {
    const referer = (() => {
      try {
        return new URL(targetUrl).origin;
      } catch {
        return "";
      }
    })();

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await net.fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        signal: abortController.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 LookBack/1.0",
          Accept:
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          ...(referer ? { Referer: `${referer}/` } : {}),
          Connection: "close",
        },
      });
      if (!response.ok) {
        throw new Error(
          `Server responded with ${response.status}: ${response.statusText}`,
        );
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(dest, buffer);
    } catch (error) {
      await fs.remove(dest).catch(() => undefined);
      if (
        error instanceof Error &&
        (error.name === "AbortError" || /aborted/i.test(error.message))
      ) {
        throw new Error("Download timeout");
      }
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const requestRemote = async (targetUrl: string): Promise<void> => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
      try {
        await requestRemoteOnce(targetUrl);
        return;
      } catch (error) {
        const normalized =
          error instanceof Error ? error : new Error(String(error));
        lastError = normalized;
        const shouldRetry =
          attempt < MAX_RETRY_ATTEMPTS &&
          isRetryableDownloadError(normalized);
        if (!shouldRetry) {
          break;
        }
        await new Promise((resolve) => {
          setTimeout(resolve, attempt * 250);
        });
      }
    }

    throw lastError ?? new Error("Download failed");
  };

  return withFileLock(dest, async () => {
    if (url.startsWith("file://") || url.startsWith("/")) {
      await copyFromLocalPath(url);
      return;
    }
    await requestRemote(url);
  });
}

const listenOnAvailablePort = (
  appServer: express.Express,
  startPort: number,
): Promise<number> =>
  new Promise((resolve, reject) => {
    const tryListen = (port: number) => {
      if (port > MAX_SERVER_PORT) {
        reject(new Error("No available localhost port for local server"));
        return;
      }

      const httpServer = appServer.listen(port, API_HOSTNAME, () => {
        resolve(port);
      });

      httpServer.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          tryListen(port + 1);
          return;
        }
        reject(error);
      });
    };

    tryListen(startPort);
  });

export async function startServer(
  sendToRenderer?: SendToRenderer,
): Promise<number> {
  await initializeStorage();
  const server = express();
  server.use(cors());
  server.use(bodyParser.json({ limit: "25mb" }));

  const vectorService = getVectorService();

  const runPythonVector = async (
    mode: "encode-image" | "encode-text",
    arg: string,
  ) => {
    return vectorService.run(mode, arg);
  };

  const runPythonVectors = async (paths: string[]) => {
    return vectorService.runBatchImages(paths);
  };

  const runPythonDominantColor = async (arg: string) => {
    return getDominantColor(arg);
  };

  const runPythonTone = async (arg: string) => {
    return calculateTone(arg);
  };

  const sendRenderer = sendToRenderer;

  const logErrorToFile = async (error: unknown, req?: express.Request) => {
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
    }),
  );
  server.use(
    createTagsRouter({
      getImageDb,
      getIncompatibleError: () => incompatibleError,
      readSettings,
      writeSettings,
    }),
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
      runPythonVectors,
      runPythonDominantColor,
      runPythonTone,
      downloadImage,
      sendToRenderer: sendRenderer,
    }),
  );

  server.use("/images", express.static(STORAGE_DIR));

  server.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const message = err instanceof Error ? err.message : String(err);
      void _next;
      void logErrorToFile(err, req);
      res.status(500).json({ error: "Unexpected error", details: message });
    },
  );

  const port = await listenOnAvailablePort(server, DEFAULT_SERVER_PORT);
  console.log(`Local server running at http://${API_HOSTNAME}:${port}`);

  return port;
}
