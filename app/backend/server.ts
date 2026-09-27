import { app, net } from "electron";
import path from "path";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs-extra";
import { spawn, ChildProcess } from "child_process";
import type { Server as HttpServer } from "http";
import readline from "readline";
import { createDatabase, StorageIncompatibleError, type ImageDb } from "./db";
import { createImagesRouter } from "./routes/images";
import { createTagsRouter } from "./routes/tags";
import { createSettingsRouter } from "./routes/settings";
import { createModelRouter } from "./routes/model";
import {
  createWallpaperRouter,
  type WallpaperRouteHandlers,
} from "./routes/wallpaper";
import { lockedFs, withFileLock } from "./fileLock";
import {
  configureSettingsStore,
  patchSettings,
  readSettings,
  writeSettings,
} from "./settingsStore";
import {
  configureTagsStore,
  readTags,
  writeTags,
} from "./tagsStore";
import { getDominantColor, calculateTone } from "./imageAnalysis";
import { ensurePythonRuntime } from "./pythonRuntime";

export type RendererChannel =
  | "image-updated"
  | "search-updated"
  | "vector-service-status"
  | "model-download-progress"
  | "indexing-progress"
  | "env-init-progress"
  | "wallpaper-state"
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
const HTTP_SERVER_SHUTDOWN_TIMEOUT_MS = 1000;
const PROCESS_SHUTDOWN_TIMEOUT_MS = 2500;
const VECTOR_SERVICE_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

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

  // 2. Fallback to app userData storage
  return DEFAULT_STORAGE_DIR;
};

let STORAGE_DIR = DEFAULT_STORAGE_DIR;
let IMAGE_DIR = path.join(STORAGE_DIR, "images");
let SETTINGS_FILE = path.join(STORAGE_DIR, "settings.json");
let TAGS_FILE = path.join(STORAGE_DIR, "tags.json");
configureSettingsStore(SETTINGS_FILE);
configureTagsStore(TAGS_FILE);

const updateStoragePaths = (root: string) => {
  STORAGE_DIR = root;
  IMAGE_DIR = path.join(STORAGE_DIR, "images");
  SETTINGS_FILE = path.join(STORAGE_DIR, "settings.json");
  TAGS_FILE = path.join(STORAGE_DIR, "tags.json");
  configureSettingsStore(SETTINGS_FILE);
  configureTagsStore(TAGS_FILE);
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
export { patchSettings, readSettings, writeSettings };

export const getRandomWallpaperImagePaths = (count?: number): string[] => {
  if (!imageDb) {
    throw new Error("Database is not initialized");
  }
  return imageDb
    .listRandomImages(count)
    .map((image) => path.join(STORAGE_DIR, image.imagePath));
};

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
let activeHttpServer: HttpServer | null = null;
let activeServerPort: number | null = null;

const initDatabase = () => {
  const result = createDatabase(STORAGE_DIR);
  incompatibleError = result.incompatibleError;
  imageDb = result.imageDb;
  if (dbHandle && dbHandle !== result.db) {
    dbHandle.close();
  }
  dbHandle = result.db;
};

const closeDatabase = () => {
  if (!dbHandle) return;
  dbHandle.close();
  dbHandle = null;
  imageDb = null;
  incompatibleError = null;
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const waitForProcessExit = (
  proc: ChildProcess,
  timeoutMs: number,
): Promise<boolean> => {
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      proc.off("exit", onExit);
      resolve(false);
    }, timeoutMs);

    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };

    proc.once("exit", onExit);
  });
};

const forceKillChildProcess = async (
  proc: ChildProcess,
  processName: string,
): Promise<void> => {
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return;
  }

  if (process.platform === "win32" && typeof proc.pid === "number") {
    try {
      await new Promise<void>((resolve, reject) => {
        const killer = spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });

        killer.once("error", reject);
        killer.once("exit", (code) => {
          if (code === 0 || proc.exitCode !== null || proc.signalCode !== null) {
            resolve();
            return;
          }
          reject(new Error(`taskkill exited with code ${code}`));
        });
      });
    } catch (error) {
      if (await waitForProcessExit(proc, 100)) {
        return;
      }
      throw error;
    }
    return;
  }

  if (
    !proc.kill("SIGKILL") &&
    proc.exitCode === null &&
    proc.signalCode === null
  ) {
    throw new Error(`Failed to terminate ${processName}`);
  }
};

