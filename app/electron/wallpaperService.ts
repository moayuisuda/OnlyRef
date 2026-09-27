import { execFile } from "child_process";
import { createHash } from "crypto";
import path from "path";
import { promisify } from "util";
import type { Display } from "electron";
import fs from "fs-extra";
import sharp from "sharp";
import { lockedFs, withFileLocks } from "../backend/fileLock";
import type {
  WallpaperDisplay,
  WallpaperErrorCode,
  WallpaperImageCount,
  WallpaperSettings,
  WallpaperState,
} from "../shared/wallpaper";
import {
  DEFAULT_WALLPAPER_SETTINGS,
  normalizePersistedWallpaperSettings,
  WALLPAPER_IMAGE_COUNT_OPTIONS,
} from "../shared/wallpaper";

const execFileAsync = promisify(execFile);
const SETTINGS_KEY = "wallpaperSettings";
const ORIGINAL_WALLPAPERS_KEY = "wallpaperOriginals";
const LAST_UPDATED_AT_KEY = "wallpaperLastUpdatedAt";
const GENERATED_DIR_NAME = "wallpapers";
const DISPLAY_DIR_PATTERN = /^display-[a-f0-9]{16}$/;
const GENERATED_FILE_PREFIX = "picaptain-wallpaper-";
const GENERATED_FILE_PATTERN = /^picaptain-wallpaper-\d+\.jpg$/;
const GENERATED_TEMP_PATTERN = /^picaptain-wallpaper-\d+\.tmp\.jpg$/;
const DISPLAY_CHANGE_DEBOUNCE_MS = 800;
const DEFAULT_IMAGE_SCALE = 0.5;
const MAX_DISPLAY_IMAGE_RATIO = 1;
const DENSITY_SCALE_BY_IMAGE_COUNT: Record<WallpaperImageCount, number> = {
  4: 1,
  16: 1.6,
  32: 2.5,
};

const WINDOWS_DESKTOP_API_SOURCE = [
  "using System;",
  "using System.Collections.Generic;",
  "using System.Runtime.InteropServices;",
  "namespace PiCaptain {",
  "  [StructLayout(LayoutKind.Sequential)]",
  "  public struct NativeRect { public int Left; public int Top; public int Right; public int Bottom; }",
  "  [ComImport, Guid(\"B92B56A9-8B55-4E14-9A89-0199BBB6F93B\"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]",
  "  internal interface IDesktopWallpaper {",
  "    [PreserveSig] int SetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorId, [MarshalAs(UnmanagedType.LPWStr)] string wallpaper);",
  "    [PreserveSig] int GetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorId, [MarshalAs(UnmanagedType.LPWStr)] out string wallpaper);",
  "    [PreserveSig] int GetMonitorDevicePathAt(uint monitorIndex, [MarshalAs(UnmanagedType.LPWStr)] out string monitorId);",
  "    [PreserveSig] int GetMonitorDevicePathCount(out uint count);",
  "    [PreserveSig] int GetMonitorRECT([MarshalAs(UnmanagedType.LPWStr)] string monitorId, out NativeRect displayRect);",
  "  }",
  "  public sealed class WallpaperDisplayInfo {",
  "    public string Id { get; set; }",
  "    public int Left { get; set; }",
  "    public int Top { get; set; }",
  "    public int Width { get; set; }",
  "    public int Height { get; set; }",
  "  }",
  "  public static class DesktopWallpaperApi {",
  "    private static IDesktopWallpaper Create() {",
  "      var type = Type.GetTypeFromCLSID(new Guid(\"C2CF3110-460E-4FC1-B9D0-8A1C0C9CC4BD\"));",
  "      return (IDesktopWallpaper)Activator.CreateInstance(type);",
  "    }",
  "    private static void ThrowIfFailed(int hresult) { if (hresult < 0) Marshal.ThrowExceptionForHR(hresult); }",
  "    public static WallpaperDisplayInfo[] GetDisplays() {",
  "      var api = Create();",
  "      try {",
  "        uint count; ThrowIfFailed(api.GetMonitorDevicePathCount(out count));",
  "        var displays = new List<WallpaperDisplayInfo>();",
  "        for (uint index = 0; index < count; index++) {",
  "          string id; ThrowIfFailed(api.GetMonitorDevicePathAt(index, out id));",
  "          NativeRect rect; var result = api.GetMonitorRECT(id, out rect);",
  "          if (result == 1) continue;",
  "          ThrowIfFailed(result);",
  "          displays.Add(new WallpaperDisplayInfo { Id = id, Left = rect.Left, Top = rect.Top, Width = rect.Right - rect.Left, Height = rect.Bottom - rect.Top });",
  "        }",
  "        return displays.ToArray();",
  "      } finally { Marshal.FinalReleaseComObject(api); }",
  "    }",
  "    public static void SetWallpaper(string monitorId, string wallpaper) {",
  "      var api = Create();",
  "      try { ThrowIfFailed(api.SetWallpaper(monitorId, wallpaper)); }",
  "      finally { Marshal.FinalReleaseComObject(api); }",
  "    }",
  "    public static string GetWallpaper(string monitorId) {",
  "      var api = Create();",
  "      try { string wallpaper; ThrowIfFailed(api.GetWallpaper(monitorId, out wallpaper)); return wallpaper; }",
  "      finally { Marshal.FinalReleaseComObject(api); }",
  "    }",
  "  }",
  "}",
].join("\n");

