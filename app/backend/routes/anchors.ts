import express from "express";
import path from "path";
import fs from "fs-extra";
import { withFileLock } from "../fileLock";

type AnchorsRouteDeps = {
  getStorageDir: () => string;
};

export const createAnchorsRouter = (deps: AnchorsRouteDeps) => {
  const router = express.Router();

  const getAnchorsPath = () => path.join(deps.getStorageDir(), "anchors.json");

  router.get("/api/anchors", async (_req, res) => {
    try {
      const anchorsPath = getAnchorsPath();
      await withFileLock(anchorsPath, async () => {
        if (await fs.pathExists(anchorsPath)) {
          const anchors = await fs.readJson(anchorsPath);
          res.json(anchors);
          return;
        }
        res.json({});
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/anchors", async (req, res) => {
    try {
      const anchors = req.body;
      const anchorsPath = getAnchorsPath();
      await withFileLock(anchorsPath, async () => {
        await fs.ensureFile(anchorsPath);
        await fs.writeJson(anchorsPath, anchors);
      });
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  return router;
};
