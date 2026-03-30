import path from "path";
import express from "express";
import { shell } from "electron";
import { v4 as uuidv4 } from "uuid";
import type { ImageDb, ImageMeta, StorageIncompatibleError } from "../db";
import type { SendToRenderer } from "../server";
import type { I18nKey, I18nParams } from "../../shared/i18n/types";
import fs from "fs-extra";
import { lockedFs, withFileLock, withFileLocks } from "../fileLock";

type VectorMode = "encode-image" | "encode-text";

type ImagesRouteDeps = {
  getImageDb: () => ImageDb;
  getIncompatibleError: () => StorageIncompatibleError | null;
  getStorageDir: () => string;
  getImageDir: () => string;
  readSettings: () => Promise<Record<string, unknown>>;
  writeSettings: (settings: Record<string, unknown>) => Promise<void>;
  runPythonVector: (mode: VectorMode, arg: string) => Promise<number[] | null>;
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

export const createImagesRouter = (deps: ImagesRouteDeps) => {
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
        if (!query) {
          res.json({ items: [], nextCursor: null });
          return;
        }
        const settings = await deps.readSettings();
        const enableVectorSearch = Boolean(settings.enableVectorSearch);
        if (!enableVectorSearch) {
          res.json({ items: [], nextCursor: null });
          return;
        }
        const vectorCursor = parseVectorCursor(req.query as Record<string, unknown>);
        const tagIds = imageDb.getTagIdsByNames(tags);
        const tagCount = tags.length;
        const vector = await deps.runPythonVector("encode-text", query);
        if (!vector) {
          res.json({ items: [], nextCursor: null });
          return;
        }
        const results = imageDb.searchImages({
          vector,
          limit: effectiveLimit,
          tagIds,
          tagCount,
          tone,
          color,
          afterDistance: vectorCursor?.distance ?? null,
          afterRowid: vectorCursor?.rowid ?? null,
        });
        const nextCursor = buildVectorCursor(results);
        const items = results.map((item) => ({ ...item, isVectorResult: true }));
        res.json({ items, nextCursor });
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
      const searchQuery = query || tags.join(" ");
      const results = imageDb.searchImagesByText({
        query: searchQuery,
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
      const payload = req.body as {
        imageBase64?: string;
        imageUrl?: string;
        type?: "url" | "path" | "buffer";
        data?: string;
        filename?: string;
        name?: string;
        pageUrl?: string;
        tags?: string[];
      };

      const tags = ensureTags(payload.tags);
      const timestamp = Date.now();

      let sourceType: "url" | "path" | "buffer" | null = null;
      let sourceData: string | Buffer | null = null;

      if (payload.imageBase64) {
        const base64Data = payload.imageBase64.replace(/^data:image\/\w+;base64,/, "");
        sourceType = "buffer";
        sourceData = Buffer.from(base64Data, "base64");
      } else if (payload.type && payload.data) {
        sourceType = payload.type;
        sourceData = payload.data;
      } else if (payload.imageUrl) {
        const imageUrl = payload.imageUrl;
        sourceType =
          imageUrl.startsWith("file://") || imageUrl.startsWith("/")
            ? "path"
            : "url";
        sourceData = imageUrl;
      }

      if (!sourceType || sourceData === null) {
        res.status(400).json({ error: "No image data" });
        return;
      }

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

      let filename = `${safeName}${ext}`;
      let counter = 1;
      while (await lockedFs.pathExists(path.join(deps.getImageDir(), filename))) {
        if (imageDb.getImageRowByFilename(filename)) {
          filename = `${safeName}_${counter}${ext}`;
          counter += 1;
          continue;
        }
        break;
      }

      const imagePath = path.join("images", filename);
      const localPath = path.join(deps.getStorageDir(), imagePath);

      if (sourceType === "buffer") {
        await withFileLock(localPath, async () => {
          await fs.writeFile(localPath, sourceData as Buffer);
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
        await withFileLocks([srcPath, localPath], async () => {
          await fs.copy(srcPath, localPath);
        });
      } else {
        await deps.downloadImage(sourceData as string, localPath);
      }

      const id = uuidv4();
      const createdAt = timestamp;
      const pageUrl = typeof payload.pageUrl === "string" ? payload.pageUrl : null;
      const { rowid } = imageDb.insertImage({
        id,
        filename,
        imagePath,
        createdAt,
        pageUrl,
      });
      imageDb.setImageTags(id, tags);

      const meta: ImageMeta = {
        id,
        filename,
        imagePath,
        pageUrl,
        tags,
        createdAt,
        dominantColor: null,
        tone: null,
        hasVector: false,
      };

      res.json({ success: true, meta });

      void (async () => {
        const settings = await deps.readSettings();
        const enableVectorSearch = Boolean(settings.enableVectorSearch);
        console.log("[VectorIndex] start import", {
          id,
          rowid,
          enableVectorSearch,
          imagePath: localPath,
        });
        if (enableVectorSearch) {
          const vector = await deps.runPythonVector("encode-image", localPath);
          if (vector) {
            imageDb.setImageVector(rowid, vector);
            console.log("[VectorIndex] stored import", {
              id,
              rowid,
              length: vector.length,
            });
            deps.sendToRenderer?.("image-updated", { id, hasVector: true });
          } else {
            console.error("[VectorIndex] vector missing import", { id, rowid });
          }
        }
      })();

      void (async () => {
        try {
          const dominantColor = await deps.runPythonDominantColor(localPath);
          if (dominantColor) {
            const resolved = resolveOklchPayload(dominantColor);
            if (resolved) {
              imageDb.updateImage({
                id,
                dominantColor: resolved.color,
                dominantL: resolved.oklch.L,
                dominantC: resolved.oklch.C,
                dominantH: resolved.oklch.h,
              });
              deps.sendToRenderer?.("image-updated", { id, dominantColor: resolved.color });
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("Async dominant color update failed:", message);
        }
      })();

      void (async () => {
        try {
          const tone = await deps.runPythonTone(localPath);
          if (tone) {
            imageDb.updateImage({ id, tone });
            deps.sendToRenderer?.("image-updated", { id, tone });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("Async tone update failed:", message);
        }
      })();
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
        console.log("[VectorIndex] start single", {
          id: imageId,
          rowid: row.rowid,
          imagePath: localPath,
        });
        const vector = await deps.runPythonVector("encode-image", localPath);
        if (vector) {
          imageDb.setImageVector(row.rowid, vector);
          console.log("[VectorIndex] stored single", {
            id: imageId,
            rowid: row.rowid,
            length: vector.length,
          });
          deps.sendToRenderer?.("image-updated", { id: imageId, hasVector: true });
          const meta = imageDb.getImageById(imageId);
          res.json({ success: true, meta });
          return;
        }
        console.error("[VectorIndex] vector missing single", {
          id: imageId,
          rowid: row.rowid,
        });
        res.json({ success: true });
        return;
      }

      if (mode === "missing") {
        const items = imageDb.listImages();
        const existingNames = new Set(items.map((item) => item.filename));
        const files = await listImageFiles(deps.getImageDir());
        let created = 0;
        const newItems: ImageMeta[] = [];
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
          imageDb.insertImage({
            id,
            filename,
            imagePath,
            createdAt,
            pageUrl: null,
          });
          imageDb.setImageTags(id, []);
          const meta: ImageMeta = {
            id,
            filename,
            imagePath,
            pageUrl: null,
            tags: [],
            createdAt,
            dominantColor: null,
            tone: null,
            hasVector: false,
          };
          newItems.push(meta);
          existingNames.add(filename);
          created += 1;

          void (async () => {
            try {
              const dominantColor = await deps.runPythonDominantColor(localPath);
              if (dominantColor) {
                const resolved = resolveOklchPayload(dominantColor);
                if (resolved) {
                  imageDb.updateImage({
                    id,
                    dominantColor: resolved.color,
                    dominantL: resolved.oklch.L,
                    dominantC: resolved.oklch.C,
                    dominantH: resolved.oklch.h,
                  });
                  deps.sendToRenderer?.("image-updated", { id, dominantColor: resolved.color });
                }
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              console.error("Async dominant color update failed:", message);
            }
          })();

          void (async () => {
            try {
              const tone = await deps.runPythonTone(localPath);
              if (tone) {
                imageDb.updateImage({ id, tone });
                deps.sendToRenderer?.("image-updated", { id, tone });
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              console.error("Async tone update failed:", message);
            }
          })();
        }

        const candidates = [...items, ...newItems].filter(
          (item) => !item.hasVector
        );
        let current = 0;
        const total = candidates.length;
        if (!enableVectorSearch) {
          res.json({ success: true, created, updated: 0, total });
          return;
        }
        deps.sendToRenderer?.("indexing-progress", {
          current: 0,
          total,
          statusKey: "indexing.starting" as I18nKey,
        });
        let updated = 0;
        for (const item of candidates) {
          current += 1;
          if (current % 2 === 0 || current === total || current === 1) {
            deps.sendToRenderer?.("indexing-progress", {
              current,
              total,
              statusKey: "indexing.progress" as I18nKey,
              statusParams: { current, total } satisfies I18nParams,
            });
          }
          const rowid = imageDb.getImageRowidById(item.id);
          if (!rowid) {
            console.error("[VectorIndex] rowid missing batch", { id: item.id });
            continue;
          }
          const localPath = path.join(deps.getStorageDir(), item.imagePath);
          console.log("[VectorIndex] start batch", {
            id: item.id,
            rowid,
            current,
            total,
            imagePath: localPath,
          });
          const vector = await deps.runPythonVector("encode-image", localPath);
          if (vector) {
            imageDb.setImageVector(rowid, vector);
            updated += 1;
            deps.sendToRenderer?.("image-updated", { id: item.id, hasVector: true });
            console.log("[VectorIndex] stored batch", {
              id: item.id,
              rowid,
              length: vector.length,
            });
          } else {
            console.error("[VectorIndex] vector missing batch", {
              id: item.id,
              rowid,
            });
          }
        }
        deps.sendToRenderer?.("indexing-progress", {
          current: total,
          total,
          statusKey: "indexing.completed" as I18nKey,
        });
        res.json({ success: true, created, updated, total });
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

  return router;
};