type WallpaperServiceDeps = {
  getDisplays: () => Display[];
  getPrimaryDisplay: () => Display;
  getStorageDir: () => string;
  getRandomImagePaths: (count?: number) => string[];
  readSettings: () => Promise<Record<string, unknown>>;
  patchSettings: (patch: Record<string, unknown>) => Promise<unknown>;
  onStateChange?: (state: WallpaperState) => void;
};

type TileRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ImageLayout = {
  input: Buffer;
  width: number;
  height: number;
};

type PackedTile = {
  image: ImageLayout;
  renderedWidth: number;
  renderedHeight: number;
  source: TileRect;
  rect: TileRect;
};

type PreparedImage = {
  image: ImageLayout;
  aspectRatio: number;
  preferredWidth: number;
  preferredHeight: number;
  maximumHeight: number;
};

type MosaicNode =
  | {
      type: "image";
      prepared: PreparedImage;
      aspectRatio: number;
      maximumHeight: number;
    }
  | {
      type: "horizontal" | "vertical";
      children: MosaicNode[];
      aspectRatio: number;
      maximumHeight: number;
    };

type WindowsDisplayRecord = {
  Id: string;
  Left: number;
  Top: number;
  Width: number;
  Height: number;
};

const escapePowerShellLiteral = (value: string): string =>
  value.replace(/'/g, "''");

const getWindowsApiScript = (body: string): string =>
  [
    "$ErrorActionPreference = 'Stop'",
    "$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()",
    "Add-Type -TypeDefinition @'",
    WINDOWS_DESKTOP_API_SOURCE,
    "'@",
    body,
  ].join("\n");

const listWindowsDisplays = async (): Promise<WallpaperDisplay[]> => {
  const script = getWindowsApiScript(
    "[PiCaptain.DesktopWallpaperApi]::GetDisplays() | ConvertTo-Json -Compress",
  );
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, maxBuffer: 1024 * 1024 },
  );
  const raw = stdout.trim();
  if (!raw) return [];

  const parsed = JSON.parse(raw) as WindowsDisplayRecord | WindowsDisplayRecord[];
  const records = Array.isArray(parsed) ? parsed : [parsed];
  return records.map((display, index) => ({
    id: display.Id,
    index,
    name: "",
    width: display.Width,
    height: display.Height,
    isPrimary: display.Left === 0 && display.Top === 0,
  }));
};

const listMacDisplays = (
  displays: Display[],
  primaryDisplay: Display,
): WallpaperDisplay[] =>
  displays.map((display, index) => ({
    id: String(display.id),
    index,
    name: display.label,
    width: Math.max(1, Math.round(display.size.width * display.scaleFactor)),
    height: Math.max(1, Math.round(display.size.height * display.scaleFactor)),
    isPrimary: display.id === primaryDisplay.id,
  }));

const listSystemDisplays = async (
  deps: Pick<WallpaperServiceDeps, "getDisplays" | "getPrimaryDisplay">,
): Promise<WallpaperDisplay[]> => {
  if (process.platform === "win32") return listWindowsDisplays();
  if (process.platform === "darwin") {
    return listMacDisplays(deps.getDisplays(), deps.getPrimaryDisplay());
  }
  return [];
};

const applyWindowsWallpaper = async (
  displayId: string,
  imagePath: string | null,
): Promise<void> => {
  const wallpaperArgument =
    imagePath === null ? "$null" : `'${escapePowerShellLiteral(imagePath)}'`;
  const script = getWindowsApiScript(
    `[PiCaptain.DesktopWallpaperApi]::SetWallpaper('${escapePowerShellLiteral(displayId)}', ${wallpaperArgument})`,
  );
  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true },
  );
};

const getWindowsWallpaper = async (displayId: string): Promise<string | null> => {
  const script = getWindowsApiScript(
    `[PiCaptain.DesktopWallpaperApi]::GetWallpaper('${escapePowerShellLiteral(displayId)}') | ConvertTo-Json -Compress`,
  );
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true },
  );
  const raw = stdout.trim();
  if (!raw) return null;
  const wallpaper = JSON.parse(raw) as unknown;
  return typeof wallpaper === "string" && wallpaper.length > 0 ? wallpaper : null;
};

const applyMacWallpaper = async (
  displayIndex: number,
  imagePath: string,
): Promise<void> => {
  const escapedPath = imagePath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `tell application "System Events" to set picture of desktop ${displayIndex + 1} to POSIX file "${escapedPath}"`;
  await execFileAsync("/usr/bin/osascript", ["-e", script]);
};

