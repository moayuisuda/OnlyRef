import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { lockedFs } from "../app/backend/fileLock.ts";

function getConfigHome(): string {
  if (process.platform === "win32") {
    if (!process.env.APPDATA) throw new Error("缺少 APPDATA 环境变量");
    return process.env.APPDATA;
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
}

async function migrate(): Promise<void> {
  const { values } = parseArgs({
    options: {
      source: { type: "string" },
      target: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(
      "退出 PiCaptain 和 PicPin 后执行\n" +
      "node --experimental-strip-types scripts/migrate-picpin.ts [--source 旧配置目录] [--target 新配置目录] [--dry-run]\n" +
      "默认从系统配置目录下的 PiCaptain 迁移到 PicPin。图库继续使用原绝对路径。",
    );
    return;
  }

  const configHome = getConfigHome();
  const source = path.resolve(values.source ?? path.join(configHome, "PiCaptain"));
  const target = path.resolve(values.target ?? path.join(configHome, "PicPin"));
  if (path.relative(source, target) === "") {
    throw new Error("新旧配置目录必须不同");
  }

  const previousConfig = path.join(source, "picaptain_config.json");
  let storageDir: unknown;
  if (await lockedFs.pathExists(previousConfig)) {
    const config = await lockedFs.readJson<{ storageDir?: unknown }>(previousConfig);
    storageDir = config.storageDir;
  } else {
    storageDir = path.join(source, "picaptain_storage");
  }
  if (typeof storageDir !== "string" || !path.isAbsolute(storageDir)) {
    throw new Error("旧配置中的 storageDir 必须是绝对路径");
  }
  if (!(await lockedFs.stat(storageDir)).isDirectory()) {
    throw new Error(`图库路径不是目录 ${storageDir}`);
  }

  const configPath = path.join(target, "storage.json");
  console.log(`旧配置目录 ${source}\n新配置目录 ${target}\n图库目录 ${storageDir}`);
  if (values["dry-run"]) {
    await checkDestination(configPath, storageDir);
    console.log("预览完成，可以执行迁移");
    return;
  }

  await lockedFs.ensureDir(target);
  const lock = path.join(target, ".picpin-migration.lock");
  // 独立进程通过排他创建文件互斥，防止两个迁移脚本同时写入。
  await lockedFs.writeFile(lock, String(process.pid), { flag: "wx" });
  try {
    if (await checkDestination(configPath, storageDir)) {
      console.log("迁移已完成，当前配置指向同一图库");
      return;
    }
    // 图库和原配置留在原位置，绝对路径引用可以继续使用。
    await lockedFs.writeJsonAtomic(configPath, { storageDir });
    console.log("迁移完成，可以启动 PicPin。首次启动将初始化新的 Python 运行环境。");
  } finally {
    await lockedFs.unlink(lock);
  }
}

async function checkDestination(configPath: string, storageDir: string): Promise<boolean> {
  if (!(await lockedFs.pathExists(configPath))) return false;
  const existing = await lockedFs.readJson<{ storageDir?: unknown }>(configPath);
  if (
    typeof existing.storageDir !== "string" ||
    path.relative(existing.storageDir, storageDir) !== ""
  ) {
    throw new Error(`目标配置已指向其他图库，请先检查 ${configPath}`);
  }
  return true;
}

migrate().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
