import path from "path";
import express from "express";
import { clipboard, nativeImage, shell } from "electron";
import { v4 as uuidv4 } from "uuid";
import type { ImageDb, ImageMeta, StorageIncompatibleError } from "../db";
import type { SendToRenderer } from "../server";
import type { I18nKey, I18nParams } from "../../shared/i18n/types";
import fs from "fs-extra";
import { lockedFs, withFileLock, withFileLocks } from "../fileLock";

type VectorMode = "encode-image" | "encode-text";
type VectorBatchResult = { vector: number[] | null; error?: string };
type ImportSourceType = "url" | "path" | "buffer";
type ImportPayload = {
  imageBase64?: string;
  imageUrl?: string;
  type?: ImportSourceType;
  data?: string;
  filename?: string;
  name?: string;
  pageUrl?: string;
  tags?: string[];
};
type ImportSource = {
  sourceType: ImportSourceType;
  sourceData: string | Buffer;
};
type ImportedImageRecord = {
  id: string;
  rowid: number;
  localPath: string;
  meta: ImageMeta;
};
type ImagePostProcessItem = {
  id: string;
  rowid: number;
  localPath: string;
  processVector: boolean;
  processDominantColor: boolean;
  processTone: boolean;
};
type ImagePostProcessOptions = {
  vectorContext: "import" | "batch";
  notifyVectorFailure?: boolean;
  onVectorProgress?: (current: number, total: number) => void;
};

type VectorSearchSourcePayload =
  | {
      type: "text";
      query: string;
    }
  | {
      type: "imageId";
      imageId: string;
    }
  | {
      type: "localPath";
      localPath: string;
    };

const VECTOR_INDEX_BATCH_SIZE = 8;
const IMPORT_BATCH_CONCURRENCY = 4;
const IMAGE_POST_PROCESS_CONCURRENCY = 3;

type ImagesRouteDeps = {
  getImageDb: () => ImageDb;
  getIncompatibleError: () => StorageIncompatibleError | null;
  getStorageDir: () => string;
  getImageDir: () => string;
  readSettings: () => Promise<Record<string, unknown>>;
  writeSettings: (settings: Record<string, unknown>) => Promise<void>;
  runPythonVector: (mode: VectorMode, arg: string) => Promise<number[] | null>;
  runPythonVectors: (paths: string[]) => Promise<VectorBatchResult[]>;
  runPythonDominantColor: (arg: string) => Promise<string | null>;
  runPythonTone: (arg: string) => Promise<string | null>;
  downloadImage: (url: string, targetPath: string) => Promise<void>;
  sendToRenderer?: SendToRenderer;
};

const ensureTags = (tags: unknown): string[] => {
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag): tag is string => typeof tag === "string");
};

const parseNumber = (raw: unknown): number | null => {
  if (typeof raw !== "string") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseLimit = (raw: unknown): number | undefined => {
  const parsed = parseNumber(raw);
  if (typeof parsed !== "number") return undefined;
  return parsed > 0 ? parsed : undefined;
};

const parseTextCursor = (query: Record<string, unknown>) => {
  const createdAt = parseNumber(query.cursorCreatedAt);
  const rowid = parseNumber(query.cursorRowid);
  const galleryOrder = parseNumber(query.cursorGalleryOrder);
  if (typeof createdAt !== "number" || typeof rowid !== "number") return null;
  return { createdAt, rowid, galleryOrder: typeof galleryOrder === "number" ? galleryOrder : null };
};

const parseVectorCursor = (query: Record<string, unknown>) => {
  const distance = parseNumber(query.cursorDistance);
  const rowid = parseNumber(query.cursorRowid);
  if (typeof distance !== "number" || typeof rowid !== "number") return null;
  return { distance, rowid };
};

const parseVectorSearchSource = (
  raw: unknown
): VectorSearchSourcePayload | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const payload = raw as Record<string, unknown>;
  const type = typeof payload.type === "string" ? payload.type.trim() : "";
  if (type === "text") {
    const query =
      typeof payload.query === "string" ? payload.query.trim() : "";
    if (!query) {
      return null;
    }
    return {
      type: "text",
      query,
    };
  }

  if (type === "imageId") {
    const imageId =
      typeof payload.imageId === "string" ? payload.imageId.trim() : "";
    if (!imageId) {
      return null;
    }
    return {
      type: "imageId",
      imageId,
    };
  }

  if (type === "localPath") {
    const localPath =
      typeof payload.localPath === "string" ? payload.localPath.trim() : "";
    if (!localPath) {
      return null;
    }
    return {
      type: "localPath",
      localPath,
    };
  }

  return null;
};

const buildTextCursor = (items: ImageMeta[]) => {
  const last = items[items.length - 1];
  if (!last) return null;
  if (typeof last.createdAt !== "number" || typeof last.rowid !== "number") return null;
  return { createdAt: last.createdAt, rowid: last.rowid, galleryOrder: last.galleryOrder ?? null };
};

const buildVectorCursor = (items: ImageMeta[]) => {
  const last = items[items.length - 1];
  if (!last) return null;
  if (
    typeof last.vectorDistance !== "number" ||
    typeof last.vectorRowid !== "number"
  ) {
    return null;
  }
  return { distance: last.vectorDistance, rowid: last.vectorRowid };
};

type OklchColor = { L: number; C: number; h: number };

