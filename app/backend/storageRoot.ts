import path from "node:path";
import { lockedFs } from "./fileLock";

export const storageConfigPath = (profileDir: string) => path.join(profileDir, "storage.json");

export const saveStorageRoot = (profileDir: string, storageDir: string) =>
  lockedFs.writeJsonAtomic(storageConfigPath(profileDir), { storageDir });

export async function loadStorageRoot(profileDir: string): Promise<string | null> {
  const config = storageConfigPath(profileDir);
  if (!(await lockedFs.pathExists(config))) return null;
  const raw = await lockedFs.readJson<{ storageDir?: unknown }>(config);
  if (typeof raw?.storageDir !== "string" || !path.isAbsolute(raw.storageDir)) {
    throw new Error(`Invalid storage directory in ${config}`);
  }
  return raw.storageDir;
}