const getMacWallpaper = async (displayIndex: number): Promise<string | null> => {
  const script = `tell application "System Events" to get picture of desktop ${displayIndex + 1}`;
  const { stdout } = await execFileAsync("/usr/bin/osascript", ["-e", script]);
  const wallpaper = stdout.trim();
  return wallpaper.length > 0 ? wallpaper : null;
};

const applySystemWallpaper = async (
  display: WallpaperDisplay,
  imagePath: string | null,
): Promise<void> => {
  if (process.platform === "win32") {
    await applyWindowsWallpaper(display.id, imagePath);
    return;
  }
  if (process.platform === "darwin") {
    if (imagePath === null) throw new Error("macOS wallpaper path is unavailable");
    await applyMacWallpaper(display.index, imagePath);
    return;
  }
  throw new Error("Unsupported platform");
};

const getSystemWallpaper = async (
  display: WallpaperDisplay,
): Promise<string | null> => {
  if (process.platform === "win32") return getWindowsWallpaper(display.id);
  if (process.platform === "darwin") return getMacWallpaper(display.index);
  throw new Error("Unsupported platform");
};

const loadImageLayout = async (imagePath: string): Promise<ImageLayout> => {
  const input = (await lockedFs.readFile(imagePath)) as Buffer;
  const metadata = await sharp(input).metadata();
  const { width, height } = metadata.autoOrient;
  return {
    input,
    width,
    height,
  };
};

const splitProportionally = (total: number, weights: number[]): number[] => {
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const exact = weights.map((weight) => (total * weight) / weightTotal);
  const values = exact.map(Math.floor);
  const remainder = total - values.reduce((sum, value) => sum + value, 0);
  const remainderOrder = exact
    .map((value, index) => ({ index, fraction: value - values[index] }))
    .sort((left, right) => right.fraction - left.fraction);

  for (let index = 0; index < remainder; index += 1) {
    values[remainderOrder[index].index] += 1;
  }
  return values;
};

const createHorizontalNode = (children: MosaicNode[]): MosaicNode => ({
  type: "horizontal",
  children,
  aspectRatio: children.reduce((sum, child) => sum + child.aspectRatio, 0),
  maximumHeight: Math.min(...children.map((child) => child.maximumHeight)),
});

const createVerticalNode = (children: MosaicNode[]): MosaicNode => {
  const aspectRatio =
    1 /
    children.reduce((sum, child) => sum + 1 / child.aspectRatio, 0);
  return {
    type: "vertical",
    children,
    aspectRatio,
    maximumHeight: Math.min(
      ...children.map(
        (child) =>
          (child.maximumHeight * child.aspectRatio) / aspectRatio,
      ),
    ),
  };
};

const buildRecursiveMosaic = (
  images: PreparedImage[],
  targetAspectRatio: number,
): MosaicNode => {
  if (images.length === 1) {
    const prepared = images[0];
    return {
      type: "image",
      prepared,
      aspectRatio: prepared.aspectRatio,
      maximumHeight: prepared.maximumHeight,
    };
  }

  const areas = images.map(
    (image) => image.preferredWidth * image.preferredHeight,
  );
  const totalArea = areas.reduce((sum, area) => sum + area, 0);
  let firstArea = 0;
  let splitIndex = 1;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < images.length; index += 1) {
    firstArea += areas[index - 1];
    const distance = Math.abs(totalArea / 2 - firstArea);
    if (distance < closestDistance) {
      closestDistance = distance;
      splitIndex = index;
    }
  }

  const firstImages = images.slice(0, splitIndex);
  const secondImages = images.slice(splitIndex);
  const firstShare = areas
    .slice(0, splitIndex)
    .reduce((sum, area) => sum + area, 0) / totalArea;

  if (targetAspectRatio >= 1) {
    return createHorizontalNode([
      buildRecursiveMosaic(firstImages, targetAspectRatio * firstShare),
      buildRecursiveMosaic(
        secondImages,
        targetAspectRatio * (1 - firstShare),
      ),
    ]);
  }

  return createVerticalNode([
    buildRecursiveMosaic(firstImages, targetAspectRatio / firstShare),
    buildRecursiveMosaic(
      secondImages,
      targetAspectRatio / (1 - firstShare),
    ),
  ]);
};

const appendMosaicTiles = (
  node: MosaicNode,
  rect: TileRect,
  displayWidth: number,
  displayHeight: number,
  tiles: PackedTile[],
): void => {
  if (node.type === "image") {
    const visibleLeft = Math.max(0, rect.left);
    const visibleTop = Math.max(0, rect.top);
    const visibleRight = Math.min(displayWidth, rect.left + rect.width);
    const visibleBottom = Math.min(displayHeight, rect.top + rect.height);
    const visibleWidth = visibleRight - visibleLeft;
    const visibleHeight = visibleBottom - visibleTop;
    if (visibleWidth <= 0 || visibleHeight <= 0) return;
    tiles.push({
      image: node.prepared.image,
      renderedWidth: rect.width,
      renderedHeight: rect.height,
      source: {
        left: visibleLeft - rect.left,
        top: visibleTop - rect.top,
        width: visibleWidth,
        height: visibleHeight,
      },
      rect: {
        left: visibleLeft,
        top: visibleTop,
        width: visibleWidth,
        height: visibleHeight,
      },
    });
    return;
  }

  if (node.type === "horizontal") {
    const widths = splitProportionally(
      rect.width,
      node.children.map((child) => child.aspectRatio),
    );
    let left = rect.left;
    node.children.forEach((child, index) => {
      appendMosaicTiles(
        child,
        { left, top: rect.top, width: widths[index], height: rect.height },
        displayWidth,
        displayHeight,
        tiles,
      );
      left += widths[index];
    });
    return;
  }

  const heights = splitProportionally(
    rect.height,
    node.children.map((child) => 1 / child.aspectRatio),
  );
  let top = rect.top;
  node.children.forEach((child, index) => {
    appendMosaicTiles(
      child,
      { left: rect.left, top, width: rect.width, height: heights[index] },
      displayWidth,
      displayHeight,
      tiles,
    );
    top += heights[index];
  });
};

