import express from "express";
import type {
  WallpaperSettings,
  WallpaperState,
} from "../../shared/wallpaper";
import { parseWallpaperSettings } from "../../shared/wallpaper";

export type WallpaperRouteHandlers = {
  getState: () => WallpaperState;
  updateSettings: (settings: WallpaperSettings) => Promise<WallpaperState>;
  refresh: () => Promise<WallpaperState>;
};

export const createWallpaperRouter = (handlers: WallpaperRouteHandlers) => {
  const router = express.Router();

  router.get("/api/wallpaper", (_req, res) => {
    res.json(handlers.getState());
  });

  router.put("/api/wallpaper/settings", async (req, res) => {
    let settings: WallpaperSettings;
    try {
      settings = parseWallpaperSettings(req.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
      return;
    }

    try {
      res.json(await handlers.updateSettings(settings));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/wallpaper/refresh", async (_req, res) => {
    try {
      res.json(await handlers.refresh());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  return router;
};
