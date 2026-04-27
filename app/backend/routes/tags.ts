import express from "express";
import type { ImageDb, StorageIncompatibleError } from "../db";
import type { StoredTag } from "../tagsStore";

type TagsRouteDeps = {
  getImageDb: () => ImageDb;
  getIncompatibleError: () => StorageIncompatibleError | null;
  readTags: () => Promise<StoredTag[]>;
  writeTags: (tags: StoredTag[]) => Promise<void>;
};

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

const sortTags = (tags: StoredTag[]): StoredTag[] => {
  return [...tags].sort((left, right) => left.name.localeCompare(right.name));
};

export const createTagsRouter = (deps: TagsRouteDeps) => {
  const router = express.Router();

  const guardStorage = (res: express.Response): boolean => {
    const incompatibleError = deps.getIncompatibleError();
    if (!incompatibleError) return false;
    res.status(409).json({
      error: "Storage is incompatible",
      details: incompatibleError.message,
      code: "STORAGE_INCOMPATIBLE",
    });
    return true;
  };

  router.get("/api/tags", async (_req, res) => {
    try {
      if (guardStorage(res)) return;
      const tags = await deps.readTags();
      res.json(sortTags(tags));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/tag", async (req, res) => {
    try {
      if (guardStorage(res)) return;
      const name = normalizeTagName((req.body as { name?: unknown }).name);
      if (!name) {
        res.status(400).json({ error: "Tag name is required" });
        return;
      }

      const tags = await deps.readTags();
      if (tags.some((tag) => tag.name === name)) {
        res.json({ success: true });
        return;
      }

      await deps.writeTags([...tags, { name, color: null }]);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.patch("/api/tag/:name", async (req, res) => {
    try {
      if (guardStorage(res)) return;
      const imageDb = deps.getImageDb();
      const oldName = normalizeTagName(req.params.name);
      const body = req.body as { newName?: unknown; color?: unknown };
      const newName = normalizeTagName(body.newName);
      const hasRename = body.newName !== undefined;
      const hasColor = Object.prototype.hasOwnProperty.call(body, "color");

      if (!oldName) {
        res.status(400).json({ error: "Tag name is required" });
        return;
      }

      if (hasRename && !newName) {
        res.status(400).json({ error: "Tags cannot be empty" });
        return;
      }

      if (!hasRename && !hasColor) {
        res.status(400).json({ error: "No tag update provided" });
        return;
      }

      const tags = await deps.readTags();
      const currentIndex = tags.findIndex((tag) => tag.name === oldName);
      if (currentIndex === -1) {
        res.status(404).json({ error: "Tag not found" });
        return;
      }

      const targetName = hasRename ? newName : oldName;
      if (
        targetName !== oldName &&
        tags.some((tag, index) => index !== currentIndex && tag.name === targetName)
      ) {
        res.status(409).json({ error: "Tag already exists" });
        return;
      }

      const nextTags = [...tags];
      const current = nextTags[currentIndex];
      nextTags[currentIndex] = {
        name: targetName,
        color: hasColor ? normalizeTagColor(body.color) : current.color,
      };

      if (targetName !== oldName) {
        imageDb.renameTag(oldName, targetName);
      }

      await deps.writeTags(nextTags);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.delete("/api/tag/:name", async (req, res) => {
    try {
      if (guardStorage(res)) return;
      const imageDb = deps.getImageDb();
      const name = normalizeTagName(req.params.name);
      if (!name) {
        res.status(400).json({ error: "Tag name is required" });
        return;
      }

      const tags = await deps.readTags();
      await deps.writeTags(tags.filter((tag) => tag.name !== name));
      imageDb.deleteTag(name);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  return router;
};