const stopChildProcess = async (
  proc: ChildProcess,
  processName: string,
): Promise<void> => {
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return;
  }

  try {
    proc.stdin?.end();
  } catch (error) {
    console.warn(`[${processName}] failed to close stdin`, error);
  }

  if (await waitForProcessExit(proc, PROCESS_SHUTDOWN_TIMEOUT_MS)) {
    return;
  }

  console.warn(`[${processName}] did not exit gracefully, terminating`);
  await forceKillChildProcess(proc, processName);
  if (!(await waitForProcessExit(proc, 1200))) {
    throw new Error(`${processName} did not exit after termination`);
  }
};

const closeHttpServer = async (httpServer: HttpServer): Promise<void> => {
  const closeTask = new Promise<void>((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  httpServer.closeIdleConnections?.();

  const closedGracefully = await Promise.race([
    closeTask.then(() => true),
    delay(HTTP_SERVER_SHUTDOWN_TIMEOUT_MS).then(() => false),
  ]);

  if (closedGracefully) return;

  console.warn("[server] active connections did not close gracefully");
  httpServer.closeAllConnections?.();
  await closeTask;
};

const initializeStorage = async () => {
  const root = await loadStorageRoot();
  updateStoragePaths(root);
  await ensureStorageDirs(STORAGE_DIR);
  // storageDir 只能在用户显式选择后持久化，启动阶段不做隐式写回。
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
  protected stopping = false;

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
      this.resolvePendingRequests();
      if (this.process === proc) {
        this.process = null;
      }
      rl.close();
    });
  }

  protected resolvePendingRequests() {
    const pending = this.queue.splice(0, this.queue.length);
    for (const task of pending) {
      task.resolve(null);
    }
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
      // Fix CUDA out of memory by avoiding fragmentation
      PYTORCH_ALLOC_CONF: "expandable_segments:True",
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
    if (this.stopping) {
      throw new Error(`${this.serviceName} is stopping`);
    }
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

  async stop(): Promise<void> {
    this.stopping = true;
    try {
      if (this.startupPromise) {
        await this.startupPromise.catch((error) => {
          console.warn(`${this.serviceName} startup failed during stop`, error);
        });
      }

      const proc = this.process;
      this.process = null;
      this.startupPromise = null;
      if (proc) {
        await stopChildProcess(proc, this.serviceName);
      }
      this.resolvePendingRequests();
    } finally {
      this.stopping = false;
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
  private modelDownloadProcess: ChildProcess | null = null;
  private activeRequestCount = 0;
  private idleStopTimer: NodeJS.Timeout | null = null;
  private idleStopPromise: Promise<void> | null = null;
  private warmupInProgress = false;
  private onWarmupStateChange: ((isWarming: boolean) => void) | null = null;

  constructor() {
    super();
    this.serviceName = "Python Vector Service";
  }

  setWarmupStateListener(
    listener: ((isWarming: boolean) => void) | null,
  ): void {
    this.onWarmupStateChange = listener;
  }

  private setWarmupInProgress(isWarming: boolean): void {
    if (this.warmupInProgress === isWarming) {
      return;
    }
    this.warmupInProgress = isWarming;
    try {
      this.onWarmupStateChange?.(isWarming);
    } catch (error) {
      console.error(`${this.serviceName} warmup status update failed`, error);
    }
  }

  private clearIdleStopTimer(): void {
    if (!this.idleStopTimer) {
      return;
    }
    clearTimeout(this.idleStopTimer);
    this.idleStopTimer = null;
  }

  private scheduleIdleStop(): void {
    this.clearIdleStopTimer();
    if (this.activeRequestCount > 0 || !this.process) {
      return;
    }

    this.idleStopTimer = setTimeout(() => {
      this.idleStopTimer = null;
      if (this.activeRequestCount > 0 || !this.process) {
        return;
      }

      const stopPromise = super.stop();
      this.idleStopPromise = stopPromise;
      void stopPromise
        .then(() => {
          console.log(
            `${this.serviceName} stopped after ${VECTOR_SERVICE_IDLE_TIMEOUT_MS / 60_000} minutes idle`,
          );
        })
        .catch((error) => {
          console.error(`${this.serviceName} idle stop failed`, error);
        })
        .finally(() => {
          if (this.idleStopPromise === stopPromise) {
            this.idleStopPromise = null;
          }
        });
    }, VECTOR_SERVICE_IDLE_TIMEOUT_MS);
  }

  protected override async sendRequest(req: unknown): Promise<unknown> {
    this.clearIdleStopTimer();
    this.activeRequestCount += 1;
    const ownsWarmupStatus =
      (!this.process || this.idleStopPromise !== null) &&
      !this.warmupInProgress;

    if (ownsWarmupStatus) {
      this.setWarmupInProgress(true);
    }

    try {
      if (this.idleStopPromise) {
        await this.idleStopPromise;
      }
      return await super.sendRequest(req);
    } finally {
      if (ownsWarmupStatus) {
        this.setWarmupInProgress(false);
      }
      this.activeRequestCount -= 1;
      this.scheduleIdleStop();
    }
  }

  downloadModel(onProgress: (data: unknown) => void): Promise<void> {
    if (this.modelDownloadProcess) {
      throw new Error("Model download is already running");
    }

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
        this.modelDownloadProcess = proc;

        const rl = proc.stdout
          ? readline.createInterface({ input: proc.stdout })
          : null;
        if (rl) {
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

        proc.once("error", (error) => {
          if (this.modelDownloadProcess === proc) {
            this.modelDownloadProcess = null;
          }
          rl?.close();
          reject(error);
        });

        proc.on("exit", (code) => {
          if (this.modelDownloadProcess === proc) {
            this.modelDownloadProcess = null;
          }
          rl?.close();
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

  override async stop(): Promise<void> {
    this.clearIdleStopTimer();
    if (this.idleStopPromise) {
      await this.idleStopPromise;
    }

    const downloadProc = this.modelDownloadProcess;
    this.modelDownloadProcess = null;
    if (downloadProc) {
      await stopChildProcess(downloadProc, "Python Model Download");
    }

    await super.stop();
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

  async runBatchTexts(
    texts: string[],
  ): Promise<{ vector: number[] | null; error?: string }[]> {
    if (texts.length === 0) return [];
    const raw = await this.sendRequest({ mode: "encode-texts", arg: texts });

    if (!raw || typeof raw !== "object") {
      throw new Error("Invalid text batch response");
    }

    const res = raw as { items?: unknown; error?: unknown };
    if (res.error) {
      throw new Error(`Python error: ${String(res.error)}`);
    }
    if (!Array.isArray(res.items)) {
      throw new Error("Text batch items missing");
    }
    if (res.items.length !== texts.length) {
      throw new Error("Text batch item count mismatch");
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
): Promise<{ port: number; httpServer: HttpServer }> =>
  new Promise((resolve, reject) => {
    const tryListen = (port: number) => {
      if (port > MAX_SERVER_PORT) {
        reject(new Error("No available localhost port for local server"));
        return;
      }

      const httpServer = appServer.listen(port, API_HOSTNAME, () => {
        resolve({ port, httpServer });
      });

      httpServer.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          httpServer.close();
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
  wallpaperHandlers?: WallpaperRouteHandlers,
): Promise<number> {
  if (activeHttpServer && activeServerPort !== null) {
    return activeServerPort;
  }

  await initializeStorage();
  const server = express();
  server.use(cors());
  server.use(bodyParser.json({ limit: "25mb" }));

  const vectorService = getVectorService();
  vectorService.setWarmupStateListener((isWarming) => {
    sendToRenderer?.("vector-service-status", { isWarming });
  });

  const runPythonVector = async (
    mode: "encode-image" | "encode-text",
    arg: string,
  ) => {
    return vectorService.run(mode, arg);
  };

  const runPythonVectors = async (paths: string[]) => {
    return vectorService.runBatchImages(paths);
  };

  const runPythonTexts = async (texts: string[]) => {
    return vectorService.runBatchTexts(texts);
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

  server.use(createSettingsRouter({ readSettings, patchSettings }));
  if (wallpaperHandlers) {
    server.use(createWallpaperRouter(wallpaperHandlers));
  }
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
      readTags,
      writeTags,
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
      readTags,
      writeTags,
      runPythonVector,
      runPythonVectors,
      runPythonTexts,
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

  const { port, httpServer } = await listenOnAvailablePort(
    server,
    DEFAULT_SERVER_PORT,
  );
  activeHttpServer = httpServer;
  activeServerPort = port;
  console.log(`Local server running at http://${API_HOSTNAME}:${port}`);

  return port;
}

export async function stopServer(): Promise<void> {
  const httpServer = activeHttpServer;
  activeHttpServer = null;
  activeServerPort = null;

  if (httpServer) {
    await closeHttpServer(httpServer);
  }

  await getVectorService().stop();
  closeDatabase();
}
