import path from "path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { OKLCH_FILTER } from "./constants";

export class StorageIncompatibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageIncompatibleError";
  }
}

export type ImageMeta = {
  id: string;
  filename: string;
  imagePath: string;
  pageUrl: string | null;
  tags: string[];
  createdAt: number;
  dominantColor: string | null;
  tone: string | null;
  hasVector: boolean;
  score?: number;
  vectorDistance?: number;
  vectorRowid?: number;
  rowid?: number;
  galleryOrder?: number | null;
  isVectorResult?: boolean;
};

type ImageRow = {
  rowid: number;
  id: string;
  filename: string;
  imagePath: string;
  createdAt: number;
  pageUrl: string | null;
  dominantColor: string | null;
  dominantL: number | null;
  dominantC: number | null;
  dominantH: number | null;
  tone: string | null;
  galleryOrder?: number | null;
};

type TagRow = { imageId: string; name: string };

export type ImageDb = {
  getImageById: (id: string) => ImageMeta | null;
  listImages: (params?: {
    limit?: number;
    tone?: string | null;
    color?: OklchColor | null;
    cursor?: { galleryOrder: number | null; createdAt: number; rowid: number } | null;
  }) => ImageMeta[];
  listImagesByIds: (ids: string[]) => ImageMeta[];
  setGalleryOrder: (order: string[]) => void;
  moveGalleryOrder: (activeId: string, overId: string) => void;
  searchImages: (params: {
    vector?: number[] | null;
    limit?: number;
    tagIds?: number[];
    tagCount?: number;
    tone?: string | null;
    color?: OklchColor | null;
    afterDistance?: number | null;
    afterRowid?: number | null;
  }) => ImageMeta[];
  searchImagesByText: (params: {
    query: string;
    limit?: number;
    tagIds?: number[];
    tagCount?: number;
    tone?: string | null;
    color?: OklchColor | null;
    afterCreatedAt?: number | null;
    afterRowid?: number | null;
  }) => ImageMeta[];
  insertImage: (data: {
    id: string;
    filename: string;
    imagePath: string;
    createdAt: number;
    pageUrl: string | null;
  }) => { rowid: number };
  updateImage: (data: {
    id: string;
    filename?: string;
    imagePath?: string;
    pageUrl?: string | null;
    dominantColor?: string | null;
    dominantL?: number | null;
    dominantC?: number | null;
    dominantH?: number | null;
    tone?: string | null;
  }) => void;
  deleteImage: (id: string) => { imagePath: string } | null;
  setImageTags: (id: string, tags: string[]) => void;
  setImageVector: (rowid: number, vector: number[]) => void;
  setImageVectors: (items: { rowid: number; vector: number[] }[]) => number[];
  getImageRowById: (id: string) => ImageRow | null;
  getImageRowidById: (id: string) => number | null;
  getImageRowByFilename: (filename: string) => ImageRow | null;
  listTags: () => string[];
  renameTag: (oldName: string, newName: string) => void;
  deleteTag: (name: string) => void;
  resolveTagIds: (names: string[]) => number[];
  getTagIdsByNames: (names: string[]) => number[];
};

const schemaStandard = `
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  filename TEXT UNIQUE NOT NULL,
  imagePath TEXT UNIQUE NOT NULL,
  createdAt INTEGER NOT NULL,
  pageUrl TEXT,
  dominantColor TEXT,
  dominantL REAL,
  dominantC REAL,
  dominantH REAL,
  tone TEXT,
  galleryOrder INTEGER
);
CREATE INDEX IF NOT EXISTS idx_images_created ON images(createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_images_filename ON images(filename);
CREATE INDEX IF NOT EXISTS idx_images_path ON images(imagePath);
CREATE INDEX IF NOT EXISTS idx_images_gallery_order ON images(galleryOrder ASC);
CREATE INDEX IF NOT EXISTS idx_images_oklch ON images(dominantL, dominantC, dominantH);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS image_tags (
  imageId TEXT NOT NULL,
  tagId INTEGER NOT NULL,
  PRIMARY KEY (imageId, tagId),
  FOREIGN KEY (imageId) REFERENCES images(id) ON DELETE CASCADE,
  FOREIGN KEY (tagId) REFERENCES tags(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_image_tags_tag_image ON image_tags(tagId, imageId);
`;