const sanitizeBase = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return "image";
  let withoutControls = "";
  for (const ch of trimmed) {
    const code = ch.charCodeAt(0);
    withoutControls += code < 32 || code === 127 ? "_" : ch;
  }
  const withoutReserved = withoutControls.replace(/[\\/:*?"<>|]/g, "_");
  const collapsedWs = withoutReserved.replace(/\s+/g, " ").trim();
  const noTrailing = collapsedWs.replace(/[ .]+$/g, "");
  const normalized = noTrailing || "image";
  const maxLen = 80;
  return normalized.length > maxLen ? normalized.slice(0, maxLen) : normalized;
};

const normalizeExt = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withDot = trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
  if (!/^\.[a-zA-Z0-9]{1,10}$/.test(withDot)) return null;
  return withDot.toLowerCase();
};

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".tiff",
  ".tif",
  ".heic",
  ".heif",
  ".avif",
]);

const isImageFilename = (filename: string): boolean =>
  IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());

const listImageFiles = async (dir: string): Promise<string[]> => {
  if (!(await lockedFs.pathExists(dir))) return [];
  const entries = (await lockedFs.readdir(dir, {
    withFileTypes: true,
  })) as unknown as fs.Dirent[];
  return entries
    .filter((entry) => entry.isFile() && isImageFilename(entry.name))
    .map((entry) => entry.name);
};

const pruneMissingIndexedImages = (
  imageDb: ImageDb,
  indexedItems: ImageMeta[],
  diskFilenames: Set<string>
) => {
  let deleted = 0;
  const retainedItems: ImageMeta[] = [];

  indexedItems.forEach((item) => {
    const diskFilename = path.basename(item.imagePath);
    if (!diskFilenames.has(diskFilename)) {
      imageDb.deleteImage(item.id);
      deleted += 1;
      return;
    }
    retainedItems.push(item);
  });

  return { deleted, retainedItems };
};

const parseTags = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw.filter((tag): tag is string => typeof tag === "string");
  }
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }
  return [];
};

const normalizeHexColor = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const val = raw.trim().toLowerCase();
  if (!val) return null;
  const withHash = val.startsWith("#") ? val : `#${val}`;
  if (/^#[0-9a-f]{6}$/.test(withHash)) return withHash;
  if (/^#[0-9a-f]{3}$/.test(withHash)) {
    return `#${withHash[1]}${withHash[1]}${withHash[2]}${withHash[2]}${withHash[3]}${withHash[3]}`;
  }
  return null;
};

const hexToRgb = (
  hex: string
): { r: number; g: number; b: number } | null => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
};

