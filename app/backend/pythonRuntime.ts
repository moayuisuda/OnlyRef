import { spawn as spawnProcess } from "child_process";
import { createHash } from "crypto";
import { app } from "electron";
import { spawn as spawnPty } from "@lydell/node-pty";
import log from "electron-log";
import path from "path";
import { lockedFs } from "./fileLock";
import type { I18nKey, I18nParams } from "../shared/i18n/types";

const PYTHON_RUNTIME_DIR_NAME = "python-runtime";
const PYTHON_RUNTIME_FILES = ["requirements.lock.txt", "tagger.py"] as const;
const RUNTIME_STATE_FILE_NAME = "runtime-state.json";
const RUNTIME_VENV_DIR_NAME = ".venv";
const RUNTIME_STAGING_VENV_DIR_NAME = ".venv.next";
const RUNTIME_BACKUP_VENV_DIR_NAME = ".venv.prev";
const RUNTIME_UV_CACHE_DIR_NAME = ".uv-cache";
const RUNTIME_STATE_VERSION = 1;
const PYPI_INDEX_URL = "https://mirrors.aliyun.com/pypi/simple/";

type PythonRuntimeFile = (typeof PYTHON_RUNTIME_FILES)[number];
type TorchBackend = "auto" | "cpu";

type CommandResult = {
  stdout: string;
  stderr: string;
};

type CommandCallbacks = {
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
};

type PythonRuntimeProgressReporter = (
  statusKey: I18nKey,
  progress: number,
  statusParams?: I18nParams,
  detailText?: string,
) => void;

type GpuDetectionResult = {
  torchBackend: TorchBackend;
  supported: boolean;
  gpuName: string | null;
  driverVersion: string | null;
  cudaVersion: string | null;
  reason: string;
};

type InstalledTorchInfo = {
  pythonVersion: string;
  torchVersion: string | null;
  torchBackendBuilt: boolean;
  cudaAvailable: boolean;
  cudaDeviceCount: number;
  device: string;
};

type RuntimeState = {
  version: number;
  platform: NodeJS.Platform;
  arch: string;
  requirementsHash: string;
  torchBackend: TorchBackend;
  gpuFallback: boolean;
  gpu: GpuDetectionResult;
  installedTorch: InstalledTorchInfo;
  updatedAt: string;
};

export type PythonRuntime = {
  runtimeDir: string;
  scriptPath: string;
  pythonPath: string;
  state: RuntimeState;
};

let runtimePromise: Promise<PythonRuntime> | null = null;

const getUnpackedPath = (targetPath: string): string => {
  if (!app.isPackaged) return targetPath;
  return targetPath.replace("app.asar", "app.asar.unpacked");
};

const getBundledPythonSourceDir = (): string => {
  return getUnpackedPath(path.join(__dirname, "../backend/python"));
};

const getBundledPythonSourceFile = (fileName: PythonRuntimeFile): string => {
  return path.join(getBundledPythonSourceDir(), fileName);
};

export const getManagedPythonRuntimeDir = (): string => {
  return path.join(app.getPath("userData"), PYTHON_RUNTIME_DIR_NAME);
};

export const getManagedPythonScriptPath = (): string => {
  return path.join(getManagedPythonRuntimeDir(), "tagger.py");
};

export const getManagedPythonVenvDir = (): string => {
  return path.join(getManagedPythonRuntimeDir(), RUNTIME_VENV_DIR_NAME);
};

const getManagedPythonStagingVenvDir = (): string => {
  return path.join(getManagedPythonRuntimeDir(), RUNTIME_STAGING_VENV_DIR_NAME);
};

const getManagedPythonBackupVenvDir = (): string => {
  return path.join(getManagedPythonRuntimeDir(), RUNTIME_BACKUP_VENV_DIR_NAME);
};

const getPythonExecutablePath = (venvDir: string): string => {
  return process.platform === "win32"
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");
};

export const getManagedPythonExecutablePath = (): string => {
  return getPythonExecutablePath(getManagedPythonVenvDir());
};

const getManagedPythonRequirementsPath = (): string => {
  return path.join(getManagedPythonRuntimeDir(), "requirements.lock.txt");
};

const getManagedPythonStatePath = (): string => {
  return path.join(getManagedPythonRuntimeDir(), RUNTIME_STATE_FILE_NAME);
};