const schemaVector = `
CREATE VIRTUAL TABLE IF NOT EXISTS images_vec USING vec0(
  rowid INTEGER PRIMARY KEY,
  vector float[768]
);
`;

export type OklchColor = {
  L: number;
  C: number;
  h: number;
};

const normalizeTags = (tags: string[]): string[] => {
  const normalized = tags
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => tag.length > 0);
  return Array.from(new Set(normalized));
};

const buildTagsMap = (rows: TagRow[]): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.imageId) ?? [];
    list.push(row.name);
    map.set(row.imageId, list);
  }
  return map;
};

const resolveHasVector = (
  db: Database.Database,
  rowids: number[]
): Set<number> => {
  if (rowids.length === 0) return new Set();
  try {
    const placeholders = rowids.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT rowid FROM images_vec WHERE rowid IN (${placeholders})`)
      .all(...rowids) as { rowid: number }[];
    return new Set(rows.map((row) => row.rowid));
  } catch (error) {
    console.error("Failed to resolve vector status:", error);
    return new Set();
  }
};

const loadTags = (
  db: Database.Database,
  imageIds: string[]
): Map<string, string[]> => {
  if (imageIds.length === 0) return new Map();
  const placeholders = imageIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT it.imageId, t.name FROM image_tags it JOIN tags t ON t.id = it.tagId WHERE it.imageId IN (${placeholders})`
    )
    .all(...imageIds) as TagRow[];
  return buildTagsMap(rows);
};

const mapImages = (
  db: Database.Database,
  rows: ImageRow[]
): ImageMeta[] => {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const rowids = rows.map((row) => row.rowid);
  const tagsMap = loadTags(db, ids);
  const vectorSet = resolveHasVector(db, rowids);
  return rows.map((row) => ({
    id: row.id,
    rowid: row.rowid,
    filename: row.filename,
    imagePath: row.imagePath,
    createdAt: row.createdAt,
    pageUrl: row.pageUrl,
    dominantColor: row.dominantColor,
    tone: row.tone,
    tags: tagsMap.get(row.id) ?? [],
    hasVector: vectorSet.has(row.rowid),
    galleryOrder: row.galleryOrder ?? null,
  }));
};

// const ensureCompatible = (storageDir: string) => {
//   const dbPath = path.join(storageDir, "meta.sqlite");
//   const metaDir = path.join(storageDir, "meta");
//   const imagesDir = path.join(storageDir, "images");
//   const hasDb = fs.pathExistsSync(dbPath);
//   const metaFiles =
//     fs.pathExistsSync(metaDir) &&
//     fs
//       .readdirSync(metaDir)
//       .some((file) => file.toLowerCase().endsWith(".json"));
//   const imageFiles =
//     fs.pathExistsSync(imagesDir) &&
//     fs.readdirSync(imagesDir).some((file) => file.trim().length > 0);

//   if (!hasDb && (metaFiles || imageFiles)) {
//     throw new StorageIncompatibleError(
//       "Storage format is incompatible. Please reset the data folder."
//     );
//   }
// };

