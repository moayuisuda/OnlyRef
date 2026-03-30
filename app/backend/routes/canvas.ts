import path from "path";
import express from "express";
import fs from "fs-extra";
import { lockedFs, withFileLock, withFileLocks } from "../fileLock";

type CanvasRouteDeps = {
  getCanvasesDir: () => string;
  getCanvasTempDir: () => string;
};

const getCanvasPaths = (dir: string, name: string) => {
  const safeName = name.replace(/[/\\:*?"<>|]/g, "_") || "Default";
  const canvasDir = path.join(dir, safeName);
  return {
    dir: canvasDir,
    dataFile: path.join(canvasDir, "canvas.json"),
    viewportFile: path.join(canvasDir, "canvas_viewport.json"),
  };
};

const ensureDefaultCanvas = async (dir: string) => {
  const defaultCanvasPath = path.join(dir, "Default");
  const canvases = await lockedFs.readdir(dir).catch(() => []);
  if (canvases.length === 0) {
    await lockedFs.ensureDir(defaultCanvasPath);
  }
};

export const createCanvasRouter = (deps: CanvasRouteDeps) => {
  const router = express.Router();

  router.get("/api/canvases", async (_req, res) => {
    try {
      const canvasesDir = deps.getCanvasesDir();
      await ensureDefaultCanvas(canvasesDir);
      const dirs = await lockedFs.readdir(canvasesDir);
      const canvases: { name: string; lastModified: number }[] = [];
      for (const dir of dirs) {
        const fullPath = path.join(canvasesDir, dir);
        try {
          const stat = await lockedFs.stat(fullPath);
          if (stat.isDirectory()) {
            canvases.push({ name: dir, lastModified: stat.mtimeMs });
          }
        } catch {
          void 0;
        }
      }
      res.json(canvases.sort((a, b) => b.lastModified - a.lastModified));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/canvases", async (req, res) => {
    try {
      const { name } = req.body as { name?: string };
      if (!name) {
        res.status(400).json({ error: "Canvas name is required" });
        return;
      }
      const paths = getCanvasPaths(deps.getCanvasesDir(), name);
      await withFileLock(paths.dir, async () => {
        if (await fs.pathExists(paths.dir)) {
          res.status(409).json({ error: "Canvas already exists" });
          return;
        }
        await fs.ensureDir(paths.dir);
      });
      if (res.headersSent) return;
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/canvases/rename", async (req, res) => {
    try {
      const { oldName, newName } = req.body as { oldName?: string; newName?: string };
      if (!oldName || !newName) {
        res.status(400).json({ error: "Both oldName and newName are required" });
        return;
      }
      const canvasesDir = deps.getCanvasesDir();
      const oldPaths = getCanvasPaths(canvasesDir, oldName);
      const newPaths = getCanvasPaths(canvasesDir, newName);
      await withFileLocks([oldPaths.dir, newPaths.dir], async () => {
        if (!(await fs.pathExists(oldPaths.dir))) {
          res.status(404).json({ error: "Canvas not found" });
          return;
        }
        if (await fs.pathExists(newPaths.dir)) {
          res.status(409).json({ error: "Target canvas name already exists" });
          return;
        }
        await fs.rename(oldPaths.dir, newPaths.dir);
      });
      if (res.headersSent) return;
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/canvases/delete", async (req, res) => {
    try {
      const { name } = req.body as { name?: string };
      if (!name) {
        res.status(400).json({ error: "Canvas name is required" });
        return;
      }
      const paths = getCanvasPaths(deps.getCanvasesDir(), name);
      await withFileLock(paths.dir, async () => {
        if (await fs.pathExists(paths.dir)) {
          await fs.remove(paths.dir);
        }
      });
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/save-canvas", async (req, res) => {
    try {
      const { images, canvasName } = req.body as {
        images?: unknown;
        canvasName?: string;
      };
      const paths = getCanvasPaths(deps.getCanvasesDir(), canvasName || "Default");
      await withFileLocks([paths.dir, paths.dataFile], async () => {
        await fs.ensureDir(paths.dir);
        await fs.writeJson(paths.dataFile, images);
      });
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/canvas-viewport", async (req, res) => {
    try {
      const { viewport, canvasName } = req.body as {
        viewport?: unknown;
        canvasName?: string;
      };
      const paths = getCanvasPaths(deps.getCanvasesDir(), canvasName || "Default");
      await withFileLocks([paths.dir, paths.viewportFile], async () => {
        await fs.ensureDir(paths.dir);
        await fs.writeJson(paths.viewportFile, viewport);
      });
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.get("/api/canvas-viewport", async (req, res) => {
    try {
      const canvasName = req.query.canvasName as string;
      const paths = getCanvasPaths(deps.getCanvasesDir(), canvasName || "Default");
      await withFileLock(paths.viewportFile, async () => {
        if (await fs.pathExists(paths.viewportFile)) {
          const viewport = await fs.readJson(paths.viewportFile);
          res.json(viewport);
          return;
        }
        res.json(null);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.get("/api/load-canvas", async (req, res) => {
    try {
      const canvasName = req.query.canvasName as string;
      const paths = getCanvasPaths(deps.getCanvasesDir(), canvasName || "Default");

      let images: unknown = [];
      await withFileLock(paths.dataFile, async () => {
        if (await fs.pathExists(paths.dataFile)) {
          images = await fs.readJson(paths.dataFile);
        }
      });

      try {
        const canvasTempDir = deps.getCanvasTempDir();
        await withFileLock(canvasTempDir, async () => {
          if (await fs.pathExists(canvasTempDir)) {
            const usedTempFiles = new Set<string>();
            if (Array.isArray(images)) {
              images.forEach((img: { localPath?: string; imagePath?: string }) => {
                const pathValue = img.localPath || img.imagePath;
                if (pathValue) {
                  const basename = path.basename(pathValue);
                  usedTempFiles.add(basename);
                }
              });
            }

            const files = await fs.readdir(canvasTempDir);
            for (const file of files) {
              if (!usedTempFiles.has(file)) {
                await fs.unlink(path.join(canvasTempDir, file));
              }
            }
          }
        });
      } catch {
        void 0;
      }

      res.json(images);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  return router;
};