const getManagedUvCacheDir = (): string => {
  return path.join(getManagedPythonRuntimeDir(), RUNTIME_UV_CACHE_DIR_NAME);
};

const getRuntimeEnv = (): NodeJS.ProcessEnv => {
  return {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
    TRANSFORMERS_VERBOSITY: "error",
    HF_HUB_DISABLE_PROGRESS_BARS: "1",
    UV_INDEX_URL: PYPI_INDEX_URL,
    PIP_INDEX_URL: PYPI_INDEX_URL,
    HF_ENDPOINT: "https://hf-mirror.com",
    UV_CACHE_DIR: getManagedUvCacheDir(),
  };
};

const runCommand = async (
  command: string,
  args: string[],
  cwd: string,
  envOverrides: NodeJS.ProcessEnv = {},
  callbacks: CommandCallbacks = {},
): Promise<CommandResult> => {
  return new Promise<CommandResult>((resolve, reject) => {
    const env = {
      ...getRuntimeEnv(),
      ...envOverrides,
    };
    const proc = spawnProcess(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stdoutBuffer = "";
    let stderrBuffer = "";

    const flushBuffer = (
      source: "stdout" | "stderr",
      force: boolean = false,
    ): void => {
      const callback =
        source === "stdout" ? callbacks.onStdoutLine : callbacks.onStderrLine;
      const buffer = source === "stdout" ? stdoutBuffer : stderrBuffer;
      if (!callback || !buffer) {
        if (force) {
          if (source === "stdout") {
            stdoutBuffer = "";
          } else {
            stderrBuffer = "";
          }
        }
        return;
      }

      const parts = buffer.split(/\r?\n|\r/g);
      const completeCount = force ? parts.length : parts.length - 1;
      for (let index = 0; index < completeCount; index += 1) {
        const line = parts[index]?.trim();
        if (line) {
          callback(line);
        }
      }

      const remainder = force ? "" : (parts.at(-1) ?? "");
      if (source === "stdout") {
        stdoutBuffer = remainder;
      } else {
        stderrBuffer = remainder;
      }
    };

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      stdoutBuffer += text;
      flushBuffer("stdout");
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      stderrBuffer += text;
      flushBuffer("stderr");
    });

    proc.once("error", reject);
    proc.once("exit", (code) => {
      flushBuffer("stdout", true);
      flushBuffer("stderr", true);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `Command failed (${command} ${args.join(" ")}): ${
            stderr.trim() || stdout.trim() || `exit code ${code}`
          }`,
        ),
      );
    });
  });
};

const tryRunCommand = async (
  command: string,
  args: string[],
  cwd: string,
): Promise<CommandResult | null> => {
  try {
    return await runCommand(command, args, cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("ENOENT") ||
      message.includes("not recognized") ||
      message.includes("No such file or directory")
    ) {
      return null;
    }
    throw error;
  }
};

const syncRuntimeFile = async (fileName: PythonRuntimeFile): Promise<void> => {
  const sourcePath = getBundledPythonSourceFile(fileName);
  const targetPath = path.join(getManagedPythonRuntimeDir(), fileName);
  const exists = await lockedFs.pathExists(sourcePath);

  if (!exists) {
    throw new Error(`Missing bundled python runtime file: ${sourcePath}`);
  }

  await lockedFs.copy(sourcePath, targetPath);
};

const getNvidiaSmiCandidates = (): string[] => {
  const candidates = ["nvidia-smi"];

  if (process.platform !== "win32") {
    return candidates;
  }

  const roots = [
    process.env.ProgramFiles,
    process.env["ProgramW6432"],
    process.env["ProgramFiles(x86)"],
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim());

  const seen = new Set<string>(candidates);
  for (const root of roots) {
    const target = path.join(
      root,
      "NVIDIA Corporation",
      "NVSMI",
      "nvidia-smi.exe",
    );
    if (seen.has(target)) continue;
    seen.add(target);
    candidates.push(target);
  }

  return candidates;
};

const resolveSuccessfulCommand = async (
  candidates: string[],
  args: string[],
  cwd: string,
): Promise<{ command: string; result: CommandResult } | null> => {
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !(await lockedFs.pathExists(candidate))) {
      continue;
    }
    const result = await tryRunCommand(candidate, args, cwd);
    if (result) {
      return { command: candidate, result };
    }
  }

  return null;
};