const createImageDb = (db: Database.Database): ImageDb => {
  const insertImageStmt = db.prepare(
    `INSERT INTO images (id, filename, imagePath, createdAt, pageUrl, dominantColor, dominantL, dominantC, dominantH, tone)
     VALUES (@id, @filename, @imagePath, @createdAt, @pageUrl, @dominantColor, @dominantL, @dominantC, @dominantH, @tone)`
  );

  const updateImageStmt = db.prepare(
    `UPDATE images SET
      filename = CASE WHEN @setFilename = 1 THEN @filename ELSE filename END,
      imagePath = CASE WHEN @setImagePath = 1 THEN @imagePath ELSE imagePath END,
      pageUrl = CASE WHEN @setPageUrl = 1 THEN @pageUrl ELSE pageUrl END,
      dominantColor = CASE WHEN @setDominantColor = 1 THEN @dominantColor ELSE dominantColor END,
      dominantL = CASE WHEN @setDominantColor = 1 THEN @dominantL ELSE dominantL END,
      dominantC = CASE WHEN @setDominantColor = 1 THEN @dominantC ELSE dominantC END,
      dominantH = CASE WHEN @setDominantColor = 1 THEN @dominantH ELSE dominantH END,
      tone = CASE WHEN @setTone = 1 THEN @tone ELSE tone END
     WHERE id = @id`
  );

  const getImageRowById = (id: string): ImageRow | null => {
    const row = db
      .prepare(
        `SELECT rowid, id, filename, imagePath, createdAt, pageUrl, dominantColor, dominantL, dominantC, dominantH, tone, galleryOrder FROM images WHERE id = ?`
      )
      .get(id) as ImageRow | undefined;
    return row ?? null;
  };

  const getImageRowByFilename = (filename: string): ImageRow | null => {
    const row = db
      .prepare(
        `SELECT rowid, id, filename, imagePath, createdAt, pageUrl, dominantColor, dominantL, dominantC, dominantH, tone, galleryOrder FROM images WHERE filename = ?`
      )
      .get(filename) as ImageRow | undefined;
    return row ?? null;
  };

  const getImageRowidById = (id: string): number | null => {
    const row = db
      .prepare(`SELECT rowid FROM images WHERE id = ?`)
      .get(id) as { rowid?: number } | undefined;
    return typeof row?.rowid === "number" ? row.rowid : null;
  };

  const getImageById = (id: string): ImageMeta | null => {
    const row = getImageRowById(id);
    if (!row) return null;
    return mapImages(db, [row])[0] ?? null;
  };

  const listImages = (params?: {
    limit?: number;
    tone?: string | null;
    color?: OklchColor | null;
    cursor?: { galleryOrder: number | null; createdAt: number; rowid: number } | null;
  }): ImageMeta[] => {
    const { limit, tone, color, cursor } = params ?? {};
    const colorSql = buildColorFilterSql("i", color);
    const orderKey = "COALESCE(i.galleryOrder, -1)";
    const hasCursor =
      typeof cursor?.createdAt === "number" &&
      typeof cursor?.rowid === "number" &&
      cursor?.galleryOrder !== undefined;
    const limitValue = typeof limit === "number" && limit > 0 ? limit : null;
    const sql = `SELECT i.rowid, i.id, i.filename, i.imagePath, i.createdAt, i.pageUrl, i.dominantColor, i.dominantL, i.dominantC, i.dominantH, i.tone, i.galleryOrder
         FROM images i
         WHERE (@tone IS NULL OR i.tone = @tone)
           ${colorSql.sql}
           AND (
             @hasCursor = 0
             OR ${orderKey} > @cursorOrderKey
             OR (${orderKey} = @cursorOrderKey AND i.createdAt < @cursorCreatedAt)
             OR (${orderKey} = @cursorOrderKey AND i.createdAt = @cursorCreatedAt AND i.rowid < @cursorRowid)
           )
         ORDER BY ${orderKey} ASC, i.createdAt DESC, i.rowid DESC
         ${limitValue ? "LIMIT @limit" : ""}`;
    const rows = db
      .prepare(sql)
      .all({
        tone: tone ?? null,
        hasCursor: hasCursor ? 1 : 0,
        cursorOrderKey: hasCursor ? (cursor?.galleryOrder ?? -1) : 0,
        cursorCreatedAt: hasCursor ? cursor?.createdAt : 0,
        cursorRowid: hasCursor ? cursor?.rowid : 0,
        limit: limitValue,
        ...colorSql.params,
      }) as ImageRow[];
    return mapImages(db, rows);
  };

  const listImagesByIds = (ids: string[]): ImageMeta[] => {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT rowid, id, filename, imagePath, createdAt, pageUrl, dominantColor, dominantL, dominantC, dominantH, tone, galleryOrder FROM images WHERE id IN (${placeholders})`
      )
      .all(...ids) as ImageRow[];
    const map = new Map(rows.map((row) => [row.id, row]));
    const orderedRows = ids
      .map((id) => map.get(id))
      .filter((row): row is ImageRow => Boolean(row));
    return mapImages(db, orderedRows);
  };

  const insertImage = (data: {
    id: string;
    filename: string;
    imagePath: string;
    createdAt: number;
    pageUrl: string | null;
  }) => {
    const info = insertImageStmt.run({
      ...data,
      dominantColor: null,
      dominantL: null,
      dominantC: null,
      dominantH: null,
      tone: null,
    });
    return { rowid: Number(info.lastInsertRowid) };
  };

  const updateImage = (data: {
    id: string;
    filename?: string;
    imagePath?: string;
    pageUrl?: string | null;
    dominantColor?: string | null;
    dominantL?: number | null;
    dominantC?: number | null;
    dominantH?: number | null;
    tone?: string | null;
  }) => {
    const hasFilename = data.filename !== undefined;
    const hasImagePath = data.imagePath !== undefined;
    const hasPageUrl = data.pageUrl !== undefined;
    const hasDominantColor = data.dominantColor !== undefined;
    const hasTone = data.tone !== undefined;
    updateImageStmt.run({
      id: data.id,
      setFilename: hasFilename ? 1 : 0,
      filename: hasFilename ? data.filename : null,
      setImagePath: hasImagePath ? 1 : 0,
      imagePath: hasImagePath ? data.imagePath : null,
      setPageUrl: hasPageUrl ? 1 : 0,
      pageUrl: hasPageUrl ? data.pageUrl : null,
      setDominantColor: hasDominantColor ? 1 : 0,
      dominantColor: hasDominantColor ? data.dominantColor ?? null : null,
      dominantL: hasDominantColor ? data.dominantL ?? null : null,
      dominantC: hasDominantColor ? data.dominantC ?? null : null,
      dominantH: hasDominantColor ? data.dominantH ?? null : null,
      setTone: hasTone ? 1 : 0,
      tone: hasTone ? data.tone ?? null : null,
    });
  };

  const deleteImage = (id: string): { imagePath: string } | null => {
    const row = getImageRowById(id);
    if (!row) return null;
    try {
      db.prepare(`DELETE FROM images_vec WHERE rowid = ?`).run(row.rowid);
    } catch {
      // Ignore if vector table doesn't exist
    }
    db.prepare(`DELETE FROM images WHERE id = ?`).run(id);
    db.prepare(`DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tagId FROM image_tags)`).run();
    return { imagePath: row.imagePath };
  };

  const resolveTagIds = (names: string[]): number[] => {
    const normalized = normalizeTags(names);
    if (normalized.length === 0) return [];
    const insertStmt = db.prepare(`INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING`);
    const getStmt = db.prepare(`SELECT id FROM tags WHERE name = ?`);
    const tx = db.transaction(() => {
      normalized.forEach((name) => insertStmt.run(name));
      return normalized
        .map((name) => {
          const row = getStmt.get(name) as { id?: number } | undefined;
          return row?.id;
        })
        .filter((id): id is number => typeof id === "number");
    });
    return tx();
  };

  const getTagIdsByNames = (names: string[]): number[] => {
    const normalized = normalizeTags(names);
    if (normalized.length === 0) return [];
    const placeholders = normalized.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT id, name FROM tags WHERE name IN (${placeholders})`)
      .all(...normalized) as { id: number; name: string }[];
    const map = new Map(rows.map((row) => [row.name, row.id]));
    return normalized
      .map((name) => map.get(name))
      .filter((id): id is number => typeof id === "number");
  };

  const setImageTags = (id: string, tags: string[]) => {
    const normalized = normalizeTags(tags);
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM image_tags WHERE imageId = ?`).run(id);
      const tagIds = resolveTagIds(normalized);
      const insertStmt = db.prepare(
        `INSERT OR IGNORE INTO image_tags (imageId, tagId) VALUES (?, ?)`
      );
      tagIds.forEach((tagId) => insertStmt.run(id, tagId));
      db.prepare(`DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tagId FROM image_tags)`).run();
    });
    tx();
  };

  const setImageVector = (rowid: number, vector: number[]) => {
    try {
      const normalizedRowid = Number(rowid);
      if (!Number.isFinite(normalizedRowid) || !Number.isInteger(normalizedRowid)) {
        console.error("Failed to set image vector: invalid rowid", rowid);
        return;
      }
      const rowidValue = BigInt(normalizedRowid);
      const tx = db.transaction(() => {
        db.prepare(`DELETE FROM images_vec WHERE rowid = ?`).run(rowidValue);
        const normalizedVector = new Float32Array(vector);
        db.prepare(
          `INSERT INTO images_vec (rowid, vector) VALUES (@rowid, @vector)`
        ).run({
          rowid: rowidValue,
          vector: normalizedVector,
        });
      });
      tx();
    } catch (error) {
      console.error("Failed to set image vector:", error);
    }
  };

  const setImageVectors = (items: { rowid: number; vector: number[] }[]): number[] => {
    if (items.length === 0) return [];

    const normalizedItems = items
      .map((item) => {
        const normalizedRowid = Number(item.rowid);
        if (!Number.isFinite(normalizedRowid) || !Number.isInteger(normalizedRowid)) {
          console.error("Failed to set image vectors: invalid rowid", item.rowid);
          return null;
        }
        return {
          rowid: normalizedRowid,
          rowidValue: BigInt(normalizedRowid),
          vector: new Float32Array(item.vector),
        };
      })
      .filter(
        (
          item
        ): item is {
          rowid: number;
          rowidValue: bigint;
          vector: Float32Array;
        } => item !== null
      );

    if (normalizedItems.length === 0) return [];

    const deleteStmt = db.prepare(`DELETE FROM images_vec WHERE rowid = ?`);
    const insertStmt = db.prepare(
      `INSERT INTO images_vec (rowid, vector) VALUES (@rowid, @vector)`
    );
    const tx = db.transaction(() => {
      normalizedItems.forEach((item) => {
        deleteStmt.run(item.rowidValue);
        insertStmt.run({
          rowid: item.rowidValue,
          vector: item.vector,
        });
      });
    });
    tx();
    return normalizedItems.map((item) => item.rowid);
  };

  const setGalleryOrder = (order: string[]) => {
    const resetStmt = db.prepare(`UPDATE images SET galleryOrder = NULL WHERE galleryOrder IS NOT NULL`);
    const updateStmt = db.prepare(`UPDATE images SET galleryOrder = ? WHERE id = ?`);
    const tx = db.transaction(() => {
      resetStmt.run();
      order.forEach((id, index) => updateStmt.run(index, id));
    });
    tx();
  };

  const moveGalleryOrder = (activeId: string, overId: string) => {
    const tx = db.transaction(() => {
      const hasNull = db.prepare("SELECT 1 FROM images WHERE galleryOrder IS NULL LIMIT 1").get();
      
      if (hasNull) {
        const allImages = db
          .prepare("SELECT id FROM images ORDER BY galleryOrder ASC, createdAt DESC")
          .all() as { id: string }[];
        
        const updateStmt = db.prepare("UPDATE images SET galleryOrder = ? WHERE id = ?");
        allImages.forEach((row, index) => {
          updateStmt.run(index, row.id);
        });
      }

      const getOrderStmt = db.prepare("SELECT galleryOrder FROM images WHERE id = ?");
      const activeRow = getOrderStmt.get(activeId) as { galleryOrder: number } | undefined;
      const overRow = getOrderStmt.get(overId) as { galleryOrder: number } | undefined;

      if (!activeRow || !overRow || activeRow.galleryOrder === null || overRow.galleryOrder === null) {
        return;
      }

      const oldOrder = activeRow.galleryOrder;
      const newOrder = overRow.galleryOrder;

      if (oldOrder === newOrder) return;

      if (oldOrder < newOrder) {
        db.prepare(
          "UPDATE images SET galleryOrder = galleryOrder - 1 WHERE galleryOrder > ? AND galleryOrder <= ?"
        ).run(oldOrder, newOrder);
      } else {
        db.prepare(
          "UPDATE images SET galleryOrder = galleryOrder + 1 WHERE galleryOrder >= ? AND galleryOrder < ?"
        ).run(newOrder, oldOrder);
      }

      db.prepare("UPDATE images SET galleryOrder = ? WHERE id = ?").run(newOrder, activeId);
    });
    tx();
  };

  const listTags = (): string[] => {
    const rows = db.prepare(`SELECT name FROM tags ORDER BY name ASC`).all() as { name: string }[];
    return rows.map((row) => row.name);
  };

  const renameTag = (oldName: string, newName: string) => {
    const trimmedOld = oldName.trim();
    const trimmedNew = newName.trim();
    if (!trimmedOld || !trimmedNew || trimmedOld === trimmedNew) return;
    const oldRow = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(trimmedOld) as { id?: number } | undefined;
    if (!oldRow?.id) return;
    const newRow = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(trimmedNew) as { id?: number } | undefined;
    const tx = db.transaction(() => {
      if (newRow?.id) {
        db.prepare(`UPDATE OR IGNORE image_tags SET tagId = ? WHERE tagId = ?`).run(
          newRow.id,
          oldRow.id
        );
        db.prepare(`DELETE FROM tags WHERE id = ?`).run(oldRow.id);
      } else {
        db.prepare(`UPDATE tags SET name = ? WHERE id = ?`).run(trimmedNew, oldRow.id);
      }
      db.prepare(`DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tagId FROM image_tags)`).run();
    });
    tx();
  };

  const deleteTag = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const row = db
      .prepare(`SELECT id FROM tags WHERE name = ?`)
      .get(trimmed) as { id?: number } | undefined;
    if (!row?.id) return;
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM image_tags WHERE tagId = ?`).run(row.id);
      db.prepare(`DELETE FROM tags WHERE id = ?`).run(row.id);
    });
    tx();
  };

  const searchImages = (params: {
    vector?: number[] | null;
    limit?: number;
    tagIds?: number[];
    tagCount?: number;
    tone?: string | null;
    color?: OklchColor | null;
    afterDistance?: number | null;
    afterRowid?: number | null;
  }) => {
    const { vector, limit, tagIds, tagCount, tone, color, afterDistance, afterRowid } = params;
    if (!vector || vector.length === 0) return [];
    try {
      const idsJson = JSON.stringify(tagIds ?? []);
      const colorSql = buildColorFilterSql("i", color);
      const stmt = db.prepare(
        `
      WITH tag_ids AS (
        SELECT DISTINCT value AS tagId
        FROM json_each(@tagIds)
      ),
      vss_matches AS (
        SELECT rowid, distance
        FROM images_vec
        WHERE vector MATCH @vector
        ORDER BY distance
        LIMIT @vssLimit
      )
      SELECT i.rowid, i.id, i.filename, i.imagePath, i.createdAt, i.pageUrl, i.dominantColor, i.dominantL, i.dominantC, i.dominantH, i.tone, i.galleryOrder, v.distance
      FROM vss_matches v
      JOIN images i ON v.rowid = i.rowid
      WHERE (@tone IS NULL OR i.tone = @tone)
        ${colorSql.sql}
        AND (
          @hasTags = 0 OR EXISTS (
            SELECT 1 FROM image_tags it
            WHERE it.imageId = i.id
            AND it.tagId IN (SELECT tagId FROM tag_ids)
            GROUP BY it.imageId
            HAVING COUNT(DISTINCT it.tagId) = @tagCount
          )
        )
        AND (
          @hasCursor = 0
          OR v.distance > @cursorDistance
          OR (v.distance = @cursorDistance AND v.rowid > @cursorRowid)
        )
      ORDER BY v.distance ASC, v.rowid ASC
      LIMIT @limit
    `
      );
      const normalizedVector = new Float32Array(vector);
      const effectiveLimit = typeof limit === "number" && limit > 0 ? limit : 100;
      const hasCursor =
        typeof afterDistance === "number" && typeof afterRowid === "number";
      const cursorDistance = hasCursor ? afterDistance : 0;
      const cursorRowid = hasCursor ? afterRowid : 0;
      const maxVssLimit = Math.max(effectiveLimit * 20, 500);
      const vssLimitBase = effectiveLimit * 20;
      const vssLimit = Math.min(vssLimitBase, maxVssLimit);
      const rows = stmt.all({
        vector: normalizedVector,
        tagIds: idsJson,
        hasTags: tagIds && tagIds.length > 0 ? 1 : 0,
        tagCount: tagCount ?? 0,
        limit: effectiveLimit,
        vssLimit,
        hasCursor: hasCursor ? 1 : 0,
        cursorDistance,
        cursorRowid,
        tone: tone ?? null,
        ...colorSql.params,
      }) as (ImageRow & { distance: number })[];
      const metas = mapImages(db, rows);
      const scores = new Map(rows.map((row) => [row.id, row.distance]));
      const cursorMap = new Map(
        rows.map((row) => [row.id, { distance: row.distance, rowid: row.rowid }])
      );
      return metas.map((meta) => {
        const distance = scores.get(meta.id);
        const score = typeof distance === "number" ? 1 - distance : undefined;
        const cursor = cursorMap.get(meta.id);
        if (!cursor) {
          return score !== undefined ? { ...meta, score } : meta;
        }
        return {
          ...meta,
          score,
          vectorDistance: cursor.distance,
          vectorRowid: cursor.rowid,
        };
      });
    } catch (error) {
      console.error("Vector search failed:", error);
      return [];
    }
  };

  const searchImagesByText = (params: {
    query: string;
    limit?: number;
    tagIds?: number[];
    tagCount?: number;
    tone?: string | null;
    color?: OklchColor | null;
    afterCreatedAt?: number | null;
    afterRowid?: number | null;
  }) => {
    const { query, limit, tagIds, tagCount, tone, color, afterCreatedAt, afterRowid } = params;
    const tokens = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const hasTextQuery = tokens.length > 0;
    if (!hasTextQuery && (!tagIds || tagIds.length === 0)) return [];

    const idsJson = JSON.stringify(tagIds ?? []);
    const colorSql = buildColorFilterSql("i", color);

    const textConditions = tokens
      .map(
        (_, i) =>
          `(lower(i.filename) LIKE @token${i} OR lower(i.imagePath) LIKE @token${i})`
      )
      .join(" AND ");
    const textSql = hasTextQuery ? `AND (${textConditions})` : "";

    const sql = `
      WITH tag_ids AS (
        SELECT DISTINCT value AS tagId
        FROM json_each(@tagIds)
      )
      SELECT i.rowid, i.id, i.filename, i.imagePath, i.createdAt, i.pageUrl, i.dominantColor, i.dominantL, i.dominantC, i.dominantH, i.tone, i.galleryOrder
      FROM images i
      WHERE (@tone IS NULL OR i.tone = @tone)
        ${colorSql.sql}
        AND (
          @hasTags = 0 OR EXISTS (
            SELECT 1 FROM image_tags it
            WHERE it.imageId = i.id
            AND it.tagId IN (SELECT tagId FROM tag_ids)
            GROUP BY it.imageId
            HAVING COUNT(DISTINCT it.tagId) = @tagCount
          )
        )
        ${textSql}
        AND (
          @hasCursor = 0
          OR i.createdAt < @cursorCreatedAt
          OR (i.createdAt = @cursorCreatedAt AND i.rowid < @cursorRowid)
        )
      ORDER BY i.createdAt DESC, i.rowid DESC
      LIMIT @limit
    `;

    const stmt = db.prepare(sql);

    const hasCursor =
      typeof afterCreatedAt === "number" && typeof afterRowid === "number";
    const queryParams: Record<string, unknown> = {
      tagIds: idsJson,
      hasTags: tagIds && tagIds.length > 0 ? 1 : 0,
      tagCount: tagCount ?? 0,
      limit: typeof limit === "number" && limit > 0 ? limit : 100,
      tone: tone ?? null,
      hasCursor: hasCursor ? 1 : 0,
      cursorCreatedAt: hasCursor ? afterCreatedAt : 0,
      cursorRowid: hasCursor ? afterRowid : 0,
      ...colorSql.params,
    };

    tokens.forEach((token, i) => {
      queryParams[`token${i}`] = `%${token}%`;
    });

    const rows = stmt.all(queryParams) as ImageRow[];
    return mapImages(db, rows);
  };

  return {
    getImageById,
    listImages,
    listImagesByIds,
    setGalleryOrder,
    moveGalleryOrder,
    searchImages,
    searchImagesByText,
    insertImage,
    updateImage,
    deleteImage,
    setImageTags,
    setImageVector,
    setImageVectors,
    getImageRowById,
    getImageRowidById,
    getImageRowByFilename,
    listTags,
    renameTag,
    deleteTag,
    resolveTagIds,
    getTagIdsByNames,
  };
};

