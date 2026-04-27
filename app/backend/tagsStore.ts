import fs from "fs-extra";
import { withFileLock } from "./fileLock";

export type StoredTag = {
  name: string;
  color: string | null;
};

let tagsFilePath = "";
let tagsCache: StoredTag[] | null = null;

const normalizeTagName = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const normalizeTagColor = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-f]{6}$/.test(withHash)) return withHash;
  if (/^#[0-9a-f]{3}$/.test(withHash)) {
    return `#${withHash[1]}${withHash[1]}${withHash[2]}${withHash[2]}${withHash[3]}${withHash[3]}`;
  }
  return null;
};

const normalizeTags = (value: unknown): StoredTag[] => {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: StoredTag[] = [];

  value.forEach((item) => {
    if (!item || typeof item !== "object") return;

    const record = item as Record<string, unknown>;
    const name = normalizeTagName(record.name);
    if (!name || seen.has(name)) return;

    seen.add(name);
    normalized.push({
      name,
      color: normalizeTagColor(record.color),
    });
  });

  return normalized;
};

export const configureTagsStore = (filePath: string): void => {
  if (!filePath) {
    throw new Error("Tags store file path is required");
  }
  if (tagsFilePath === filePath) return;
  tagsFilePath = filePath;
  tagsCache = null;
};

const getTagsFilePath = (): string => {
  if (!tagsFilePath) {
    throw new Error("Tags store is not configured");
  }
  return tagsFilePath;
};

export const readTags = async (): Promise<StoredTag[]> => {
  const filePath = getTagsFilePath();
  if (tagsCache) return tagsCache;

  return withFileLock(filePath, async () => {
    if (!(await fs.pathExists(filePath))) {
      tagsCache = [];
      return tagsCache;
    }

    try {
      const raw = await fs.readJson(filePath);
      tagsCache = normalizeTags(raw);
      return tagsCache;
    } catch (error) {
      console.error("Failed to read tags file", error);
    }

    tagsCache = [];
    return tagsCache;
  });
};

export const writeTags = async (tags: StoredTag[]): Promise<void> => {
  const filePath = getTagsFilePath();
  const normalized = normalizeTags(tags);
  tagsCache = normalized;

  await withFileLock(filePath, async () => {
    try {
      await fs.writeJson(filePath, normalized);
    } catch (error) {
      console.error("Failed to write tags file", error);
    }
  });
};
