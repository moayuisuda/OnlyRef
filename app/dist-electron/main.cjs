var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_electron4 = require("electron");
var import_path6 = __toESM(require("path"), 1);
var import_fs_extra5 = __toESM(require("fs-extra"), 1);
var import_electron_log = __toESM(require("electron-log"), 1);
var import_electron_updater = require("electron-updater");
var import_child_process3 = require("child_process");

// backend/fileLock.ts
var import_fs_extra = __toESM(require("fs-extra"), 1);
var import_path = __toESM(require("path"), 1);
var KeyedMutex = class {
  locks = /* @__PURE__ */ new Map();
  async run(key, task) {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release = () => {
    };
    const current = new Promise((resolve) => {
      release = resolve;
    });
    const chain = previous.then(() => current);
    this.locks.set(key, chain);
    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.locks.get(key) === chain) {
        this.locks.delete(key);
      }
    }
  }
};
var mutex = new KeyedMutex();
var normalizeKey = (target) => {
  if (!target) return "unknown";
  try {
    return import_path.default.resolve(target);
  } catch {
    return target;
  }
};
var withFileLock = async (target, task) => {
  return mutex.run(normalizeKey(target), task);
};
var withFileLocks = async (targets, task) => {
  const keys = Array.from(new Set(targets.map(normalizeKey))).sort();
  const run = async (index) => {
    if (index >= keys.length) return task();
    return mutex.run(keys[index], () => run(index + 1));
  };
  return run(0);
};
var lockedFs = {
  pathExists: (target) => withFileLock(target, () => import_fs_extra.default.pathExists(target)),
  ensureDir: (target) => withFileLock(target, () => import_fs_extra.default.ensureDir(target)),
  ensureFile: (target) => withFileLock(target, () => import_fs_extra.default.ensureFile(target)),
  readJson: (target) => withFileLock(target, () => import_fs_extra.default.readJson(target)),
  writeJson: (target, data) => withFileLock(target, () => import_fs_extra.default.writeJson(target, data)),
  readFile: (target, options) => withFileLock(target, () => import_fs_extra.default.readFile(target, options)),
  writeFile: (target, data, options) => withFileLock(
    target,
    () => import_fs_extra.default.writeFile(target, data, options)
  ),
  appendFile: (target, data) => withFileLock(target, () => import_fs_extra.default.appendFile(target, data)),
  readdir: (target, options) => withFileLock(target, () => import_fs_extra.default.readdir(target, options)),
  stat: (target) => withFileLock(target, () => import_fs_extra.default.stat(target)),
  rename: (src, dest) => withFileLocks([src, dest], () => import_fs_extra.default.rename(src, dest)),
  copy: (src, dest) => withFileLocks([src, dest], () => import_fs_extra.default.copy(src, dest)),
  remove: (target) => withFileLock(target, () => import_fs_extra.default.remove(target)),
  unlink: (target) => withFileLock(target, () => import_fs_extra.default.unlink(target))
};

// electron/main.ts
var import_readline2 = __toESM(require("readline"), 1);
var import_https = __toESM(require("https"), 1);
var import_zlib = __toESM(require("zlib"), 1);