export const ensurePythonRuntimeFiles = async (): Promise<{
  runtimeDir: string;
  scriptPath: string;
}> => {
  const runtimeDir = getManagedPythonRuntimeDir();

  await lockedFs.ensureDir(runtimeDir);
  await lockedFs.ensureDir(getManagedUvCacheDir());
  await Promise.all(PYTHON_RUNTIME_FILES.map(syncRuntimeFile));

  return {
    runtimeDir,
    scriptPath: getManagedPythonScriptPath(),
  };
};

const detectGpuSupport = async (): Promise<GpuDetectionResult> => {
  if (process.platform === "darwin") {
    return {
      torchBackend: "cpu",
      supported: false,
      gpuName: null,
      driverVersion: null,
      cudaVersion: null,
      reason: "CUDA is not available on macOS",
    };
  }

  const runtimeDir = getManagedPythonRuntimeDir();
  const resolvedGpuCommand = await resolveSuccessfulCommand(
    getNvidiaSmiCandidates(),
    ["-L"],
    runtimeDir,
  );
  if (!resolvedGpuCommand) {
    return {
      torchBackend: "cpu",
      supported: false,
      gpuName: null,
      driverVersion: null,
      cudaVersion: null,
      reason: "nvidia-smi is unavailable",
    };
  }

  const firstGpuLine = resolvedGpuCommand.result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("GPU "));

  if (!firstGpuLine) {
    return {
      torchBackend: "cpu",
      supported: false,
      gpuName: null,
      driverVersion: null,
      cudaVersion: null,
      reason: "No NVIDIA GPU detected",
    };
  }

  const gpuName =
    firstGpuLine.match(/^GPU \d+:\s*(.+?)\s+\(UUID:/)?.[1]?.trim() ?? null;
  const detail = await tryRunCommand(resolvedGpuCommand.command, [], runtimeDir);
  const detailOutput = `${detail?.stdout ?? ""}\n${detail?.stderr ?? ""}`;
  const driverVersion =
    detailOutput.match(/Driver Version:\s*([0-9.]+)/)?.[1] ?? null;
  const cudaVersion =
    detailOutput.match(/CUDA Version:\s*([0-9.]+)/)?.[1] ?? null;

  return {
    torchBackend: "auto",
    supported: true,
    gpuName,
    driverVersion,
    cudaVersion,
    reason: "Detected NVIDIA GPU via nvidia-smi",
  };
};

const readRuntimeState = async (): Promise<RuntimeState | null> => {
  const statePath = getManagedPythonStatePath();
  const exists = await lockedFs.pathExists(statePath);
  if (!exists) return null;

  try {
    return await lockedFs.readJson<RuntimeState>(statePath);
  } catch {
    return null;
  }
};

const hashRequirements = async (): Promise<string> => {
  const requirementsPath = getManagedPythonRequirementsPath();
  const content = (await lockedFs.readFile(requirementsPath, "utf8")) as string;
  const hash = createHash("sha256").update(content).digest("hex");
  log.info(`[python-runtime] requirements hash: ${hash} (from ${requirementsPath})`);
  return hash;
};

const countLockedPackages = async (requirementsPath: string): Promise<number> => {
  const content = (await lockedFs.readFile(requirementsPath, "utf8")) as string;
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#")).length;
};

