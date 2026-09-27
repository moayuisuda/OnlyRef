import { proxy } from "valtio";
import type {
  WallpaperSettings,
  WallpaperState,
} from "../../shared/wallpaper";
import { DEFAULT_WALLPAPER_SETTINGS } from "../../shared/wallpaper";
import {
  getWallpaperState,
  refreshWallpaper,
  updateWallpaperSettings,
} from "../service";

type WallpaperStore = WallpaperState & {
  loaded: boolean;
  saving: boolean;
  panelOpen: boolean;
};

export const wallpaperState = proxy<WallpaperStore>({
  supported: true,
  displays: [],
  settings: { ...DEFAULT_WALLPAPER_SETTINGS },
  updating: false,
  lastUpdatedAt: null,
  nextUpdatedAt: null,
  errorCode: null,
  loaded: false,
  saving: false,
  panelOpen: false,
});

const applyState = (next: WallpaperState): void => {
  wallpaperState.supported = next.supported;
  wallpaperState.displays.splice(0, wallpaperState.displays.length);
  wallpaperState.displays.push(...next.displays);
  wallpaperState.settings.enabled = next.settings.enabled;
  wallpaperState.settings.intervalMinutes = next.settings.intervalMinutes;
  wallpaperState.settings.imageCount = next.settings.imageCount;
  if (next.settings.targetDisplayIds === null) {
    wallpaperState.settings.targetDisplayIds = null;
  } else {
    if (wallpaperState.settings.targetDisplayIds === null) {
      wallpaperState.settings.targetDisplayIds = [];
    }
    wallpaperState.settings.targetDisplayIds.splice(
      0,
      wallpaperState.settings.targetDisplayIds.length,
      ...next.settings.targetDisplayIds,
    );
  }
  wallpaperState.updating = next.updating;
  wallpaperState.lastUpdatedAt = next.lastUpdatedAt;
  wallpaperState.nextUpdatedAt = next.nextUpdatedAt;
  wallpaperState.errorCode = next.errorCode;
};

export const wallpaperActions = {
  setPanelOpen(open: boolean): void {
    wallpaperState.panelOpen = open;
  },

  async load(): Promise<void> {
    if (wallpaperState.loaded) return;
    try {
      applyState(await getWallpaperState());
      wallpaperState.loaded = true;
    } catch {
      wallpaperState.errorCode = "request-failed";
    }
  },

  sync(next: WallpaperState): void {
    applyState(next);
    wallpaperState.loaded = true;
  },

  async updateSettings(settings: WallpaperSettings): Promise<void> {
    wallpaperState.saving = true;
    try {
      applyState(await updateWallpaperSettings(settings));
    } catch {
      wallpaperState.errorCode = "request-failed";
    } finally {
      wallpaperState.saving = false;
    }
  },

  async refresh(): Promise<void> {
    wallpaperState.updating = true;
    try {
      applyState(await refreshWallpaper());
    } catch {
      wallpaperState.errorCode = "request-failed";
    } finally {
      wallpaperState.updating = false;
    }
  },
};
