import fs from "fs-extra";
import { withFileLock } from "./fileLock";

let settingsFilePath = "";
let settingsCache: Record<string, unknown> | null = null;

export const configureSettingsStore = (filePath: string): void => {
  if (!filePath) {
    throw new Error("Settings file path is required");
  }
  if (settingsFilePath === filePath) return;
  settingsFilePath = filePath;
  settingsCache = null;
};

const getSettingsFilePath = (): string => {
  if (!settingsFilePath) {
    throw new Error("Settings store is not configured");
  }
  return settingsFilePath;
};

const readSettingsFile = async (
  filePath: string,
): Promise<Record<string, unknown>> => {
  if (!(await fs.pathExists(filePath))) return {};
  const raw = await fs.readJson(filePath);
  if (!raw || typeof raw !== "object") {
    throw new Error("Settings file must contain an object");
  }
  return raw as Record<string, unknown>;
};

export const readSettings = async (): Promise<Record<string, unknown>> => {
  const filePath = getSettingsFilePath();
  if (settingsCache) return settingsCache;

  return withFileLock(filePath, async () => {
    try {
      settingsCache = await readSettingsFile(filePath);
      return settingsCache;
    } catch (error) {
      console.error("Failed to read settings file", error);
    }

    settingsCache = {};
    return settingsCache;
  });
};

export const writeSettings = async (
  settings: Record<string, unknown>,
): Promise<void> => {
  const filePath = getSettingsFilePath();

  await withFileLock(filePath, async () => {
    await fs.writeJson(filePath, settings);
    settingsCache = settings;
  });
};

export const patchSettings = async (
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const filePath = getSettingsFilePath();
  return withFileLock(filePath, async () => {
    const current = settingsCache ?? (await readSettingsFile(filePath));
    const next = { ...current, ...patch };
    await fs.writeJson(filePath, next);
    settingsCache = next;
    return next;
  });
};