const ANSI_COLOR_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*m`,
  "g",
);
const ANSI_CONTROL_SEQUENCE_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`,
  "g",
);
const OSC_SEQUENCE_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\][^${String.fromCharCode(7)}]*${String.fromCharCode(7)}`,
  "g",
);
const BEL_CHARACTER = String.fromCharCode(7);

const normalizeCommandLine = (line: string): string => {
  return line.replace(ANSI_COLOR_PATTERN, "").trim();
};

const stripTerminalSequences = (value: string): string => {
  return value
    .replace(OSC_SEQUENCE_PATTERN, "")
    .replace(ANSI_CONTROL_SEQUENCE_PATTERN, "")
    .split(BEL_CHARACTER)
    .join("");
};

const clampProgress = (value: number): number => {
  return Math.max(0, Math.min(1, value));
};

const mapProgress = (
  start: number,
  end: number,
  current: number,
  total: number,
): number => {
  if (total <= 0) return start;
  const ratio = clampProgress(current / total);
  return start + (end - start) * ratio;
};

const extractPackageCount = (line: string, verb: string): number | null => {
  const matched = line.match(new RegExp(`${verb}\\s+(\\d+)\\s+packages?`, "i"));
  return matched ? Number.parseInt(matched[1], 10) : null;
};

const extractPackageName = (line: string): string | null => {
  const matched = line.match(/^[+\-~]\s+([A-Za-z0-9._-]+)/);
  return matched?.[1] ?? null;
};

const createUvSyncProgressParser = (
  totalPackages: number,
  reportProgress?: PythonRuntimeProgressReporter,
) => {
  let installedPackages = 0;
  let preparedPackages = 0;
  let installedSummary = 0;
  let downloadedPackages = 0;

  return (rawLine: string): void => {
    if (!reportProgress) return;

    const line = normalizeCommandLine(rawLine);
    if (!line) return;

    const resolvedCount = extractPackageCount(line, "Resolved");
    if (resolvedCount !== null) {
      reportProgress(
        "envInit.resolvedPackages",
        0.42,
        {
          total: resolvedCount,
        },
        line,
      );
      return;
    }

    const preparedCount = extractPackageCount(line, "Prepared");
    if (preparedCount !== null) {
      preparedPackages = Math.max(preparedPackages, preparedCount);
      reportProgress(
        "envInit.downloadingPackagesDetailed",
        mapProgress(0.5, 0.72, preparedPackages, totalPackages),
        {
          current: preparedPackages,
          total: totalPackages,
        },
        line,
      );
      return;
    }

    const installedCount = extractPackageCount(line, "Installed");
    if (installedCount !== null) {
      installedSummary = Math.max(installedSummary, installedCount);
      reportProgress(
        "envInit.installingPackagesDetailed",
        mapProgress(0.72, 0.9, installedSummary, totalPackages),
        {
          current: installedSummary,
          total: totalPackages,
        },
        line,
      );
      return;
    }

    const downloadingMatch = line.match(
      /^Downloading\s+([A-Za-z0-9._-]+)\s+\(([^)]+)\)$/i,
    );
    if (downloadingMatch) {
      reportProgress(
        "envInit.downloadingPackageNamed",
        mapProgress(0.5, 0.72, downloadedPackages + 0.3, totalPackages),
        {
          current: downloadedPackages + 1,
          total: totalPackages,
          name: downloadingMatch[1],
          size: downloadingMatch[2],
        },
        line,
      );
      return;
    }

    const downloadedMatch = line.match(/^Downloaded\s+([A-Za-z0-9._-]+)$/i);
    if (downloadedMatch) {
      downloadedPackages = Math.min(totalPackages, downloadedPackages + 1);
      reportProgress(
        "envInit.downloadedPackageNamed",
        mapProgress(0.5, 0.72, downloadedPackages, totalPackages),
        {
          current: downloadedPackages,
          total: totalPackages,
          name: downloadedMatch[1],
        },
        line,
      );
      return;
    }

    const packageName = extractPackageName(line);
    if (packageName) {
      installedPackages = Math.min(totalPackages, installedPackages + 1);
      reportProgress(
        "envInit.installingPackageNamed",
        mapProgress(0.72, 0.9, installedPackages, totalPackages),
        {
          current: installedPackages,
          total: totalPackages,
          name: packageName,
        },
        line,
      );
      return;
    }

    reportProgress("envInit.installingPackages", 0.72, undefined, line);
  };
};

const runCommandInPty = async (
  command: string,
  args: string[],
  cwd: string,
  envOverrides: NodeJS.ProcessEnv = {},
  onLine?: (line: string) => void,
): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    const env = {
      ...getRuntimeEnv(),
      ...envOverrides,
      TERM: process.env.TERM || "xterm-256color",
      FORCE_COLOR: "0",
    };
    const terminal = spawnPty(command, args, {
      name: env.TERM,
      cols: 160,
      rows: 40,
      cwd,
      env,
      encoding: "utf8",
      useConpty: process.platform === "win32",
    });

    let output = "";
    let lineBuffer = "";
    let settled = false;

    const emitBufferedLines = (force: boolean = false): void => {
      const normalized = lineBuffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const parts = normalized.split("\n");
      const completeCount = force ? parts.length : parts.length - 1;
      for (let index = 0; index < completeCount; index += 1) {
        const line = normalizeCommandLine(parts[index] ?? "");
        if (line) {
          onLine?.(line);
        }
      }
      lineBuffer = force ? "" : (parts.at(-1) ?? "");
    };

    const dataDisposable = terminal.onData((data) => {
      const cleaned = stripTerminalSequences(data);
      output += cleaned;
      lineBuffer += cleaned;
      emitBufferedLines();
    });

    const exitDisposable = terminal.onExit(({ exitCode }) => {
      if (settled) {
        return;
      }
      settled = true;
      dataDisposable.dispose();
      exitDisposable.dispose();
      emitBufferedLines(true);
      if (exitCode === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Command failed (${command} ${args.join(" ")}): ${
            output.trim() || `exit code ${exitCode}`
          }`,
        ),
      );
    });
  });
};

