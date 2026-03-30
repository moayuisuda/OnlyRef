import path from "path";
import express from "express";
import fs from "fs-extra";
import { withFileLock } from "../fileLock";

type TempRouteDeps = {
  getCanvasTempDir: () => string;
  downloadImage: (url: string, targetPath: string) => Promise<void>;
  runPythonDominantColor: (arg: string) => Promise<string | null>;
};

export const createTempRouter = (deps: TempRouteDeps) => {
  const router = express.Router();

  router.post("/api/download-url", async (req, res) => {
    try {
      const { url } = req.body as { url?: string };
      if (!url || typeof url !== "string") {
        res.status(400).json({ error: "URL is required" });
        return;
      }

      const trimmedUrl = url.trim();
      if (
        !trimmedUrl.startsWith("http://") &&
        !trimmedUrl.startsWith("https://")
      ) {
        res.status(400).json({ error: "Invalid URL" });
        return;
      }

      let urlFilename = "image.jpg";
      try {
        const urlObj = new URL(trimmedUrl);
        const pathname = urlObj.pathname;
        const baseName = path.basename(pathname).split("?")[0];
        if (baseName && /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(baseName)) {
          urlFilename = baseName;
        }
      } catch {
        void 0;
      }

      const ext = path.extname(urlFilename) || ".jpg";
      const nameWithoutExt = path.basename(urlFilename, ext);
      const safeName =
        nameWithoutExt.replace(/[^a-zA-Z0-9.\-_]/g, "_") || "image";
      const timestamp = Date.now();
      const filename = `${safeName}_${timestamp}${ext}`;
      const filepath = path.join(deps.getCanvasTempDir(), filename);

      await deps.downloadImage(trimmedUrl, filepath);

      res.json({
        success: true,
        filename,
        path: filepath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/upload-temp", async (req, res) => {
    try {
      const { imageBase64, filename: providedFilename } = req.body as {
        imageBase64?: string;
        filename?: string;
      };
      if (!imageBase64) {
        res.status(400).json({ error: "No image data" });
        return;
      }

      let filename = "temp.png";
      if (providedFilename) {
        const ext = path.extname(providedFilename) || ".png";
        const name = path.basename(providedFilename, ext);
        const safeName = name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        filename = `${safeName}${ext}`;
      }

      const filepath = path.join(deps.getCanvasTempDir(), filename);
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

      await withFileLock(filepath, async () => {
        await fs.writeFile(filepath, base64Data, "base64");
      });

      res.json({
        success: true,
        filename,
        path: filepath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/delete-temp-file", async (req, res) => {
    try {
      const { filePath } = req.body as { filePath?: string };
      if (!filePath) {
        res.status(400).json({ error: "File path is required" });
        return;
      }

      const canvasTempDir = deps.getCanvasTempDir();
      const normalizedPath = path.normalize(filePath);
      if (!normalizedPath.startsWith(canvasTempDir)) {
        const inTemp = path.join(canvasTempDir, path.basename(filePath));
        await withFileLock(inTemp, async () => {
          if (await fs.pathExists(inTemp)) {
            await fs.unlink(inTemp);
            res.json({ success: true });
            return;
          }
          res
            .status(403)
            .json({ error: "Invalid file path: Must be in temp directory" });
        });
        return;
      }

      await withFileLock(normalizedPath, async () => {
        if (await fs.pathExists(normalizedPath)) {
          await fs.unlink(normalizedPath);
          res.json({ success: true });
          return;
        }
        res.status(404).json({ error: "File not found" });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/temp-dominant-color", async (req, res) => {
    try {
      const { filePath } = req.body as { filePath?: string };
      if (!filePath) {
        res.status(400).json({ error: "File path is required" });
        return;
      }

      const normalizedPath = path.normalize(filePath);
      let targetPath = normalizedPath;

      const canvasTempDir = deps.getCanvasTempDir();
      if (!normalizedPath.startsWith(canvasTempDir)) {
        const inTemp = path.join(canvasTempDir, path.basename(filePath));
        const exists = await withFileLock(inTemp, () => fs.pathExists(inTemp));
        if (!exists) {
          res
            .status(403)
            .json({ error: "Invalid file path: Must be in temp directory" });
          return;
        }
        targetPath = inTemp;
      } else {
        const exists = await withFileLock(normalizedPath, () =>
          fs.pathExists(normalizedPath)
        );
        if (!exists) {
          res.status(404).json({ error: "File not found" });
          return;
        }
      }

      const dominantColor = await deps.runPythonDominantColor(targetPath);
      res.json({ success: true, dominantColor });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  return router;
};