export const createDatabase = (
  storageDir: string
): { db: Database.Database; imageDb: ImageDb; incompatibleError: StorageIncompatibleError | null } => {
  // let incompatibleError: StorageIncompatibleError | null = null;
  // try {
  //   ensureCompatible(storageDir);
  // } catch (error) {
  //   if (error instanceof StorageIncompatibleError) {
  //     incompatibleError = error;
  //   } else {
  //     throw error;
  //   }
  // }
  const dbPath = path.join(storageDir, "meta.sqlite");
  const db = new Database(dbPath);
  try {
    let extensionPath = sqliteVec.getLoadablePath();
    // In packaged Electron app, native modules in asar cannot be loaded via dlopen/loadExtension
    // We need to point to the unpacked version
    if (process.versions.electron && __dirname.includes("app.asar")) {
      extensionPath = extensionPath.replace("app.asar", "app.asar.unpacked");
    }
    db.loadExtension(extensionPath);
    console.log("sqlite-vec loaded successfully");
  } catch (e) {
    console.error("Failed to load sqlite-vec:", e);
  }
  db.pragma("journal_mode = WAL");
  
  try {
    db.exec(schemaStandard);
  } catch (e) {
    console.error("Failed to execute standard schema:", e);
    // If standard schema fails, we probably can't do anything.
    throw e;
  }

  try {
    db.exec(schemaVector);
  } catch (e) {
    console.error("Failed to execute vector schema:", e);
    // Proceed without vector search
  }

  return { db, imageDb: createImageDb(db), incompatibleError: null };
};