const shouldRebuildRuntime = async (
  state: RuntimeState | null,
  _requirementsHash: string,
  preferredTorchBackend: TorchBackend,
): Promise<boolean> => {
  if (!state) return true;
  if (state.version !== RUNTIME_STATE_VERSION) return true;
  if (state.platform !== process.platform) return true;
  if (state.arch !== process.arch) return true;
  if (preferredTorchBackend === "cpu" && state.torchBackend !== "cpu") return true;
  if (
    preferredTorchBackend === "auto" &&
    state.torchBackend !== "auto" &&
    !state.gpuFallback
  ) {
    return true;
  }
  if (
    state.gpu.supported &&
    state.torchBackend === "auto" &&
    !state.installedTorch.cudaAvailable
  ) {
    return true;
  }
  return !(await lockedFs.pathExists(getManagedPythonExecutablePath()));
};

const canReusePersistedRuntime = async (
  state: RuntimeState | null,
): Promise<boolean> => {
  if (!state) {
    log.info("[python-runtime] canReuse=false: no persisted state");
    return false;
  }
  if (state.version !== RUNTIME_STATE_VERSION) {
    log.info(
      `[python-runtime] canReuse=false: state version mismatch (persisted=${state.version}, current=${RUNTIME_STATE_VERSION})`,
    );
    return false;
  }
  if (state.platform !== process.platform) {
    log.info(
      `[python-runtime] canReuse=false: platform mismatch (persisted=${state.platform}, current=${process.platform})`,
    );
    return false;
  }
  if (state.arch !== process.arch) {
    log.info(
      `[python-runtime] canReuse=false: arch mismatch (persisted=${state.arch}, current=${process.arch})`,
    );
    return false;
  }

  if (
    state.gpu.supported &&
    state.torchBackend === "auto" &&
    !state.installedTorch.cudaAvailable
  ) {
    log.info(
      "[python-runtime] canReuse=false: GPU supported but CUDA unavailable in persisted state",
    );
    return false;
  }

  const venvExists = await lockedFs.pathExists(getManagedPythonExecutablePath());
  if (!venvExists) {
    log.info(
      `[python-runtime] canReuse=false: venv executable missing at ${getManagedPythonExecutablePath()}`,
    );
    return false;
  }

  log.info("[python-runtime] canReuse=true: reusing existing runtime");
  return true;
};

const validateInstalledTorch = (
  requireCuda: boolean,
  gpu: GpuDetectionResult,
  installedTorch: InstalledTorchInfo,
): void => {
  if (!requireCuda) {
    return;
  }

  if (!gpu.supported) {
    return;
  }

  if (installedTorch.cudaAvailable) {
    return;
  }

  throw new Error(
    `GPU detected (${gpu.gpuName ?? "unknown GPU"}), but installed torch is not using CUDA`,
  );
};

const promoteRuntimeVenv = async (stagingVenvDir: string): Promise<void> => {
  const runtimeVenvDir = getManagedPythonVenvDir();
  const backupVenvDir = getManagedPythonBackupVenvDir();

  await lockedFs.remove(backupVenvDir);

  if (await lockedFs.pathExists(runtimeVenvDir)) {
    await lockedFs.rename(runtimeVenvDir, backupVenvDir);
  }

  try {
    await lockedFs.rename(stagingVenvDir, runtimeVenvDir);
  } catch (error) {
    if (await lockedFs.pathExists(backupVenvDir)) {
      await lockedFs.rename(backupVenvDir, runtimeVenvDir);
    }
    throw error;
  }

  await lockedFs.remove(backupVenvDir);
};

