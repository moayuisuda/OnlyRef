import express from "express";
import type { ImageDb, StorageIncompatibleError } from "../db";

type TagsRouteDeps = {
  getImageDb: () => ImageDb;
  getIncompatibleError: () => StorageIncompatibleError | null;
  readSettings: () => Promise<Record<string, unknown>>;
  writeSettings: (settings: Record<string, unknown>) => Promise<void>;
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
      const imageDb = deps.getImageDb();
      const tags = imageDb.listTags();
      const settings = await deps.readSettings();
      const tagColors = (settings.tagColors || {}) as Record<string, string>;
      const result = tags.map((tag) => ({
        name: tag,
        color: tagColors[tag] || null,
      }));
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.patch("/api/tag/:name", async (req, res) => {
    try {
      if (guardStorage(res)) return;
      const imageDb = deps.getImageDb();
      const oldName = req.params.name;
      const { newName } = req.body as { newName?: string };
      if (!oldName || !newName) {
        res.status(400).json({ error: "Tag names are required" });
        return;
      }
      const trimmedOld = oldName.trim();
      const trimmedNew = newName.trim();
      if (!trimmedOld || !trimmedNew) {
        res.status(400).json({ error: "Tags cannot be empty" });
        return;
      }
      imageDb.renameTag(trimmedOld, trimmedNew);

      const settings = await deps.readSettings();
      const tagColors = (settings.tagColors || {}) as Record<string, string>;
      if (Object.prototype.hasOwnProperty.call(tagColors, trimmedOld)) {
        const color = tagColors[trimmedOld];
        const nextTagColors = { ...tagColors };
        delete nextTagColors[trimmedOld];
        nextTagColors[trimmedNew] = color;
        await deps.writeSettings({ ...settings, tagColors: nextTagColors });
      }

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  return router;
};
