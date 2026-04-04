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

export const readSettings = async (): Promise<Record<string, unknown>> => {
  const filePath = getSettingsFilePath();
  if (settingsCache) return settingsCache;

  return withFileLock(filePath, async () => {
    if (!(await fs.pathExists(filePath))) {
      settingsCache = {};
      return settingsCache;
    }

    try {
      const raw = await fs.readJson(filePath);
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

export const writeSettings = async (
  settings: Record<string, unknown>,
): Promise<void> => {
  const filePath = getSettingsFilePath();
  settingsCache = settings;

  await withFileLock(filePath, async () => {
    try {
      await fs.writeJson(filePath, settings);
    } catch (error) {
      console.error("Failed to write settings file", error);
    }
  });
};