const inspectInstalledTorch = async (
  pythonPath: string,
  cwd: string,
): Promise<InstalledTorchInfo> => {
  const script = [
    "import json",
    "import platform",
    "import torch",
    "print(json.dumps({",
    "  'python_version': platform.python_version(),",
    "  'torch_version': getattr(torch, '__version__', None),",
    "  'torch_backend_built': bool(getattr(torch.backends.cuda, 'is_built', lambda: False)()),",
    "  'cuda_available': bool(torch.cuda.is_available()),",
    "  'cuda_device_count': torch.cuda.device_count() if torch.cuda.is_available() else 0,",
    "  'device': 'cuda' if torch.cuda.is_available() else 'cpu',",
    "}, ensure_ascii=False))",
  ].join("\n");
  const { stdout } = await runCommand(pythonPath, ["-c", script], cwd);
  const raw = JSON.parse(stdout.trim()) as {
    python_version: string;
    torch_version: string | null;
    torch_backend_built: boolean;
    cuda_available: boolean;
    cuda_device_count: number;
    device: string;
  };

  return {
    pythonVersion: raw.python_version,
    torchVersion: raw.torch_version,
    torchBackendBuilt: raw.torch_backend_built,
    cudaAvailable: raw.cuda_available,
    cudaDeviceCount: raw.cuda_device_count,
    device: raw.device,
  };
};

const rebuildRuntime = async (
  uvPath: string,
  runtimeDir: string,
  torchBackend: TorchBackend,
  gpu: GpuDetectionResult,
  requireCuda: boolean,
  reportProgress?: PythonRuntimeProgressReporter,
): Promise<InstalledTorchInfo> => {
  const stagingVenvDir = getManagedPythonStagingVenvDir();
  const pythonPath = getPythonExecutablePath(stagingVenvDir);
  const requirementsPath = getManagedPythonRequirementsPath();
  const totalPackages = await countLockedPackages(requirementsPath);
  const handleSyncLine = createUvSyncProgressParser(totalPackages, reportProgress);

  await lockedFs.remove(stagingVenvDir);

  try {
    reportProgress?.("envInit.creatingVirtualEnv", 0.3);
    await runCommand(uvPath, ["venv", stagingVenvDir], runtimeDir);
    reportProgress?.("envInit.resolvingDependencies", 0.38);
    await runCommandInPty(
      uvPath,
      [
        "pip",
        "sync",
        requirementsPath,
        "--python",
        pythonPath,
        "--torch-backend",
        torchBackend,
        "--strict",
        "--color",
        "never",
      ],
      runtimeDir,
      {},
      handleSyncLine,
    );

    reportProgress?.("envInit.verifyingEnvironment", 0.94);
    const installedTorch = await inspectInstalledTorch(pythonPath, runtimeDir);
    validateInstalledTorch(requireCuda, gpu, installedTorch);

    // Build and validate the replacement runtime before promoting it.
    await promoteRuntimeVenv(stagingVenvDir);
    return installedTorch;
  } catch (error) {
    await lockedFs.remove(stagingVenvDir);
    throw error;
  }
};

const installRuntimeForPreferredBackend = async (
  uvPath: string,
  runtimeDir: string,
  gpu: GpuDetectionResult,
  reportProgress?: PythonRuntimeProgressReporter,
): Promise<{
  installedTorch: InstalledTorchInfo;
  torchBackend: TorchBackend;
  gpuFallback: boolean;
}> => {
  if (gpu.torchBackend !== "auto") {
    return {
      installedTorch: await rebuildRuntime(
        uvPath,
        runtimeDir,
        "cpu",
        gpu,
        false,
        reportProgress,
      ),
      torchBackend: "cpu",
      gpuFallback: false,
    };
  }

  try {
    return {
      installedTorch: await rebuildRuntime(
        uvPath,
        runtimeDir,
        "auto",
        gpu,
        true,
        reportProgress,
      ),
      torchBackend: "auto",
      gpuFallback: false,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `GPU runtime setup failed for ${gpu.gpuName ?? "the detected GPU"}: ${reason}`,
    );
  }
};