const renderMosaicRoot = (
  root: MosaicNode,
  display: WallpaperDisplay,
): PackedTile[] => {
  const displayAspectRatio = display.width / display.height;
  const renderedHeight =
    root.aspectRatio >= displayAspectRatio
      ? display.height
      : display.width / root.aspectRatio;
  const rootHeight = Math.max(1, Math.ceil(renderedHeight));
  const rootWidth = Math.max(
    display.width,
    Math.ceil(rootHeight * root.aspectRatio),
  );
  const tiles: PackedTile[] = [];
  appendMosaicTiles(
    root,
    {
      left: Math.floor((display.width - rootWidth) / 2),
      top: Math.floor((display.height - rootHeight) / 2),
      width: rootWidth,
      height: rootHeight,
    },
    display.width,
    display.height,
    tiles,
  );
  return tiles;
};

const buildPackedTiles = async (
  imagePaths: string[],
  display: WallpaperDisplay,
  targetImageCount: WallpaperImageCount,
): Promise<PackedTile[]> => {
  const preparedImages: PreparedImage[] = [];
  const displayAspectRatio = display.width / display.height;
  let densityImageCount: number | null = null;

  for (const imagePath of imagePaths) {
    const image = await loadImageLayout(imagePath);
    const preferredScale = Math.min(
      DEFAULT_IMAGE_SCALE,
      (display.width * MAX_DISPLAY_IMAGE_RATIO) / image.width,
      (display.height * MAX_DISPLAY_IMAGE_RATIO) / image.height,
    );
    const maximumScale = Math.min(
      1,
      (display.width * MAX_DISPLAY_IMAGE_RATIO) / image.width,
      (display.height * MAX_DISPLAY_IMAGE_RATIO) / image.height,
    );
    preparedImages.push({
      image,
      aspectRatio: image.width / image.height,
      preferredWidth: image.width * preferredScale,
      preferredHeight: image.height * preferredScale,
      maximumHeight: image.height * maximumScale,
    });
    if (preparedImages.length < WALLPAPER_IMAGE_COUNT_OPTIONS[0]) continue;
    if (
      densityImageCount !== null &&
      preparedImages.length < densityImageCount
    ) {
      continue;
    }

    const root = buildRecursiveMosaic(preparedImages, displayAspectRatio);
    const renderedHeight =
      root.aspectRatio >= displayAspectRatio
        ? display.height
        : display.width / root.aspectRatio;
    if (renderedHeight > root.maximumHeight) continue;

    if (densityImageCount === null) {
      // 先找到无放大铺满屏幕所需的基准数量，再按密度拉开图片数量。
      densityImageCount = Math.max(
        targetImageCount,
        Math.ceil(
          preparedImages.length *
            DENSITY_SCALE_BY_IMAGE_COUNT[targetImageCount],
        ),
      );
      if (preparedImages.length < densityImageCount) continue;
    }
    return renderMosaicRoot(root, display);
  }

  throw new Error("Not enough images to fill the wallpaper");
};

const getDisplayDirectoryName = (displayId: string): string => {
  const digest = createHash("sha256").update(displayId).digest("hex").slice(0, 16);
  return `display-${digest}`;
};

const sameDisplayIds = (
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean =>
  left.size === right.size && [...left].every((id) => right.has(id));

type OriginalWallpapers = Record<string, string | null>;

type WallpaperSnapshot = {
  display: WallpaperDisplay;
  wallpaper: string | null;
};

const parseOriginalWallpapers = (value: unknown): OriginalWallpapers => {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid original wallpaper settings");
  }

  const entries = Object.entries(value);
  if (
    entries.some(
      ([displayId, wallpaper]) =>
        displayId.length === 0 ||
        (wallpaper !== null &&
          (typeof wallpaper !== "string" || wallpaper.length === 0)),
    )
  ) {
    throw new Error("Invalid original wallpaper settings");
  }
  return Object.fromEntries(entries) as OriginalWallpapers;
};

const hasOriginalWallpaper = (
  originals: OriginalWallpapers,
  displayId: string,
): boolean => Object.prototype.hasOwnProperty.call(originals, displayId);