// backend/server.ts
var import_electron3 = require("electron");
var import_path5 = __toESM(require("path"), 1);
var import_express5 = __toESM(require("express"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_body_parser = __toESM(require("body-parser"), 1);
var import_fs_extra4 = __toESM(require("fs-extra"), 1);
var import_child_process2 = require("child_process");
var import_readline = __toESM(require("readline"), 1);

// backend/db.ts
var import_path2 = __toESM(require("path"), 1);
var import_better_sqlite3 = __toESM(require("better-sqlite3"), 1);
var sqliteVec = __toESM(require("sqlite-vec"), 1);

// backend/constants.ts
var OKLCH_FILTER = {
  deltaE: 0.17,
  maxHueDiff: 0.55,
  chromaThreshold: 0.04,
  neutralChromaCutoff: 0.02,
  tau: Math.PI * 2
};

// backend/db.ts
var schemaStandard = `
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
var schemaVector = `
CREATE VIRTUAL TABLE IF NOT EXISTS images_vec USING vec0(
  rowid INTEGER PRIMARY KEY,
  vector float[768]
);
`;
var normalizeTags = (tags) => {
  const normalized = tags.map((tag) => typeof tag === "string" ? tag.trim() : "").filter((tag) => tag.length > 0);
  return Array.from(new Set(normalized));
};
var buildTagsMap = (rows) => {
  const map = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const list = map.get(row.imageId) ?? [];
    list.push(row.name);
    map.set(row.imageId, list);
  }
  return map;
};
var resolveHasVector = (db, rowids) => {
  if (rowids.length === 0) return /* @__PURE__ */ new Set();
  try {
    const placeholders = rowids.map(() => "?").join(",");
    const rows = db.prepare(`SELECT rowid FROM images_vec WHERE rowid IN (${placeholders})`).all(...rowids);
    return new Set(rows.map((row) => row.rowid));
  } catch (error) {
    console.error("Failed to resolve vector status:", error);
    return /* @__PURE__ */ new Set();
  }
};
var loadTags = (db, imageIds) => {
  if (imageIds.length === 0) return /* @__PURE__ */ new Map();
  const placeholders = imageIds.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT it.imageId, t.name FROM image_tags it JOIN tags t ON t.id = it.tagId WHERE it.imageId IN (${placeholders})`
  ).all(...imageIds);
  return buildTagsMap(rows);
};
var mapImages = (db, rows) => {
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
    galleryOrder: row.galleryOrder ?? null
  }));
};
var createImageDb = (db) => {
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
  const getImageRowById = (id) => {
    const row = db.prepare(
      `SELECT rowid, id, filename, imagePath, createdAt, pageUrl, dominantColor, dominantL, dominantC, dominantH, tone, galleryOrder FROM images WHERE id = ?`
    ).get(id);
    return row ?? null;
  };
  const getImageRowByFilename = (filename) => {
    const row = db.prepare(
      `SELECT rowid, id, filename, imagePath, createdAt, pageUrl, dominantColor, dominantL, dominantC, dominantH, tone, galleryOrder FROM images WHERE filename = ?`
    ).get(filename);
    return row ?? null;
  };
  const getImageRowidById = (id) => {
    const row = db.prepare(`SELECT rowid FROM images WHERE id = ?`).get(id);
    return typeof (row == null ? void 0 : row.rowid) === "number" ? row.rowid : null;
  };
  const getImageById = (id) => {
    const row = getImageRowById(id);
    if (!row) return null;
    return mapImages(db, [row])[0] ?? null;
  };
  const listImages = (params) => {
    const { limit, tone, color, cursor } = params ?? {};
    const colorSql = buildColorFilterSql("i", color);
    const orderKey = "COALESCE(i.galleryOrder, -1)";
    const hasCursor = typeof (cursor == null ? void 0 : cursor.createdAt) === "number" && typeof (cursor == null ? void 0 : cursor.rowid) === "number" && (cursor == null ? void 0 : cursor.galleryOrder) !== void 0;
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
    const rows = db.prepare(sql).all({
      tone: tone ?? null,
      hasCursor: hasCursor ? 1 : 0,
      cursorOrderKey: hasCursor ? (cursor == null ? void 0 : cursor.galleryOrder) ?? -1 : 0,
      cursorCreatedAt: hasCursor ? cursor == null ? void 0 : cursor.createdAt : 0,
      cursorRowid: hasCursor ? cursor == null ? void 0 : cursor.rowid : 0,
      limit: limitValue,
      ...colorSql.params
    });
    return mapImages(db, rows);
  };
  const listImagesByIds = (ids) => {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const rows = db.prepare(
      `SELECT rowid, id, filename, imagePath, createdAt, pageUrl, dominantColor, dominantL, dominantC, dominantH, tone, galleryOrder FROM images WHERE id IN (${placeholders})`
    ).all(...ids);
    const map = new Map(rows.map((row) => [row.id, row]));
    const orderedRows = ids.map((id) => map.get(id)).filter((row) => Boolean(row));
    return mapImages(db, orderedRows);
  };
  const insertImage = (data) => {
    const info = insertImageStmt.run({
      ...data,
      dominantColor: null,
      dominantL: null,
      dominantC: null,
      dominantH: null,
      tone: null
    });
    return { rowid: Number(info.lastInsertRowid) };
  };
  const updateImage = (data) => {
    const hasFilename = data.filename !== void 0;
    const hasImagePath = data.imagePath !== void 0;
    const hasPageUrl = data.pageUrl !== void 0;
    const hasDominantColor = data.dominantColor !== void 0;
    const hasTone = data.tone !== void 0;
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
      tone: hasTone ? data.tone ?? null : null
    });
  };
  const deleteImage = (id) => {
    const row = getImageRowById(id);
    if (!row) return null;
    try {
      db.prepare(`DELETE FROM images_vec WHERE rowid = ?`).run(row.rowid);
    } catch {
    }
    db.prepare(`DELETE FROM images WHERE id = ?`).run(id);
    db.prepare(`DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tagId FROM image_tags)`).run();
    return { imagePath: row.imagePath };
  };
  const resolveTagIds = (names) => {
    const normalized = normalizeTags(names);
    if (normalized.length === 0) return [];
    const insertStmt = db.prepare(`INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING`);
    const getStmt = db.prepare(`SELECT id FROM tags WHERE name = ?`);
    const tx = db.transaction(() => {
      normalized.forEach((name) => insertStmt.run(name));
      return normalized.map((name) => {
        const row = getStmt.get(name);
        return row == null ? void 0 : row.id;
      }).filter((id) => typeof id === "number");
    });
    return tx();
  };
  const getTagIdsByNames = (names) => {
    const normalized = normalizeTags(names);
    if (normalized.length === 0) return [];
    const placeholders = normalized.map(() => "?").join(",");
    const rows = db.prepare(`SELECT id, name FROM tags WHERE name IN (${placeholders})`).all(...normalized);
    const map = new Map(rows.map((row) => [row.name, row.id]));
    return normalized.map((name) => map.get(name)).filter((id) => typeof id === "number");
  };
  const setImageTags = (id, tags) => {
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
  const setImageVector = (rowid, vector) => {
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
          vector: normalizedVector
        });
      });
      tx();
    } catch (error) {
      console.error("Failed to set image vector:", error);
    }
  };
  const setImageVectors = (items) => {
    if (items.length === 0) return [];
    const normalizedItems = items.map((item) => {
      const normalizedRowid = Number(item.rowid);
      if (!Number.isFinite(normalizedRowid) || !Number.isInteger(normalizedRowid)) {
        console.error("Failed to set image vectors: invalid rowid", item.rowid);
        return null;
      }
      return {
        rowid: normalizedRowid,
        rowidValue: BigInt(normalizedRowid),
        vector: new Float32Array(item.vector)
      };
    }).filter(
      (item) => item !== null
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
          vector: item.vector
        });
      });
    });
    tx();
    return normalizedItems.map((item) => item.rowid);
  };
  const setGalleryOrder = (order) => {
    const resetStmt = db.prepare(`UPDATE images SET galleryOrder = NULL WHERE galleryOrder IS NOT NULL`);
    const updateStmt = db.prepare(`UPDATE images SET galleryOrder = ? WHERE id = ?`);
    const tx = db.transaction(() => {
      resetStmt.run();
      order.forEach((id, index) => updateStmt.run(index, id));
    });
    tx();
  };
  const moveGalleryOrder = (activeId, overId) => {
    const tx = db.transaction(() => {
      const hasNull = db.prepare("SELECT 1 FROM images WHERE galleryOrder IS NULL LIMIT 1").get();
      if (hasNull) {
        const allImages = db.prepare("SELECT id FROM images ORDER BY galleryOrder ASC, createdAt DESC").all();
        const updateStmt = db.prepare("UPDATE images SET galleryOrder = ? WHERE id = ?");
        allImages.forEach((row, index) => {
          updateStmt.run(index, row.id);
        });
      }
      const getOrderStmt = db.prepare("SELECT galleryOrder FROM images WHERE id = ?");
      const activeRow = getOrderStmt.get(activeId);
      const overRow = getOrderStmt.get(overId);
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
  const listTags = () => {
    const rows = db.prepare(`SELECT name FROM tags ORDER BY name ASC`).all();
    return rows.map((row) => row.name);
  };
  const renameTag = (oldName, newName) => {
    const trimmedOld = oldName.trim();
    const trimmedNew = newName.trim();
    if (!trimmedOld || !trimmedNew || trimmedOld === trimmedNew) return;
    const oldRow = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(trimmedOld);
    if (!(oldRow == null ? void 0 : oldRow.id)) return;
    const newRow = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(trimmedNew);
    const tx = db.transaction(() => {
      if (newRow == null ? void 0 : newRow.id) {
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
  const deleteTag = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const row = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(trimmed);
    if (!(row == null ? void 0 : row.id)) return;
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM image_tags WHERE tagId = ?`).run(row.id);
      db.prepare(`DELETE FROM tags WHERE id = ?`).run(row.id);
    });
    tx();
  };
  const searchImages = (params) => {
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
      const hasCursor = typeof afterDistance === "number" && typeof afterRowid === "number";
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
        ...colorSql.params
      });
      const metas = mapImages(db, rows);
      const scores = new Map(rows.map((row) => [row.id, row.distance]));
      const cursorMap = new Map(
        rows.map((row) => [row.id, { distance: row.distance, rowid: row.rowid }])
      );
      return metas.map((meta) => {
        const distance = scores.get(meta.id);
        const score = typeof distance === "number" ? 1 - distance : void 0;
        const cursor = cursorMap.get(meta.id);
        if (!cursor) {
          return score !== void 0 ? { ...meta, score } : meta;
        }
        return {
          ...meta,
          score,
          vectorDistance: cursor.distance,
          vectorRowid: cursor.rowid
        };
      });
    } catch (error) {
      console.error("Vector search failed:", error);
      return [];
    }
  };
  const searchImagesByText = (params) => {
    const { query, limit, tagIds, tagCount, tone, color, afterCreatedAt, afterRowid } = params;
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hasTextQuery = tokens.length > 0;
    if (!hasTextQuery && (!tagIds || tagIds.length === 0)) return [];
    const idsJson = JSON.stringify(tagIds ?? []);
    const colorSql = buildColorFilterSql("i", color);
    const textConditions = tokens.map(
      (_, i) => `(lower(i.filename) LIKE @token${i} OR lower(i.imagePath) LIKE @token${i})`
    ).join(" AND ");
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
    const hasCursor = typeof afterCreatedAt === "number" && typeof afterRowid === "number";
    const queryParams = {
      tagIds: idsJson,
      hasTags: tagIds && tagIds.length > 0 ? 1 : 0,
      tagCount: tagCount ?? 0,
      limit: typeof limit === "number" && limit > 0 ? limit : 100,
      tone: tone ?? null,
      hasCursor: hasCursor ? 1 : 0,
      cursorCreatedAt: hasCursor ? afterCreatedAt : 0,
      cursorRowid: hasCursor ? afterRowid : 0,
      ...colorSql.params
    };
    tokens.forEach((token, i) => {
      queryParams[`token${i}`] = `%${token}%`;
    });
    const rows = stmt.all(queryParams);
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
    getTagIdsByNames
  };
};
var createDatabase = (storageDir) => {
  const dbPath = import_path2.default.join(storageDir, "meta.sqlite");
  const db = new import_better_sqlite3.default(dbPath);
  try {
    let extensionPath = sqliteVec.getLoadablePath();
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
    throw e;
  }
  try {
    db.exec(schemaVector);
  } catch (e) {
    console.error("Failed to execute vector schema:", e);
  }
  return { db, imageDb: createImageDb(db), incompatibleError: null };
};
var buildColorFilterSql = (alias, color) => {
  if (!color) return { sql: "", params: {} };
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
      colorH: color.h
    }
  };
};

// backend/routes/images.ts
var import_path3 = __toESM(require("path"), 1);
var import_express = __toESM(require("express"), 1);
var import_electron = require("electron");
var import_uuid = require("uuid");
var import_fs_extra2 = __toESM(require("fs-extra"), 1);
var VECTOR_INDEX_BATCH_SIZE = 8;
var IMPORT_BATCH_CONCURRENCY = 4;
var IMAGE_POST_PROCESS_CONCURRENCY = 3;
var ensureTags = (tags) => {
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag) => typeof tag === "string");
};
var parseNumber = (raw) => {
  if (typeof raw !== "string") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};
var parseLimit = (raw) => {
  const parsed = parseNumber(raw);
  if (typeof parsed !== "number") return void 0;
  return parsed > 0 ? parsed : void 0;
};
var parseTextCursor = (query) => {
  const createdAt = parseNumber(query.cursorCreatedAt);
  const rowid = parseNumber(query.cursorRowid);
  const galleryOrder = parseNumber(query.cursorGalleryOrder);
  if (typeof createdAt !== "number" || typeof rowid !== "number") return null;
  return { createdAt, rowid, galleryOrder: typeof galleryOrder === "number" ? galleryOrder : null };
};
var parseVectorCursor = (query) => {
  const distance = parseNumber(query.cursorDistance);
  const rowid = parseNumber(query.cursorRowid);
  if (typeof distance !== "number" || typeof rowid !== "number") return null;
  return { distance, rowid };
};
var parseVectorSearchSource = (raw) => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const payload = raw;
  const type = typeof payload.type === "string" ? payload.type.trim() : "";
  if (type === "text") {
    const query = typeof payload.query === "string" ? payload.query.trim() : "";
    if (!query) {
      return null;
    }
    return {
      type: "text",
      query
    };
  }
  if (type === "imageId") {
    const imageId = typeof payload.imageId === "string" ? payload.imageId.trim() : "";
    if (!imageId) {
      return null;
    }
    return {
      type: "imageId",
      imageId
    };
  }
  if (type === "localPath") {
    const localPath = typeof payload.localPath === "string" ? payload.localPath.trim() : "";
    if (!localPath) {
      return null;
    }
    return {
      type: "localPath",
      localPath
    };
  }
  return null;
};
var buildTextCursor = (items) => {
  const last = items[items.length - 1];
  if (!last) return null;
  if (typeof last.createdAt !== "number" || typeof last.rowid !== "number") return null;
  return { createdAt: last.createdAt, rowid: last.rowid, galleryOrder: last.galleryOrder ?? null };
};
var buildVectorCursor = (items) => {
  const last = items[items.length - 1];
  if (!last) return null;
  if (typeof last.vectorDistance !== "number" || typeof last.vectorRowid !== "number") {
    return null;
  }
  return { distance: last.vectorDistance, rowid: last.vectorRowid };
};
var sanitizeBase = (raw) => {
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
var normalizeExt = (raw) => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withDot = trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
  if (!/^\.[a-zA-Z0-9]{1,10}$/.test(withDot)) return null;
  return withDot.toLowerCase();
};
var IMAGE_EXTENSIONS = /* @__PURE__ */ new Set([
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
  ".avif"
]);
var isImageFilename = (filename) => IMAGE_EXTENSIONS.has(import_path3.default.extname(filename).toLowerCase());
var listImageFiles = async (dir) => {
  if (!await lockedFs.pathExists(dir)) return [];
  const entries = await lockedFs.readdir(dir, {
    withFileTypes: true
  });
  return entries.filter((entry) => entry.isFile() && isImageFilename(entry.name)).map((entry) => entry.name);
};
var pruneMissingIndexedImages = (imageDb2, indexedItems, diskFilenames) => {
  let deleted = 0;
  const retainedItems = [];
  indexedItems.forEach((item) => {
    const diskFilename = import_path3.default.basename(item.imagePath);
    if (!diskFilenames.has(diskFilename)) {
      imageDb2.deleteImage(item.id);
      deleted += 1;
      return;
    }
    retainedItems.push(item);
  });
  return { deleted, retainedItems };
};
var parseTags = (raw) => {
  if (Array.isArray(raw)) {
    return raw.filter((tag) => typeof tag === "string");
  }
  if (typeof raw === "string") {
    return raw.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  }
  return [];
};
var normalizeHexColor = (raw) => {
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
var hexToRgb = (hex) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
};
var srgbToLinear = (x) => {
  const v = x / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
var rgbToOklab = (rgb) => {
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
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  };
};
var oklabToOklch = (lab) => {
  const C = Math.hypot(lab.a, lab.b);
  const h = Math.atan2(lab.b, lab.a);
  return { L: lab.L, C, h };
};
var hexToOklch = (hex) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return oklabToOklch(rgbToOklab(rgb));
};
var resolveOklchPayload = (raw) => {
  const normalized = normalizeHexColor(raw);
  if (!normalized) return null;
  const oklch = hexToOklch(normalized);
  if (!oklch) return null;
  return { color: normalized, oklch };
};
var resolveImportSource = (payload) => {
  if (payload.imageBase64) {
    const base64Data = payload.imageBase64.replace(/^data:image\/\w+;base64,/, "");
    return {
      sourceType: "buffer",
      sourceData: Buffer.from(base64Data, "base64")
    };
  }
  if (payload.type && payload.data) {
    return {
      sourceType: payload.type,
      sourceData: payload.data
    };
  }
  if (payload.imageUrl) {
    return {
      sourceType: payload.imageUrl.startsWith("file://") || payload.imageUrl.startsWith("/") ? "path" : "url",
      sourceData: payload.imageUrl
    };
  }
  return null;
};
var chunkItems = (items, size) => {
  if (items.length === 0) return [];
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};
var runWithConcurrency = async (items, limit, task) => {
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
var mergeImagePostProcessItems = (items) => {
  const merged = /* @__PURE__ */ new Map();
  items.forEach((item) => {
    const current = merged.get(item.id);
    if (!current) {
      merged.set(item.id, { ...item });
      return;
    }
    current.processVector = current.processVector || item.processVector;
    current.processDominantColor = current.processDominantColor || item.processDominantColor;
    current.processTone = current.processTone || item.processTone;
  });
  return Array.from(merged.values());
};
var createImagesRouter = (deps) => {
  const router = import_express.default.Router();
  const reservedImportFilenames = /* @__PURE__ */ new Set();
  const guardStorage = (res) => {
    const incompatibleError2 = deps.getIncompatibleError();
    if (!incompatibleError2) return false;
    res.status(409).json({
      error: "Storage is incompatible",
      details: incompatibleError2.message,
      code: "STORAGE_INCOMPATIBLE"
    });
    return true;
  };
  const resolveVectorSearchLocalPath = async (imageDb2, source) => {
    if (source.type === "text") {
      return {
        mode: "encode-text",
        arg: source.query
      };
    }
    if (source.type === "imageId") {
      const row = imageDb2.getImageRowById(source.imageId);
      if (!row) {
        return null;
      }
      return {
        mode: "encode-image",
        arg: import_path3.default.join(deps.getStorageDir(), row.imagePath)
      };
    }
    const resolvedPath = import_path3.default.resolve(source.localPath);
    const exists = await withFileLock(
      resolvedPath,
      async () => import_fs_extra2.default.pathExists(resolvedPath)
    );
    if (!exists) {
      return null;
    }
    return {
      mode: "encode-image",
      arg: resolvedPath
    };
  };
  const runVectorSearch = async (imageDb2, params) => {
    var _a, _b;
    if (params.source.type === "text" && !params.source.query.trim()) {
      return { items: [], nextCursor: null };
    }
    const settings = await deps.readSettings();
    const enableVectorSearch = Boolean(settings.enableVectorSearch);
    if (!enableVectorSearch) {
      return { items: [], nextCursor: null };
    }
    const resolved = await resolveVectorSearchLocalPath(imageDb2, params.source);
    if (!resolved) {
      return { items: [], nextCursor: null };
    }
    const vector = resolved.mode === "encode-image" ? await withFileLock(
      resolved.arg,
      async () => deps.runPythonVector(resolved.mode, resolved.arg)
    ) : await deps.runPythonVector(resolved.mode, resolved.arg);
    if (!vector) {
      return { items: [], nextCursor: null };
    }
    const tagIds = imageDb2.getTagIdsByNames(params.tags);
    const tagCount = params.tags.length;
    const results = imageDb2.searchImages({
      vector,
      limit: params.effectiveLimit,
      tagIds,
      tagCount,
      tone: params.tone,
      color: params.color,
      afterDistance: ((_a = params.cursor) == null ? void 0 : _a.distance) ?? null,
      afterRowid: ((_b = params.cursor) == null ? void 0 : _b.rowid) ?? null
    });
    const nextCursor = buildVectorCursor(results);
    return {
      items: results.map((item) => ({ ...item, isVectorResult: true })),
      nextCursor
    };
  };
  const indexImageVector = async (imageDb2, params) => {
    var _a;
    const { id, rowid, localPath, context, current, total } = params;
    console.log(`[VectorIndex] start ${context}`, {
      id,
      rowid,
      ...typeof current === "number" ? { current } : {},
      ...typeof total === "number" ? { total } : {},
      imagePath: localPath
    });
    const vector = await deps.runPythonVector("encode-image", localPath);
    if (!vector) {
      console.error(`[VectorIndex] vector missing ${context}`, {
        id,
        rowid,
        ...typeof current === "number" ? { current } : {},
        ...typeof total === "number" ? { total } : {}
      });
      return false;
    }
    imageDb2.setImageVector(rowid, vector);
    (_a = deps.sendToRenderer) == null ? void 0 : _a.call(deps, "image-updated", { id, hasVector: true });
    console.log(`[VectorIndex] stored ${context}`, {
      id,
      rowid,
      ...typeof current === "number" ? { current } : {},
      ...typeof total === "number" ? { total } : {},
      length: vector.length
    });
    return true;
  };
  const indexImageVectorBatch = async (imageDb2, items) => {
    if (items.length === 0) return 0;
    console.log("[VectorIndex] start batch-chunk", {
      size: items.length,
      firstCurrent: items[0].current,
      lastCurrent: items[items.length - 1].current,
      total: items[0].total
    });
    const results = await deps.runPythonVectors(items.map((item) => item.localPath));
    if (results.length !== items.length) {
      throw new Error("Vector batch result length mismatch");
    }
    const successfulEntries = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const result = results[index];
      if ((result == null ? void 0 : result.vector) && result.vector.length > 0) {
        successfulEntries.push({ item, vector: result.vector });
        continue;
      }
      console.error("[VectorIndex] vector missing batch", {
        id: item.id,
        rowid: item.rowid,
        current: item.current,
        total: item.total,
        error: (result == null ? void 0 : result.error) ?? "vector-missing"
      });
    }
    const writtenRowids = new Set(
      imageDb2.setImageVectors(
        successfulEntries.map(({ item, vector }) => ({ rowid: item.rowid, vector }))
      )
    );
    successfulEntries.forEach(({ item, vector }) => {
      var _a;
      if (!writtenRowids.has(item.rowid)) {
        console.error("[VectorIndex] vector write missing batch", {
          id: item.id,
          rowid: item.rowid,
          current: item.current,
          total: item.total
        });
        return;
      }
      (_a = deps.sendToRenderer) == null ? void 0 : _a.call(deps, "image-updated", { id: item.id, hasVector: true });
      console.log("[VectorIndex] stored batch", {
        id: item.id,
        rowid: item.rowid,
        current: item.current,
        total: item.total,
        length: vector.length
      });
    });
    return writtenRowids.size;
  };
  const updateImageDominantColor = async (imageDb2, item) => {
    var _a;
    try {
      const dominantColor = await deps.runPythonDominantColor(item.localPath);
      if (!dominantColor) return;
      const resolved = resolveOklchPayload(dominantColor);
      if (!resolved) return;
      imageDb2.updateImage({
        id: item.id,
        dominantColor: resolved.color,
        dominantL: resolved.oklch.L,
        dominantC: resolved.oklch.C,
        dominantH: resolved.oklch.h
      });
      (_a = deps.sendToRenderer) == null ? void 0 : _a.call(deps, "image-updated", {
        id: item.id,
        dominantColor: resolved.color
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Async dominant color update failed:", message);
    }
  };
  const updateImageTone = async (imageDb2, item) => {
    var _a;
    try {
      const tone = await deps.runPythonTone(item.localPath);
      if (!tone) return;
      imageDb2.updateImage({ id: item.id, tone });
      (_a = deps.sendToRenderer) == null ? void 0 : _a.call(deps, "image-updated", { id: item.id, tone });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Async tone update failed:", message);
    }
  };
  const runImagePostProcessing = async (imageDb2, items, options) => {
    var _a;
    if (items.length === 0) {
      return { updatedVectors: 0, totalVectors: 0 };
    }
    const vectorCandidates = items.filter((item) => item.processVector);
    let vectorItems = [];
    if (vectorCandidates.length > 0) {
      const settings = await deps.readSettings();
      if (settings.enableVectorSearch === true) {
        vectorItems = vectorCandidates;
      }
    }
    let updatedVectors = 0;
    let vectorFailures = 0;
    let completedVectors = 0;
    const jobs = [];
    const vectorScheduledIds = /* @__PURE__ */ new Set();
    const appendDerivativeJobs = (item) => {
      if (item.processDominantColor) {
        jobs.push(() => updateImageDominantColor(imageDb2, item));
      }
      if (item.processTone) {
        jobs.push(() => updateImageTone(imageDb2, item));
      }
    };
    let vectorBaseIndex = 0;
    for (const chunk of chunkItems(vectorItems, VECTOR_INDEX_BATCH_SIZE)) {
      const batchItems = chunk.map((item, index) => ({
        id: item.id,
        rowid: item.rowid,
        localPath: item.localPath,
        current: vectorBaseIndex + index + 1,
        total: vectorItems.length
      }));
      jobs.push(async () => {
        var _a2;
        try {
          if (batchItems.length === 1) {
            const indexed = await indexImageVector(imageDb2, {
              id: batchItems[0].id,
              rowid: batchItems[0].rowid,
              localPath: batchItems[0].localPath,
              context: options.vectorContext,
              current: batchItems[0].current,
              total: batchItems[0].total
            });
            updatedVectors += indexed ? 1 : 0;
            vectorFailures += indexed ? 0 : 1;
          } else {
            const updated = await indexImageVectorBatch(imageDb2, batchItems);
            updatedVectors += updated;
            vectorFailures += batchItems.length - updated;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("Async vector image processing failed:", message);
          vectorFailures += batchItems.length;
        } finally {
          completedVectors += batchItems.length;
          (_a2 = options.onVectorProgress) == null ? void 0 : _a2.call(options, completedVectors, vectorItems.length);
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
      (_a = deps.sendToRenderer) == null ? void 0 : _a.call(deps, "toast", {
        key: "toast.vectorIndexFailed",
        type: "error"
      });
    }
    return { updatedVectors, totalVectors: vectorItems.length };
  };
  const scheduleImagePostProcessing = (imageDb2, items, options) => {
    if (items.length === 0) return;
    void runImagePostProcessing(imageDb2, items, options).catch((error) => {
      var _a;
      const message = error instanceof Error ? error.message : String(error);
      console.error("Async image post processing failed:", message);
      if (options.notifyVectorFailure) {
        (_a = deps.sendToRenderer) == null ? void 0 : _a.call(deps, "toast", {
          key: "toast.vectorIndexFailed",
          type: "error"
        });
      }
    });
  };
  const reserveImportTarget = async (imageDb2, payload, source, timestamp) => {
    const { sourceType, sourceData } = source;
    const sourceFilename = sourceType === "path" ? import_path3.default.basename(sourceData).split("?")[0] : "";
    const metaFilename = typeof payload.filename === "string" ? payload.filename.trim() : "";
    const metaName = typeof payload.name === "string" ? payload.name.trim() : "";
    const extFromMetaFilename = normalizeExt(import_path3.default.extname(metaFilename));
    const extFromSource = normalizeExt(import_path3.default.extname(sourceFilename));
    const extFromMetaName = normalizeExt(import_path3.default.extname(metaName));
    const ext = extFromMetaFilename || extFromSource || extFromMetaName || (sourceType === "buffer" ? ".png" : ".jpg");
    const baseNameFromMetaFilename = metaFilename ? import_path3.default.basename(metaFilename, import_path3.default.extname(metaFilename)) : "";
    const baseNameFromMetaName = metaName ? import_path3.default.basename(metaName, import_path3.default.extname(metaName)) : "";
    const baseNameFromSource = sourceFilename ? import_path3.default.basename(sourceFilename, import_path3.default.extname(sourceFilename)) : "";
    const rawBase = baseNameFromMetaFilename || baseNameFromMetaName || baseNameFromSource || `EMPTY_NAME_${timestamp}`;
    const safeName = sanitizeBase(rawBase);
    return withFileLock(deps.getImageDir(), async () => {
      let filename = `${safeName}${ext}`;
      let counter = 1;
      while (true) {
        if (reservedImportFilenames.has(filename) || imageDb2.getImageRowByFilename(filename)) {
          filename = `${safeName}_${counter}${ext}`;
          counter += 1;
          continue;
        }
        const imagePath = import_path3.default.join("images", filename);
        const localPath = import_path3.default.join(deps.getStorageDir(), imagePath);
        const existedBefore = await lockedFs.pathExists(localPath);
        reservedImportFilenames.add(filename);
        return { filename, imagePath, localPath, existedBefore };
      }
    });
  };
  const importSingleImage = async (imageDb2, payload, timestamp) => {
    const source = resolveImportSource(payload);
    if (!source) {
      throw new Error("No image data");
    }
    const tags = ensureTags(payload.tags);
    const { sourceType, sourceData } = source;
    const target = await reserveImportTarget(imageDb2, payload, source, timestamp);
    try {
      if (sourceType === "buffer") {
        await withFileLock(target.localPath, async () => {
          await import_fs_extra2.default.writeFile(target.localPath, sourceData);
        });
      } else if (sourceType === "path") {
        let srcPath = sourceData;
        if (srcPath.startsWith("file://")) {
          srcPath = new URL(srcPath).pathname;
          if (process.platform === "win32" && srcPath.startsWith("/") && srcPath.includes(":")) {
            srcPath = srcPath.substring(1);
          }
        }
        srcPath = decodeURIComponent(srcPath);
        await withFileLocks([srcPath, target.localPath], async () => {
          await import_fs_extra2.default.copy(srcPath, target.localPath);
        });
      } else {
        await deps.downloadImage(sourceData, target.localPath);
      }
      const id = (0, import_uuid.v4)();
      const createdAt = timestamp;
      const pageUrl = typeof payload.pageUrl === "string" ? payload.pageUrl : null;
      const { rowid } = imageDb2.insertImage({
        id,
        filename: target.filename,
        imagePath: target.imagePath,
        createdAt,
        pageUrl
      });
      imageDb2.setImageTags(id, tags);
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
          hasVector: false
        }
      };
    } catch (error) {
      if (!target.existedBefore) {
        await withFileLock(target.localPath, async () => {
          if (await import_fs_extra2.default.pathExists(target.localPath)) {
            await import_fs_extra2.default.remove(target.localPath);
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
      const imageDb2 = deps.getImageDb();
      const mode = typeof req.query.mode === "string" ? req.query.mode.trim() : "";
      const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
      const tags = parseTags(req.query.tags);
      const tone = typeof req.query.tone === "string" && req.query.tone.trim() ? req.query.tone.trim() : null;
      const colorHex = normalizeHexColor(req.query.color);
      const color = colorHex ? hexToOklch(colorHex) : null;
      const effectiveLimit = parseLimit(req.query.limit) ?? 100;
      if (mode === "vector") {
        const vectorCursor = parseVectorCursor(req.query);
        const data = await runVectorSearch(imageDb2, {
          source: {
            type: "text",
            query
          },
          tags,
          tone,
          color,
          effectiveLimit,
          cursor: vectorCursor
        });
        res.json(data);
        return;
      }
      const textCursor = parseTextCursor(req.query);
      if (!query && tags.length === 0) {
        const items = imageDb2.listImages({
          limit: effectiveLimit,
          tone,
          color,
          cursor: textCursor
        });
        const nextCursor2 = buildTextCursor(items);
        res.json({ items, nextCursor: nextCursor2 });
        return;
      }
      const tagIds = imageDb2.getTagIdsByNames(tags);
      const tagCount = tags.length;
      const results = imageDb2.searchImagesByText({
        query,
        limit: effectiveLimit,
        tagIds,
        tagCount,
        tone,
        color,
        afterCreatedAt: (textCursor == null ? void 0 : textCursor.createdAt) ?? null,
        afterRowid: (textCursor == null ? void 0 : textCursor.rowid) ?? null
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
      const imageDb2 = deps.getImageDb();
      const body = req.body;
      const source = parseVectorSearchSource(body.source);
      if (!source) {
        res.status(400).json({ error: "Invalid vector search source" });
        return;
      }
      const tone = typeof body.tone === "string" && body.tone.trim() ? body.tone.trim() : null;
      const colorHex = normalizeHexColor(body.color);
      const color = colorHex ? hexToOklch(colorHex) : null;
      const effectiveLimit = parseLimit(String(body.limit ?? "")) ?? 100;
      const vectorCursor = parseVectorCursor({
        cursorDistance: String(body.cursorDistance ?? ""),
        cursorRowid: String(body.cursorRowid ?? "")
      });
      const tags = parseTags(body.tags);
      const data = await runVectorSearch(imageDb2, {
        source,
        tags,
        tone,
        color,
        effectiveLimit,
        cursor: vectorCursor
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
      const rawPath = typeof req.query.path === "string" ? req.query.path.trim() : "";
      if (!rawPath) {
        res.status(400).json({ error: "Path is required" });
        return;
      }
      const resolvedPath = import_path3.default.resolve(rawPath);
      const exists = await withFileLock(
        resolvedPath,
        async () => import_fs_extra2.default.pathExists(resolvedPath)
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
      const imageDb2 = deps.getImageDb();
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "Image id is required" });
        return;
      }
      const meta = imageDb2.getImageById(id);
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
      const imageDb2 = deps.getImageDb();
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "Image id is required" });
        return;
      }
      const current = imageDb2.getImageRowById(id);
      if (!current) {
        res.status(404).json({ error: "Image not found" });
        return;
      }
      const body = req.body;
      let nextFilename = current.filename;
      let nextImagePath = current.imagePath;
      if (typeof body.filename === "string" && body.filename.trim()) {
        const raw = body.filename.trim();
        const ext = import_path3.default.extname(current.filename);
        const base = raw.replace(/[/\\:*?"<>|]+/g, "_").trim() || "image";
        let candidate = `${base}${ext}`;
        let counter = 1;
        while (await lockedFs.pathExists(import_path3.default.join(deps.getImageDir(), candidate))) {
          if (candidate === current.filename) break;
          candidate = `${base}_${counter}${ext}`;
          counter += 1;
        }
        if (candidate !== current.filename) {
          const existing = imageDb2.getImageRowByFilename(candidate);
          if (existing && existing.id !== id) {
            res.status(409).json({ error: "Filename already exists" });
            return;
          }
          const oldLocalPath = import_path3.default.join(deps.getStorageDir(), current.imagePath);
          const newRelPath = import_path3.default.join("images", candidate);
          const newLocalPath = import_path3.default.join(deps.getStorageDir(), newRelPath);
          imageDb2.updateImage({ id, filename: candidate, imagePath: newRelPath });
          try {
            await withFileLocks([oldLocalPath, newLocalPath], async () => {
              await import_fs_extra2.default.rename(oldLocalPath, newLocalPath);
            });
          } catch (err) {
            imageDb2.updateImage({
              id,
              filename: current.filename,
              imagePath: current.imagePath
            });
            throw err;
          }
          nextFilename = candidate;
          nextImagePath = newRelPath;
        }
      }
      let nextDominantColor = void 0;
      let nextDominantOklch = void 0;
      if (body.dominantColor !== void 0) {
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
      let nextTone = void 0;
      if (body.tone !== void 0) {
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
      let nextPageUrl = void 0;
      if (body.pageUrl !== void 0) {
        if (body.pageUrl === null) {
          nextPageUrl = null;
        } else if (typeof body.pageUrl === "string") {
          nextPageUrl = body.pageUrl.trim() || null;
        } else {
          res.status(400).json({ error: "pageUrl must be a string or null" });
          return;
        }
      }
      imageDb2.updateImage({
        id,
        dominantColor: nextDominantColor,
        dominantL: nextDominantOklch == null ? void 0 : nextDominantOklch.L,
        dominantC: nextDominantOklch == null ? void 0 : nextDominantOklch.C,
        dominantH: nextDominantOklch == null ? void 0 : nextDominantOklch.h,
        tone: nextTone,
        pageUrl: nextPageUrl
      });
      if (body.tags !== void 0) {
        imageDb2.setImageTags(id, ensureTags(body.tags));
      }
      const updated = imageDb2.getImageById(id);
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
      const imageDb2 = deps.getImageDb();
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "Image id is required" });
        return;
      }
      const record = imageDb2.getImageRowById(id);
      if (!record) {
        res.status(404).json({ error: "Image not found" });
        return;
      }
      imageDb2.deleteImage(id);
      const localPath = import_path3.default.join(deps.getStorageDir(), record.imagePath);
      await withFileLock(localPath, async () => {
        if (await import_fs_extra2.default.pathExists(localPath)) {
          await import_fs_extra2.default.remove(localPath);
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
      const { order } = req.body;
      if (!Array.isArray(order)) {
        res.status(400).json({ error: "Order must be an array of IDs" });
        return;
      }
      const normalized = order.filter((id) => typeof id === "string");
      deps.getImageDb().setGalleryOrder(normalized);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.post("/api/order-move", async (req, res) => {
    try {
      const { activeId, overId } = req.body;
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
      const imageDb2 = deps.getImageDb();
      const payload = req.body;
      const imported = await importSingleImage(imageDb2, payload, Date.now());
      res.json({ success: true, meta: imported.meta });
      scheduleImagePostProcessing(
        imageDb2,
        [
          {
            id: imported.id,
            rowid: imported.rowid,
            localPath: imported.localPath,
            processVector: true,
            processDominantColor: true,
            processTone: true
          }
        ],
        {
          vectorContext: "import",
          notifyVectorFailure: true
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
      const imageDb2 = deps.getImageDb();
      const body = req.body;
      if (!Array.isArray(body.items) || body.items.length === 0) {
        res.status(400).json({ error: "No import items" });
        return;
      }
      const importedResults = new Array(
        body.items.length
      ).fill(null);
      const failedItems = [];
      const startedAt = Date.now();
      await runWithConcurrency(
        body.items,
        IMPORT_BATCH_CONCURRENCY,
        async (payload, index) => {
          try {
            importedResults[index] = await importSingleImage(
              imageDb2,
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
        (item) => item !== null
      );
      res.json({
        success: true,
        items: importedItems.map((item) => item.meta),
        failedCount: failedItems.length
      });
      scheduleImagePostProcessing(
        imageDb2,
        importedItems.map((item) => ({
          id: item.id,
          rowid: item.rowid,
          localPath: item.localPath,
          processVector: true,
          processDominantColor: true,
          processTone: true
        })),
        {
          vectorContext: "batch",
          notifyVectorFailure: true
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.post("/api/index", async (req, res) => {
    var _a, _b;
    try {
      if (guardStorage(res)) return;
      const imageDb2 = deps.getImageDb();
      const { imageId, mode } = req.body;
      const settings = await deps.readSettings();
      const enableVectorSearch = Boolean(settings.enableVectorSearch);
      if (!enableVectorSearch && !imageId && mode !== "missing") {
        res.json({ success: true, created: 0, updated: 0 });
        return;
      }
      if (imageId) {
        const row = imageDb2.getImageRowById(imageId);
        if (!row) {
          res.status(404).json({ error: "Image not found" });
          return;
        }
        const localPath = import_path3.default.join(deps.getStorageDir(), row.imagePath);
        const indexed = await indexImageVector(imageDb2, {
          id: imageId,
          rowid: row.rowid,
          localPath,
          context: "single"
        });
        if (indexed) {
          const meta = imageDb2.getImageById(imageId);
          res.json({ success: true, meta });
          return;
        }
        res.json({ success: true });
        return;
      }
      if (mode === "missing") {
        const indexedItems = imageDb2.listImages();
        const files = await listImageFiles(deps.getImageDir());
        const diskFilenames = new Set(files);
        const { deleted, retainedItems } = pruneMissingIndexedImages(
          imageDb2,
          indexedItems,
          diskFilenames
        );
        const existingNames = new Set(
          retainedItems.map((item) => import_path3.default.basename(item.imagePath))
        );
        let created = 0;
        const newItems = [];
        for (const filename of files) {
          if (existingNames.has(filename)) continue;
          const imagePath = import_path3.default.join("images", filename);
          const localPath = import_path3.default.join(deps.getStorageDir(), imagePath);
          const stat = await withFileLock(
            localPath,
            () => import_fs_extra2.default.stat(localPath).catch(() => null)
          );
          const createdAt = stat && typeof stat.mtimeMs === "number" ? Math.floor(stat.mtimeMs) : Date.now();
          const id = (0, import_uuid.v4)();
          const { rowid } = imageDb2.insertImage({
            id,
            filename,
            imagePath,
            createdAt,
            pageUrl: null
          });
          imageDb2.setImageTags(id, []);
          const meta = {
            id,
            rowid,
            filename,
            imagePath,
            pageUrl: null,
            tags: [],
            createdAt,
            dominantColor: null,
            tone: null,
            hasVector: false
          };
          newItems.push({
            id,
            rowid,
            localPath,
            meta
          });
          existingNames.add(filename);
          created += 1;
        }
        const newMetas = newItems.map((item) => item.meta);
        const candidates = [...retainedItems, ...newMetas].filter((item) => !item.hasVector);
        const indexedCandidates = candidates.filter(
          (item) => typeof item.rowid === "number"
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
            imageDb2,
            newItems.map((item) => ({
              id: item.id,
              rowid: item.rowid,
              localPath: item.localPath,
              processVector: false,
              processDominantColor: true,
              processTone: true
            })),
            {
              vectorContext: "batch"
            }
          );
          res.json({ success: true, created, updated: 0, deleted, total });
          return;
        }
        (_a = deps.sendToRenderer) == null ? void 0 : _a.call(deps, "indexing-progress", {
          current: 0,
          total,
          statusKey: "indexing.starting"
        });
        const postProcessItems = mergeImagePostProcessItems([
          ...newItems.map((item) => ({
            id: item.id,
            rowid: item.rowid,
            localPath: item.localPath,
            processVector: true,
            processDominantColor: true,
            processTone: true
          })),
          ...indexedCandidates.map((item) => ({
            id: item.id,
            rowid: item.rowid,
            localPath: import_path3.default.join(deps.getStorageDir(), item.imagePath),
            processVector: true,
            processDominantColor: false,
            processTone: false
          }))
        ]);
        const { updatedVectors } = await runImagePostProcessing(
          imageDb2,
          postProcessItems,
          {
            vectorContext: "batch",
            onVectorProgress: (nextCurrent, nextTotal) => {
              var _a2;
              (_a2 = deps.sendToRenderer) == null ? void 0 : _a2.call(deps, "indexing-progress", {
                current: nextCurrent,
                total: nextTotal,
                statusKey: "indexing.progress",
                statusParams: {
                  current: nextCurrent,
                  total: nextTotal
                }
              });
            }
          }
        );
        (_b = deps.sendToRenderer) == null ? void 0 : _b.call(deps, "indexing-progress", {
          current: total,
          total,
          statusKey: "indexing.completed"
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
      const imageDb2 = deps.getImageDb();
      const { id } = req.body;
      if (!id) {
        res.status(400).json({ error: "Image id is required" });
        return;
      }
      const meta = imageDb2.getImageRowById(id);
      if (!meta) {
        res.status(404).json({ error: "Image not found" });
        return;
      }
      const targetPath = import_path3.default.join(deps.getStorageDir(), meta.imagePath);
      const dir = import_path3.default.dirname(targetPath);
      await import_electron.shell.openPath(dir);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.post("/api/open-with-default", async (req, res) => {
    try {
      const imageDb2 = deps.getImageDb();
      const { id } = req.body;
      if (!id) {
        res.status(400).json({ error: "Image id is required" });
        return;
      }
      const meta = imageDb2.getImageRowById(id);
      if (!meta) {
        res.status(404).json({ error: "Image not found" });
        return;
      }
      const targetPath = import_path3.default.join(deps.getStorageDir(), meta.imagePath);
      await import_electron.shell.openPath(targetPath);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.post("/api/copy-image", async (req, res) => {
    try {
      if (guardStorage(res)) return;
      const imageDb2 = deps.getImageDb();
      const { id } = req.body;
      if (typeof id !== "string" || !id.trim()) {
        res.status(400).json({ error: "Image id is required" });
        return;
      }
      const meta = imageDb2.getImageRowById(id);
      if (!meta) {
        res.status(404).json({ error: "Image not found" });
        return;
      }
      const targetPath = import_path3.default.join(deps.getStorageDir(), meta.imagePath);
      const exists = await withFileLock(
        targetPath,
        async () => import_fs_extra2.default.pathExists(targetPath)
      );
      if (!exists) {
        res.status(404).json({ error: "Image file not found" });
        return;
      }
      const image = import_electron.nativeImage.createFromPath(targetPath);
      if (image.isEmpty()) {
        res.status(500).json({ error: "Failed to load image" });
        return;
      }
      import_electron.clipboard.writeImage(image);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  return router;
};

// backend/routes/tags.ts
var import_express2 = __toESM(require("express"), 1);
var createTagsRouter = (deps) => {
  const router = import_express2.default.Router();
  const guardStorage = (res) => {
    const incompatibleError2 = deps.getIncompatibleError();
    if (!incompatibleError2) return false;
    res.status(409).json({
      error: "Storage is incompatible",
      details: incompatibleError2.message,
      code: "STORAGE_INCOMPATIBLE"
    });
    return true;
  };
  router.get("/api/tags", async (_req, res) => {
    try {
      if (guardStorage(res)) return;
      const imageDb2 = deps.getImageDb();
      const tags = imageDb2.listTags();
      const settings = await deps.readSettings();
      const tagColors = settings.tagColors || {};
      const result = tags.map((tag) => ({
        name: tag,
        color: tagColors[tag] || null
      }));
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.patch("/api/tag/:name", async (req, res) => {
    try {
      if (guardStorage(res)) return;
      const imageDb2 = deps.getImageDb();
      const oldName = req.params.name;
      const { newName } = req.body;
      if (!oldName || !newName) {
        res.status(400).json({ error: "Tag names are required" });
        return;
      }
      const trimmedOld = oldName.trim();
      const trimmedNew = newName.trim();
      if (!trimmedOld || !trimmedNew) {
        res.status(400).json({ error: "Tags cannot be empty" });
        return;
      }
      imageDb2.renameTag(trimmedOld, trimmedNew);
      const settings = await deps.readSettings();
      const tagColors = settings.tagColors || {};
      if (Object.prototype.hasOwnProperty.call(tagColors, trimmedOld)) {
        const color = tagColors[trimmedOld];
        const nextTagColors = { ...tagColors };
        delete nextTagColors[trimmedOld];
        nextTagColors[trimmedNew] = color;
        await deps.writeSettings({ ...settings, tagColors: nextTagColors });
      }
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.delete("/api/tag/:name", async (req, res) => {
    try {
      if (guardStorage(res)) return;
      const imageDb2 = deps.getImageDb();
      const rawName = req.params.name;
      const name = typeof rawName === "string" ? rawName.trim() : "";
      if (!name) {
        res.status(400).json({ error: "Tag name is required" });
        return;
      }
      imageDb2.deleteTag(name);
      const settings = await deps.readSettings();
      const tagColors = settings.tagColors || {};
      if (Object.prototype.hasOwnProperty.call(tagColors, name)) {
        const nextTagColors = { ...tagColors };
        delete nextTagColors[name];
        await deps.writeSettings({ ...settings, tagColors: nextTagColors });
      }
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  return router;
};

// backend/routes/settings.ts
var import_express3 = __toESM(require("express"), 1);
var createSettingsRouter = (deps) => {
  const router = import_express3.default.Router();
  router.get("/settings", async (_req, res) => {
    try {
      const settings = await deps.readSettings();
      res.json(settings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.get("/api/settings", async (_req, res) => {
    try {
      const settings = await deps.readSettings();
      res.json(settings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.get("/api/settings/:key", async (req, res) => {
    try {
      const key = req.params.key;
      if (!key) {
        res.status(400).json({ error: "Key is required" });
        return;
      }
      const settings = await deps.readSettings();
      const value = Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : null;
      res.json({ value });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  router.post("/api/settings/:key", async (req, res) => {
    try {
      const key = req.params.key;
      if (!key) {
        res.status(400).json({ error: "Key is required" });
        return;
      }
      const { value } = req.body;
      const settings = await deps.readSettings();
      const next = { ...settings, [key]: value };
      await deps.writeSettings(next);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  return router;
};

// backend/routes/model.ts
var import_express4 = __toESM(require("express"), 1);
var createModelRouter = (deps) => {
  const router = import_express4.default.Router();
  router.post("/api/download-model", async (_req, res) => {
    try {
      deps.downloadModel((data) => {
        var _a;
        (_a = deps.sendToRenderer) == null ? void 0 : _a.call(deps, "model-download-progress", data);
      }).catch((err) => {
        var _a;
        (_a = deps.sendToRenderer) == null ? void 0 : _a.call(deps, "model-download-progress", {
          type: "error",
          reason: String(err)
        });
      });
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  return router;
};

// backend/settingsStore.ts
var import_fs_extra3 = __toESM(require("fs-extra"), 1);
var settingsFilePath = "";
var settingsCache = null;
var configureSettingsStore = (filePath) => {
  if (!filePath) {
    throw new Error("Settings file path is required");
  }
  if (settingsFilePath === filePath) return;
  settingsFilePath = filePath;
  settingsCache = null;
};
var getSettingsFilePath = () => {
  if (!settingsFilePath) {
    throw new Error("Settings store is not configured");
  }
  return settingsFilePath;
};
var readSettings = async () => {
  const filePath = getSettingsFilePath();
  if (settingsCache) return settingsCache;
  return withFileLock(filePath, async () => {
    if (!await import_fs_extra3.default.pathExists(filePath)) {
      settingsCache = {};
      return settingsCache;
    }
    try {
      const raw = await import_fs_extra3.default.readJson(filePath);
      if (raw && typeof raw === "object") {
        settingsCache = raw;
        return settingsCache;
      }
    } catch (error) {
      console.error("Failed to read settings file", error);
    }
    settingsCache = {};
    return settingsCache;
  });
};
var writeSettings = async (settings) => {
  const filePath = getSettingsFilePath();
  settingsCache = settings;
  await withFileLock(filePath, async () => {
    try {
      await import_fs_extra3.default.writeJson(filePath, settings);
    } catch (error) {
      console.error("Failed to write settings file", error);
    }
  });
};

// backend/imageAnalysis.ts
var import_sharp = __toESM(require("sharp"), 1);
var DEFAULT_DOMINANT_COLOR = "#808080";
var DOMINANT_ANALYSIS_SIZE = 96;
var DOMINANT_CLUSTER_COUNT = 6;
var DOMINANT_CLUSTER_ITERATIONS = 10;
var MIN_VISIBLE_ALPHA = 8;
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function rgbToHsv(r, g, b) {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (max !== min) {
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      default:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h, s, v };
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
}
function srgbChannelToLinear(value) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}
function rgbToLab(r, g, b) {
  const rLinear = srgbChannelToLinear(r);
  const gLinear = srgbChannelToLinear(g);
  const bLinear = srgbChannelToLinear(b);
  const x = rLinear * 0.4124564 + gLinear * 0.3575761 + bLinear * 0.1804375;
  const y = rLinear * 0.2126729 + gLinear * 0.7151522 + bLinear * 0.072175;
  const z = rLinear * 0.0193339 + gLinear * 0.119192 + bLinear * 0.9503041;
  const xn = 0.95047;
  const yn = 1;
  const zn = 1.08883;
  const delta = 6 / 29;
  const deltaCubed = delta ** 3;
  const factor = 1 / (3 * delta ** 2);
  const offset = 4 / 29;
  const f = (value) => value > deltaCubed ? Math.cbrt(value) : value * factor + offset;
  const fx = f(x / xn);
  const fy = f(y / yn);
  const fz = f(z / zn);
  return {
    l: 116 * fy - 16,
    labA: 500 * (fx - fy),
    labB: 200 * (fy - fz)
  };
}
function labDistanceSquared(left, right) {
  const dl = left.l - right.l;
  const da = left.labA - right.labA;
  const db = left.labB - right.labB;
  return dl * dl + da * da + db * db;
}
function deltaE2000(left, right) {
  const l1 = left.l;
  const a1 = left.labA;
  const b1 = left.labB;
  const l2 = right.l;
  const a2 = right.labA;
  const b2 = right.labB;
  const c1 = Math.sqrt(a1 * a1 + b1 * b1);
  const c2 = Math.sqrt(a2 * a2 + b2 * b2);
  const cMean = (c1 + c2) / 2;
  const cMeanPow7 = cMean ** 7;
  const g = 0.5 * (1 - Math.sqrt(cMeanPow7 / (cMeanPow7 + 25 ** 7)));
  const a1Prime = (1 + g) * a1;
  const a2Prime = (1 + g) * a2;
  const c1Prime = Math.sqrt(a1Prime * a1Prime + b1 * b1);
  const c2Prime = Math.sqrt(a2Prime * a2Prime + b2 * b2);
  const hPrime = (aPrime, bValue) => {
    if (aPrime === 0 && bValue === 0) return 0;
    const angle = Math.atan2(bValue, aPrime) * 180 / Math.PI;
    return angle >= 0 ? angle : angle + 360;
  };
  const h1Prime = hPrime(a1Prime, b1);
  const h2Prime = hPrime(a2Prime, b2);
  const deltaLPrime = l2 - l1;
  const deltaCPrime = c2Prime - c1Prime;
  let deltahPrime = 0;
  if (c1Prime !== 0 && c2Prime !== 0) {
    const diff = h2Prime - h1Prime;
    if (Math.abs(diff) <= 180) {
      deltahPrime = diff;
    } else if (diff > 180) {
      deltahPrime = diff - 360;
    } else {
      deltahPrime = diff + 360;
    }
  }
  const deltaHPrime = 2 * Math.sqrt(c1Prime * c2Prime) * Math.sin(deltahPrime / 2 * Math.PI / 180);
  const lPrimeMean = (l1 + l2) / 2;
  const cPrimeMean = (c1Prime + c2Prime) / 2;
  let hPrimeMean = h1Prime + h2Prime;
  if (c1Prime !== 0 && c2Prime !== 0) {
    const diff = Math.abs(h1Prime - h2Prime);
    if (diff <= 180) {
      hPrimeMean = (h1Prime + h2Prime) / 2;
    } else if (h1Prime + h2Prime < 360) {
      hPrimeMean = (h1Prime + h2Prime + 360) / 2;
    } else {
      hPrimeMean = (h1Prime + h2Prime - 360) / 2;
    }
  }
  const t2 = 1 - 0.17 * Math.cos((hPrimeMean - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * hPrimeMean * Math.PI / 180) + 0.32 * Math.cos((3 * hPrimeMean + 6) * Math.PI / 180) - 0.2 * Math.cos((4 * hPrimeMean - 63) * Math.PI / 180);
  const deltaTheta = 30 * Math.exp(-(((hPrimeMean - 275) / 25) ** 2));
  const rC = 2 * Math.sqrt(cPrimeMean ** 7 / (cPrimeMean ** 7 + 25 ** 7));
  const sL = 1 + 0.015 * (lPrimeMean - 50) ** 2 / Math.sqrt(20 + (lPrimeMean - 50) ** 2);
  const sC = 1 + 0.045 * cPrimeMean;
  const sH = 1 + 0.015 * cPrimeMean * t2;
  const rT = -Math.sin(2 * deltaTheta * Math.PI / 180) * rC;
  const lTerm = deltaLPrime / sL;
  const cTerm = deltaCPrime / sC;
  const hTerm = deltaHPrime / sH;
  return Math.sqrt(lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + rT * cTerm * hTerm);
}
function getCenterWeight(x, y, width, height) {
  const normalizedX = width <= 1 ? 0 : x / (width - 1) * 2 - 1;
  const normalizedY = height <= 1 ? 0 : y / (height - 1) * 2 - 1;
  const radialDistance = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
  return clamp(0.65 + Math.exp(-(radialDistance * radialDistance) / 0.55) * 0.55, 0.65, 1.2);
}
async function collectDominantColorInput(filePath) {
  const { data, info } = await (0, import_sharp.default)(filePath).resize(DOMINANT_ANALYSIS_SIZE, DOMINANT_ANALYSIS_SIZE, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = info.width || DOMINANT_ANALYSIS_SIZE;
  const height = info.height || DOMINANT_ANALYSIS_SIZE;
  const channels = info.channels || 4;
  const samples = [];
  let totalWeight = 0;
  let weightedL = 0;
  let weightedA = 0;
  let weightedB = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * channels;
      const alpha = channels > 3 ? data[index + 3] : 255;
      if (alpha < MIN_VISIBLE_ALPHA) continue;
      const alphaWeight = alpha / 255;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const { l, labA, labB } = rgbToLab(r, g, b);
      const centerWeight = getCenterWeight(x, y, width, height);
      const weight = alphaWeight * centerWeight;
      if (weight <= 0) continue;
      samples.push({ r, g, b, l, labA, labB, weight, centerWeight });
      totalWeight += weight;
      weightedL += l * weight;
      weightedA += labA * weight;
      weightedB += labB * weight;
    }
  }
  if (samples.length === 0 || totalWeight === 0) return null;
  return {
    samples,
    totalWeight,
    meanLab: {
      l: weightedL / totalWeight,
      labA: weightedA / totalWeight,
      labB: weightedB / totalWeight
    }
  };
}
function chooseInitialCentroids(samples, centroidCount) {
  if (samples.length === 0) return [];
  let firstIndex = 0;
  let maxWeight = -1;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].weight <= maxWeight) continue;
    maxWeight = samples[i].weight;
    firstIndex = i;
  }
  const centroids = [
    {
      l: samples[firstIndex].l,
      labA: samples[firstIndex].labA,
      labB: samples[firstIndex].labB
    }
  ];
  while (centroids.length < centroidCount && centroids.length < samples.length) {
    let bestIndex = -1;
    let bestScore = -1;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      let minDistance = Number.POSITIVE_INFINITY;
      for (const centroid of centroids) {
        minDistance = Math.min(minDistance, labDistanceSquared(sample, centroid));
      }
      const score = minDistance * sample.weight;
      if (score <= bestScore) continue;
      bestScore = score;
      bestIndex = i;
    }
    if (bestIndex === -1) break;
    centroids.push({
      l: samples[bestIndex].l,
      labA: samples[bestIndex].labA,
      labB: samples[bestIndex].labB
    });
  }
  return centroids;
}
function buildClusters(samples, assignments, centroidCount) {
  const accumulators = Array.from({ length: centroidCount }, () => ({
    weight: 0,
    centerWeight: 0,
    r: 0,
    g: 0,
    b: 0,
    l: 0,
    labA: 0,
    labB: 0,
    count: 0
  }));
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const clusterIndex = assignments[i];
    const accumulator = accumulators[clusterIndex];
    accumulator.weight += sample.weight;
    accumulator.centerWeight += sample.centerWeight * sample.weight;
    accumulator.r += sample.r * sample.weight;
    accumulator.g += sample.g * sample.weight;
    accumulator.b += sample.b * sample.weight;
    accumulator.l += sample.l * sample.weight;
    accumulator.labA += sample.labA * sample.weight;
    accumulator.labB += sample.labB * sample.weight;
    accumulator.count += 1;
  }
  return accumulators.filter((accumulator) => accumulator.weight > 0).map((accumulator) => ({
    r: accumulator.r / accumulator.weight,
    g: accumulator.g / accumulator.weight,
    b: accumulator.b / accumulator.weight,
    l: accumulator.l / accumulator.weight,
    labA: accumulator.labA / accumulator.weight,
    labB: accumulator.labB / accumulator.weight,
    weight: accumulator.weight,
    centerWeight: accumulator.centerWeight / accumulator.weight,
    count: accumulator.count
  })).sort((left, right) => right.weight - left.weight);
}
function clusterSamples(samples) {
  const centroidCount = Math.min(DOMINANT_CLUSTER_COUNT, samples.length);
  if (centroidCount === 0) return [];
  const centroids = chooseInitialCentroids(samples, centroidCount);
  const assignments = new Array(samples.length).fill(0);
  for (let iteration = 0; iteration < DOMINANT_CLUSTER_ITERATIONS; iteration++) {
    const accumulators = Array.from({ length: centroids.length }, () => ({
      weight: 0,
      l: 0,
      labA: 0,
      labB: 0
    }));
    let changed = false;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let centroidIndex = 0; centroidIndex < centroids.length; centroidIndex++) {
        const centroid = centroids[centroidIndex];
        const distance = labDistanceSquared(sample, centroid);
        if (distance >= bestDistance) continue;
        bestDistance = distance;
        bestIndex = centroidIndex;
      }
      if (assignments[i] !== bestIndex) {
        changed = true;
        assignments[i] = bestIndex;
      }
      const accumulator = accumulators[bestIndex];
      accumulator.weight += sample.weight;
      accumulator.l += sample.l * sample.weight;
      accumulator.labA += sample.labA * sample.weight;
      accumulator.labB += sample.labB * sample.weight;
    }
    for (let centroidIndex = 0; centroidIndex < centroids.length; centroidIndex++) {
      const accumulator = accumulators[centroidIndex];
      if (accumulator.weight === 0) continue;
      centroids[centroidIndex] = {
        l: accumulator.l / accumulator.weight,
        labA: accumulator.labA / accumulator.weight,
        labB: accumulator.labB / accumulator.weight
      };
    }
    if (!changed && iteration > 0) break;
  }
  return buildClusters(samples, assignments, centroids.length);
}
function scoreCluster(cluster, totalWeight, meanLab, maxChroma, maxContrast) {
  const share = cluster.weight / totalWeight;
  const { s, v } = rgbToHsv(cluster.r, cluster.g, cluster.b);
  const chroma = Math.sqrt(cluster.labA * cluster.labA + cluster.labB * cluster.labB);
  const contrast = deltaE2000(cluster, meanLab);
  const chromaScore = maxChroma > 0 ? chroma / maxChroma : 0;
  const contrastScore = maxContrast > 0 ? contrast / maxContrast : 0;
  const centerScore = clamp((cluster.centerWeight - 0.65) / 0.55, 0, 1);
  let score = share;
  score *= 0.95 + chromaScore * 1.8;
  score *= 0.95 + contrastScore * 1.35;
  score *= 0.9 + centerScore * 0.35;
  if (s < 0.08 && v > 0.9) {
    score *= 0.02;
  } else if (s < 0.15 && v > 0.82) {
    score *= 0.14;
  }
  if (v < 0.15 && chromaScore < 0.25) {
    score *= 0.18;
  } else if (v < 0.22 && s < 0.18) {
    score *= 0.35;
  }
  if (share < 0.015 && chromaScore < 0.3) {
    score *= 0.4;
  }
  return score;
}
async function getDominantColor(filePath) {
  try {
    const input = await collectDominantColorInput(filePath);
    if (!input) return DEFAULT_DOMINANT_COLOR;
    const clusters = clusterSamples(input.samples);
    if (clusters.length === 0) return DEFAULT_DOMINANT_COLOR;
    const contrasts = clusters.map((cluster) => deltaE2000(cluster, input.meanLab));
    const chromas = clusters.map((cluster) => Math.sqrt(cluster.labA * cluster.labA + cluster.labB * cluster.labB));
    const maxContrast = Math.max(...contrasts, 1);
    const maxChroma = Math.max(...chromas, 1);
    let bestCluster = null;
    let bestScore = -1;
    for (const cluster of clusters) {
      const score = scoreCluster(cluster, input.totalWeight, input.meanLab, maxChroma, maxContrast);
      if (score <= bestScore) continue;
      bestScore = score;
      bestCluster = cluster;
    }
    return bestCluster ? rgbToHex(bestCluster.r, bestCluster.g, bestCluster.b) : DEFAULT_DOMINANT_COLOR;
  } catch (error) {
    console.error(`Error calculating dominant color for ${filePath}:`, error);
    return DEFAULT_DOMINANT_COLOR;
  }
}
async function calculateTone(filePath) {
  try {
    const { data, info } = await (0, import_sharp.default)(filePath).resize(150, 150, { fit: "cover" }).grayscale().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const hist = new Array(256).fill(0);
    const channels = info.channels || 2;
    for (let i = 0; i < data.length; i += channels) {
      const luminance = data[i];
      const alpha = channels > 1 ? data[i + 1] : 255;
      if (alpha === 0) continue;
      hist[luminance]++;
    }
    const totalPixels = hist.reduce((sum, count) => sum + count, 0);
    if (totalPixels === 0) return "mid-mid";
    let shadowPixels = 0;
    let highlightPixels = 0;
    let weightedSum = 0;
    for (let i = 0; i < 256; i++) {
      const count = hist[i];
      if (i <= 85) shadowPixels += count;
      if (i >= 171) highlightPixels += count;
      weightedSum += i * count;
    }
    const pShadow = shadowPixels / totalPixels;
    const pHigh = highlightPixels / totalPixels;
    const meanLum = weightedSum / totalPixels;
    let key = "mid";
    if (pHigh > 0.6 || meanLum > 180) {
      key = "high";
    } else if (pShadow > 0.6 || meanLum < 75) {
      key = "low";
    }
    let cumulative = 0;
    let p5Idx = -1;
    let p95Idx = 255;
    for (let i = 0; i < 256; i++) {
      cumulative += hist[i];
      const frac = cumulative / totalPixels;
      if (frac >= 0.05 && p5Idx === -1) {
        p5Idx = i;
      }
      if (frac >= 0.95) {
        p95Idx = i;
        break;
      }
    }
    if (p5Idx === -1) p5Idx = 0;
    const dynamicRange = p95Idx - p5Idx;
    let toneRange = "mid";
    if (dynamicRange < 100) {
      toneRange = "short";
    } else if (dynamicRange > 190) {
      toneRange = "long";
    }
    return `${key}-${toneRange}`;
  } catch (error) {
    console.error(`Error calculating tone for ${filePath}:`, error);
    return "mid-mid";
  }
}

// backend/pythonRuntime.ts
var import_child_process = require("child_process");
var import_crypto = require("crypto");
var import_electron2 = require("electron");
var import_node_pty = require("@lydell/node-pty");
var import_path4 = __toESM(require("path"), 1);
var PYTHON_RUNTIME_DIR_NAME = "python-runtime";
var PYTHON_RUNTIME_FILES = ["requirements.lock.txt", "tagger.py"];
var RUNTIME_STATE_FILE_NAME = "runtime-state.json";
var RUNTIME_VENV_DIR_NAME = ".venv";
var RUNTIME_STAGING_VENV_DIR_NAME = ".venv.next";
var RUNTIME_BACKUP_VENV_DIR_NAME = ".venv.prev";
var RUNTIME_UV_CACHE_DIR_NAME = ".uv-cache";
var RUNTIME_STATE_VERSION = 1;
var PYPI_INDEX_URL = "https://mirrors.aliyun.com/pypi/simple/";
var runtimePromise = null;
var getUnpackedPath = (targetPath) => {
  if (!import_electron2.app.isPackaged) return targetPath;
  return targetPath.replace("app.asar", "app.asar.unpacked");
};
var getBundledPythonSourceDir = () => {
  return getUnpackedPath(import_path4.default.join(__dirname, "../backend/python"));
};
var getBundledPythonSourceFile = (fileName) => {
  return import_path4.default.join(getBundledPythonSourceDir(), fileName);
};
var getManagedPythonRuntimeDir = () => {
  return import_path4.default.join(import_electron2.app.getPath("userData"), PYTHON_RUNTIME_DIR_NAME);
};
var getManagedPythonScriptPath = () => {
  return import_path4.default.join(getManagedPythonRuntimeDir(), "tagger.py");
};
var getManagedPythonVenvDir = () => {
  return import_path4.default.join(getManagedPythonRuntimeDir(), RUNTIME_VENV_DIR_NAME);
};
var getManagedPythonStagingVenvDir = () => {
  return import_path4.default.join(getManagedPythonRuntimeDir(), RUNTIME_STAGING_VENV_DIR_NAME);
};
var getManagedPythonBackupVenvDir = () => {
  return import_path4.default.join(getManagedPythonRuntimeDir(), RUNTIME_BACKUP_VENV_DIR_NAME);
};
var getPythonExecutablePath = (venvDir) => {
  return process.platform === "win32" ? import_path4.default.join(venvDir, "Scripts", "python.exe") : import_path4.default.join(venvDir, "bin", "python");
};
var getManagedPythonExecutablePath = () => {
  return getPythonExecutablePath(getManagedPythonVenvDir());
};
var getManagedPythonRequirementsPath = () => {
  return import_path4.default.join(getManagedPythonRuntimeDir(), "requirements.lock.txt");
};
var getManagedPythonStatePath = () => {
  return import_path4.default.join(getManagedPythonRuntimeDir(), RUNTIME_STATE_FILE_NAME);
};
var getManagedUvCacheDir = () => {
  return import_path4.default.join(getManagedPythonRuntimeDir(), RUNTIME_UV_CACHE_DIR_NAME);
};
var cleanupManagedUvCache = async () => {
  const cacheDir = getManagedUvCacheDir();
  if (!await lockedFs.pathExists(cacheDir)) {
    return;
  }
  await lockedFs.remove(cacheDir);
};
var getRuntimeEnv = () => {
  return {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
    TRANSFORMERS_VERBOSITY: "error",
    HF_HUB_DISABLE_PROGRESS_BARS: "1",
    UV_INDEX_URL: PYPI_INDEX_URL,
    PIP_INDEX_URL: PYPI_INDEX_URL,
    HF_ENDPOINT: "https://hf-mirror.com",
    UV_CACHE_DIR: getManagedUvCacheDir()
  };
};
var runCommand = async (command, args, cwd, envOverrides = {}, callbacks = {}) => {
  return new Promise((resolve, reject) => {
    var _a, _b;
    const env = {
      ...getRuntimeEnv(),
      ...envOverrides
    };
    const proc = (0, import_child_process.spawn)(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let stdoutBuffer = "";
    let stderrBuffer = "";
    const flushBuffer = (source, force = false) => {
      var _a2;
      const callback = source === "stdout" ? callbacks.onStdoutLine : callbacks.onStderrLine;
      const buffer = source === "stdout" ? stdoutBuffer : stderrBuffer;
      if (!callback || !buffer) {
        if (force) {
          if (source === "stdout") {
            stdoutBuffer = "";
          } else {
            stderrBuffer = "";
          }
        }
        return;
      }
      const parts = buffer.split(/\r?\n|\r/g);
      const completeCount = force ? parts.length : parts.length - 1;
      for (let index = 0; index < completeCount; index += 1) {
        const line = (_a2 = parts[index]) == null ? void 0 : _a2.trim();
        if (line) {
          callback(line);
        }
      }
      const remainder = force ? "" : parts.at(-1) ?? "";
      if (source === "stdout") {
        stdoutBuffer = remainder;
      } else {
        stderrBuffer = remainder;
      }
    };
    (_a = proc.stdout) == null ? void 0 : _a.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      stdoutBuffer += text;
      flushBuffer("stdout");
    });
    (_b = proc.stderr) == null ? void 0 : _b.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      stderrBuffer += text;
      flushBuffer("stderr");
    });
    proc.once("error", reject);
    proc.once("exit", (code) => {
      flushBuffer("stdout", true);
      flushBuffer("stderr", true);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `Command failed (${command} ${args.join(" ")}): ${stderr.trim() || stdout.trim() || `exit code ${code}`}`
        )
      );
    });
  });
};
var tryRunCommand = async (command, args, cwd) => {
  try {
    return await runCommand(command, args, cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT") || message.includes("not recognized") || message.includes("No such file or directory")) {
      return null;
    }
    throw error;
  }
};
var syncRuntimeFile = async (fileName) => {
  const sourcePath = getBundledPythonSourceFile(fileName);
  const targetPath = import_path4.default.join(getManagedPythonRuntimeDir(), fileName);
  const exists = await lockedFs.pathExists(sourcePath);
  if (!exists) {
    throw new Error(`Missing bundled python runtime file: ${sourcePath}`);
  }
  await lockedFs.copy(sourcePath, targetPath);
};
var getNvidiaSmiCandidates = () => {
  const candidates = ["nvidia-smi"];
  if (process.platform !== "win32") {
    return candidates;
  }
  const roots = [
    process.env.ProgramFiles,
    process.env["ProgramW6432"],
    process.env["ProgramFiles(x86)"]
  ].filter((value) => Boolean(value)).map((value) => value.trim());
  const seen = new Set(candidates);
  for (const root of roots) {
    const target = import_path4.default.join(
      root,
      "NVIDIA Corporation",
      "NVSMI",
      "nvidia-smi.exe"
    );
    if (seen.has(target)) continue;
    seen.add(target);
    candidates.push(target);
  }
  return candidates;
};
var resolveSuccessfulCommand = async (candidates, args, cwd) => {
  for (const candidate of candidates) {
    if (import_path4.default.isAbsolute(candidate) && !await lockedFs.pathExists(candidate)) {
      continue;
    }
    const result = await tryRunCommand(candidate, args, cwd);
    if (result) {
      return { command: candidate, result };
    }
  }
  return null;
};
var ensurePythonRuntimeFiles = async () => {
  const runtimeDir = getManagedPythonRuntimeDir();
  await lockedFs.ensureDir(runtimeDir);
  await lockedFs.ensureDir(getManagedUvCacheDir());
  await Promise.all(PYTHON_RUNTIME_FILES.map(syncRuntimeFile));
  return {
    runtimeDir,
    scriptPath: getManagedPythonScriptPath()
  };
};
var detectGpuSupport = async () => {
  var _a, _b, _c, _d;
  if (process.platform === "darwin") {
    return {
      torchBackend: "cpu",
      supported: false,
      gpuName: null,
      driverVersion: null,
      cudaVersion: null,
      reason: "CUDA is not available on macOS"
    };
  }
  const runtimeDir = getManagedPythonRuntimeDir();
  const resolvedGpuCommand = await resolveSuccessfulCommand(
    getNvidiaSmiCandidates(),
    ["-L"],
    runtimeDir
  );
  if (!resolvedGpuCommand) {
    return {
      torchBackend: "cpu",
      supported: false,
      gpuName: null,
      driverVersion: null,
      cudaVersion: null,
      reason: "nvidia-smi is unavailable"
    };
  }
  const firstGpuLine = resolvedGpuCommand.result.stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith("GPU "));
  if (!firstGpuLine) {
    return {
      torchBackend: "cpu",
      supported: false,
      gpuName: null,
      driverVersion: null,
      cudaVersion: null,
      reason: "No NVIDIA GPU detected"
    };
  }
  const gpuName = ((_b = (_a = firstGpuLine.match(/^GPU \d+:\s*(.+?)\s+\(UUID:/)) == null ? void 0 : _a[1]) == null ? void 0 : _b.trim()) ?? null;
  const detail = await tryRunCommand(resolvedGpuCommand.command, [], runtimeDir);
  const detailOutput = `${(detail == null ? void 0 : detail.stdout) ?? ""}
${(detail == null ? void 0 : detail.stderr) ?? ""}`;
  const driverVersion = ((_c = detailOutput.match(/Driver Version:\s*([0-9.]+)/)) == null ? void 0 : _c[1]) ?? null;
  const cudaVersion = ((_d = detailOutput.match(/CUDA Version:\s*([0-9.]+)/)) == null ? void 0 : _d[1]) ?? null;
  return {
    torchBackend: "auto",
    supported: true,
    gpuName,
    driverVersion,
    cudaVersion,
    reason: "Detected NVIDIA GPU via nvidia-smi"
  };
};
var readRuntimeState = async () => {
  const statePath = getManagedPythonStatePath();
  const exists = await lockedFs.pathExists(statePath);
  if (!exists) return null;
  try {
    return await lockedFs.readJson(statePath);
  } catch {
    return null;
  }
};
var hashRequirements = async () => {
  const requirementsPath = getManagedPythonRequirementsPath();
  const content = await lockedFs.readFile(requirementsPath, "utf8");
  return (0, import_crypto.createHash)("sha256").update(content).digest("hex");
};
var countLockedPackages = async (requirementsPath) => {
  const content = await lockedFs.readFile(requirementsPath, "utf8");
  return content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).length;
};
var ANSI_COLOR_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*m`,
  "g"
);
var ANSI_CONTROL_SEQUENCE_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`,
  "g"
);
var OSC_SEQUENCE_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\][^${String.fromCharCode(7)}]*${String.fromCharCode(7)}`,
  "g"
);
var BEL_CHARACTER = String.fromCharCode(7);
var normalizeCommandLine = (line) => {
  return line.replace(ANSI_COLOR_PATTERN, "").trim();
};
var stripTerminalSequences = (value) => {
  return value.replace(OSC_SEQUENCE_PATTERN, "").replace(ANSI_CONTROL_SEQUENCE_PATTERN, "").split(BEL_CHARACTER).join("");
};
var clampProgress = (value) => {
  return Math.max(0, Math.min(1, value));
};
var mapProgress = (start, end, current, total) => {
  if (total <= 0) return start;
  const ratio = clampProgress(current / total);
  return start + (end - start) * ratio;
};
var extractPackageCount = (line, verb) => {
  const matched = line.match(new RegExp(`${verb}\\s+(\\d+)\\s+packages?`, "i"));
  return matched ? Number.parseInt(matched[1], 10) : null;
};
var extractPackageName = (line) => {
  const matched = line.match(/^[+\-~]\s+([A-Za-z0-9._-]+)/);
  return (matched == null ? void 0 : matched[1]) ?? null;
};
var createUvSyncProgressParser = (totalPackages, reportProgress) => {
  let installedPackages = 0;
  let preparedPackages = 0;
  let installedSummary = 0;
  let downloadedPackages = 0;
  return (rawLine) => {
    if (!reportProgress) return;
    const line = normalizeCommandLine(rawLine);
    if (!line) return;
    const resolvedCount = extractPackageCount(line, "Resolved");
    if (resolvedCount !== null) {
      reportProgress(
        "envInit.resolvedPackages",
        0.42,
        {
          total: resolvedCount
        },
        line
      );
      return;
    }
    const preparedCount = extractPackageCount(line, "Prepared");
    if (preparedCount !== null) {
      preparedPackages = Math.max(preparedPackages, preparedCount);
      reportProgress(
        "envInit.downloadingPackagesDetailed",
        mapProgress(0.5, 0.72, preparedPackages, totalPackages),
        {
          current: preparedPackages,
          total: totalPackages
        },
        line
      );
      return;
    }
    const installedCount = extractPackageCount(line, "Installed");
    if (installedCount !== null) {
      installedSummary = Math.max(installedSummary, installedCount);
      reportProgress(
        "envInit.installingPackagesDetailed",
        mapProgress(0.72, 0.9, installedSummary, totalPackages),
        {
          current: installedSummary,
          total: totalPackages
        },
        line
      );
      return;
    }
    const downloadingMatch = line.match(
      /^Downloading\s+([A-Za-z0-9._-]+)\s+\(([^)]+)\)$/i
    );
    if (downloadingMatch) {
      reportProgress(
        "envInit.downloadingPackageNamed",
        mapProgress(0.5, 0.72, downloadedPackages + 0.3, totalPackages),
        {
          current: downloadedPackages + 1,
          total: totalPackages,
          name: downloadingMatch[1],
          size: downloadingMatch[2]
        },
        line
      );
      return;
    }
    const downloadedMatch = line.match(/^Downloaded\s+([A-Za-z0-9._-]+)$/i);
    if (downloadedMatch) {
      downloadedPackages = Math.min(totalPackages, downloadedPackages + 1);
      reportProgress(
        "envInit.downloadedPackageNamed",
        mapProgress(0.5, 0.72, downloadedPackages, totalPackages),
        {
          current: downloadedPackages,
          total: totalPackages,
          name: downloadedMatch[1]
        },
        line
      );
      return;
    }
    const packageName = extractPackageName(line);
    if (packageName) {
      installedPackages = Math.min(totalPackages, installedPackages + 1);
      reportProgress(
        "envInit.installingPackageNamed",
        mapProgress(0.72, 0.9, installedPackages, totalPackages),
        {
          current: installedPackages,
          total: totalPackages,
          name: packageName
        },
        line
      );
      return;
    }
    reportProgress("envInit.installingPackages", 0.72, void 0, line);
  };
};
var runCommandInPty = async (command, args, cwd, envOverrides = {}, onLine) => {
  return new Promise((resolve, reject) => {
    const env = {
      ...getRuntimeEnv(),
      ...envOverrides,
      TERM: process.env.TERM || "xterm-256color",
      FORCE_COLOR: "0"
    };
    const terminal = (0, import_node_pty.spawn)(command, args, {
      name: env.TERM,
      cols: 160,
      rows: 40,
      cwd,
      env,
      encoding: "utf8",
      useConpty: process.platform === "win32"
    });
    let output = "";
    let lineBuffer = "";
    let settled = false;
    const emitBufferedLines = (force = false) => {
      const normalized = lineBuffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const parts = normalized.split("\n");
      const completeCount = force ? parts.length : parts.length - 1;
      for (let index = 0; index < completeCount; index += 1) {
        const line = normalizeCommandLine(parts[index] ?? "");
        if (line) {
          onLine == null ? void 0 : onLine(line);
        }
      }
      lineBuffer = force ? "" : parts.at(-1) ?? "";
    };
    const dataDisposable = terminal.onData((data) => {
      const cleaned = stripTerminalSequences(data);
      output += cleaned;
      lineBuffer += cleaned;
      emitBufferedLines();
    });
    const exitDisposable = terminal.onExit(({ exitCode }) => {
      if (settled) {
        return;
      }
      settled = true;
      dataDisposable.dispose();
      exitDisposable.dispose();
      emitBufferedLines(true);
      if (exitCode === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Command failed (${command} ${args.join(" ")}): ${output.trim() || `exit code ${exitCode}`}`
        )
      );
    });
  });
};
var shouldRebuildRuntime = async (state, requirementsHash, preferredTorchBackend) => {
  if (!state) return true;
  if (state.version !== RUNTIME_STATE_VERSION) return true;
  if (state.platform !== process.platform) return true;
  if (state.arch !== process.arch) return true;
  if (state.requirementsHash !== requirementsHash) return true;
  if (preferredTorchBackend === "cpu" && state.torchBackend !== "cpu") return true;
  if (preferredTorchBackend === "auto" && state.torchBackend !== "auto" && !state.gpuFallback) {
    return true;
  }
  if (state.gpu.supported && state.torchBackend === "auto" && !state.installedTorch.cudaAvailable) {
    return true;
  }
  return !await lockedFs.pathExists(getManagedPythonExecutablePath());
};
var canReusePersistedRuntime = async (state, requirementsHash) => {
  if (!state) return false;
  if (state.version !== RUNTIME_STATE_VERSION) return false;
  if (state.platform !== process.platform) return false;
  if (state.arch !== process.arch) return false;
  if (state.requirementsHash !== requirementsHash) return false;
  if (state.gpu.supported && state.torchBackend === "auto" && !state.installedTorch.cudaAvailable) {
    return false;
  }
  return lockedFs.pathExists(getManagedPythonExecutablePath());
};
var validateInstalledTorch = (requireCuda, gpu, installedTorch) => {
  if (!requireCuda) {
    return;
  }
  if (!gpu.supported) {
    return;
  }
  if (installedTorch.cudaAvailable) {
    return;
  }
  throw new Error(
    `GPU detected (${gpu.gpuName ?? "unknown GPU"}), but installed torch is not using CUDA`
  );
};
var promoteRuntimeVenv = async (stagingVenvDir) => {
  const runtimeVenvDir = getManagedPythonVenvDir();
  const backupVenvDir = getManagedPythonBackupVenvDir();
  await lockedFs.remove(backupVenvDir);
  if (await lockedFs.pathExists(runtimeVenvDir)) {
    await lockedFs.rename(runtimeVenvDir, backupVenvDir);
  }
  try {
    await lockedFs.rename(stagingVenvDir, runtimeVenvDir);
  } catch (error) {
    if (await lockedFs.pathExists(backupVenvDir)) {
      await lockedFs.rename(backupVenvDir, runtimeVenvDir);
    }
    throw error;
  }
  await lockedFs.remove(backupVenvDir);
};
var inspectInstalledTorch = async (pythonPath, cwd) => {
  const script = [
    "import json",
    "import platform",
    "import torch",
    "print(json.dumps({",
    "  'python_version': platform.python_version(),",
    "  'torch_version': getattr(torch, '__version__', None),",
    "  'torch_backend_built': bool(getattr(torch.backends.cuda, 'is_built', lambda: False)()),",
    "  'cuda_available': bool(torch.cuda.is_available()),",
    "  'cuda_device_count': torch.cuda.device_count() if torch.cuda.is_available() else 0,",
    "  'device': 'cuda' if torch.cuda.is_available() else 'cpu',",
    "}, ensure_ascii=False))"
  ].join("\n");
  const { stdout } = await runCommand(pythonPath, ["-c", script], cwd);
  const raw = JSON.parse(stdout.trim());
  return {
    pythonVersion: raw.python_version,
    torchVersion: raw.torch_version,
    torchBackendBuilt: raw.torch_backend_built,
    cudaAvailable: raw.cuda_available,
    cudaDeviceCount: raw.cuda_device_count,
    device: raw.device
  };
};
var rebuildRuntime = async (uvPath, runtimeDir, torchBackend, gpu, requireCuda, reportProgress) => {
  const stagingVenvDir = getManagedPythonStagingVenvDir();
  const pythonPath = getPythonExecutablePath(stagingVenvDir);
  const requirementsPath = getManagedPythonRequirementsPath();
  const totalPackages = await countLockedPackages(requirementsPath);
  const handleSyncLine = createUvSyncProgressParser(totalPackages, reportProgress);
  await lockedFs.remove(stagingVenvDir);
  try {
    reportProgress == null ? void 0 : reportProgress("envInit.creatingVirtualEnv", 0.3);
    await runCommand(uvPath, ["venv", stagingVenvDir], runtimeDir);
    reportProgress == null ? void 0 : reportProgress("envInit.resolvingDependencies", 0.38);
    await runCommandInPty(
      uvPath,
      [
        "pip",
        "sync",
        requirementsPath,
        "--python",
        pythonPath,
        "--torch-backend",
        torchBackend,
        "--strict",
        "--color",
        "never"
      ],
      runtimeDir,
      {},
      handleSyncLine
    );
    reportProgress == null ? void 0 : reportProgress("envInit.verifyingEnvironment", 0.94);
    const installedTorch = await inspectInstalledTorch(pythonPath, runtimeDir);
    validateInstalledTorch(requireCuda, gpu, installedTorch);
    await promoteRuntimeVenv(stagingVenvDir);
    return installedTorch;
  } catch (error) {
    await lockedFs.remove(stagingVenvDir);
    throw error;
  }
};
var installRuntimeForPreferredBackend = async (uvPath, runtimeDir, gpu, reportProgress) => {
  if (gpu.torchBackend !== "auto") {
    return {
      installedTorch: await rebuildRuntime(
        uvPath,
        runtimeDir,
        "cpu",
        gpu,
        false,
        reportProgress
      ),
      torchBackend: "cpu",
      gpuFallback: false
    };
  }
  try {
    return {
      installedTorch: await rebuildRuntime(
        uvPath,
        runtimeDir,
        "auto",
        gpu,
        true,
        reportProgress
      ),
      torchBackend: "auto",
      gpuFallback: false
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `GPU runtime setup failed for ${gpu.gpuName ?? "the detected GPU"}: ${reason}`
    );
  }
};
var ensurePythonRuntime = async (uvPath, reportProgress) => {
  if (runtimePromise) {
    return runtimePromise;
  }
  runtimePromise = (async () => {
    reportProgress == null ? void 0 : reportProgress("envInit.initializingPythonEnv", 0.08);
    const { runtimeDir, scriptPath } = await ensurePythonRuntimeFiles();
    const requirementsHash = await hashRequirements();
    const currentState = await readRuntimeState();
    const canReusePersisted = await canReusePersistedRuntime(
      currentState,
      requirementsHash
    );
    if (canReusePersisted && currentState) {
      reportProgress == null ? void 0 : reportProgress("envInit.pythonEnvReady", 1);
      return {
        runtimeDir,
        scriptPath,
        pythonPath: getManagedPythonExecutablePath(),
        state: currentState
      };
    }
    reportProgress == null ? void 0 : reportProgress("envInit.detectingGpu", 0.16);
    const gpu = await detectGpuSupport();
    const shouldRebuild = await shouldRebuildRuntime(
      currentState,
      requirementsHash,
      gpu.torchBackend
    );
    let installedTorch;
    let resolvedTorchBackend = (currentState == null ? void 0 : currentState.torchBackend) ?? gpu.torchBackend;
    let gpuFallback = (currentState == null ? void 0 : currentState.gpuFallback) ?? false;
    if (shouldRebuild) {
      const installResult = await installRuntimeForPreferredBackend(
        uvPath,
        runtimeDir,
        gpu,
        reportProgress
      );
      installedTorch = installResult.installedTorch;
      resolvedTorchBackend = installResult.torchBackend;
      gpuFallback = installResult.gpuFallback;
    } else {
      const pythonPath2 = getManagedPythonExecutablePath();
      installedTorch = await inspectInstalledTorch(pythonPath2, runtimeDir);
      if (gpu.supported && !installedTorch.cudaAvailable) {
        const installResult = await installRuntimeForPreferredBackend(
          uvPath,
          runtimeDir,
          gpu,
          reportProgress
        );
        installedTorch = installResult.installedTorch;
        resolvedTorchBackend = installResult.torchBackend;
        gpuFallback = installResult.gpuFallback;
      }
    }
    const pythonPath = getManagedPythonExecutablePath();
    const nextState = {
      version: RUNTIME_STATE_VERSION,
      platform: process.platform,
      arch: process.arch,
      requirementsHash,
      torchBackend: resolvedTorchBackend,
      gpuFallback,
      gpu,
      installedTorch,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await lockedFs.writeJson(getManagedPythonStatePath(), nextState);
    await cleanupManagedUvCache();
    reportProgress == null ? void 0 : reportProgress("envInit.pythonEnvReady", 1);
    return {
      runtimeDir,
      scriptPath,
      pythonPath,
      state: nextState
    };
  })();
  try {
    return await runtimePromise;
  } finally {
    runtimePromise = null;
  }
};

// backend/server.ts
var DEFAULT_SERVER_PORT = 30003;
var MAX_SERVER_PORT = 65535;
var API_HOSTNAME = "localhost";
var CONFIG_FILE = import_path5.default.join(import_electron3.app.getPath("userData"), "picaptain_config.json");
var DEFAULT_STORAGE_DIR = import_path5.default.join(
  import_electron3.app.getPath("userData"),
  "picaptain_storage"
);
var loadStorageRoot = async () => {
  try {
    if (await lockedFs.pathExists(CONFIG_FILE)) {
      const raw = await lockedFs.readJson(CONFIG_FILE).catch(() => null);
      if (raw && typeof raw.storageDir === "string" && raw.storageDir.trim()) {
        return raw.storageDir;
      }
    }
  } catch {
  }
  if (import_electron3.app.isPackaged && process.platform !== "darwin") {
    try {
      const exeDir = import_path5.default.dirname(import_electron3.app.getPath("exe"));
      const portableDataDir = import_path5.default.join(exeDir, "data");
      if (await lockedFs.pathExists(portableDataDir)) {
        return portableDataDir;
      }
      const testFile = import_path5.default.join(exeDir, ".write_test");
      const writable = await withFileLock(testFile, async () => {
        try {
          await import_fs_extra4.default.writeFile(testFile, "test");
          await import_fs_extra4.default.remove(testFile);
          return true;
        } catch {
          return false;
        }
      });
      if (writable) {
        return portableDataDir;
      }
    } catch {
    }
  }
  return DEFAULT_STORAGE_DIR;
};
var STORAGE_DIR = DEFAULT_STORAGE_DIR;
var IMAGE_DIR = import_path5.default.join(STORAGE_DIR, "images");
var SETTINGS_FILE = import_path5.default.join(STORAGE_DIR, "settings.json");
configureSettingsStore(SETTINGS_FILE);
var updateStoragePaths = (root) => {
  STORAGE_DIR = root;
  IMAGE_DIR = import_path5.default.join(STORAGE_DIR, "images");
  SETTINGS_FILE = import_path5.default.join(STORAGE_DIR, "settings.json");
  configureSettingsStore(SETTINGS_FILE);
};
var ensureStorageDirs = async (root) => {
  await Promise.all([
    lockedFs.ensureDir(root),
    lockedFs.ensureDir(import_path5.default.join(root, "images")),
    lockedFs.ensureDir(import_path5.default.join(root, "model"))
  ]);
};
var persistStorageRootConfig = async (root) => {
  await withFileLock(CONFIG_FILE, async () => {
    await import_fs_extra4.default.writeJson(CONFIG_FILE, { storageDir: root });
  });
};
var getStorageDir = () => STORAGE_DIR;
var setStorageRoot = async (root) => {
  const trimmed = root.trim();
  if (!trimmed) return;
  updateStoragePaths(trimmed);
  await ensureStorageDirs(STORAGE_DIR);
  await persistStorageRootConfig(STORAGE_DIR);
  initDatabase();
};
var imageDb = null;
var incompatibleError = null;
var dbHandle = null;
var initDatabase = () => {
  const result = createDatabase(STORAGE_DIR);
  incompatibleError = result.incompatibleError;
  imageDb = result.imageDb;
  if (dbHandle && dbHandle !== result.db) {
    dbHandle.close();
  }
  dbHandle = result.db;
};
var initializeStorage = async () => {
  const root = await loadStorageRoot();
  updateStoragePaths(root);
  await ensureStorageDirs(STORAGE_DIR);
  await persistStorageRootConfig(STORAGE_DIR);
  initDatabase();
};
var BasePythonService = class {
  process = null;
  startupPromise = null;
  queue = [];
  serviceName = "Python Service";
  getManagedUvPath() {
    return import_path5.default.join(
      import_electron3.app.getPath("userData"),
      "uv",
      process.platform === "win32" ? "uv.exe" : "uv"
    );
  }
  getBundledUvPath() {
    const executable = process.platform === "win32" ? "uv.exe" : "uv";
    const target = `${process.platform}-${process.arch}`;
    const root = import_electron3.app.isPackaged ? import_path5.default.join(process.resourcesPath, "uv") : import_path5.default.join(__dirname, "../resources/uv");
    return import_path5.default.join(root, target, executable);
  }
  getUvCandidates() {
    var _a;
    const candidates = [];
    candidates.push(this.getBundledUvPath());
    const env = (_a = process.env.PROREF_UV_PATH) == null ? void 0 : _a.trim();
    if (env) candidates.push(env);
    candidates.push(this.getManagedUvPath());
    const uniq = [];
    const seen = /* @__PURE__ */ new Set();
    for (const c of candidates) {
      if (!c) continue;
      if (seen.has(c)) continue;
      seen.add(c);
      uniq.push(c);
    }
    return uniq;
  }
  async resolveUvCommand() {
    const candidates = this.getUvCandidates();
    for (const candidate of candidates) {
      if (!import_path5.default.isAbsolute(candidate)) {
        return candidate;
      }
      if (await lockedFs.pathExists(candidate)) {
        return candidate;
      }
    }
    throw new Error(`Failed to spawn ${this.serviceName}: uv not found`);
  }
  attachProcess(proc) {
    var _a;
    if (!proc.stdout) {
      console.error(`Failed to spawn ${this.serviceName} stdout`);
      return;
    }
    const rl = import_readline.default.createInterface({ input: proc.stdout });
    rl.on("line", (line) => {
      const task = this.queue.shift();
      if (task) {
        try {
          const res = JSON.parse(line);
          task.resolve(res);
        } catch (e) {
          console.error(`JSON parse error from ${this.serviceName}:`, e);
          task.resolve({ error: "invalid-json" });
        }
      }
    });
    (_a = proc.stderr) == null ? void 0 : _a.on("data", (data) => {
      const output = data.toString();
      const lines = output.split(/\r?\n/).filter((l) => l.trim().length > 0);
      for (const line of lines) {
        const normalized = line.trim();
        const lower = normalized.toLowerCase();
        const cleaned = normalized.replace(
          /^\[(info|warn|warning|error)\]\s*/i,
          ""
        );
        const cleanedWarning = cleaned.replace(/^warning:\s*/i, "");
        const isInfo = normalized.startsWith("[INFO]") || normalized.includes("Python vector service started") || normalized.includes("Model loaded");
        const isWarning = normalized.startsWith("[WARN]") || normalized.startsWith("[WARNING]") || lower.startsWith("warning:") || lower.includes("warning:");
        const isError = normalized.startsWith("[ERROR]") || lower.startsWith("error:") || lower.includes("traceback") || lower.includes("exception") || lower.includes("os error");
        if (isError) {
          console.error(`[${this.serviceName} Error]`, cleaned);
        } else if (isWarning) {
          console.warn(`[${this.serviceName} Warning]`, cleanedWarning);
        } else if (isInfo) {
          console.log(`[${this.serviceName}]`, cleaned);
        } else {
          console.log(`[${this.serviceName}]`, normalized);
        }
      }
    });
    proc.on("exit", (code) => {
      console.log(`${this.serviceName} exited with code`, code);
      const pending = this.queue.splice(0, this.queue.length);
      for (const task of pending) {
        task.resolve(null);
      }
      if (this.process === proc) {
        this.process = null;
      }
      rl.close();
    });
  }
  spawnProcess(command, args, cwd, envOverrides = {}, attachListeners = true) {
    const env = {
      ...process.env,
      PROREF_MODEL_DIR: import_path5.default.join(getStorageDir(), "model"),
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
      TRANSFORMERS_VERBOSITY: "error",
      HF_HUB_DISABLE_PROGRESS_BARS: "1",
      // Use Aliyun mirror for PyPI (often more stable/accessible)
      UV_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
      // Also set PIP_INDEX_URL as fallback/standard
      PIP_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
      // Use HF mirror for model downloads
      HF_ENDPOINT: "https://hf-mirror.com",
      ...envOverrides
    };
    const proc = (0, import_child_process2.spawn)(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd,
      env
    });
    if (attachListeners) {
      this.attachProcess(proc);
    }
    return proc;
  }
  async spawnUvProcess(args, cwd, envOverrides = {}, attachListeners = true) {
    const uvCandidates = this.getUvCandidates();
    const trySpawn = async (index) => {
      console.log(`Trying uv candidate ${index}: ${uvCandidates[index]}`);
      if (index >= uvCandidates.length) {
        throw new Error(`Failed to spawn ${this.serviceName}: uv not found`);
      }
      const command = uvCandidates[index];
      if (import_path5.default.isAbsolute(command)) {
        const exists = await lockedFs.pathExists(command);
        if (!exists) {
          return trySpawn(index + 1);
        }
      }
      return new Promise((resolve, reject) => {
        const proc = this.spawnProcess(
          command,
          args,
          cwd,
          envOverrides,
          attachListeners
        );
        let settled = false;
        proc.once("spawn", () => {
          settled = true;
          resolve(proc);
        });
        proc.once("error", (err) => {
          const code = err.code;
          if (!settled && code === "ENOENT") {
            void trySpawn(index + 1).then(resolve).catch(reject);
            return;
          }
          reject(err);
        });
      });
    };
    return trySpawn(0);
  }
  async start() {
    if (this.process) return;
    if (this.startupPromise) {
      await this.startupPromise;
      return;
    }
    this.startupPromise = (async () => {
      const uvPath = await this.resolveUvCommand();
      const { runtimeDir, scriptPath, pythonPath } = await ensurePythonRuntime(
        uvPath
      );
      const proc = this.spawnProcess(pythonPath, [scriptPath], runtimeDir);
      this.process = proc;
    })();
    try {
      await this.startupPromise;
    } finally {
      this.startupPromise = null;
      if (!this.process) {
        this.startupPromise = null;
      }
    }
  }
  async sendRequest(req) {
    if (!this.process) {
      await this.start();
    }
    return new Promise((resolve, reject) => {
      var _a;
      this.queue.push({ resolve, reject });
      if ((_a = this.process) == null ? void 0 : _a.stdin) {
        this.process.stdin.write(JSON.stringify(req) + "\n");
      } else {
        resolve({ error: "stdin-unavailable" });
      }
    });
  }
};
var PythonVectorService = class extends BasePythonService {
  warmupPromise = null;
  warmedUp = false;
  constructor() {
    super();
    this.serviceName = "Python Vector Service";
  }
  attachProcess(proc) {
    super.attachProcess(proc);
    proc.once("exit", () => {
      this.warmedUp = false;
      this.warmupPromise = null;
    });
  }
  async warmup() {
    if (this.warmedUp) {
      return;
    }
    if (this.warmupPromise) {
      await this.warmupPromise;
      return;
    }
    this.warmupPromise = (async () => {
      await this.start();
      await this.run("encode-text", "warmup");
      this.warmedUp = true;
    })();
    try {
      await this.warmupPromise;
    } finally {
      if (!this.warmedUp) {
        this.warmupPromise = null;
      }
    }
  }
  downloadModel(onProgress) {
    return new Promise((resolve, reject) => {
      const startDownload = async () => {
        var _a;
        const uvPath = await this.resolveUvCommand();
        const { runtimeDir, scriptPath, pythonPath } = await ensurePythonRuntime(
          uvPath
        );
        const proc = this.spawnProcess(
          pythonPath,
          [scriptPath, "--download-model"],
          runtimeDir,
          {},
          false
        );
        if (proc.stdout) {
          const rl = import_readline.default.createInterface({ input: proc.stdout });
          rl.on("line", (line) => {
            try {
              const res = JSON.parse(line);
              onProgress(res);
            } catch {
            }
          });
        }
        (_a = proc.stderr) == null ? void 0 : _a.on("data", (data) => {
          console.log("[Python Download]", data.toString());
        });
        proc.on("exit", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Download process exited with code ${code}`));
          }
        });
      };
      void startDownload().catch(reject);
    });
  }
  async run(mode, arg) {
    const raw = await this.sendRequest({ mode, arg });
    if (!raw || typeof raw !== "object") {
      throw new Error("Invalid vector response");
    }
    const res = raw;
    if (res.error) {
      throw new Error(`Python error: ${String(res.error)}`);
    }
    if (Array.isArray(res.vector)) {
      const vector = res.vector;
      return vector;
    }
    throw new Error("Vector missing");
  }
  async runBatchImages(paths) {
    if (paths.length === 0) return [];
    const raw = await this.sendRequest({ mode: "encode-images", arg: paths });
    if (!raw || typeof raw !== "object") {
      throw new Error("Invalid vector batch response");
    }
    const res = raw;
    if (res.error) {
      throw new Error(`Python error: ${String(res.error)}`);
    }
    if (!Array.isArray(res.items)) {
      throw new Error("Vector batch items missing");
    }
    if (res.items.length !== paths.length) {
      throw new Error("Vector batch item count mismatch");
    }
    return res.items.map((item) => {
      if (!item || typeof item !== "object") {
        return { vector: null, error: "invalid-batch-item" };
      }
      const record = item;
      if (Array.isArray(record.vector)) {
        return { vector: record.vector };
      }
      return {
        vector: null,
        error: typeof record.error === "string" ? record.error : "vector-missing"
      };
    });
  }
};
var mapModelDownloadProgress = (data) => {
  if (!data || typeof data !== "object") return data;
  const d = data;
  const type = d.type;
  if (type === "error") {
    return {
      type: "error",
      reason: typeof d.message === "string" ? d.message : String(d.message ?? "")
    };
  }
  if (type === "weight-failed") {
    return {
      type: "weight-failed",
      filename: typeof d.filename === "string" ? d.filename : void 0,
      reason: typeof d.message === "string" ? d.message : String(d.message ?? "")
    };
  }
  if (type === "retry") {
    return {
      type: "retry",
      filename: typeof d.filename === "string" ? d.filename : void 0,
      reason: typeof d.message === "string" ? d.message : String(d.message ?? ""),
      attempt: typeof d.attempt === "number" ? d.attempt : void 0,
      nextWaitSeconds: typeof d.nextWaitSeconds === "number" ? d.nextWaitSeconds : void 0
    };
  }
  return data;
};
var vectorServiceSingleton = null;
var getVectorService = () => {
  if (!vectorServiceSingleton) {
    vectorServiceSingleton = new PythonVectorService();
  }
  return vectorServiceSingleton;
};
var warmupVectorService = async () => {
  await getVectorService().warmup();
};
function downloadImage(url, dest) {
  const REQUEST_TIMEOUT_MS = 15e3;
  const MAX_RETRY_ATTEMPTS = 3;
  const copyFromLocalPath = async (targetUrl) => {
    let srcPath = targetUrl;
    if (targetUrl.startsWith("file://")) {
      srcPath = new URL(targetUrl).pathname;
      if (process.platform === "win32" && srcPath.startsWith("/") && srcPath.includes(":")) {
        srcPath = srcPath.substring(1);
      }
    }
    await import_fs_extra4.default.copy(decodeURIComponent(srcPath), dest);
  };
  const isRetryableDownloadError = (error) => {
    const code = error.code;
    if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNABORTED" || code === "EAI_AGAIN" || code === "EPIPE" || code === "ENETUNREACH") {
      return true;
    }
    return /socket hang up|timeout|network/i.test(error.message);
  };
  const requestRemoteOnce = async (targetUrl) => {
    const referer = (() => {
      try {
        return new URL(targetUrl).origin;
      } catch {
        return "";
      }
    })();
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
      const response = await import_electron3.net.fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        signal: abortController.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 LookBack/1.0",
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          ...referer ? { Referer: `${referer}/` } : {},
          Connection: "close"
        }
      });
      if (!response.ok) {
        throw new Error(
          `Server responded with ${response.status}: ${response.statusText}`
        );
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await import_fs_extra4.default.writeFile(dest, buffer);
    } catch (error) {
      await import_fs_extra4.default.remove(dest).catch(() => void 0);
      if (error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message))) {
        throw new Error("Download timeout");
      }
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timeoutId);
    }
  };
  const requestRemote = async (targetUrl) => {
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
      try {
        await requestRemoteOnce(targetUrl);
        return;
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        lastError = normalized;
        const shouldRetry = attempt < MAX_RETRY_ATTEMPTS && isRetryableDownloadError(normalized);
        if (!shouldRetry) {
          break;
        }
        await new Promise((resolve) => {
          setTimeout(resolve, attempt * 250);
        });
      }
    }
    throw lastError ?? new Error("Download failed");
  };
  return withFileLock(dest, async () => {
    if (url.startsWith("file://") || url.startsWith("/")) {
      await copyFromLocalPath(url);
      return;
    }
    await requestRemote(url);
  });
}
var listenOnAvailablePort = (appServer, startPort) => new Promise((resolve, reject) => {
  const tryListen = (port) => {
    if (port > MAX_SERVER_PORT) {
      reject(new Error("No available localhost port for local server"));
      return;
    }
    const httpServer = appServer.listen(port, API_HOSTNAME, () => {
      resolve(port);
    });
    httpServer.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        tryListen(port + 1);
        return;
      }
      reject(error);
    });
  };
  tryListen(startPort);
});
async function startServer(sendToRenderer) {
  await initializeStorage();
  const server = (0, import_express5.default)();
  server.use((0, import_cors.default)());
  server.use(import_body_parser.default.json({ limit: "25mb" }));
  const vectorService = getVectorService();
  const runPythonVector = async (mode, arg) => {
    return vectorService.run(mode, arg);
  };
  const runPythonVectors = async (paths) => {
    return vectorService.runBatchImages(paths);
  };
  const runPythonDominantColor = async (arg) => {
    return getDominantColor(arg);
  };
  const runPythonTone = async (arg) => {
    return calculateTone(arg);
  };
  const sendRenderer = sendToRenderer;
  const logErrorToFile = async (error, req) => {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : void 0;
    const payload = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message,
      stack,
      method: req == null ? void 0 : req.method,
      url: req == null ? void 0 : req.originalUrl
    };
    const logFile = import_path5.default.join(STORAGE_DIR, "server.log");
    await withFileLock(logFile, async () => {
      await import_fs_extra4.default.ensureFile(logFile);
      await import_fs_extra4.default.appendFile(logFile, `${JSON.stringify(payload)}
`);
    });
  };
  const getImageDb = () => {
    if (!imageDb) {
      initDatabase();
    }
    if (!imageDb) {
      throw new Error("Database is not initialized");
    }
    return imageDb;
  };
  server.use(createSettingsRouter({ readSettings, writeSettings }));
  server.use(
    createModelRouter({
      downloadModel: (onProgress) => vectorService.downloadModel((data) => {
        onProgress(mapModelDownloadProgress(data));
      }),
      sendToRenderer: sendRenderer
    })
  );
  server.use(
    createTagsRouter({
      getImageDb,
      getIncompatibleError: () => incompatibleError,
      readSettings,
      writeSettings
    })
  );
  server.use(
    createImagesRouter({
      getImageDb,
      getIncompatibleError: () => incompatibleError,
      getStorageDir: () => STORAGE_DIR,
      getImageDir: () => IMAGE_DIR,
      readSettings,
      writeSettings,
      runPythonVector,
      runPythonVectors,
      runPythonDominantColor,
      runPythonTone,
      downloadImage,
      sendToRenderer: sendRenderer
    })
  );
  server.use("/images", import_express5.default.static(STORAGE_DIR));
  server.use(
    (err, req, res, _next) => {
      const message = err instanceof Error ? err.message : String(err);
      void _next;
      void logErrorToFile(err, req);
      res.status(500).json({ error: "Unexpected error", details: message });
    }
  );
  const port = await listenOnAvailablePort(server, DEFAULT_SERVER_PORT);
  console.log(`Local server running at http://${API_HOSTNAME}:${port}`);
  return port;
}