const srgbToLinear = (x: number): number => {
  const v = x / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

const rgbToOklab = (rgb: {
  r: number;
  g: number;
  b: number;
}): { L: number; a: number; b: number } => {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
};

const oklabToOklch = (lab: { L: number; a: number; b: number }) => {
  const C = Math.hypot(lab.a, lab.b);
  const h = Math.atan2(lab.b, lab.a);
  return { L: lab.L, C, h };
};

const hexToOklch = (hex: string): OklchColor | null => {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return oklabToOklch(rgbToOklab(rgb));
};

const resolveOklchPayload = (raw: string): { color: string; oklch: OklchColor } | null => {
  const normalized = normalizeHexColor(raw);
  if (!normalized) return null;
  const oklch = hexToOklch(normalized);
  if (!oklch) return null;
  return { color: normalized, oklch };
};

const resolveImportSource = (payload: ImportPayload): ImportSource | null => {
  if (payload.imageBase64) {
    const base64Data = payload.imageBase64.replace(/^data:image\/\w+;base64,/, "");
    return {
      sourceType: "buffer",
      sourceData: Buffer.from(base64Data, "base64"),
    };
  }
  if (payload.type && payload.data) {
    return {
      sourceType: payload.type,
      sourceData: payload.data,
    };
  }
  if (payload.imageUrl) {
    return {
      sourceType:
        payload.imageUrl.startsWith("file://") || payload.imageUrl.startsWith("/")
          ? "path"
          : "url",
      sourceData: payload.imageUrl,
    };
  }
  return null;
};

const chunkItems = <T,>(items: T[], size: number): T[][] => {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const runWithConcurrency = async <T,>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>
): Promise<void> => {
  if (items.length === 0) return;
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await task(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
};

const mergeImagePostProcessItems = (
  items: ImagePostProcessItem[]
): ImagePostProcessItem[] => {
  const merged = new Map<string, ImagePostProcessItem>();
  items.forEach((item) => {
    const current = merged.get(item.id);
    if (!current) {
      merged.set(item.id, { ...item });
      return;
    }
    current.processVector = current.processVector || item.processVector;
    current.processDominantColor =
      current.processDominantColor || item.processDominantColor;
    current.processTone = current.processTone || item.processTone;
  });
  return Array.from(merged.values());
};

export const createImagesRouter = (deps: ImagesRouteDeps) => {
  const router = express.Router();
  const reservedImportFilenames = new Set<string>();

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

  const resolveVectorSearchLocalPath = async (
    imageDb: ImageDb,
    source: VectorSearchSourcePayload
  ): Promise<{ mode: VectorMode; arg: string } | null> => {
    if (source.type === "text") {
      return {
        mode: "encode-text",
        arg: source.query,
      };
    }

    if (source.type === "imageId") {
      const row = imageDb.getImageRowById(source.imageId);
      if (!row) {
        return null;
      }
      return {
        mode: "encode-image",
        arg: path.join(deps.getStorageDir(), row.imagePath),
      };
    }

    const resolvedPath = path.resolve(source.localPath);
    const exists = await withFileLock(resolvedPath, async () =>
      fs.pathExists(resolvedPath)
    );
    if (!exists) {
      return null;
    }

    return {
      mode: "encode-image",
      arg: resolvedPath,
    };
  };

  const runVectorSearch = async (
    imageDb: ImageDb,
    params: {
      source: VectorSearchSourcePayload;
      tags: string[];
      tone: string | null;
      color: OklchColor | null;
      effectiveLimit: number;
      cursor: { distance: number; rowid: number } | null;
    }
  ) => {
    if (params.source.type === "text" && !params.source.query.trim()) {
      return { items: [], nextCursor: null };
    }

    const settings = await deps.readSettings();
    const enableVectorSearch = Boolean(settings.enableVectorSearch);
    if (!enableVectorSearch) {
      return { items: [], nextCursor: null };
    }

    const resolved = await resolveVectorSearchLocalPath(imageDb, params.source);
    if (!resolved) {
      return { items: [], nextCursor: null };
    }

    const vector =
      resolved.mode === "encode-image"
        ? await withFileLock(resolved.arg, async () =>
            deps.runPythonVector(resolved.mode, resolved.arg)
          )
        : await deps.runPythonVector(resolved.mode, resolved.arg);

    if (!vector) {
      return { items: [], nextCursor: null };
    }

    const tagIds = imageDb.getTagIdsByNames(params.tags);
    const tagCount = params.tags.length;
    const results = imageDb.searchImages({
      vector,
      limit: params.effectiveLimit,
      tagIds,
      tagCount,
      tone: params.tone,
      color: params.color,
      afterDistance: params.cursor?.distance ?? null,
      afterRowid: params.cursor?.rowid ?? null,
    });
    const nextCursor = buildVectorCursor(results);
    return {
      items: results.map((item) => ({ ...item, isVectorResult: true })),
      nextCursor,
    };
  };

  const indexImageVector = async (
    imageDb: ImageDb,
    params: {
      id: string;
      rowid: number;
      localPath: string;
      context: "import" | "single" | "batch";
      current?: number;
      total?: number;
    }
  ): Promise<boolean> => {
    const { id, rowid, localPath, context, current, total } = params;
    console.log(`[VectorIndex] start ${context}`, {
      id,
      rowid,
      ...(typeof current === "number" ? { current } : {}),
      ...(typeof total === "number" ? { total } : {}),
      imagePath: localPath,
    });

    const vector = await deps.runPythonVector("encode-image", localPath);
    if (!vector) {
      console.error(`[VectorIndex] vector missing ${context}`, {
        id,
        rowid,
        ...(typeof current === "number" ? { current } : {}),
        ...(typeof total === "number" ? { total } : {}),
      });
      return false;
    }

    imageDb.setImageVector(rowid, vector);
    deps.sendToRenderer?.("image-updated", { id, hasVector: true });
    console.log(`[VectorIndex] stored ${context}`, {
      id,
      rowid,
      ...(typeof current === "number" ? { current } : {}),
      ...(typeof total === "number" ? { total } : {}),
      length: vector.length,
    });
    return true;
  };

  const indexImageVectorBatch = async (
    imageDb: ImageDb,
    items: {
      id: string;
      rowid: number;
      localPath: string;
      current: number;
      total: number;
    }[]
  ): Promise<number> => {
    if (items.length === 0) return 0;

    console.log("[VectorIndex] start batch-chunk", {
      size: items.length,
      firstCurrent: items[0].current,
      lastCurrent: items[items.length - 1].current,
      total: items[0].total,
    });

    const results = await deps.runPythonVectors(items.map((item) => item.localPath));
    if (results.length !== items.length) {
      throw new Error("Vector batch result length mismatch");
    }

    const successfulEntries: { item: (typeof items)[0]; vector: number[] }[] = [];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const result = results[index];
      if (result?.vector && result.vector.length > 0) {
        successfulEntries.push({ item, vector: result.vector });
        continue;
      }

      console.error("[VectorIndex] vector missing batch", {
        id: item.id,
        rowid: item.rowid,
        current: item.current,
        total: item.total,
        error: result?.error ?? "vector-missing",
      });
    }

    const writtenRowids = new Set(
      imageDb.setImageVectors(
        successfulEntries.map(({ item, vector }) => ({ rowid: item.rowid, vector }))
      )
    );

    successfulEntries.forEach(({ item, vector }) => {
      if (!writtenRowids.has(item.rowid)) {
        console.error("[VectorIndex] vector write missing batch", {
          id: item.id,
          rowid: item.rowid,
          current: item.current,
          total: item.total,
        });
        return;
      }
      deps.sendToRenderer?.("image-updated", { id: item.id, hasVector: true });
      console.log("[VectorIndex] stored batch", {
        id: item.id,
        rowid: item.rowid,
        current: item.current,
        total: item.total,
        length: vector.length,
      });
    });

    return writtenRowids.size;
  };

  const updateImageDominantColor = async (
    imageDb: ImageDb,
    item: ImagePostProcessItem
  ): Promise<void> => {
    try {
      const dominantColor = await deps.runPythonDominantColor(item.localPath);
      if (!dominantColor) return;
      const resolved = resolveOklchPayload(dominantColor);
      if (!resolved) return;
      imageDb.updateImage({
        id: item.id,
        dominantColor: resolved.color,
        dominantL: resolved.oklch.L,
        dominantC: resolved.oklch.C,
        dominantH: resolved.oklch.h,
      });
      deps.sendToRenderer?.("image-updated", {
        id: item.id,
        dominantColor: resolved.color,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Async dominant color update failed:", message);
    }
  };

  const updateImageTone = async (
    imageDb: ImageDb,
    item: ImagePostProcessItem
  ): Promise<void> => {
    try {
      const tone = await deps.runPythonTone(item.localPath);
      if (!tone) return;
      imageDb.updateImage({ id: item.id, tone });
      deps.sendToRenderer?.("image-updated", { id: item.id, tone });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Async tone update failed:", message);
    }
  };

  const runImagePostProcessing = async (
    imageDb: ImageDb,
    items: ImagePostProcessItem[],
    options: ImagePostProcessOptions
  ): Promise<{ updatedVectors: number; totalVectors: number }> => {
    if (items.length === 0) {
      return { updatedVectors: 0, totalVectors: 0 };
    }

    const vectorCandidates = items.filter((item) => item.processVector);
    let vectorItems: ImagePostProcessItem[] = [];
    if (vectorCandidates.length > 0) {
      const settings = await deps.readSettings();
      if (settings.enableVectorSearch === true) {
        vectorItems = vectorCandidates;
      }
    }

    let updatedVectors = 0;
    let vectorFailures = 0;
    let completedVectors = 0;
    const jobs: Array<() => Promise<void>> = [];
    const vectorScheduledIds = new Set<string>();

    const appendDerivativeJobs = (item: ImagePostProcessItem) => {
      if (item.processDominantColor) {
        jobs.push(() => updateImageDominantColor(imageDb, item));
      }
      if (item.processTone) {
        jobs.push(() => updateImageTone(imageDb, item));
      }
    };

    let vectorBaseIndex = 0;
    for (const chunk of chunkItems(vectorItems, VECTOR_INDEX_BATCH_SIZE)) {
      const batchItems = chunk.map((item, index) => ({
        id: item.id,
        rowid: item.rowid,
        localPath: item.localPath,
        current: vectorBaseIndex + index + 1,
        total: vectorItems.length,
      }));

      jobs.push(async () => {
        try {
          if (batchItems.length === 1) {
            const indexed = await indexImageVector(imageDb, {
              id: batchItems[0].id,
              rowid: batchItems[0].rowid,
              localPath: batchItems[0].localPath,
              context: options.vectorContext,
              current: batchItems[0].current,
              total: batchItems[0].total,
            });
            updatedVectors += indexed ? 1 : 0;
            vectorFailures += indexed ? 0 : 1;
          } else {
            const updated = await indexImageVectorBatch(imageDb, batchItems);
            updatedVectors += updated;
            vectorFailures += batchItems.length - updated;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("Async vector image processing failed:", message);
          vectorFailures += batchItems.length;
        } finally {
          completedVectors += batchItems.length;
          options.onVectorProgress?.(completedVectors, vectorItems.length);
        }
      });

      chunk.forEach((item) => {
        vectorScheduledIds.add(item.id);
        appendDerivativeJobs(item);
      });
      vectorBaseIndex += chunk.length;
    }

    items.forEach((item) => {
      if (!vectorScheduledIds.has(item.id)) {
        appendDerivativeJobs(item);
      }
    });

    await runWithConcurrency(jobs, IMAGE_POST_PROCESS_CONCURRENCY, async (job) => {
      await job();
    });

    if (vectorFailures > 0 && options.notifyVectorFailure) {
      deps.sendToRenderer?.("toast", {
        key: "toast.vectorIndexFailed",
        type: "error",
      });
    }

    return { updatedVectors, totalVectors: vectorItems.length };
  };

  const scheduleImagePostProcessing = (
    imageDb: ImageDb,
    items: ImagePostProcessItem[],
    options: ImagePostProcessOptions
  ) => {
    if (items.length === 0) return;
    void runImagePostProcessing(imageDb, items, options).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Async image post processing failed:", message);
      if (options.notifyVectorFailure) {
        deps.sendToRenderer?.("toast", {
          key: "toast.vectorIndexFailed",
          type: "error",
        });
      }
    });
  };

  const reserveImportTarget = async (
    imageDb: ImageDb,
    payload: ImportPayload,
    source: ImportSource,
    timestamp: number
  ): Promise<{
    filename: string;
    imagePath: string;
    localPath: string;
    existedBefore: boolean;
  }> => {
    const { sourceType, sourceData } = source;
    const sourceFilename =
      sourceType === "path"
        ? (path.basename(sourceData as string).split("?")[0] as string)
        : "";
    const metaFilename =
      typeof payload.filename === "string" ? payload.filename.trim() : "";
    const metaName = typeof payload.name === "string" ? payload.name.trim() : "";

    const extFromMetaFilename = normalizeExt(path.extname(metaFilename));
    const extFromSource = normalizeExt(path.extname(sourceFilename));
    const extFromMetaName = normalizeExt(path.extname(metaName));
    const ext =
      extFromMetaFilename ||
      extFromSource ||
      extFromMetaName ||
      (sourceType === "buffer" ? ".png" : ".jpg");

    const baseNameFromMetaFilename = metaFilename
      ? path.basename(metaFilename, path.extname(metaFilename))
      : "";
    const baseNameFromMetaName = metaName
      ? path.basename(metaName, path.extname(metaName))
      : "";
    const baseNameFromSource = sourceFilename
      ? path.basename(sourceFilename, path.extname(sourceFilename))
      : "";

    const rawBase =
      baseNameFromMetaFilename ||
      baseNameFromMetaName ||
      baseNameFromSource ||
      `EMPTY_NAME_${timestamp}`;
    const safeName = sanitizeBase(rawBase);

    return withFileLock(deps.getImageDir(), async () => {
      let filename = `${safeName}${ext}`;
      let counter = 1;

      while (true) {
        if (
          reservedImportFilenames.has(filename) ||
          imageDb.getImageRowByFilename(filename)
        ) {
          filename = `${safeName}_${counter}${ext}`;
          counter += 1;
          continue;
        }

        const imagePath = path.join("images", filename);
        const localPath = path.join(deps.getStorageDir(), imagePath);
        const existedBefore = await lockedFs.pathExists(localPath);
        reservedImportFilenames.add(filename);
        return { filename, imagePath, localPath, existedBefore };
      }
    });
  };

  const importSingleImage = async (
    imageDb: ImageDb,
    payload: ImportPayload,
    timestamp: number
  ): Promise<ImportedImageRecord> => {
    const source = resolveImportSource(payload);
    if (!source) {
      throw new Error("No image data");
    }

    const tags = ensureTags(payload.tags);
    const { sourceType, sourceData } = source;
    const target = await reserveImportTarget(imageDb, payload, source, timestamp);

    try {
      if (sourceType === "buffer") {
        await withFileLock(target.localPath, async () => {
          await fs.writeFile(target.localPath, sourceData as Buffer);
        });
      } else if (sourceType === "path") {
        let srcPath = sourceData as string;
        if (srcPath.startsWith("file://")) {
          srcPath = new URL(srcPath).pathname;
          if (
            process.platform === "win32" &&
            srcPath.startsWith("/") &&
            srcPath.includes(":")
          ) {
            srcPath = srcPath.substring(1);
          }
        }
        srcPath = decodeURIComponent(srcPath);
        await withFileLocks([srcPath, target.localPath], async () => {
          await fs.copy(srcPath, target.localPath);
        });
      } else {
        await deps.downloadImage(sourceData as string, target.localPath);
      }

      const id = uuidv4();
      const createdAt = timestamp;
      const pageUrl = typeof payload.pageUrl === "string" ? payload.pageUrl : null;
      const { rowid } = imageDb.insertImage({
        id,
        filename: target.filename,
        imagePath: target.imagePath,
        createdAt,
        pageUrl,
      });
      imageDb.setImageTags(id, tags);

      return {
        id,
        rowid,
        localPath: target.localPath,
        meta: {
          id,
          rowid,
          filename: target.filename,
          imagePath: target.imagePath,
          pageUrl,
          tags,
          createdAt,
          dominantColor: null,
          tone: null,
          hasVector: false,
        },
      };
    } catch (error) {
      if (!target.existedBefore) {
        await withFileLock(target.localPath, async () => {
          if (await fs.pathExists(target.localPath)) {
            await fs.remove(target.localPath);
          }
        });
      }
      throw error;
    } finally {
      await withFileLock(deps.getImageDir(), async () => {
        reservedImportFilenames.delete(target.filename);
      });
    }
  };

  router.get("/api/images", async (req, res) => {
    try {
      if (guardStorage(res)) return;
      const imageDb = deps.getImageDb();
      const mode = typeof req.query.mode === "string" ? req.query.mode.trim() : "";
      const query =
        typeof req.query.query === "string" ? req.query.query.trim() : "";
      const tags = parseTags(req.query.tags);
      const tone =
        typeof req.query.tone === "string" && req.query.tone.trim()
          ? req.query.tone.trim()
          : null;
      const colorHex = normalizeHexColor(req.query.color);
      const color = colorHex ? hexToOklch(colorHex) : null;
      const effectiveLimit = parseLimit(req.query.limit) ?? 100;
      if (mode === "vector") {
        const vectorCursor = parseVectorCursor(req.query as Record<string, unknown>);
        const data = await runVectorSearch(imageDb, {
          source: {
            type: "text",
            query,
          },
          tags,
          tone,
          color,
          effectiveLimit,
          cursor: vectorCursor,
        });
        res.json(data);
        return;
      }

      const textCursor = parseTextCursor(req.query as Record<string, unknown>);
      if (!query && tags.length === 0) {
        const items = imageDb.listImages({
          limit: effectiveLimit,
          tone,
          color,
          cursor: textCursor,
        });
        const nextCursor = buildTextCursor(items);
        res.json({ items, nextCursor });
        return;
      }

      const tagIds = imageDb.getTagIdsByNames(tags);
      const tagCount = tags.length;
      const results = imageDb.searchImagesByText({
        query,
        limit: effectiveLimit,
        tagIds,
        tagCount,
        tone,
        color,
        afterCreatedAt: textCursor?.createdAt ?? null,
        afterRowid: textCursor?.rowid ?? null,
      });

      const nextCursor = buildTextCursor(results);
      res.json({ items: results, nextCursor });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/images/vector-search", async (req, res) => {
    try {
      if (guardStorage(res)) return;
      const imageDb = deps.getImageDb();
      const body = req.body as {
        source?: unknown;
        tags?: unknown;
        tone?: unknown;
        color?: unknown;
        limit?: unknown;
        cursorDistance?: unknown;
        cursorRowid?: unknown;
      };
      const source = parseVectorSearchSource(body.source);
      if (!source) {
        res.status(400).json({ error: "Invalid vector search source" });
        return;
      }

      const tone =
        typeof body.tone === "string" && body.tone.trim()
          ? body.tone.trim()
          : null;
      const colorHex = normalizeHexColor(body.color);
      const color = colorHex ? hexToOklch(colorHex) : null;
      const effectiveLimit = parseLimit(String(body.limit ?? "")) ?? 100;
      const vectorCursor = parseVectorCursor({
        cursorDistance: String(body.cursorDistance ?? ""),
        cursorRowid: String(body.cursorRowid ?? ""),
      });
      const tags = parseTags(body.tags);

      const data = await runVectorSearch(imageDb, {
        source,
        tags,
        tone,
        color,
        effectiveLimit,
        cursor: vectorCursor,
      });
      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.get("/api/local-image-preview", async (req, res) => {
    try {
      if (guardStorage(res)) return;

      const rawPath =
        typeof req.query.path === "string" ? req.query.path.trim() : "";
      if (!rawPath) {
        res.status(400).json({ error: "Path is required" });
        return;
      }

      const resolvedPath = path.resolve(rawPath);
      const exists = await withFileLock(resolvedPath, async () =>
        fs.pathExists(resolvedPath)
      );

      if (!exists) {
        res.status(404).json({ error: "Image not found" });
        return;
      }

      res.sendFile(resolvedPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.get("/api/image/:id", async (req, res) => {
    try {
      if (guardStorage(res)) return;
      const imageDb = deps.getImageDb();
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "Image id is required" });
        return;
      }
      const meta = imageDb.getImageById(id);
      if (!meta) {
        res.status(404).json({ error: "Image not found" });
        return;
      }
      res.json(meta);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.patch("/api/image/:id", async (req, res) => {
    try {
      if (guardStorage(res)) return;
      const imageDb = deps.getImageDb();
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "Image id is required" });
        return;
      }
      const current = imageDb.getImageRowById(id);
      if (!current) {
        res.status(404).json({ error: "Image not found" });
        return;
      }

      const body = req.body as {
        filename?: unknown;
        tags?: unknown;
        dominantColor?: unknown;
        tone?: unknown;
        pageUrl?: unknown;
      };

      let nextFilename = current.filename;
      let nextImagePath = current.imagePath;

      if (typeof body.filename === "string" && body.filename.trim()) {
        const raw = body.filename.trim();
        const ext = path.extname(current.filename);
        const base = raw.replace(/[/\\:*?"<>|]+/g, "_").trim() || "image";
        let candidate = `${base}${ext}`;
        let counter = 1;
        while (await lockedFs.pathExists(path.join(deps.getImageDir(), candidate))) {
          if (candidate === current.filename) break;
          candidate = `${base}_${counter}${ext}`;
          counter += 1;
        }
        if (candidate !== current.filename) {
          const existing = imageDb.getImageRowByFilename(candidate);
          if (existing && existing.id !== id) {
            res.status(409).json({ error: "Filename already exists" });
            return;
          }
          const oldLocalPath = path.join(deps.getStorageDir(), current.imagePath);
          const newRelPath = path.join("images", candidate);
          const newLocalPath = path.join(deps.getStorageDir(), newRelPath);
          imageDb.updateImage({ id, filename: candidate, imagePath: newRelPath });
          try {
            await withFileLocks([oldLocalPath, newLocalPath], async () => {
              await fs.rename(oldLocalPath, newLocalPath);
            });
          } catch (err) {
            imageDb.updateImage({
              id,
              filename: current.filename,
              imagePath: current.imagePath,
            });
            throw err;
          }
          nextFilename = candidate;
          nextImagePath = newRelPath;
        }
      }

      let nextDominantColor: string | null | undefined = undefined;
      let nextDominantOklch: OklchColor | null | undefined = undefined;
      if (body.dominantColor !== undefined) {
        if (body.dominantColor === null) {
          nextDominantColor = null;
          nextDominantOklch = null;
        } else if (typeof body.dominantColor === "string") {
          const trimmed = body.dominantColor.trim();
          if (!trimmed) {
            nextDominantColor = null;
            nextDominantOklch = null;
          } else {
            const resolved = resolveOklchPayload(trimmed);
            if (!resolved) {
              res.status(400).json({ error: "dominantColor must be a hex color like #RRGGBB" });
              return;
            }
            nextDominantColor = resolved.color;
            nextDominantOklch = resolved.oklch;
          }
        } else {
          res.status(400).json({ error: "dominantColor must be a string or null" });
          return;
        }
      }

      let nextTone: string | null | undefined = undefined;
      if (body.tone !== undefined) {
        if (body.tone === null) {
          nextTone = null;
        } else if (typeof body.tone === "string") {
          const trimmed = body.tone.trim();
          nextTone = trimmed || null;
        } else {
          res.status(400).json({ error: "tone must be a string or null" });
          return;
        }
      }

      let nextPageUrl: string | null | undefined = undefined;
      if (body.pageUrl !== undefined) {
        if (body.pageUrl === null) {
          nextPageUrl = null;
        } else if (typeof body.pageUrl === "string") {
          nextPageUrl = body.pageUrl.trim() || null;
        } else {
          res.status(400).json({ error: "pageUrl must be a string or null" });
          return;
        }
      }

      imageDb.updateImage({
        id,
        dominantColor: nextDominantColor,
        dominantL: nextDominantOklch?.L,
        dominantC: nextDominantOklch?.C,
        dominantH: nextDominantOklch?.h,
        tone: nextTone,
        pageUrl: nextPageUrl,
      });

      if (body.tags !== undefined) {
        imageDb.setImageTags(id, ensureTags(body.tags));
      }

      const updated = imageDb.getImageById(id);
      if (!updated) {
        res.status(404).json({ error: "Image not found" });
        return;
      }
      res.json({ success: true, meta: updated, filename: nextFilename, imagePath: nextImagePath });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.delete("/api/image/:id", async (req, res) => {
    try {
      if (guardStorage(res)) return;
      const imageDb = deps.getImageDb();
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "Image id is required" });
        return;
      }

      const record = imageDb.getImageRowById(id);
      if (!record) {
        res.status(404).json({ error: "Image not found" });
        return;
      }
      imageDb.deleteImage(id);
      const localPath = path.join(deps.getStorageDir(), record.imagePath);
      await withFileLock(localPath, async () => {
        if (await fs.pathExists(localPath)) {
          await fs.remove(localPath);
        }
      });
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/save-gallery-order", async (req, res) => {
    try {
      const { order } = req.body as { order?: unknown };
      if (!Array.isArray(order)) {
        res.status(400).json({ error: "Order must be an array of IDs" });
        return;
      }
      const normalized = order.filter((id): id is string => typeof id === "string");
      deps.getImageDb().setGalleryOrder(normalized);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/order-move", async (req, res) => {
    try {
      const { activeId, overId } = req.body as { activeId?: unknown; overId?: unknown };
      if (typeof activeId !== "string" || typeof overId !== "string") {
        res.status(400).json({ error: "activeId and overId are required" });
        return;
      }
      deps.getImageDb().moveGalleryOrder(activeId, overId);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/import", async (req, res) => {
    try {
      if (guardStorage(res)) return;
      const imageDb = deps.getImageDb();
      const payload = req.body as ImportPayload;
      const imported = await importSingleImage(imageDb, payload, Date.now());

      res.json({ success: true, meta: imported.meta });

      scheduleImagePostProcessing(
        imageDb,
        [
          {
            id: imported.id,
            rowid: imported.rowid,
            localPath: imported.localPath,
            processVector: true,
            processDominantColor: true,
            processTone: true,
          },
        ],
        {
          vectorContext: "import",
          notifyVectorFailure: true,
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/import-batch", async (req, res) => {
    try {
      if (guardStorage(res)) return;
      const imageDb = deps.getImageDb();
      const body = req.body as { items?: unknown };
      if (!Array.isArray(body.items) || body.items.length === 0) {
        res.status(400).json({ error: "No import items" });
        return;
      }

      const importedResults: Array<ImportedImageRecord | null> = new Array(
        body.items.length
      ).fill(null);
      const failedItems: { index: number; error: string }[] = [];
      const startedAt = Date.now();

      await runWithConcurrency(
        body.items as ImportPayload[],
        IMPORT_BATCH_CONCURRENCY,
        async (payload, index) => {
        try {
            importedResults[index] = await importSingleImage(
              imageDb,
              payload,
              startedAt + index
            );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("Batch import item failed:", message);
          failedItems.push({ index, error: message });
        }
        }
      );

      const importedItems = importedResults.filter(
        (item): item is ImportedImageRecord => item !== null
      );

      res.json({
        success: true,
        items: importedItems.map((item) => item.meta),
        failedCount: failedItems.length,
      });

      scheduleImagePostProcessing(
        imageDb,
        importedItems.map((item) => ({
          id: item.id,
          rowid: item.rowid,
          localPath: item.localPath,
          processVector: true,
          processDominantColor: true,
          processTone: true,
        })),
        {
          vectorContext: "batch",
          notifyVectorFailure: true,
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/index", async (req, res) => {
    try {
      if (guardStorage(res)) return;
      const imageDb = deps.getImageDb();
      const { imageId, mode } = req.body as {
        imageId?: string;
        mode?: string;
      };
      const settings = await deps.readSettings();
      const enableVectorSearch = Boolean(settings.enableVectorSearch);
      if (!enableVectorSearch && !imageId && mode !== "missing") {
        res.json({ success: true, created: 0, updated: 0 });
        return;
      }

      if (imageId) {
        const row = imageDb.getImageRowById(imageId);
        if (!row) {
          res.status(404).json({ error: "Image not found" });
          return;
        }
        const localPath = path.join(deps.getStorageDir(), row.imagePath);
        const indexed = await indexImageVector(imageDb, {
          id: imageId,
          rowid: row.rowid,
          localPath,
          context: "single",
        });
        if (indexed) {
          const meta = imageDb.getImageById(imageId);
          res.json({ success: true, meta });
          return;
        }
        res.json({ success: true });
        return;
      }

      if (mode === "missing") {
        const indexedItems = imageDb.listImages();
        const files = await listImageFiles(deps.getImageDir());
        const diskFilenames = new Set(files);
        const { deleted, retainedItems } = pruneMissingIndexedImages(
          imageDb,
          indexedItems,
          diskFilenames
        );
        const existingNames = new Set(
          retainedItems.map((item) => path.basename(item.imagePath))
        );
        let created = 0;
        const newItems: ImportedImageRecord[] = [];
        for (const filename of files) {
          if (existingNames.has(filename)) continue;
          const imagePath = path.join("images", filename);
          const localPath = path.join(deps.getStorageDir(), imagePath);
          const stat = await withFileLock(localPath, () =>
            fs.stat(localPath).catch(() => null)
          );
          const createdAt =
            stat && typeof stat.mtimeMs === "number"
              ? Math.floor(stat.mtimeMs)
              : Date.now();
          const id = uuidv4();
          const { rowid } = imageDb.insertImage({
            id,
            filename,
            imagePath,
            createdAt,
            pageUrl: null,
          });
          imageDb.setImageTags(id, []);
          const meta: ImageMeta = {
            id,
            rowid,
            filename,
            imagePath,
            pageUrl: null,
            tags: [],
            createdAt,
            dominantColor: null,
            tone: null,
            hasVector: false,
          };
          newItems.push({
            id,
            rowid,
            localPath,
            meta,
          });
          existingNames.add(filename);
          created += 1;
        }

        const newMetas = newItems.map((item) => item.meta);
        const candidates = [...retainedItems, ...newMetas].filter((item) => !item.hasVector);
        const indexedCandidates = candidates.filter(
          (
            item
          ): item is ImageMeta & {
            rowid: number;
          } => typeof item.rowid === "number"
        );
        const rowidMissingItems = candidates.filter(
          (item) => typeof item.rowid !== "number"
        );
        rowidMissingItems.forEach((item) => {
          console.error("[VectorIndex] rowid missing batch", { id: item.id });
        });

        const total = indexedCandidates.length;
        if (!enableVectorSearch) {
          scheduleImagePostProcessing(
            imageDb,
            newItems.map((item) => ({
              id: item.id,
              rowid: item.rowid,
              localPath: item.localPath,
              processVector: false,
              processDominantColor: true,
              processTone: true,
            })),
            {
              vectorContext: "batch",
            }
          );
          res.json({ success: true, created, updated: 0, deleted, total });
          return;
        }
        deps.sendToRenderer?.("indexing-progress", {
          current: 0,
          total,
          statusKey: "indexing.starting" as I18nKey,
        });
        const postProcessItems = mergeImagePostProcessItems([
          ...newItems.map((item) => ({
            id: item.id,
            rowid: item.rowid,
            localPath: item.localPath,
            processVector: true,
            processDominantColor: true,
            processTone: true,
          })),
          ...indexedCandidates.map((item) => ({
            id: item.id,
            rowid: item.rowid,
            localPath: path.join(deps.getStorageDir(), item.imagePath),
            processVector: true,
            processDominantColor: false,
            processTone: false,
          })),
        ]);
        const { updatedVectors } = await runImagePostProcessing(
          imageDb,
          postProcessItems,
          {
            vectorContext: "batch",
            onVectorProgress: (nextCurrent, nextTotal) => {
              deps.sendToRenderer?.("indexing-progress", {
                current: nextCurrent,
                total: nextTotal,
                statusKey: "indexing.progress" as I18nKey,
                statusParams: {
                  current: nextCurrent,
                  total: nextTotal,
                } satisfies I18nParams,
              });
            },
          }
        );
        deps.sendToRenderer?.("indexing-progress", {
          current: total,
          total,
          statusKey: "indexing.completed" as I18nKey,
        });
        res.json({ success: true, created, updated: updatedVectors, deleted, total });
        return;
      }

      res.status(400).json({ error: "Invalid request" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/open-in-folder", async (req, res) => {
    try {
      const imageDb = deps.getImageDb();
      const { id } = req.body as { id?: string };
      if (!id) {
        res.status(400).json({ error: "Image id is required" });
        return;
      }
      const meta = imageDb.getImageRowById(id);
      if (!meta) {
        res.status(404).json({ error: "Image not found" });
        return;
      }
      const targetPath = path.join(deps.getStorageDir(), meta.imagePath);
      const dir = path.dirname(targetPath);
      await shell.openPath(dir);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/open-with-default", async (req, res) => {
    try {
      const imageDb = deps.getImageDb();
      const { id } = req.body as { id?: string };
      if (!id) {
        res.status(400).json({ error: "Image id is required" });
        return;
      }
      const meta = imageDb.getImageRowById(id);
      if (!meta) {
        res.status(404).json({ error: "Image not found" });
        return;
      }
      const targetPath = path.join(deps.getStorageDir(), meta.imagePath);
      await shell.openPath(targetPath);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.post("/api/copy-image", async (req, res) => {
    try {
      if (guardStorage(res)) return;
      const imageDb = deps.getImageDb();
      const { id } = req.body as { id?: unknown };
      if (typeof id !== "string" || !id.trim()) {
        res.status(400).json({ error: "Image id is required" });
        return;
      }

      const meta = imageDb.getImageRowById(id);
      if (!meta) {
        res.status(404).json({ error: "Image not found" });
        return;
      }

      const targetPath = path.join(deps.getStorageDir(), meta.imagePath);
      const exists = await withFileLock(targetPath, async () =>
        fs.pathExists(targetPath)
      );
      if (!exists) {
        res.status(404).json({ error: "Image file not found" });
        return;
      }

      const image = nativeImage.createFromPath(targetPath);
      if (image.isEmpty()) {
        res.status(500).json({ error: "Failed to load image" });
        return;
      }

      clipboard.writeImage(image);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  return router;
};
