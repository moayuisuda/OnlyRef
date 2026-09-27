export const WALLPAPER_INTERVAL_OPTIONS = [
  15,
  30,
  60,
  180,
  360,
  720,
  1440,
  4320,
  10080,
] as const;
export const WALLPAPER_IMAGE_COUNT_OPTIONS = [4, 16, 32] as const;

export type WallpaperIntervalMinutes = (typeof WALLPAPER_INTERVAL_OPTIONS)[number];
export type WallpaperImageCount = (typeof WALLPAPER_IMAGE_COUNT_OPTIONS)[number];

export type WallpaperSettings = {
  enabled: boolean;
  intervalMinutes: WallpaperIntervalMinutes;
  imageCount: WallpaperImageCount;
  /** null 表示跟随当前主显示器，空数组表示不更新任何显示器。 */
  targetDisplayIds: string[] | null;
};

export type WallpaperDisplay = {
  id: string;
  index: number;
  name: string;
  width: number;
  height: number;
  isPrimary: boolean;
};

export type WallpaperErrorCode =
  | "unsupported-platform"
  | "not-enough-images"
  | "generation-failed"
  | "apply-failed"
  | "cleanup-failed"
  | "display-unavailable"
  | "request-failed";

export type WallpaperState = {
  supported: boolean;
  displays: WallpaperDisplay[];
  settings: WallpaperSettings;
  updating: boolean;
  lastUpdatedAt: number | null;
  nextUpdatedAt: number | null;
  errorCode: WallpaperErrorCode | null;
};

export const DEFAULT_WALLPAPER_SETTINGS: WallpaperSettings = {
  enabled: false,
  intervalMinutes: 60,
  imageCount: 16,
  targetDisplayIds: null,
};

const isOneOf = <T extends readonly number[]>(
  value: unknown,
  options: T,
): value is T[number] =>
  typeof value === "number" && options.includes(value as T[number]);

export const parseWallpaperSettings = (value: unknown): WallpaperSettings => {
  if (value === undefined) {
    return { ...DEFAULT_WALLPAPER_SETTINGS };
  }
  if (!value || typeof value !== "object") {
    throw new Error("Invalid wallpaper settings");
  }

  const settings = value as Record<string, unknown>;
  if (
    typeof settings.enabled !== "boolean" ||
    !isOneOf(settings.intervalMinutes, WALLPAPER_INTERVAL_OPTIONS) ||
    !isOneOf(settings.imageCount, WALLPAPER_IMAGE_COUNT_OPTIONS) ||
    !(
      settings.targetDisplayIds === null ||
      (Array.isArray(settings.targetDisplayIds) &&
        settings.targetDisplayIds.every(
          (id) => typeof id === "string" && id.length > 0,
        ))
    ) ||
    (settings.enabled === true &&
      Array.isArray(settings.targetDisplayIds) &&
      settings.targetDisplayIds.length === 0)
  ) {
    throw new Error("Invalid wallpaper settings");
  }

  return {
    enabled: settings.enabled,
    intervalMinutes: settings.intervalMinutes,
    imageCount: settings.imageCount,
    targetDisplayIds:
      settings.targetDisplayIds === null
        ? null
        : [...new Set(settings.targetDisplayIds as string[])],
  };
};