const parseLastUpdatedAt = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error("Invalid wallpaper last updated time");
  }
  return Math.floor(value);
};

export class WallpaperService {
  private readonly deps: WallpaperServiceDeps;
  private settings: WallpaperSettings = { ...DEFAULT_WALLPAPER_SETTINGS };
  private originalWallpapers: OriginalWallpapers = {};
  private timer: NodeJS.Timeout | null = null;
  private displayChangeTimer: NodeJS.Timeout | null = null;
  private updateTask: Promise<WallpaperState> | null = null;
  private settingsUpdateTail: Promise<void> = Promise.resolve();
  private state: WallpaperState = {
    supported: process.platform === "win32" || process.platform === "darwin",
    displays: [],
    settings: { ...DEFAULT_WALLPAPER_SETTINGS },
    updating: false,
    lastUpdatedAt: null,
    nextUpdatedAt: null,
    errorCode: null,
  };

  constructor(deps: WallpaperServiceDeps) {
    this.deps = deps;
  }

  async start(): Promise<void> {
    await this.refreshDisplays();
    const persisted = await this.deps.readSettings();
    const repairPatch: Record<string, unknown> = {};
    let lastUpdatedAt: number | null = null;

    const normalizedSettings = normalizePersistedWallpaperSettings(
      persisted[SETTINGS_KEY],
    );
    this.settings = normalizedSettings.settings;
    if (normalizedSettings.repaired) {
      console.warn("[wallpaper] repaired persisted wallpaper settings");
      repairPatch[SETTINGS_KEY] = this.settings;
    }

    try {
      this.originalWallpapers = parseOriginalWallpapers(
        persisted[ORIGINAL_WALLPAPERS_KEY],
      );
    } catch (error) {
      console.error("[wallpaper] repaired invalid original wallpapers", error);
      this.originalWallpapers = {};
      repairPatch[ORIGINAL_WALLPAPERS_KEY] = this.originalWallpapers;
    }

    try {
      lastUpdatedAt = parseLastUpdatedAt(persisted[LAST_UPDATED_AT_KEY]);
    } catch (error) {
      console.error("[wallpaper] repaired invalid update time", error);
      repairPatch[LAST_UPDATED_AT_KEY] = null;
    }

    this.patchState({ settings: { ...this.settings }, lastUpdatedAt });
    if (Object.keys(repairPatch).length > 0) {
      try {
        await this.deps.patchSettings(repairPatch);
      } catch (error) {
        console.error("[wallpaper] failed to persist repaired settings", error);
        this.patchState({ errorCode: "request-failed" });
      }
    }
    try {
      await this.cleanupTemporaryFiles();
    } catch (error) {
      console.error("[wallpaper] startup cleanup failed", error);
      this.patchState({ errorCode: "cleanup-failed" });
    }

    if (this.settings.enabled && this.state.supported) {
      if (this.isUpdateDue()) {
        await this.refresh();
      } else {
        this.scheduleNextUpdate();
      }
    }
  }

  stop(): void {
    this.clearTimer();
    if (this.displayChangeTimer) {
      clearTimeout(this.displayChangeTimer);
      this.displayChangeTimer = null;
    }
  }

  getState(): WallpaperState {
    return {
      ...this.state,
      displays: this.state.displays.map((display) => ({ ...display })),
      settings: {
        ...this.state.settings,
        targetDisplayIds:
          this.state.settings.targetDisplayIds === null
            ? null
            : [...this.state.settings.targetDisplayIds],
      },
    };
  }

  async refreshDisplays(): Promise<void> {
    if (!this.state.supported) return;
    try {
      const displays = await listSystemDisplays(this.deps);
      this.patchState({ displays, errorCode: null });
    } catch (error) {
      console.error("[wallpaper] failed to enumerate displays", error);
      this.patchState({ displays: [], errorCode: "display-unavailable" });
    }
  }

  handleDisplaysChanged(): void {
    if (this.displayChangeTimer) clearTimeout(this.displayChangeTimer);
    this.displayChangeTimer = setTimeout(() => {
      this.displayChangeTimer = null;
      void (async () => {
        await this.refreshDisplays();
        if (this.updateTask) await this.updateTask;
        const restoreError = await this.restoreUnmanagedDisplays();
        if (!this.settings.enabled) {
          if (restoreError) this.patchState({ errorCode: restoreError });
          return;
        }
        await this.refresh();
        if (restoreError) this.patchState({ errorCode: restoreError });
      })();
    }, DISPLAY_CHANGE_DEBOUNCE_MS);
  }