const buildColorFilterSql = (alias: string, color: OklchColor | null | undefined) => {
  if (!color) return { sql: "", params: {} as Record<string, unknown> };
  const hueDiff = `MIN(ABS(${alias}.dominantH - @colorH), ${OKLCH_FILTER.tau} - ABS(${alias}.dominantH - @colorH))`;
  const avgC = `((${alias}.dominantC + @colorC) / 2)`;
  const dH = `(CASE WHEN ${avgC} < ${OKLCH_FILTER.neutralChromaCutoff} THEN 0 ELSE 2 * SQRT(${alias}.dominantC * @colorC) * SIN((${hueDiff}) / 2) END)`;
  const deltaE = `SQRT(((${alias}.dominantL - @colorL) * (${alias}.dominantL - @colorL)) + ((${alias}.dominantC - @colorC) * (${alias}.dominantC - @colorC)) + (${dH} * ${dH}))`;
  const sql = `
    AND ${alias}.dominantL IS NOT NULL
    AND ${alias}.dominantC IS NOT NULL
    AND ${alias}.dominantH IS NOT NULL
    AND (
      (${avgC} <= ${OKLCH_FILTER.chromaThreshold} OR ${hueDiff} <= ${OKLCH_FILTER.maxHueDiff})
      AND ${deltaE} <= ${OKLCH_FILTER.deltaE}
    )
  `;
  return {
    sql,
    params: {
      colorL: color.L,
      colorC: color.C,
      colorH: color.h,
    },
  };
};
