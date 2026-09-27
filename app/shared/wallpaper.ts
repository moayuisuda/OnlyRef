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

const getNearestImageCount = (value: unknown): WallpaperImageCount => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_WALLPAPER_SETTINGS.imageCount;
  }
  return WALLPAPER_IMAGE_COUNT_OPTIONS.reduce((nearest, candidate) =>
    Math.abs(candidate - value) <= Math.abs(nearest - value)
      ? candidate
      : nearest,
  );
};

export const normalizePersistedWallpaperSettings = (
  value: unknown,
): { settings: WallpaperSettings; repaired: boolean } => {
  if (value === undefined) {
    return { settings: { ...DEFAULT_WALLPAPER_SETTINGS }, repaired: false };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { settings: { ...DEFAULT_WALLPAPER_SETTINGS }, repaired: true };
  }

  const raw = value as Record<string, unknown>;
  const hasValidEnabled = typeof raw.enabled === "boolean";
  const enabled = hasValidEnabled
    ? (raw.enabled as boolean)
    : DEFAULT_WALLPAPER_SETTINGS.enabled;
  const hasValidInterval = isOneOf(
    raw.intervalMinutes,
    WALLPAPER_INTERVAL_OPTIONS,
  );
  const hasValidImageCount = isOneOf(
    raw.imageCount,
    WALLPAPER_IMAGE_COUNT_OPTIONS,
  );
  const hasValidTargets =
    (raw.targetDisplayIds === null ||
      (Array.isArray(raw.targetDisplayIds) &&
        raw.targetDisplayIds.every(
          (id) => typeof id === "string" && id.length > 0,
        ))) &&
    !(
      enabled &&
      Array.isArray(raw.targetDisplayIds) &&
      raw.targetDisplayIds.length === 0
    );

  return {
    settings: {
      enabled,
      intervalMinutes: hasValidInterval
        ? (raw.intervalMinutes as WallpaperIntervalMinutes)
        : DEFAULT_WALLPAPER_SETTINGS.intervalMinutes,
      imageCount: hasValidImageCount
        ? (raw.imageCount as WallpaperImageCount)
        : getNearestImageCount(raw.imageCount),
      targetDisplayIds: hasValidTargets
        ? raw.targetDisplayIds === null
          ? null
          : [...new Set(raw.targetDisplayIds as string[])]
        : null,
    },
    repaired:
      !hasValidEnabled ||
      !hasValidInterval ||
      !hasValidImageCount ||
      !hasValidTargets,
  };
};

export const parseWallpaperSettings = (value: unknown): WallpaperSettings => {
  const normalized = normalizePersistedWallpaperSettings(value);
  if (normalized.repaired) {
    throw new Error("Invalid wallpaper settings");
  }
  return normalized.settings;
};