// shared/i18n/locales/en.ts
var en = {
  "common.ok": "OK",
  "common.confirm": "Confirm",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.open": "Open",
  "common.close": "Close",
  "common.loading": "Loading...",
  "common.unavailable": "Unavailable",
  "common.clear": "Clear",
  "common.none": "None",
  "common.notSet": "Not set",
  "common.color": "Color",
  "common.language": "Language",
  "common.language.en": "EN",
  "common.language.zh": "\u4E2D\u6587",
  "common.reset": "Reset",
  "titleBar.settings": "Settings",
  "titleBar.floatingMode": "Floating mode",
  "titleBar.minimize": "Minimize",
  "titleBar.maximize": "Maximize",
  "titleBar.alwaysOnTop": "Always on Top",
  "titleBar.dataFolder": "Data Folder",
  "titleBar.dataFolder.default": "Not configured, using default directory",
  "titleBar.change": "Change",
  "titleBar.window": "Window",
  "titleBar.pinTransparent": "Pin transparent",
  "titleBar.canvasOpacity": "Canvas Opacity",
  "titleBar.mouseThrough": "Paper Mode",
  "titleBar.shortcuts": "Shortcuts",
  "titleBar.toggleWindowVisibility": "Toggle window visibility",
  "titleBar.canvasOpacityUp": "Increase Canvas Opacity",
  "titleBar.canvasOpacityDown": "Decrease Canvas Opacity",
  "titleBar.toggleMouseThrough": "Toggle Paper Mode",
  "titleBar.toggleGallery": "Toggle Gallery",
  "titleBar.canvasGroup": "Smart Layout (Canvas)",
  "titleBar.shortcutClickToRecord": "Click to record",
  "titleBar.shortcutRecording": "Press a shortcut\u2026",
  "titleBar.index": "Index",
  "titleBar.enableAiSearchVector": "Enable AI Search (Vector)",
  "titleBar.indexing": "Indexing...",
  "titleBar.indexUnindexedImages": "Index unindexed images",
  "titleBar.processing": "Processing...",
  "toast.indexFailed": "Failed to index images",
  "toast.noUnindexedImages": "No unindexed images found",
  "toast.indexCompleted": "Index completed: {{created}} created, {{updated}} updated, {{deleted}} deleted",
  "toast.modelReady": "AI Model is ready",
  "toast.modelCheckFailed": "Model check failed: {{error}}",
  "toast.settingsUpdateFailed": "Failed to update settings",
  "toast.translationWarning": "Translation warning: {{warning}}",
  "toast.reactError": "Something went wrong: {{message}}",
  "toast.logCopied": "Log copied to clipboard",
  "toast.logCopyFailed": "Failed to copy log",
  "toast.tagRenamed": "Tag renamed",
  "toast.tagRenameFailed": "Failed to rename tag",
  "toast.tagDeleted": "Tag deleted",
  "toast.tagDeleteFailed": "Failed to delete tag",
  "toast.importImageFailed": "Failed to import image",
  "toast.updateTagsFailed": "Failed to update tags",
  "toast.updateDominantColorFailed": "Failed to update dominant color",
  "toast.updateNameFailed": "Failed to update name",
  "toast.imageDeleted": "Image deleted",
  "toast.deleteImageFailed": "Failed to delete image",
  "toast.canvasDeleted": "Canvas deleted",
  "toast.deleteCanvasFailed": "Failed to delete canvas",
  "toast.vectorIndexed": "Vector indexed",
  "toast.vectorIndexFailed": "Failed to index vector",
  "toast.imageVectorSearchFailed": "Image search failed",
  "toast.imageCopied": "Image copied",
  "toast.copyImageFailed": "Failed to copy image",
  "toast.openFileFailed": "Failed to open file",
  "toast.shortcutInvalid": "Invalid shortcut",
  "toast.shortcutUpdateFailed": "Failed to update shortcut: {{error}}",
  "toast.windowDisplayModeUpdateFailed": "Failed to switch floating mode: {{error}}",
  "toast.windowAlwaysOnTopUpdateFailed": "Failed to update always-on-top: {{error}}",
  "envInit.brandTitle": "PiCaptain",
  "envInit.heading": "Preparing PiCaptain...",
  "envInit.subheading": "First run may download tools, install dependencies, and fetch the local model. This is a one-time step.",
  "envInit.preparing": "Preparing...",
  "envInit.checkingUv": "Checking uv...",
  "envInit.downloadingUv": "Downloading uv...",
  "envInit.initializingPythonEnv": "Initializing Python environment...",
  "envInit.detectingGpu": "Detecting GPU support...",
  "envInit.creatingVirtualEnv": "Creating Python virtual environment...",
  "envInit.resolvingDependencies": "Resolving dependencies...",
  "envInit.resolvedPackages": "Resolved {{total}} packages",
  "envInit.preparingPackagesElapsed": "Preparing {{total}} packages ({{elapsedSeconds}}s)...",
  "envInit.downloadingPackages": "Downloading packages...",
  "envInit.downloadingPackagesDetailed": "Downloading packages ({{current}}/{{total}})...",
  "envInit.downloadingPackageNamed": "Downloading package {{current}}/{{total}}: {{name}} ({{size}})",
  "envInit.downloadedPackageNamed": "Downloaded package {{current}}/{{total}}: {{name}}",
  "envInit.installingPackages": "Installing packages...",
  "envInit.installingPackagesDetailed": "Installing packages ({{current}}/{{total}})...",
  "envInit.installingPackageNamed": "Installing package {{current}}/{{total}}: {{name}}",
  "envInit.installingLargePackages": "Downloading large packages like torch ({{elapsedSeconds}}s)...",
  "envInit.installingPackagesElapsed": "Installing dependencies ({{elapsedSeconds}}s)...",
  "envInit.verifyingEnvironment": "Verifying environment...",
  "envInit.pythonEnvReady": "Python environment ready",
  "model.downloading": "Downloading model...",
  "model.preparingDownload": "Preparing model download...",
  "model.downloadingFraction": "Downloading ({{current}}/{{total}})",
  "model.retrying": "Retrying download...",
  "model.ready": "Model is ready",
  "model.downloadFailed": "Model download failed",
  "model.downloadFailedWithReason": "Model download failed: {{reason}}",
  "indexing.starting": "Starting...",
  "indexing.progress": "Indexing {{current}}/{{total}}...",
  "indexing.completed": "Completed",
  "errors.title": "PiCaptain encountered an error",
  "errors.unexpected": "An unexpected error occurred.",
  "errors.applicationLogTitle": "Application Log (Last 50KB)",
  "errors.loadingLogs": "Loading logs...",
  "errors.logAccessUnavailable": "Log access not available in this environment.",
  "errors.failedToLoadLogs": "Failed to load logs: {{message}}",
  "errors.copyLog": "Copy Log",
  "errors.reloadApplication": "Reload Application",
  "gallery.searchPlaceholder": "Search in English",
  "gallery.searchPlaceholderImage": "Image search is active",
  "gallery.filter": "Filter",
  "gallery.filterSummary.color": "Color: {{color}}",
  "gallery.filterSummary.tone": "Tone: {{tone}}",
  "gallery.filterSummary.colorTone": "Color: {{color}}, Tone: {{tone}}",
  "gallery.colorFilter.title": "Color Filter",
  "gallery.colorFilter.selected": "Selected",
  "gallery.toneFilter.title": "Tone Filter",
  "gallery.referenceAlt": "Reference",
  "gallery.notIndexed": "Not Indexed",
  "gallery.vectorResult": "AI Search Result",
  "gallery.searchImage.pick": "Choose image",
  "gallery.searchImage.defaultName": "Image query",
  "gallery.contextMenu.nameLabel": "Name",
  "gallery.contextMenu.imageNamePlaceholder": "Image name",
  "gallery.contextMenu.linkLabel": "Link",
  "gallery.contextMenu.tagsLabel": "Tags",
  "gallery.contextMenu.addTagPlaceholder": "Add tag...",
  "gallery.contextMenu.dominantColorLabel": "Dominant Color",
  "gallery.contextMenu.toneLabel": "Tone",
  "gallery.contextMenu.copyImage": "Copy image",
  "gallery.contextMenu.showInFolder": "Show in Folder",
  "gallery.contextMenu.searchByImage": "Search by image",
  "gallery.contextMenu.indexVector": "Index Vector",
  "gallery.contextMenu.deleteImage": "Delete Image",
  "gallery.dominantColor.title": "Dominant Color",
  "gallery.empty.bodyLine1": "Your image collection starts here.",
  "gallery.empty.bodyLine2": "Drop or paste images to build your reference library.",
  "gallery.empty.dragHint": "Drag images here",
  "floating.restore": "Exit floating mode",
  "floating.dropHint": "Drop here",
  "floating.dropNow": "Release to import",
  "tag.setColor": "Set Color",
  "tag.delete": "Delete Tag",
  "tag.deleteConfirmTitle": "Delete Tag",
  "tag.deleteConfirmMessage": 'Delete "{{tag}}" from all images? This action cannot be undone.',
  "canvas.toolbar.expand": "Expand Toolbar",
  "canvas.toolbar.collapse": "Collapse Toolbar",
  "canvas.toolbar.filters": "Filters",
  "canvas.filters.grayscale": "Grayscale",
  "canvas.filters.posterize": "Oil Paint Block",
  "canvas.filters.trianglePixelate": "Triangle Pixelate",
  "canvas.toolbar.toggleGrayscale": "Toggle Grayscale Mode",
  "canvas.toolbar.grayscale": "Grayscale",
  "canvas.toolbar.smartLayout": "Auto Layout",
  "canvas.toolbar.toggleMinimap": "Toggle Minimap",
  "canvas.toolbar.minimap": "Minimap",
  "canvas.toolbar.anchors": "Anchors",
  "canvas.anchor.slot": "Slot {{slot}}",
  "canvas.anchor.save": "Save Anchor",
  "canvas.anchor.restore": "Restore Anchor",
  "canvas.anchor.delete": "Delete Anchor",
  "canvas.anchor.empty": "Empty",
  "canvas.anchor.saved": "Anchor Saved",
  "canvas.clearCanvasTitle": "Clear Canvas",
  "canvas.clearCanvasMessage": "Are you sure you want to clear the canvas? This action cannot be undone.",
  "canvas.clearCanvasConfirm": "Clear",
  "swatch.replaceHint": "{{color}} (long press to replace)",
  "tone.key.high": "High",
  "tone.key.mid": "Mid",
  "tone.key.low": "Low",
  "tone.range.short": "Short",
  "tone.range.mid": "Mid",
  "tone.range.long": "Long",
  "tone.label.highShort": "High Key / Short Range",
  "tone.label.highMid": "High Key / Mid Range",
  "tone.label.highLong": "High Key / Long Range",
  "tone.label.midShort": "Mid Key / Short Range",
  "tone.label.midMid": "Mid Key / Mid Range",
  "tone.label.midLong": "Mid Key / Long Range",
  "tone.label.lowShort": "Low Key / Short Range",
  "tone.label.lowMid": "Low Key / Mid Range",
  "tone.label.lowLong": "Low Key / Long Range",
  "tone.unknown": "Tone",
  "dialog.pythonSetupFailedTitle": "Python setup failed",
  "dialog.pythonSetupFailedMessage": "Failed to set up Python environment.",
  "dialog.pythonSetupFailedDetail": "Exit code: {{code}}\nDir: {{dir}}",
  "dialog.modelDownloadFailedTitle": "Model download failed",
  "dialog.modelDownloadFailedMessage": "Failed to download model files.",
  "dialog.modelDownloadFailedDetail": "Exit code: {{code}}\nProgress: {{progress}}%\nModel dir: {{dir}}",
  "dialog.chooseStorageFolderTitle": "Choose PiCaptain storage folder",
  "toast.globalError": "Error: {{message}}",
  "toast.unhandledRejection": "Unhandled Promise Rejection: {{reason}}",
  "toast.storageIncompatible": "Storage is incompatible. Please reset the data folder.",
  "settings.canvas": "Canvas",
  "settings.canvas.create": "Create New",
  "settings.canvas.placeholder": "Canvas Name",
  "settings.canvas.deleteConfirm": "Are you sure you want to delete this canvas?",
  "settings.canvas.deleteTitle": "Delete Canvas",
  "settings.canvas.rename": "Rename",
  "settings.canvas.renamePlaceholder": "New Name",
  "toast.createCanvasFailed": "Failed to create canvas",
  "toast.llmTranslationFailed": "LLM translation failed: {{error}}",
  "settings.llm.title": "LLM Settings",
  "settings.llm.provider": "Model Provider",
  "settings.llm.services": "Services",
  "settings.llm.service.translation": "Translation Helper",
  "settings.llm.service.translation.desc": "Translate search queries to English for better vector search results",
  "settings.llm.enable": "Enable LLM Translation",
  "settings.llm.baseUrl": "Base URL",
  "settings.llm.key": "API Key",
  "settings.llm.model": "Model",
  "settings.open": "Open settings",
  "settings.storageFolder": "Storage folder",
  "settings.queryTranslation": "Query translation",
  "settings.queryTranslation.desc": "LLM-assisted query rewrite",
  "settings.indexing": "Indexing",
  "settings.toggleWindowShortcut": "Toggle window shortcut",
  "settings.run": "Run",
  "settings.running": "Running",
  "settings.imageCount.one": "{{count}} image",
  "settings.imageCount.other": "{{count}} images",
  "settings.status.indexingTitleFallback": "Preparing library update",
  "settings.status.indexingDetailFallback": "Refreshing your local reference library and metadata.",
  "settings.status.ready.semanticAndTranslation": "Semantic search and query translation are active.",
  "settings.status.ready.semantic": "Semantic search is active for your local library.",
  "settings.status.ready.basic": "Search, color filtering, and local library management are ready."
};