  async updateSettings(settings: WallpaperSettings): Promise<WallpaperState> {
    const task = this.settingsUpdateTail.then(() =>
      this.performSettingsUpdate(settings),
    );
    // 单个请求失败不能阻断后续设置更新，调用方仍通过 task 收到原始异常。
    this.settingsUpdateTail = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private async performSettingsUpdate(
    settings: WallpaperSettings,
  ): Promise<WallpaperState> {
    if (this.updateTask) await this.updateTask;

    const previous = this.settings;
    const previousTargetIds = this.getTargetDisplayIds(previous);
    const nextTargetIds = this.getTargetDisplayIds(settings);
    await this.deps.patchSettings({ [SETTINGS_KEY]: settings });

    this.settings = {
      ...settings,
      targetDisplayIds:
        settings.targetDisplayIds === null
          ? null
          : [...settings.targetDisplayIds],
    };
    this.patchState({ settings: { ...this.settings }, errorCode: null });
    const restoreError = await this.restoreUnmanagedDisplays();

    if (!settings.enabled || !this.state.supported) {
      this.clearTimer();
      if (restoreError) this.patchState({ errorCode: restoreError });
      return this.getState();
    }

    const selectionChanged = !sameDisplayIds(
      previousTargetIds,
      nextTargetIds,
    );
    const shouldRefreshAll =
      !previous.enabled ||
      previous.imageCount !== settings.imageCount ||
      (!selectionChanged && this.isUpdateDue());
    const newlyTargetedDisplayIds = selectionChanged
      ? new Set([...nextTargetIds].filter((id) => !previousTargetIds.has(id)))
      : new Set<string>();

    if (shouldRefreshAll) {
      await this.refresh();
    } else if (newlyTargetedDisplayIds.size > 0) {
      // 切换显示器时只更新新加入的目标，避免无关显示器的壁纸跟着变化。
      await this.refresh(newlyTargetedDisplayIds);
    } else {
      this.scheduleNextUpdate();
    }
    if (restoreError) this.patchState({ errorCode: restoreError });
    return this.getState();
  }

  refresh(targetDisplayIds?: ReadonlySet<string>): Promise<WallpaperState> {
    if (this.updateTask) return this.updateTask;
    this.updateTask = this.performRefresh(targetDisplayIds).finally(() => {
      this.updateTask = null;
    });
    return this.updateTask;
  }

  private getTargetDisplayIds(settings = this.settings): Set<string> {
    const targets = settings.targetDisplayIds;
    if (targets === null) {
      return new Set(
        this.state.displays
          .filter((display) => display.isPrimary)
          .map((display) => display.id),
      );
    }
    const availableDisplayIds = new Set(
      this.state.displays.map((display) => display.id),
    );
    return new Set(targets.filter((id) => availableDisplayIds.has(id)));
  }

  private getTargetDisplays(
    targetDisplayIds: ReadonlySet<string> = this.getTargetDisplayIds(),
  ): WallpaperDisplay[] {
    return this.state.displays.filter((display) =>
      targetDisplayIds.has(display.id),
    );
  }

  private isDisplayTargeted(displayId: string): boolean {
    const targets = this.settings.targetDisplayIds;
    if (targets !== null) return targets.includes(displayId);
    return this.state.displays.some(
      (display) => display.id === displayId && display.isPrimary,
    );
  }

  private async persistOriginalWallpapers(): Promise<void> {
    await this.deps.patchSettings({
      [ORIGINAL_WALLPAPERS_KEY]: { ...this.originalWallpapers },
    });
  }

  private async captureWallpapers(
    displays: WallpaperDisplay[],
  ): Promise<WallpaperSnapshot[]> {
    return Promise.all(
      displays.map(async (display) => ({
        display,
        wallpaper: await getSystemWallpaper(display),
      })),
    );
  }

  private async restoreChangedWallpapers(
    snapshots: WallpaperSnapshot[],
  ): Promise<void> {
    for (const snapshot of snapshots) {
      const current = await getSystemWallpaper(snapshot.display);
      if (current === snapshot.wallpaper) continue;
      await applySystemWallpaper(snapshot.display, snapshot.wallpaper);
    }
  }

  private async ensureOriginalWallpaper(
    display: WallpaperDisplay,
  ): Promise<void> {
    if (hasOriginalWallpaper(this.originalWallpapers, display.id)) return;
    const currentWallpaper = await getSystemWallpaper(display);
    const generatedRoot = `${path.resolve(
      this.deps.getStorageDir(),
      GENERATED_DIR_NAME,
    )}${path.sep}`;
    const wallpaper =
      currentWallpaper !== null &&
      path.resolve(currentWallpaper).startsWith(generatedRoot)
        ? null
        : currentWallpaper;
    this.originalWallpapers[display.id] = wallpaper;
    try {
      await this.persistOriginalWallpapers();
    } catch (error) {
      delete this.originalWallpapers[display.id];
      throw error;
    }
  }

  private async restoreUnmanagedDisplays(): Promise<WallpaperErrorCode | null> {
    let errorCode: WallpaperErrorCode | null = null;
    let originalsChanged = false;
    let protectedWallpapers: WallpaperSnapshot[];

    try {
      protectedWallpapers = await this.captureWallpapers(
        this.settings.enabled ? this.getTargetDisplays() : [],
      );
    } catch (error) {
      console.error("[wallpaper] failed to snapshot managed displays", error);
      return "apply-failed";
    }

    for (const display of this.state.displays) {
      if (!hasOriginalWallpaper(this.originalWallpapers, display.id)) continue;
      if (this.settings.enabled && this.isDisplayTargeted(display.id)) continue;

      try {
        await applySystemWallpaper(
          display,
          this.originalWallpapers[display.id],
        );
      } catch (error) {
        console.error(
          `[wallpaper] failed to restore wallpaper for ${display.id}`,
          error,
        );
        errorCode ??= "apply-failed";
        continue;
      }

      delete this.originalWallpapers[display.id];
      originalsChanged = true;
      try {
        await this.cleanupDisplayWallpapers(display.id);
      } catch (error) {
        console.error(
          `[wallpaper] failed to clean restored display ${display.id}`,
          error,
        );
        errorCode ??= "cleanup-failed";
      }
    }

    try {
      // Windows 从“所有屏幕共用一张图”切换到逐屏模式时，第一次写入可能
      // 连带修改其他屏幕，因此必须恢复并固定仍受管理的显示器。
      await this.restoreChangedWallpapers(protectedWallpapers);
    } catch (error) {
      console.error("[wallpaper] failed to preserve managed displays", error);
      errorCode ??= "apply-failed";
    }

    if (originalsChanged) {
      try {
        await this.persistOriginalWallpapers();
      } catch (error) {
        console.error("[wallpaper] failed to persist restored displays", error);
        errorCode ??= "request-failed";
      }
    }
    return errorCode;
  }

  private async performRefresh(
    targetDisplayIds?: ReadonlySet<string>,
  ): Promise<WallpaperState> {
    if (!this.state.supported) {
      this.patchState({ errorCode: "unsupported-platform" });
      return this.getState();
    }

    this.clearTimer();
    this.patchState({ updating: true, errorCode: null });
    let errorCode: WallpaperErrorCode | null = null;
    let updatedDisplayCount = 0;
    let successfulUpdatedAt: number | null = null;

    try {
      const displays = this.getTargetDisplays(targetDisplayIds);
      if (displays.length === 0) {
        errorCode = "display-unavailable";
      } else {
        let protectedWallpapers: WallpaperSnapshot[] = [];
        try {
          const targetIds = new Set(displays.map((display) => display.id));
          protectedWallpapers = await this.captureWallpapers(
            this.state.displays.filter((display) => !targetIds.has(display.id)),
          );
        } catch (error) {
          console.error("[wallpaper] failed to snapshot untargeted displays", error);
          errorCode = "apply-failed";
        }

        if (errorCode === null) {
          try {
            for (const display of displays) {
              const imagePaths = this.deps.getRandomImagePaths();
              if (imagePaths.length < 2) {
                errorCode = "not-enough-images";
                break;
              }

              let outputPath = "";
              try {
                outputPath = await this.generateWallpaper(imagePaths, display);
              } catch (error) {
                console.error(
                  `[wallpaper] generation failed for ${display.id}`,
                  error,
                );
                errorCode ??= "generation-failed";
                continue;
              }

              try {
                await this.ensureOriginalWallpaper(display);
                await applySystemWallpaper(display, outputPath);
              } catch (error) {
                console.error(`[wallpaper] apply failed for ${display.id}`, error);
                await lockedFs.remove(outputPath).catch(() => undefined);
                errorCode = "apply-failed";
                continue;
              }

              updatedDisplayCount += 1;
              try {
                await this.cleanupGeneratedWallpapers(outputPath);
              } catch (error) {
                console.error(`[wallpaper] cleanup failed for ${display.id}`, error);
                errorCode ??= "cleanup-failed";
              }
            }
          } finally {
            try {
              // 保证定向刷新不会把 Windows 仍处于共享状态的其他屏幕带着改掉。
              await this.restoreChangedWallpapers(protectedWallpapers);
            } catch (error) {
              console.error(
                "[wallpaper] failed to preserve untargeted displays",
                error,
              );
              errorCode ??= "apply-failed";
            }
          }
        }
      }

      if (updatedDisplayCount > 0) {
        successfulUpdatedAt = Date.now();
        try {
          await this.deps.patchSettings({
            [LAST_UPDATED_AT_KEY]: successfulUpdatedAt,
          });
        } catch (error) {
          console.error("[wallpaper] failed to persist update time", error);
          errorCode ??= "request-failed";
        }

        try {
          await this.cleanupDetachedDisplayDirectories();
        } catch (error) {
          console.error("[wallpaper] detached display cleanup failed", error);
          errorCode ??= "cleanup-failed";
        }
      }
    } catch (error) {
      console.error("[wallpaper] update failed", error);
      errorCode ??= "generation-failed";
    } finally {
      this.patchState({
        updating: false,
        lastUpdatedAt:
          successfulUpdatedAt ?? this.state.lastUpdatedAt,
        errorCode,
      });
      if (this.settings.enabled) {
        this.scheduleNextUpdate(successfulUpdatedAt ?? Date.now());
      }
    }

    return this.getState();
  }

  private async generateWallpaper(
    imagePaths: string[],
    display: WallpaperDisplay,
  ): Promise<string> {
    const generatedDir = path.join(
      this.deps.getStorageDir(),
      GENERATED_DIR_NAME,
      getDisplayDirectoryName(display.id),
    );
    await lockedFs.ensureDir(generatedDir);

    const timestamp = Date.now();
    const outputPath = path.join(
      generatedDir,
      `${GENERATED_FILE_PREFIX}${timestamp}.jpg`,
    );
    const tempPath = path.join(
      generatedDir,
      `${GENERATED_FILE_PREFIX}${timestamp}.tmp.jpg`,
    );

    try {
      const tiles = await buildPackedTiles(
        imagePaths,
        display,
        this.settings.imageCount,
      );
      await withFileLocks([tempPath, outputPath], async () => {
        const tileLayers = await Promise.all(
          tiles.map(async ({
            image,
            renderedWidth,
            renderedHeight,
            source,
            rect,
          }) => {
            const input = await sharp(image.input)
              .rotate()
              .resize(renderedWidth, renderedHeight, {
                fit: "fill",
                withoutEnlargement: true,
              })
              .extract(source)
              .flatten({ background: "#ffffff" })
              .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
              .toBuffer();
            return {
              input,
              left: rect.left,
              top: rect.top,
            };
          }),
        );

        await sharp({
          create: {
            width: display.width,
            height: display.height,
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
          },
        })
          .composite(tileLayers)
          .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
          .toFile(tempPath);

        await fs.rename(tempPath, outputPath);
      });
    } catch (error) {
      await Promise.all([
        lockedFs.remove(tempPath).catch(() => undefined),
        lockedFs.remove(outputPath).catch(() => undefined),
      ]);
      throw error;
    }

    return outputPath;
  }

  private async cleanupTemporaryFiles(): Promise<void> {
    const generatedRoot = path.join(
      this.deps.getStorageDir(),
      GENERATED_DIR_NAME,
    );
    if (!(await lockedFs.pathExists(generatedRoot))) return;
    const entries = (await lockedFs.readdir(generatedRoot)) as string[];

    await Promise.all(
      entries
        .filter((name) => DISPLAY_DIR_PATTERN.test(name))
        .map(async (directoryName) => {
          const directoryPath = path.join(generatedRoot, directoryName);
          const files = (await lockedFs.readdir(directoryPath)) as string[];
          await Promise.all(
            files
              .filter((name) => GENERATED_TEMP_PATTERN.test(name))
              .map((name) => lockedFs.remove(path.join(directoryPath, name))),
          );
        }),
    );
  }

  private async cleanupGeneratedWallpapers(activePath: string): Promise<void> {
    const generatedDir = path.dirname(activePath);
    const entries = (await lockedFs.readdir(generatedDir)) as string[];
    const activeName = path.basename(activePath);
    await Promise.all(
      entries
        .filter(
          (name) =>
            name !== activeName &&
            (GENERATED_FILE_PATTERN.test(name) || GENERATED_TEMP_PATTERN.test(name)),
        )
        .map((name) => lockedFs.remove(path.join(generatedDir, name))),
    );
  }

  private async cleanupDisplayWallpapers(displayId: string): Promise<void> {
    const generatedDir = path.join(
      this.deps.getStorageDir(),
      GENERATED_DIR_NAME,
      getDisplayDirectoryName(displayId),
    );
    if (await lockedFs.pathExists(generatedDir)) {
      await lockedFs.remove(generatedDir);
    }
  }

  private async cleanupDetachedDisplayDirectories(): Promise<void> {
    const generatedRoot = path.join(
      this.deps.getStorageDir(),
      GENERATED_DIR_NAME,
    );
    if (!(await lockedFs.pathExists(generatedRoot))) return;

    const attachedDirectories = new Set(
      this.state.displays.map((display) => getDisplayDirectoryName(display.id)),
    );
    const entries = (await lockedFs.readdir(generatedRoot)) as string[];
    await Promise.all(
      entries
        .filter(
          (name) =>
            DISPLAY_DIR_PATTERN.test(name) && !attachedDirectories.has(name),
        )
        .map((name) => lockedFs.remove(path.join(generatedRoot, name))),
    );
  }

  private scheduleNextUpdate(
    referenceTime = this.state.lastUpdatedAt ?? Date.now(),
  ): void {
    this.clearTimer();
    if (!this.settings.enabled || !this.state.supported) return;
    const nextUpdatedAt = this.getNextUpdateAt(referenceTime);
    const delayMs = Math.max(0, nextUpdatedAt - Date.now());
    this.timer = setTimeout(() => {
      void this.refresh();
    }, delayMs);
    this.patchState({ nextUpdatedAt });
  }

  private getNextUpdateAt(
    referenceTime = this.state.lastUpdatedAt ?? Date.now(),
  ): number {
    const intervalMs = this.settings.intervalMinutes * 60 * 1000;
    return referenceTime + intervalMs;
  }

  private isUpdateDue(): boolean {
    return (
      this.state.lastUpdatedAt === null ||
      this.getNextUpdateAt() <= Date.now()
    );
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.patchState({ nextUpdatedAt: null });
  }

  private patchState(patch: Partial<WallpaperState>): void {
    this.state = { ...this.state, ...patch };
    this.deps.onStateChange?.(this.getState());
  }
}