export const ensurePythonRuntime = async (
  uvPath: string,
  reportProgress?: PythonRuntimeProgressReporter,
): Promise<PythonRuntime> => {
  if (runtimePromise) {
    return runtimePromise;
  }

  runtimePromise = (async () => {
    reportProgress?.("envInit.initializingPythonEnv", 0.08);
    const { runtimeDir, scriptPath } = await ensurePythonRuntimeFiles();
    const currentState = await readRuntimeState();

    const canReusePersisted = await canReusePersistedRuntime(currentState);

    if (canReusePersisted && currentState) {
      reportProgress?.("envInit.pythonEnvReady", 1);
      return {
        runtimeDir,
        scriptPath,
        pythonPath: getManagedPythonExecutablePath(),
        state: currentState,
      };
    }

    // --- Recovery path: state file is missing/corrupt but the venv already
    // exists and requirements hash matches what is bundled now.  This happens
    // when the app was killed after the venv was promoted but before the state
    // file was written.  Inspecting the existing venv is cheap; if it succeeds
    // we save a fresh state and skip the full re-download.
    if (
      !currentState &&
      (await lockedFs.pathExists(getManagedPythonExecutablePath()))
    ) {
      log.info(
        "[python-runtime] state file missing but venv exists – attempting recovery without re-download",
      );
      try {
        const pythonPath = getManagedPythonExecutablePath();
        const gpu = await detectGpuSupport();
        const installedTorch = await inspectInstalledTorch(pythonPath, runtimeDir);
        const hash = await hashRequirements();

        const recoveredState: RuntimeState = {
          version: RUNTIME_STATE_VERSION,
          platform: process.platform,
          arch: process.arch,
          requirementsHash: hash,
          torchBackend: gpu.torchBackend,
          gpuFallback: false,
          gpu,
          installedTorch,
          updatedAt: new Date().toISOString(),
        };
        await lockedFs.writeJson(getManagedPythonStatePath(), recoveredState);
        log.info("[python-runtime] recovery succeeded – reusing existing venv");
        reportProgress?.("envInit.pythonEnvReady", 1);
        return {
          runtimeDir,
          scriptPath,
          pythonPath,
          state: recoveredState,
        };
      } catch (recoveryError) {
        log.warn(
          "[python-runtime] recovery failed, will rebuild:",
          recoveryError,
        );
      }
    }

    reportProgress?.("envInit.detectingGpu", 0.16);
    const gpu = await detectGpuSupport();
    const shouldRebuild = await shouldRebuildRuntime(
      currentState,
      "",
      gpu.torchBackend,
    );

    let installedTorch: InstalledTorchInfo;
    let resolvedTorchBackend: TorchBackend =
      currentState?.torchBackend ?? gpu.torchBackend;
    let gpuFallback = currentState?.gpuFallback ?? false;

    if (shouldRebuild) {
      log.info("[python-runtime] rebuilding runtime environment...");
      const installResult = await installRuntimeForPreferredBackend(
        uvPath,
        runtimeDir,
        gpu,
        reportProgress,
      );
      installedTorch = installResult.installedTorch;
      resolvedTorchBackend = installResult.torchBackend;
      gpuFallback = installResult.gpuFallback;
    } else {
      const pythonPath = getManagedPythonExecutablePath();
      installedTorch = await inspectInstalledTorch(pythonPath, runtimeDir);
      if (gpu.supported && !installedTorch.cudaAvailable) {
        log.info(
          "[python-runtime] GPU supported but CUDA unavailable – rebuilding with auto backend",
        );
        const installResult = await installRuntimeForPreferredBackend(
          uvPath,
          runtimeDir,
          gpu,
          reportProgress,
        );
        installedTorch = installResult.installedTorch;
        resolvedTorchBackend = installResult.torchBackend;
        gpuFallback = installResult.gpuFallback;
      }
    }

    const pythonPath = getManagedPythonExecutablePath();
    const nextState: RuntimeState = {
      version: RUNTIME_STATE_VERSION,
      platform: process.platform,
      arch: process.arch,
      requirementsHash: await hashRequirements(),
      torchBackend: resolvedTorchBackend,
      gpuFallback,
      gpu,
      installedTorch,
      updatedAt: new Date().toISOString(),
    };

    await lockedFs.writeJson(getManagedPythonStatePath(), nextState);
    log.info("[python-runtime] state file written successfully");
    reportProgress?.("envInit.pythonEnvReady", 1);

    return {
      runtimeDir,
      scriptPath,
      pythonPath,
      state: nextState,
    };
  })();

  try {
    return await runtimePromise;
  } finally {
    runtimePromise = null;
  }
};