// shared/i18n/locales/zh.ts
var zh = {
  "common.ok": "\u786E\u5B9A",
  "common.confirm": "\u786E\u8BA4",
  "common.cancel": "\u53D6\u6D88",
  "common.delete": "\u5220\u9664",
  "common.open": "\u6253\u5F00",
  "common.close": "\u5173\u95ED",
  "common.loading": "\u52A0\u8F7D\u4E2D\u2026",
  "common.clear": "\u6E05\u9664",
  "common.none": "\u65E0",
  "common.notSet": "\u672A\u8BBE\u7F6E",
  "common.color": "\u989C\u8272",
  "common.language": "\u8BED\u8A00",
  "common.language.en": "EN",
  "common.language.zh": "\u4E2D\u6587",
  "common.reset": "\u91CD\u7F6E",
  "titleBar.settings": "\u8BBE\u7F6E",
  "titleBar.floatingMode": "\u6D6E\u7A97\u6A21\u5F0F",
  "titleBar.alwaysOnTop": "\u7F6E\u9876",
  "titleBar.dataFolder": "\u6570\u636E\u6587\u4EF6\u5939",
  "titleBar.dataFolder.default": "\u672A\u914D\u7F6E\uFF0C\u5C06\u4F7F\u7528\u9ED8\u8BA4\u76EE\u5F55",
  "titleBar.change": "\u66F4\u6539",
  "titleBar.window": "\u7A97\u53E3",
  "titleBar.pinTransparent": "\u7F6E\u9876\u900F\u660E",
  "titleBar.canvasOpacity": "\u753B\u5E03\u900F\u660E\u5EA6",
  "titleBar.mouseThrough": "\u9F20\u6807\u7A7F\u900F",
  "titleBar.shortcuts": "\u5FEB\u6377\u952E",
  "titleBar.toggleWindowVisibility": "\u5207\u6362\u7A97\u53E3\u663E\u793A",
  "titleBar.canvasOpacityUp": "\u589E\u52A0\u753B\u5E03\u900F\u660E\u5EA6",
  "titleBar.canvasOpacityDown": "\u964D\u4F4E\u753B\u5E03\u4E0D\u900F\u660E\u5EA6",
  "titleBar.toggleMouseThrough": "\u5207\u6362\u9F20\u6807\u7A7F\u900F",
  "titleBar.toggleGallery": "\u5207\u6362\u56FE\u5E93\u62BD\u5C49",
  "titleBar.canvasGroup": "\u753B\u5E03\u667A\u80FD\u5E03\u5C40",
  "titleBar.shortcutClickToRecord": "\u70B9\u51FB\u5F55\u5236",
  "titleBar.shortcutRecording": "\u8BF7\u6309\u952E...",
  "titleBar.index": "\u7D22\u5F15",
  "titleBar.enableAiSearchVector": "\u542F\u7528 AI \u641C\u7D22",
  "titleBar.indexing": "\u7D22\u5F15\u4E2D\u2026",
  "titleBar.indexUnindexedImages": "\u7D22\u5F15\u672A\u5165\u5E93\u56FE\u7247",
  "titleBar.processing": "\u5904\u7406\u4E2D\u2026",
  "toast.indexFailed": "\u7D22\u5F15\u56FE\u7247\u5931\u8D25",
  "toast.noUnindexedImages": "\u6CA1\u6709\u672A\u5165\u5E93\u7684\u56FE\u7247",
  "toast.indexCompleted": "\u7D22\u5F15\u5B8C\u6210\uFF1A\u65B0\u589E {{created}}\uFF0C\u66F4\u65B0 {{updated}}\uFF0C\u5220\u9664 {{deleted}}",
  "toast.modelReady": "\u641C\u7D22\u6A21\u578B\u5DF2\u5C31\u7EEA",
  "toast.modelCheckFailed": "\u6A21\u578B\u68C0\u67E5\u5931\u8D25\uFF1A{{error}}",
  "toast.settingsUpdateFailed": "\u66F4\u65B0\u8BBE\u7F6E\u5931\u8D25",
  "toast.translationWarning": "\u7FFB\u8BD1\u8B66\u544A\uFF1A{{warning}}",
  "toast.reactError": "\u53D1\u751F\u9519\u8BEF\uFF1A{{message}}",
  "toast.logCopied": "\u65E5\u5FD7\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F",
  "toast.logCopyFailed": "\u590D\u5236\u65E5\u5FD7\u5931\u8D25",
  "toast.tagRenamed": "\u6807\u7B7E\u5DF2\u91CD\u547D\u540D",
  "toast.tagRenameFailed": "\u91CD\u547D\u540D\u6807\u7B7E\u5931\u8D25",
  "toast.tagDeleted": "\u6807\u7B7E\u5DF2\u5220\u9664",
  "toast.tagDeleteFailed": "\u5220\u9664\u6807\u7B7E\u5931\u8D25",
  "toast.importImageFailed": "\u5BFC\u5165\u56FE\u7247\u5931\u8D25",
  "toast.updateTagsFailed": "\u66F4\u65B0\u6807\u7B7E\u5931\u8D25",
  "toast.updateDominantColorFailed": "\u66F4\u65B0\u4E3B\u8272\u5931\u8D25",
  "toast.updateNameFailed": "\u66F4\u65B0\u540D\u79F0\u5931\u8D25",
  "toast.imageDeleted": "\u56FE\u7247\u5DF2\u5220\u9664",
  "toast.deleteImageFailed": "\u5220\u9664\u56FE\u7247\u5931\u8D25",
  "toast.canvasDeleted": "\u753B\u5E03\u5DF2\u5220\u9664",
  "toast.deleteCanvasFailed": "\u5220\u9664\u753B\u5E03\u5931\u8D25",
  "toast.vectorIndexed": "\u5411\u91CF\u5DF2\u5165\u5E93",
  "toast.vectorIndexFailed": "\u5411\u91CF\u5165\u5E93\u5931\u8D25",
  "toast.openFileFailed": "\u6253\u5F00\u6587\u4EF6\u5931\u8D25",
  "toast.shortcutInvalid": "\u5FEB\u6377\u952E\u65E0\u6548",
  "toast.shortcutUpdateFailed": "\u66F4\u65B0\u5FEB\u6377\u952E\u5931\u8D25\uFF1A{{error}}",
  "toast.windowDisplayModeUpdateFailed": "\u5207\u6362\u6D6E\u7A97\u6A21\u5F0F\u5931\u8D25\uFF1A{{error}}",
  "toast.windowAlwaysOnTopUpdateFailed": "\u66F4\u65B0\u7F6E\u9876\u72B6\u6001\u5931\u8D25\uFF1A{{error}}",
  "envInit.brandTitle": "PiCaptain",
  "envInit.heading": "\u6B63\u5728\u51C6\u5907 PiCaptain\u2026",
  "envInit.subheading": "\u9996\u6B21\u8FD0\u884C\u53EF\u80FD\u4F1A\u4E0B\u8F7D\u5DE5\u5177\u3001\u5B89\u88C5\u4F9D\u8D56\u5E76\u62C9\u53D6\u672C\u5730\u6A21\u578B\uFF0C\u8FD9\u662F\u4E00\u6B21\u6027\u6B65\u9AA4\u3002",
  "envInit.preparing": "\u51C6\u5907\u4E2D\u2026",
  "envInit.checkingUv": "\u6B63\u5728\u68C0\u67E5 uv\u2026",
  "envInit.downloadingUv": "\u6B63\u5728\u4E0B\u8F7D uv\u2026",
  "envInit.initializingPythonEnv": "\u6B63\u5728\u521D\u59CB\u5316 Python \u73AF\u5883\u2026",
  "envInit.resolvingDependencies": "\u6B63\u5728\u89E3\u6790\u4F9D\u8D56\u2026",
  "envInit.downloadingPackages": "\u6B63\u5728\u4E0B\u8F7D\u4F9D\u8D56\u5305\u2026",
  "envInit.installingPackages": "\u6B63\u5728\u5B89\u88C5\u4F9D\u8D56\u5305\u2026",
  "envInit.verifyingEnvironment": "\u6B63\u5728\u6821\u9A8C\u73AF\u5883\u2026",
  "envInit.pythonEnvReady": "Python \u73AF\u5883\u5DF2\u5C31\u7EEA",
  "model.downloading": "\u6B63\u5728\u4E0B\u8F7D\u6A21\u578B\u2026",
  "model.preparingDownload": "\u6B63\u5728\u51C6\u5907\u6A21\u578B\u4E0B\u8F7D\u2026",
  "model.downloadingFraction": "\u4E0B\u8F7D\u4E2D\uFF08{{current}}/{{total}}\uFF09",
  "model.retrying": "\u6B63\u5728\u91CD\u8BD5\u4E0B\u8F7D\u2026",
  "model.ready": "\u6A21\u578B\u5DF2\u5C31\u7EEA",
  "model.downloadFailed": "\u6A21\u578B\u4E0B\u8F7D\u5931\u8D25",
  "model.downloadFailedWithReason": "\u6A21\u578B\u4E0B\u8F7D\u5931\u8D25\uFF1A{{reason}}",
  "indexing.starting": "\u5F00\u59CB\u2026",
  "indexing.progress": "\u7D22\u5F15\u4E2D {{current}}/{{total}}\u2026",
  "indexing.completed": "\u5B8C\u6210",
  "errors.title": "PiCaptain \u51FA\u73B0\u9519\u8BEF",
  "errors.unexpected": "\u53D1\u751F\u4E86\u4E00\u4E2A\u610F\u5916\u9519\u8BEF\u3002",
  "errors.applicationLogTitle": "\u5E94\u7528\u65E5\u5FD7\uFF08\u6700\u8FD1 50KB\uFF09",
  "errors.loadingLogs": "\u6B63\u5728\u52A0\u8F7D\u65E5\u5FD7\u2026",
  "errors.logAccessUnavailable": "\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u8BFB\u53D6\u65E5\u5FD7\u3002",
  "errors.failedToLoadLogs": "\u52A0\u8F7D\u65E5\u5FD7\u5931\u8D25\uFF1A{{message}}",
  "errors.copyLog": "\u590D\u5236\u65E5\u5FD7",
  "errors.reloadApplication": "\u91CD\u65B0\u52A0\u8F7D\u5E94\u7528",
  "gallery.searchPlaceholder": "\u8BF7\u7528\u82F1\u6587\u641C\u7D22\uFF0C\u6216\u5148\u8BD1\u6210\u82F1\u6587",
  "gallery.filter": "\u7B5B\u9009",
  "gallery.filterSummary.color": "\u989C\u8272\uFF1A{{color}}",
  "gallery.filterSummary.tone": "\u8272\u8C03\uFF1A{{tone}}",
  "gallery.filterSummary.colorTone": "\u989C\u8272\uFF1A{{color}}\uFF0C\u8272\u8C03\uFF1A{{tone}}",
  "gallery.colorFilter.title": "\u989C\u8272\u7B5B\u9009",
  "gallery.colorFilter.selected": "\u5DF2\u9009",
  "gallery.toneFilter.title": "\u8272\u8C03\u7B5B\u9009",
  "gallery.referenceAlt": "\u53C2\u8003\u56FE",
  "gallery.notIndexed": "\u672A\u5165\u5E93",
  "gallery.vectorResult": "AI \u641C\u7D22\u7ED3\u679C",
  "gallery.contextMenu.nameLabel": "\u540D\u79F0",
  "gallery.contextMenu.imageNamePlaceholder": "\u56FE\u7247\u540D\u79F0",
  "gallery.contextMenu.linkLabel": "\u94FE\u63A5",
  "gallery.contextMenu.tagsLabel": "\u6807\u7B7E",
  "gallery.contextMenu.addTagPlaceholder": "\u6DFB\u52A0\u6807\u7B7E\u2026",
  "gallery.contextMenu.dominantColorLabel": "\u4E3B\u8272",
  "gallery.contextMenu.toneLabel": "\u8272\u8C03",
  "gallery.contextMenu.showInFolder": "\u5728\u6587\u4EF6\u5939\u4E2D\u663E\u793A",
  "gallery.contextMenu.indexVector": "\u5165\u5E93\u5411\u91CF",
  "gallery.contextMenu.deleteImage": "\u5220\u9664\u56FE\u7247",
  "gallery.dominantColor.title": "\u4E3B\u8272",
  "gallery.empty.bodyLine1": "\u65C5\u7A0B\u4ECE\u8FD9\u91CC\u5F00\u59CB\u3002",
  "gallery.empty.bodyLine2": "\u62D6\u653E\u56FE\u7247\u6765\u5F00\u59CB\u4F60\u7684\u65C5\u7A0B\u3002",
  "gallery.empty.dragHint": "\u5C06\u56FE\u7247\u62D6\u5230\u8FD9\u91CC",
  "floating.restore": "\u9000\u51FA\u6D6E\u7A97",
  "floating.dropHint": "\u62D6\u5165",
  "floating.dropNow": "\u677E\u624B\u5BFC\u5165",
  "tag.setColor": "\u8BBE\u7F6E\u989C\u8272",
  "tag.delete": "\u5220\u9664\u6807\u7B7E",
  "tag.deleteConfirmTitle": "\u5220\u9664\u6807\u7B7E",
  "tag.deleteConfirmMessage": "\u8981\u4ECE\u6240\u6709\u56FE\u7247\u4E2D\u5220\u9664\u201C{{tag}}\u201D\u5417\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002",
  "canvas.toolbar.expand": "\u5C55\u5F00\u5DE5\u5177\u680F",
  "canvas.toolbar.collapse": "\u6536\u8D77\u5DE5\u5177\u680F",
  "canvas.toolbar.filters": "\u6EE4\u955C",
  "canvas.filters.grayscale": "\u7070\u5EA6",
  "canvas.filters.posterize": "\u6CB9\u753B\u8272\u5757",
  "canvas.filters.trianglePixelate": "\u4E09\u89D2\u5F62\u50CF\u7D20\u5316",
  "canvas.toolbar.toggleGrayscale": "\u5207\u6362\u7070\u5EA6\u6A21\u5F0F",
  "canvas.toolbar.grayscale": "\u7070\u5EA6",
  "canvas.toolbar.smartLayout": "\u81EA\u52A8\u5E03\u5C40",
  "canvas.toolbar.toggleMinimap": "\u5207\u6362\u5C0F\u5730\u56FE",
  "canvas.toolbar.minimap": "\u5C0F\u5730\u56FE",
  "canvas.toolbar.anchors": "\u951A\u70B9",
  "canvas.anchor.slot": "\u63D2\u69FD {{slot}}",
  "canvas.anchor.save": "\u4FDD\u5B58\u951A\u70B9",
  "canvas.anchor.restore": "\u6062\u590D\u951A\u70B9",
  "canvas.anchor.delete": "\u5220\u9664\u951A\u70B9",
  "canvas.anchor.empty": "\u7A7A",
  "canvas.anchor.saved": "\u951A\u70B9\u5DF2\u4FDD\u5B58",
  "canvas.clearCanvasTitle": "\u6E05\u7A7A\u753B\u5E03",
  "canvas.clearCanvasMessage": "\u786E\u5B9A\u8981\u6E05\u7A7A\u753B\u5E03\u5417\uFF1F\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u9500\u3002",
  "canvas.clearCanvasConfirm": "\u6E05\u7A7A",
  "swatch.replaceHint": "{{color}}\uFF08\u957F\u6309\u66FF\u6362\uFF09",
  "tone.key.high": "\u9AD8",
  "tone.key.mid": "\u4E2D",
  "tone.key.low": "\u4F4E",
  "tone.range.short": "\u77ED",
  "tone.range.mid": "\u4E2D",
  "tone.range.long": "\u957F",
  "tone.label.highShort": "\u9AD8\u8C03 / \u77ED\u8C03",
  "tone.label.highMid": "\u9AD8\u8C03 / \u4E2D\u8C03",
  "tone.label.highLong": "\u9AD8\u8C03 / \u957F\u8C03",
  "tone.label.midShort": "\u4E2D\u8C03 / \u77ED\u8C03",
  "tone.label.midMid": "\u4E2D\u8C03 / \u4E2D\u8C03",
  "tone.label.midLong": "\u4E2D\u8C03 / \u957F\u8C03",
  "tone.label.lowShort": "\u4F4E\u8C03 / \u77ED\u8C03",
  "tone.label.lowMid": "\u4F4E\u8C03 / \u4E2D\u8C03",
  "tone.label.lowLong": "\u4F4E\u8C03 / \u957F\u8C03",
  "tone.unknown": "\u8272\u8C03",
  "dialog.pythonSetupFailedTitle": "Python \u73AF\u5883\u914D\u7F6E\u5931\u8D25",
  "dialog.pythonSetupFailedMessage": "\u65E0\u6CD5\u5B8C\u6210 Python \u73AF\u5883\u914D\u7F6E\u3002",
  "dialog.pythonSetupFailedDetail": "\u9000\u51FA\u7801\uFF1A{{code}}\n\u76EE\u5F55\uFF1A{{dir}}",
  "dialog.modelDownloadFailedTitle": "\u6A21\u578B\u4E0B\u8F7D\u5931\u8D25",
  "dialog.modelDownloadFailedMessage": "\u65E0\u6CD5\u4E0B\u8F7D\u6A21\u578B\u6587\u4EF6\u3002",
  "dialog.modelDownloadFailedDetail": "\u9000\u51FA\u7801\uFF1A{{code}}\n\u8FDB\u5EA6\uFF1A{{progress}}%\n\u6A21\u578B\u76EE\u5F55\uFF1A{{dir}}",
  "dialog.chooseStorageFolderTitle": "\u9009\u62E9 PiCaptain \u5B58\u50A8\u6587\u4EF6\u5939",
  "toast.globalError": "\u9519\u8BEF\uFF1A{{message}}",
  "toast.unhandledRejection": "\u672A\u5904\u7406\u7684 Promise \u62D2\u7EDD\uFF1A{{reason}}",
  "toast.storageIncompatible": "\u5B58\u50A8\u76EE\u5F55\u4E0D\u517C\u5BB9\uFF0C\u8BF7\u91CD\u7F6E\u6570\u636E\u6587\u4EF6\u5939\u3002",
  "settings.canvas": "\u5F53\u524D\u753B\u5E03",
  "settings.canvas.create": "\u65B0\u5EFA\u753B\u5E03",
  "settings.canvas.placeholder": "\u753B\u5E03\u540D\u79F0",
  "settings.canvas.deleteConfirm": "\u786E\u8BA4\u5220\u9664\u8BE5\u753B\u5E03\uFF1F",
  "settings.canvas.deleteTitle": "\u5220\u9664\u753B\u5E03",
  "settings.canvas.rename": "\u91CD\u547D\u540D",
  "settings.canvas.renamePlaceholder": "\u65B0\u540D\u79F0",
  "toast.createCanvasFailed": "\u521B\u5EFA\u753B\u5E03\u5931\u8D25",
  "toast.llmTranslationFailed": "LLM \u7FFB\u8BD1\u5931\u8D25\uFF1A{{error}}",
  "settings.llm.title": "LLM \u8BBE\u7F6E",
  "settings.llm.provider": "\u6A21\u578B\u670D\u52A1",
  "settings.llm.services": "\u5E94\u7528\u529F\u80FD",
  "settings.llm.service.translation": "\u7FFB\u8BD1\u8F85\u52A9",
  "settings.llm.service.translation.desc": "\u5C06\u641C\u7D22\u8BCD\u7FFB\u8BD1\u4E3A\u82F1\u6587\u4EE5\u4F18\u5316\u5411\u91CF\u68C0\u7D22\u7ED3\u679C",
  "settings.llm.enable": "\u542F\u7528 LLM \u7FFB\u8BD1",
  "settings.llm.baseUrl": "\u57FA\u7840\u5730\u5740 (Base URL)",
  "settings.llm.key": "API \u5BC6\u94A5",
  "settings.llm.model": "\u6A21\u578B\u540D\u79F0",
  "common.unavailable": "\u4E0D\u53EF\u7528",
  "titleBar.minimize": "\u6700\u5C0F\u5316",
  "titleBar.maximize": "\u6700\u5927\u5316",
  "settings.open": "\u6253\u5F00\u8BBE\u7F6E",
  "settings.storageFolder": "\u5B58\u50A8\u6587\u4EF6\u5939",
  "settings.queryTranslation": "\u67E5\u8BE2\u7FFB\u8BD1",
  "settings.queryTranslation.desc": "LLM \u8F85\u52A9\u7684\u67E5\u8BE2\u6539\u5199",
  "settings.indexing": "\u7D22\u5F15",
  "settings.toggleWindowShortcut": "\u5207\u6362\u7A97\u53E3\u5FEB\u6377\u952E",
  "settings.run": "\u8FD0\u884C",
  "settings.running": "\u8FD0\u884C\u4E2D",
  "settings.imageCount.one": "{{count}} \u5F20\u56FE\u7247",
  "settings.imageCount.other": "{{count}} \u5F20\u56FE\u7247",
  "settings.status.indexingTitleFallback": "\u6B63\u5728\u51C6\u5907\u66F4\u65B0\u7D22\u5F15",
  "settings.status.indexingDetailFallback": "\u6B63\u5728\u5237\u65B0\u672C\u5730\u7D20\u6750\u5E93\u4E0E\u5143\u6570\u636E",
  "settings.status.ready.semanticAndTranslation": "\u8BED\u4E49\u641C\u7D22\u548C\u67E5\u8BE2\u7FFB\u8BD1\u5DF2\u542F\u7528",
  "settings.status.ready.semantic": "\u672C\u5730\u7D20\u6750\u5E93\u7684\u8BED\u4E49\u641C\u7D22\u5DF2\u542F\u7528",
  "settings.status.ready.basic": "\u641C\u7D22\u3001\u989C\u8272\u7B5B\u9009\u548C\u672C\u5730\u7D20\u6750\u7BA1\u7406\u5DF2\u5C31\u7EEA",
  "envInit.detectingGpu": "\u6B63\u5728\u68C0\u6D4B GPU \u652F\u6301\u2026",
  "envInit.creatingVirtualEnv": "\u6B63\u5728\u521B\u5EFA Python \u865A\u62DF\u73AF\u5883\u2026",
  "envInit.resolvedPackages": "\u5DF2\u89E3\u6790 {{total}} \u4E2A\u4F9D\u8D56\u5305",
  "envInit.downloadingPackagesDetailed": "\u6B63\u5728\u4E0B\u8F7D\u4F9D\u8D56\u5305\uFF08{{current}}/{{total}}\uFF09\u2026",
  "envInit.downloadingPackageNamed": "\u6B63\u5728\u4E0B\u8F7D\u4F9D\u8D56\u5305 {{current}}/{{total}}\uFF1A{{name}}\uFF08{{size}}\uFF09",
  "envInit.downloadedPackageNamed": "\u5DF2\u4E0B\u8F7D\u4F9D\u8D56\u5305 {{current}}/{{total}}\uFF1A{{name}}",
  "envInit.installingPackagesDetailed": "\u6B63\u5728\u5B89\u88C5\u4F9D\u8D56\u5305\uFF08{{current}}/{{total}}\uFF09\u2026",
  "envInit.installingPackageNamed": "\u6B63\u5728\u5B89\u88C5\u4F9D\u8D56\u5305 {{current}}/{{total}}\uFF1A{{name}}",
  "envInit.preparingPackagesElapsed": "\u6B63\u5728\u51C6\u5907 {{total}} \u4E2A\u4F9D\u8D56\u5305\uFF08\u5DF2\u7528\u65F6 {{elapsedSeconds}}\u79D2\uFF09\u2026",
  "envInit.installingLargePackages": "\u6B63\u5728\u4E0B\u8F7D torch \u7B49\u5927\u578B\u4F9D\u8D56\uFF08\u5DF2\u7528\u65F6 {{elapsedSeconds}}\u79D2\uFF09\u2026",
  "envInit.installingPackagesElapsed": "\u6B63\u5728\u5B89\u88C5\u4F9D\u8D56\uFF08\u5DF2\u7528\u65F6 {{elapsedSeconds}}\u79D2\uFF09\u2026",
  "toast.imageVectorSearchFailed": "\u4EE5\u56FE\u641C\u56FE\u5931\u8D25",
  "toast.imageCopied": "\u5DF2\u590D\u5236\u56FE\u7247",
  "toast.copyImageFailed": "\u590D\u5236\u56FE\u7247\u5931\u8D25",
  "gallery.searchPlaceholderImage": "\u5DF2\u542F\u7528\u4EE5\u56FE\u641C\u56FE",
  "gallery.searchImage.pick": "\u9009\u62E9\u56FE\u7247",
  "gallery.searchImage.defaultName": "\u56FE\u7247\u68C0\u7D22",
  "gallery.contextMenu.copyImage": "\u590D\u5236\u56FE\u7247",
  "gallery.contextMenu.searchByImage": "\u4EE5\u56FE\u641C\u56FE"
};

// shared/i18n/t.ts
var dictionaries = {
  en,
  zh
};
function t(locale, key, params) {
  const template = dictionaries[locale][key];
  if (!params) return template;
  return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (match, name) => {
    const value = params[name];
    if (value === void 0 || value === null) return match;
    return String(value);
  });
}

// electron/main.ts
var import_radash = require("radash");
if (!import_electron4.app.isPackaged) {
  import_electron4.app.setName("PiCaptain");
}
Object.assign(console, import_electron_log.default.functions);
import_electron_log.default.transports.file.level = "info";
import_electron_log.default.transports.file.maxSize = 5 * 1024 * 1024;
import_electron_log.default.transports.file.archiveLog = (file) => {
  const filePath = file.toString();
  const info = import_path6.default.parse(filePath);
  const dest = import_path6.default.join(info.dir, info.name + ".old" + info.ext);
  lockedFs.rename(filePath, dest).catch((e) => {
    console.warn("Could not rotate log", e);
  });
};
var DEFAULT_WINDOW_ALWAYS_ON_TOP = false;
var mainWindow = null;
var isAppHidden = false;
var localServerApiBaseUrl = `http://localhost:${DEFAULT_SERVER_PORT}`;
var isLocalServerReady = false;
var DEFAULT_TOGGLE_WINDOW_SHORTCUT = process.platform === "darwin" ? "Command+L" : "Ctrl+L";
var APP_ID = "com.picaptain.app";
var WINDOW_ICON_PATH = import_path6.default.join(__dirname, "../resources/icon.png");
var toggleWindowShortcut = DEFAULT_TOGGLE_WINDOW_SHORTCUT;
var isSettingsOpen = false;
var hasPendingSecondInstanceRestore = false;
var windowAlwaysOnTop = DEFAULT_WINDOW_ALWAYS_ON_TOP;
var cachedWindowBounds = null;
var NORMAL_WINDOW_MIN_WIDTH = 400;
var NORMAL_WINDOW_MIN_HEIGHT = 300;
var hasSingleInstanceLock = import_electron4.app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  import_electron4.app.quit();
}
var isLocale = (value) => value === "en" || value === "zh";
var ensureSettingsStoreConfigured = () => {
  configureSettingsStore(import_path6.default.join(getStorageDir(), "settings.json"));
};
async function getLocale() {
  try {
    const settings = await readPersistedSettings();
    const raw = settings.language;
    return isLocale(raw) ? raw : "en";
  } catch {
    return "en";
  }
}
async function loadShortcuts() {
  try {
    const settings = await readPersistedSettings();
    const rawToggle = settings.toggleWindowShortcut;
    if (typeof rawToggle === "string" && rawToggle.trim()) {
      toggleWindowShortcut = rawToggle.trim();
    }
  } catch {
  }
}
async function readPersistedSettings() {
  try {
    ensureSettingsStoreConfigured();
    const settings = await readSettings();
    if (settings && typeof settings === "object") {
      return settings;
    }
  } catch {
  }
  return {};
}
async function writePersistedSettings(patch) {
  try {
    ensureSettingsStoreConfigured();
    const current = await readPersistedSettings();
    await writeSettings({
      ...current,
      ...patch
    });
  } catch (error) {
    import_electron_log.default.error("Failed to write settings", error);
  }
}
function normalizeWindowBounds(bounds) {
  const workArea = import_electron4.screen.getPrimaryDisplay().workArea;
  const width = Math.max(
    NORMAL_WINDOW_MIN_WIDTH,
    Math.min(
      typeof (bounds == null ? void 0 : bounds.width) === "number" ? bounds.width : Math.floor(workArea.width * 0.6),
      workArea.width
    )
  );
  const height = Math.max(
    NORMAL_WINDOW_MIN_HEIGHT,
    Math.min(
      typeof (bounds == null ? void 0 : bounds.height) === "number" ? bounds.height : Math.floor(workArea.height * 0.8),
      workArea.height
    )
  );
  const fallbackX = workArea.x + Math.floor((workArea.width - width) / 2);
  const fallbackY = workArea.y + Math.floor((workArea.height - height) / 2);
  const display = import_electron4.screen.getDisplayMatching({
    x: typeof (bounds == null ? void 0 : bounds.x) === "number" ? bounds.x : fallbackX,
    y: typeof (bounds == null ? void 0 : bounds.y) === "number" ? bounds.y : fallbackY,
    width,
    height
  });
  const area = display.workArea;
  const maxX = area.x + Math.max(0, area.width - width);
  const maxY = area.y + Math.max(0, area.height - height);
  return {
    width,
    height,
    x: Math.min(Math.max(typeof (bounds == null ? void 0 : bounds.x) === "number" ? bounds.x : fallbackX, area.x), maxX),
    y: Math.min(Math.max(typeof (bounds == null ? void 0 : bounds.y) === "number" ? bounds.y : fallbackY, area.y), maxY)
  };
}
var resolveDragImagePath = (imagePath) => {
  if (import_path6.default.isAbsolute(imagePath)) {
    return import_path6.default.normalize(imagePath);
  }
  const normalizedRelativePath = imagePath.replace(/^[/\\]+/, "");
  return import_path6.default.join(getStorageDir(), normalizedRelativePath);
};
var createDragPreviewIcon = (iconPath) => {
  const maxSide = 72;
  const source = import_electron4.nativeImage.createFromPath(iconPath);
  const icon = source.isEmpty() ? import_electron4.nativeImage.createFromPath(WINDOW_ICON_PATH) : source;
  const size = icon.getSize();
  if (size.width <= 0 || size.height <= 0) {
    return icon.resize({
      width: maxSide,
      height: maxSide,
      quality: "good"
    });
  }
  const scale = Math.min(maxSide / size.width, maxSide / size.height, 1);
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));
  return icon.resize({
    width,
    height,
    quality: "good"
  });
};
function cacheWindowBounds(bounds) {
  const sourceBounds = (mainWindow == null ? void 0 : mainWindow.isMaximized()) ? mainWindow.getNormalBounds() : bounds;
  const normalized = normalizeWindowBounds(sourceBounds);
  cachedWindowBounds = normalized;
  return normalized;
}
function resolveWindowBounds(settings) {
  return normalizeWindowBounds(cachedWindowBounds ?? settings.windowBounds);
}
async function saveWindowBounds(bounds) {
  const nextBounds = cacheWindowBounds(bounds);
  await writePersistedSettings({
    windowBounds: nextBounds
  });
  return nextBounds;
}
var debouncedSaveWindowBounds = (0, import_radash.debounce)(
  { delay: 1e3 },
  (bounds) => {
    void saveWindowBounds(bounds);
  }
);
function notifyWindowAlwaysOnTop() {
  if (!mainWindow) return;
  mainWindow.webContents.send(
    "renderer-event",
    "window-always-on-top",
    windowAlwaysOnTop
  );
}
function syncWindowAppearance(alwaysOnTop) {
  if (!mainWindow) return;
  mainWindow.setAlwaysOnTop(alwaysOnTop);
  mainWindow.setAlwaysOnTop(alwaysOnTop);
  mainWindow.setVisibleOnAllWorkspaces(alwaysOnTop, {
    visibleOnFullScreen: alwaysOnTop
  });
  mainWindow.setResizable(true);
  mainWindow.setMaximizable(true);
  mainWindow.setFullScreenable(true);
  mainWindow.setMinimizable(true);
  mainWindow.setMinimumSize(
    NORMAL_WINDOW_MIN_WIDTH,
    NORMAL_WINDOW_MIN_HEIGHT
  );
}
function applyWindowAlwaysOnTop(alwaysOnTop) {
  if (!mainWindow || windowAlwaysOnTop === alwaysOnTop) return;
  windowAlwaysOnTop = alwaysOnTop;
  syncWindowAppearance(alwaysOnTop);
  notifyWindowAlwaysOnTop();
}
function loadMainWindow() {
  if (!mainWindow) return;
  const query = new URLSearchParams({
    apiBaseUrl: localServerApiBaseUrl
  }).toString();
  if (!import_electron4.app.isPackaged) {
    import_electron_log.default.info("Loading renderer from localhost");
    void mainWindow.loadURL(`http://localhost:5173/?${query}`);
  } else {
    const filePath = import_path6.default.join(__dirname, "../dist-renderer/index.html");
    import_electron_log.default.info("Loading renderer from file:", filePath);
    void mainWindow.loadFile(filePath, {
      query: {
        apiBaseUrl: localServerApiBaseUrl
      }
    });
  }
}
function setupAutoUpdater() {
  import_electron_updater.autoUpdater.logger = import_electron_log.default;
  import_electron_updater.autoUpdater.autoDownload = true;
  import_electron_updater.autoUpdater.on("checking-for-update", () => {
    import_electron_log.default.info("Checking for update...");
  });
  import_electron_updater.autoUpdater.on("update-available", (info) => {
    import_electron_log.default.info("Update available.", info);
    if (mainWindow) {
      mainWindow.webContents.send("update-available", info);
    }
  });
  import_electron_updater.autoUpdater.on("update-not-available", (info) => {
    import_electron_log.default.info("Update not available.", info);
  });
  import_electron_updater.autoUpdater.on("error", (err) => {
    import_electron_log.default.error("Error in auto-updater.", err);
  });
  import_electron_updater.autoUpdater.on("download-progress", (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + " - Downloaded " + progressObj.percent + "%";
    log_message = log_message + " (" + progressObj.transferred + "/" + progressObj.total + ")";
    import_electron_log.default.info(log_message);
    if (mainWindow) {
      mainWindow.webContents.send("download-progress", progressObj);
    }
  });
  import_electron_updater.autoUpdater.on("update-downloaded", (info) => {
    import_electron_log.default.info("Update downloaded", info);
    if (mainWindow) {
      mainWindow.webContents.send("update-downloaded", info);
    }
  });
  if (import_electron4.app.isPackaged) {
    import_electron_updater.autoUpdater.checkForUpdatesAndNotify();
  }
}
async function createWindow(options) {
  import_electron_log.default.info("Creating main window...");
  isAppHidden = false;
  const settings = await readPersistedSettings();
  cachedWindowBounds = settings.windowBounds ? normalizeWindowBounds(settings.windowBounds) : null;
  windowAlwaysOnTop = settings.windowAlwaysOnTop === true;
  const windowState = resolveWindowBounds(settings);
  mainWindow = new import_electron4.BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    icon: WINDOW_ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: import_path6.default.join(__dirname, "preload.cjs")
    },
    frame: false,
    transparent: false,
    backgroundColor: "#0a0a0a",
    alwaysOnTop: windowAlwaysOnTop,
    hasShadow: true
  });
  syncWindowAppearance(windowAlwaysOnTop);
  mainWindow.on("resize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized() || mainWindow.isMaximized()) {
      return;
    }
    const bounds = mainWindow.getBounds();
    cacheWindowBounds(bounds);
    debouncedSaveWindowBounds(bounds);
  });
  mainWindow.on("move", () => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    cacheWindowBounds(bounds);
    debouncedSaveWindowBounds(bounds);
  });
  mainWindow.webContents.on("did-finish-load", () => {
    import_electron_log.default.info("Renderer process finished loading");
    notifyWindowAlwaysOnTop();
  });
  if (!import_electron4.app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      import_electron_log.default.error(
        "Renderer process failed to load:",
        errorCode,
        errorDescription,
        validatedURL
      );
    }
  );
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    import_electron_log.default.error("Renderer process gone:", details.reason, details.exitCode);
  });
  if ((options == null ? void 0 : options.load) !== false) {
    loadMainWindow();
  }
  setupAutoUpdater();
  import_electron4.ipcMain.on("window-min", () => mainWindow == null ? void 0 : mainWindow.minimize());
  import_electron4.ipcMain.on("window-max", () => {
    if (mainWindow == null ? void 0 : mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow == null ? void 0 : mainWindow.maximize();
    }
  });
  import_electron4.ipcMain.on("window-close", () => mainWindow == null ? void 0 : mainWindow.close());
  import_electron4.ipcMain.on("window-focus", () => mainWindow == null ? void 0 : mainWindow.focus());
  import_electron4.ipcMain.on(
    "set-window-bounds",
    (_event, bounds) => {
      if (!mainWindow) return;
      const current = mainWindow.getBounds();
      const nextBounds = {
        x: bounds.x ?? current.x,
        y: bounds.y ?? current.y,
        width: bounds.width ?? current.width,
        height: bounds.height ?? current.height
      };
      const normalized = normalizeWindowBounds(nextBounds);
      mainWindow.setBounds(normalized);
      cacheWindowBounds(normalized);
    }
  );
  import_electron4.ipcMain.handle("set-window-always-on-top", async (_event, value) => {
    try {
      if (typeof value !== "boolean") {
        throw new Error("Invalid always-on-top value");
      }
      applyWindowAlwaysOnTop(value);
      await writePersistedSettings({
        windowAlwaysOnTop
      });
      return { success: true, alwaysOnTop: windowAlwaysOnTop };
    } catch (error) {
      import_electron_log.default.error("Failed to switch always-on-top state", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        alwaysOnTop: windowAlwaysOnTop
      };
    }
  });
  import_electron4.ipcMain.on("log-message", (_event, level, ...args) => {
    if (typeof import_electron_log.default[level] === "function") {
      import_electron_log.default[level](...args);
    } else {
      import_electron_log.default.info(...args);
    }
  });
  import_electron4.ipcMain.handle("get-log-content", async () => {
    try {
      const logPath = import_electron_log.default.transports.file.getFile().path;
      if (await lockedFs.pathExists(logPath)) {
        const stats = await lockedFs.stat(logPath);
        const size = stats.size;
        const READ_SIZE = 50 * 1024;
        const start = Math.max(0, size - READ_SIZE);
        return await withFileLock(logPath, () => {
          return new Promise((resolve, reject) => {
            const stream = import_fs_extra5.default.createReadStream(logPath, {
              start,
              encoding: "utf8"
            });
            const chunks = [];
            stream.on("data", (chunk) => chunks.push(chunk.toString()));
            stream.on("end", () => resolve(chunks.join("")));
            stream.on("error", reject);
          });
        });
      }
      return "No log file found.";
    } catch (error) {
      import_electron_log.default.error("Failed to read log file:", error);
      return `Failed to read log file: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
  import_electron4.ipcMain.handle("open-external", async (_event, rawUrl) => {
    try {
      if (typeof rawUrl !== "string") {
        return { success: false, error: "Invalid URL" };
      }
      const url = new URL(rawUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { success: false, error: "Unsupported URL protocol" };
      }
      await import_electron4.shell.openExternal(url.toString());
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
}
function toggleMainWindowVisibility() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized() || isAppHidden) {
    restoreMainWindowVisibility();
    return;
  }
  isAppHidden = true;
  mainWindow.setIgnoreMouseEvents(true, { forward: false });
  mainWindow.webContents.send("renderer-event", "app-visibility", false);
}
function restoreMainWindowVisibility() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  isAppHidden = false;
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.webContents.send("renderer-event", "app-visibility", true);
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.focus();
}
function registerShortcut(accelerator, currentVar, updateVar, action, checkSettingsOpen = false) {
  const next = typeof accelerator === "string" ? accelerator.trim() : "";
  if (!next) {
    return { success: false, error: "Empty shortcut", accelerator: currentVar };
  }
  const prev = currentVar;
  const handler = () => {
    if (checkSettingsOpen && isSettingsOpen && (mainWindow == null ? void 0 : mainWindow.isFocused())) {
      return;
    }
    action();
  };
  try {
    if (prev !== next) {
      import_electron4.globalShortcut.unregister(prev);
    } else {
      import_electron4.globalShortcut.unregister(prev);
    }
    const ok = import_electron4.globalShortcut.register(next, handler);
    if (!ok) {
      if (prev !== next) {
        import_electron4.globalShortcut.unregister(next);
        import_electron4.globalShortcut.register(prev, handler);
      }
      return {
        success: false,
        error: "Shortcut registration failed",
        accelerator: prev
      };
    }
    updateVar(next);
    return { success: true, accelerator: next };
  } catch (e) {
    if (prev !== next) {
      import_electron4.globalShortcut.unregister(next);
      import_electron4.globalShortcut.register(prev, handler);
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      accelerator: prev
    };
  }
}
function registerToggleWindowShortcut(accelerator) {
  return registerShortcut(
    accelerator,
    toggleWindowShortcut,
    (v) => {
      toggleWindowShortcut = v;
    },
    toggleMainWindowVisibility,
    true
  );
}
function getModelDir() {
  return import_path6.default.join(getStorageDir(), "model");
}
async function hasRequiredModelFiles(modelDir) {
  const hasConfig = await lockedFs.pathExists(
    import_path6.default.join(modelDir, "config.json")
  );
  const hasWeights = await lockedFs.pathExists(
    import_path6.default.join(modelDir, "model.safetensors")
  );
  const hasProcessor = await lockedFs.pathExists(
    import_path6.default.join(modelDir, "preprocessor_config.json")
  );
  const hasTokenizer = await lockedFs.pathExists(
    import_path6.default.join(modelDir, "tokenizer.json")
  );
  return hasConfig && hasWeights && hasProcessor && hasTokenizer;
}
function getUvCandidates() {
  var _a;
  const candidates = [];
  const bundled = getBundledUvPath();
  if (bundled) candidates.push(bundled);
  const env = (_a = process.env.PROREF_UV_PATH) == null ? void 0 : _a.trim();
  if (env) candidates.push(env);
  candidates.push(getManagedUvPath());
  const uniq = [];
  const seen = /* @__PURE__ */ new Set();
  for (const c of candidates) {
    if (!c) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    uniq.push(c);
  }
  return uniq;
}
function getManagedUvPath() {
  return import_path6.default.join(
    import_electron4.app.getPath("userData"),
    "uv",
    process.platform === "win32" ? "uv.exe" : "uv"
  );
}
function getBundledUvPath() {
  const executable = process.platform === "win32" ? "uv.exe" : "uv";
  const target = `${process.platform}-${process.arch}`;
  const root = import_electron4.app.isPackaged ? import_path6.default.join(process.resourcesPath, "uv") : import_path6.default.join(__dirname, "../resources/uv");
  return import_path6.default.join(root, target, executable);
}
var UV_VERSION = "latest";
function resolveUvReleaseAsset() {
  const baseUrl = "https://xget-5sd.pages.dev/gh/astral-sh/uv/releases";
  const downloadPath = UV_VERSION === "latest" ? "latest/download" : `download/${UV_VERSION}`;
  const base = `${baseUrl}/${downloadPath}`;
  if (process.platform === "darwin") {
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
    return { url: `${base}/uv-${arch}-apple-darwin.tar.gz`, kind: "tar.gz" };
  }
  if (process.platform === "linux") {
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
    return {
      url: `${base}/uv-${arch}-unknown-linux-gnu.tar.gz`,
      kind: "tar.gz"
    };
  }
  if (process.platform === "win32") {
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
    return { url: `${base}/uv-${arch}-pc-windows-msvc.zip`, kind: "zip" };
  }
  throw new Error(`Unsupported platform: ${process.platform}`);
}
function extractTarFile(buffer, predicate) {
  const block = 512;
  let offset = 0;
  while (offset + block <= buffer.length) {
    const header = buffer.subarray(offset, offset + block);
    let allZero = true;
    for (let i = 0; i < block; i++) {
      if (header[i] !== 0) {
        allZero = false;
        break;
      }
    }
    if (allZero) return null;
    const nameRaw = header.subarray(0, 100);
    const name = nameRaw.toString("utf8").replace(/\0.*$/, "");
    const sizeRaw = header.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim();
    const size = sizeRaw ? Number.parseInt(sizeRaw, 8) : 0;
    const contentOffset = offset + block;
    const contentEnd = contentOffset + size;
    if (contentEnd > buffer.length) return null;
    if (name && predicate(name)) {
      return buffer.subarray(contentOffset, contentEnd);
    }
    const padded = Math.ceil(size / block) * block;
    offset = contentOffset + padded;
  }
  return null;
}
function extractZipFile(buffer, predicate) {
  const sigEOCD = 101010256;
  const sigCD = 33639248;
  const sigLFH = 67324752;
  const readU16 = (o) => buffer.readUInt16LE(o);
  const readU32 = (o) => buffer.readUInt32LE(o);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 65557; i--) {
    if (readU32(i) === sigEOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const cdSize = readU32(eocd + 12);
  const cdOffset = readU32(eocd + 16);
  let ptr = cdOffset;
  const cdEnd = cdOffset + cdSize;
  while (ptr + 46 <= buffer.length && ptr < cdEnd) {
    if (readU32(ptr) !== sigCD) return null;
    const compression = readU16(ptr + 10);
    const compSize = readU32(ptr + 20);
    const uncompSize = readU32(ptr + 24);
    const nameLen = readU16(ptr + 28);
    const extraLen = readU16(ptr + 30);
    const commentLen = readU16(ptr + 32);
    const lfhOffset = readU32(ptr + 42);
    const name = buffer.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    ptr += 46 + nameLen + extraLen + commentLen;
    if (!predicate(name)) continue;
    if (readU32(lfhOffset) !== sigLFH) return null;
    const lfhNameLen = readU16(lfhOffset + 26);
    const lfhExtraLen = readU16(lfhOffset + 28);
    const dataOffset = lfhOffset + 30 + lfhNameLen + lfhExtraLen;
    const dataEnd = dataOffset + compSize;
    if (dataEnd > buffer.length) return null;
    const data = buffer.subarray(dataOffset, dataEnd);
    if (compression === 0) {
      if (uncompSize !== data.length) return data;
      return data;
    }
    if (compression === 8) {
      return import_zlib.default.inflateRawSync(data);
    }
    return null;
  }
  return null;
}
function downloadBuffer(url, onProgress) {
  return new Promise((resolve, reject) => {
    const visited = /* @__PURE__ */ new Set();
    const fetch = (u, depth) => {
      if (depth > 8) {
        reject(new Error("Too many redirects"));
        return;
      }
      if (visited.has(u)) {
        reject(new Error("Redirect loop"));
        return;
      }
      visited.add(u);
      const req = import_https.default.get(u, (res) => {
        const status = res.statusCode || 0;
        const loc = res.headers.location;
        if ([301, 302, 303, 307, 308].includes(status) && loc) {
          const next = loc.startsWith("http") ? loc : new URL(loc, u).toString();
          res.resume();
          fetch(next, depth + 1);
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }
        const total = parseInt(res.headers["content-length"] || "0", 10);
        let current = 0;
        const chunks = [];
        res.on("data", (d) => {
          chunks.push(d);
          current += d.length;
          if (total > 0 && onProgress) {
            onProgress(current, total);
          }
        });
        res.on("end", () => resolve(Buffer.concat(chunks)));
      });
      req.on("error", reject);
    };
    fetch(url, 0);
  });
}
var currentEnvInitProgress = {
  isOpen: false,
  statusKey: "envInit.preparing",
  progress: 0,
  percentText: "0%"
};
function sendEnvInitProgress(parent, payload) {
  currentEnvInitProgress = payload;
  if (parent.isDestroyed()) return;
  parent.webContents.send("env-init-progress", payload);
}
function makeEnvInitReporter(parent) {
  return (statusKey, progress, statusParams, detailText) => {
    const normalized = Math.max(0, Math.min(1, progress));
    sendEnvInitProgress(parent, {
      isOpen: true,
      statusKey,
      statusParams,
      detailText,
      progress: normalized,
      percentText: `${Math.round(normalized * 100)}%`
    });
  };
}
function closeEnvInitProgress(parent) {
  currentEnvInitProgress = {
    isOpen: false,
    statusKey: "envInit.preparing",
    progress: 0,
    percentText: "0%"
  };
  if (parent.isDestroyed()) return;
  parent.webContents.send("env-init-progress", currentEnvInitProgress);
}
function createStageReporter(report, start, end) {
  const span = Math.max(0, end - start);
  return (statusKey, progress, statusParams, detailText) => {
    const normalized = Math.max(0, Math.min(1, progress));
    report(statusKey, start + span * normalized, statusParams, detailText);
  };
}
var delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function ensureUvInstalled(onProgress) {
  const candidates = getUvCandidates();
  let existing = "";
  onProgress == null ? void 0 : onProgress("envInit.checkingUv", 0.08);
  for (const c of candidates) {
    if (import_path6.default.isAbsolute(c) && await lockedFs.pathExists(c)) {
      existing = c;
      break;
    }
  }
  if (existing) return existing;
  const uvPath = getManagedUvPath();
  if (await lockedFs.pathExists(uvPath)) {
    process.env.PROREF_UV_PATH = uvPath;
    return uvPath;
  }
  await lockedFs.ensureDir(import_path6.default.dirname(uvPath));
  const { url, kind } = resolveUvReleaseAsset();
  import_electron_log.default.info(`Downloading uv from: ${url}`);
  onProgress == null ? void 0 : onProgress("envInit.downloadingUv", 0.18);
  const buf = await downloadBuffer(url, (current, total) => {
    if (total <= 0) {
      onProgress == null ? void 0 : onProgress("envInit.downloadingUv", 0.26);
      return;
    }
    const ratio = current / total;
    onProgress == null ? void 0 : onProgress("envInit.downloadingUv", 0.18 + ratio * 0.22);
  });
  let binary = null;
  if (kind === "tar.gz") {
    const tar = import_zlib.default.gunzipSync(buf);
    binary = extractTarFile(
      tar,
      (name) => name === "uv" || name.endsWith("/uv")
    );
  } else {
    binary = extractZipFile(
      buf,
      (name) => name === "uv.exe" || name.endsWith("/uv.exe")
    );
  }
  if (!binary) {
    throw new Error("Failed to extract uv binary");
  }
  await lockedFs.writeFile(uvPath, binary);
  if (process.platform !== "win32") {
    await withFileLock(uvPath, () => import_fs_extra5.default.chmod(uvPath, 493));
  }
  process.env.PROREF_UV_PATH = uvPath;
  return uvPath;
}
async function preparePythonRuntime(parent, reportEnvInit) {
  const modelDir = getModelDir();
  process.env.PROREF_MODEL_DIR = modelDir;
  reportEnvInit("envInit.preparing", 0);
  console.log("Ensuring uv installation...");
  const uvPath = await ensureUvInstalled((statusKey, progress) => {
    reportEnvInit(statusKey, progress);
  });
  import_electron_log.default.info("[python-init] uv ready:", uvPath);
  try {
    import_electron_log.default.info("[python-init] ensuring managed runtime...");
    await ensurePythonRuntime(uvPath, reportEnvInit);
    import_electron_log.default.info("[python-init] managed runtime ready.");
  } catch (error) {
    const locale = await getLocale();
    const pythonDir = getManagedPythonRuntimeDir();
    const detail = error instanceof Error && error.message ? `${error.message}
Dir: ${pythonDir}` : t(locale, "dialog.pythonSetupFailedDetail", {
      code: -1,
      dir: pythonDir
    });
    import_electron_log.default.error("[python-init] runtime setup failed", error);
    closeEnvInitProgress(parent);
    await import_electron4.dialog.showMessageBox(parent, {
      type: "error",
      title: t(locale, "dialog.pythonSetupFailedTitle"),
      message: t(locale, "dialog.pythonSetupFailedMessage"),
      detail
    });
    throw error instanceof Error ? error : new Error("Python setup failed");
  }
}
async function ensureModelReady(parent, options = {}) {
  const { reportProgress } = options;
  const modelDir = getModelDir();
  process.env.PROREF_MODEL_DIR = modelDir;
  const debug = process.env.PROREF_DEBUG_MODEL === "1";
  if (debug) console.log("[model] dir:", modelDir);
  const modelMissing = !await hasRequiredModelFiles(modelDir);
  if (!modelMissing) {
    if (debug) console.log("[model] ok");
    reportProgress == null ? void 0 : reportProgress("model.ready", 1);
    return;
  }
  if (debug) console.log("[model] missing, start download");
  const sendProgress = (statusKey, percentText2, progress2, filename, statusParams) => {
    if (reportProgress) {
      reportProgress(statusKey, progress2, statusParams);
      return;
    }
    if (parent.isDestroyed()) return;
    parent.webContents.send("model-download-progress", {
      isOpen: true,
      statusKey,
      statusParams,
      percentText: percentText2,
      progress: progress2,
      filename
    });
  };
  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(precision)} ${units[index]}`;
  };
  sendProgress("model.preparingDownload", "0%", 0);
  parent.setProgressBar(0);
  const uvPath = await ensureUvInstalled();
  const { runtimeDir: pythonDir, scriptPath, pythonPath } = await ensurePythonRuntime(uvPath);
  let percentText = "0%";
  let progress = 0;
  sendProgress("model.downloading", percentText, progress);
  const proc = (0, import_child_process3.spawn)(
    pythonPath,
    [scriptPath, "--download-model"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: pythonDir,
      env: {
        ...process.env,
        PROREF_MODEL_DIR: modelDir,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
        TRANSFORMERS_VERBOSITY: "error",
        HF_HUB_DISABLE_PROGRESS_BARS: "1",
        HF_ENDPOINT: "https://hf-mirror.com"
      }
    }
  );
  if (proc.stderr) {
    proc.stderr.on("data", (data) => {
      const msg = data.toString().trim();
      if (debug && msg) console.log("[model] py:", msg);
    });
  }
  let lastProgress = 0;
  let lastError = "";
  if (proc.stdout) {
    const rl = import_readline2.default.createInterface({ input: proc.stdout });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (debug) console.log("[model] evt:", trimmed);
      const evt = (() => {
        try {
          return JSON.parse(trimmed);
        } catch {
          return null;
        }
      })();
      if (!(evt == null ? void 0 : evt.type)) return;
      if (evt.type === "verify") {
        return;
      }
      if (evt.type === "file-progress" && typeof evt.currentBytes === "number" && typeof evt.totalBytes === "number" && typeof evt.stepIndex === "number" && typeof evt.totalSteps === "number") {
        const perFile = evt.totalBytes > 0 ? evt.currentBytes / evt.totalBytes : 0;
        const mapped = Math.max(
          0,
          Math.min(1, (evt.stepIndex - 1 + perFile) / evt.totalSteps)
        );
        progress = mapped;
        percentText = `${Math.round(mapped * 100)}%`;
        lastProgress = mapped;
        sendProgress(
          "model.downloadingFraction",
          percentText,
          progress,
          evt.filename,
          {
            current: formatBytes(evt.currentBytes),
            total: formatBytes(evt.totalBytes)
          }
        );
        return;
      }
      if (evt.type === "file" && typeof evt.current === "number" && typeof evt.total === "number") {
        const p = Math.max(0, Math.min(1, evt.current / evt.total));
        const mapped = p;
        progress = mapped;
        percentText = `${Math.round(mapped * 100)}%`;
        lastProgress = p;
      }
      if (evt.type === "done" && evt.ok) {
        progress = 1;
        percentText = "100%";
      }
      if (evt.type === "error" && typeof evt.message === "string") {
        progress = Math.max(progress, 0);
        lastError = evt.message;
      }
      if (evt.type === "file" && typeof evt.current === "number" && typeof evt.total === "number") {
        sendProgress(
          "model.downloadingFraction",
          percentText,
          progress,
          evt.filename,
          { current: evt.current, total: evt.total }
        );
        return;
      }
      if (evt.type === "done" && evt.ok) {
        sendProgress("model.ready", percentText, progress, evt.filename);
        return;
      }
      if (evt.type === "error") {
        const reason = typeof evt.message === "string" ? evt.message : "";
        sendProgress(
          reason ? "model.downloadFailedWithReason" : "model.downloadFailed",
          percentText,
          progress,
          evt.filename,
          reason ? { reason } : void 0
        );
        return;
      }
      if (evt.type === "start") {
        sendProgress(
          "model.preparingDownload",
          percentText,
          progress,
          evt.filename
        );
        return;
      }
      sendProgress("model.downloading", percentText, progress, evt.filename);
    });
  }
  const exitCode = await new Promise(
    (resolve) => proc.once("exit", resolve)
  );
  parent.setProgressBar(-1);
  if (!reportProgress) {
    parent.webContents.send("model-download-progress", { isOpen: false });
  }
  const ok = await hasRequiredModelFiles(modelDir);
  if (debug) console.log("[model] download exit:", exitCode, "ok:", ok);
  if (exitCode !== 0 || !ok) {
    const locale = await getLocale();
    await import_electron4.dialog.showMessageBox(parent, {
      type: "error",
      title: t(locale, "dialog.modelDownloadFailedTitle"),
      message: t(locale, "dialog.modelDownloadFailedMessage"),
      detail: (lastError ? `Error: ${lastError}

` : "") + t(locale, "dialog.modelDownloadFailedDetail", {
        code: exitCode,
        progress: Math.round(lastProgress * 100),
        dir: modelDir
      })
    });
    throw new Error("Model download failed");
  }
}
async function ensureStartupInitialization(parent) {
  const reportEnvInit = makeEnvInitReporter(parent);
  const reportPythonInit = createStageReporter(reportEnvInit, 0, 0.68);
  const reportModelInit = createStageReporter(reportEnvInit, 0.68, 1);
  try {
    await preparePythonRuntime(parent, reportPythonInit);
    await ensureModelReady(parent, {
      reportProgress: reportModelInit
    });
    await delay(250);
  } finally {
    closeEnvInitProgress(parent);
  }
}
function scheduleVectorServiceWarmup() {
  void (async () => {
    try {
      await warmupVectorService();
      import_electron_log.default.info("[vector-service] warmup ready.");
    } catch (error) {
      import_electron_log.default.warn("[vector-service] warmup failed:", error);
    }
  })();
}
async function startServer2() {
  const port = await startServer((channel, data) => {
    mainWindow == null ? void 0 : mainWindow.webContents.send(channel, data);
  });
  localServerApiBaseUrl = `http://localhost:${port}`;
  isLocalServerReady = true;
  return port;
}
import_electron4.app.on("second-instance", () => {
  const restoreOrCreateWindow = () => {
    if (!mainWindow) {
      if (!isLocalServerReady) {
        hasPendingSecondInstanceRestore = true;
        return;
      }
      void createWindow();
      return;
    }
    restoreMainWindowVisibility();
  };
  if (!import_electron4.app.isReady()) {
    if (hasPendingSecondInstanceRestore) return;
    hasPendingSecondInstanceRestore = true;
    import_electron4.app.once("ready", () => {
      hasPendingSecondInstanceRestore = false;
      restoreOrCreateWindow();
    });
    return;
  }
  restoreOrCreateWindow();
});
import_electron4.ipcMain.handle("get-storage-dir", async () => {
  return getStorageDir();
});
import_electron4.ipcMain.handle("get-env-init-progress", async () => {
  return currentEnvInitProgress;
});
import_electron4.ipcMain.handle("open-storage-dir", async () => {
  const target = getStorageDir();
  const result = await import_electron4.shell.openPath(target);
  if (result) {
    return { success: false, error: result };
  }
  return { success: true };
});
import_electron4.ipcMain.handle("choose-storage-dir", async () => {
  const locale = await getLocale();
  const result = await import_electron4.dialog.showOpenDialog({
    title: t(locale, "dialog.chooseStorageFolderTitle"),
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  const dir = result.filePaths[0];
  await setStorageRoot(dir);
  import_electron4.app.relaunch();
  import_electron4.app.exit(0);
});
import_electron4.ipcMain.handle("choose-search-image", async () => {
  const result = await import_electron4.dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      {
        name: "Images",
        extensions: [
          "jpg",
          "jpeg",
          "png",
          "webp",
          "gif",
          "bmp",
          "tiff",
          "tif",
          "heic",
          "heif",
          "avif"
        ]
      }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  const filePath = result.filePaths[0];
  return {
    path: filePath,
    name: import_path6.default.basename(filePath)
  };
});
import_electron4.ipcMain.handle(
  "start-image-drag",
  async (event, payload) => {
    var _a, _b;
    try {
      const rawImagePath = (_a = payload == null ? void 0 : payload.imagePath) == null ? void 0 : _a.trim();
      if (!rawImagePath) {
        return { success: false, error: "Missing image path" };
      }
      const filePath = resolveDragImagePath(rawImagePath);
      const fileExists = await lockedFs.pathExists(filePath);
      if (!fileExists) {
        return { success: false, error: "Image file does not exist" };
      }
      const preferredIconPath = ((_b = payload == null ? void 0 : payload.fallbackIconPath) == null ? void 0 : _b.trim()) ? resolveDragImagePath(payload.fallbackIconPath.trim()) : filePath;
      const iconPath = await lockedFs.pathExists(preferredIconPath) ? preferredIconPath : WINDOW_ICON_PATH;
      const icon = createDragPreviewIcon(iconPath);
      event.sender.startDrag({
        file: filePath,
        icon
      });
      return { success: true };
    } catch (error) {
      import_electron_log.default.error("Failed to start image drag", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);
import_electron4.app.whenReady().then(async () => {
  import_electron_log.default.info("App starting...");
  import_electron_log.default.info("Log file location:", import_electron_log.default.transports.file.getFile().path);
  import_electron_log.default.info("App path:", import_electron4.app.getAppPath());
  import_electron_log.default.info("User data:", import_electron4.app.getPath("userData"));
  if (process.platform === "win32") {
    import_electron4.app.setAppUserModelId(APP_ID);
  }
  const taskLoadShortcuts = loadShortcuts();
  const taskStartServer = startServer2();
  try {
    await Promise.all([taskLoadShortcuts, taskStartServer]);
    await createWindow();
    registerToggleWindowShortcut(toggleWindowShortcut);
    if (mainWindow) {
      import_electron_log.default.info("Ensuring startup initialization...");
      await ensureStartupInitialization(mainWindow);
      import_electron_log.default.info("Startup initialization ready.");
      scheduleVectorServiceWarmup();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[startup] initialization failed:", message);
    import_electron_log.default.error("[startup] initialization failed:", message);
    import_electron4.app.quit();
    return;
  }
  if (hasPendingSecondInstanceRestore) {
    hasPendingSecondInstanceRestore = false;
    restoreMainWindowVisibility();
  }
  import_electron4.app.on("activate", () => {
    if (import_electron4.BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
      return;
    }
    restoreMainWindowVisibility();
  });
});
import_electron4.ipcMain.handle(
  "set-toggle-window-shortcut",
  async (_event, accelerator) => {
    return registerToggleWindowShortcut(accelerator);
  }
);
import_electron4.ipcMain.on("settings-open-changed", (_event, open) => {
  isSettingsOpen = Boolean(open);
});
import_electron4.app.on("will-quit", () => {
  import_electron4.globalShortcut.unregisterAll();
});
import_electron4.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") import_electron4.app.quit();
});
