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
var import_electron3 = require("electron");
var import_path5 = __toESM(require("path"), 1);
var import_fs_extra4 = __toESM(require("fs-extra"), 1);
var import_electron_log = __toESM(require("electron-log"), 1);
var import_electron_updater = require("electron-updater");
var import_child_process2 = require("child_process");

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
var import_https2 = __toESM(require("https"), 1);
var import_zlib = __toESM(require("zlib"), 1);

// backend/server.ts
var import_electron2 = require("electron");
var import_path4 = __toESM(require("path"), 1);
var import_express5 = __toESM(require("express"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_body_parser = __toESM(require("body-parser"), 1);
var import_fs_extra3 = __toESM(require("fs-extra"), 1);
var import_https = __toESM(require("https"), 1);
var import_http = __toESM(require("http"), 1);
var import_child_process = require("child_process");
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

// backend/server.ts
var import_radash = require("radash");

// backend/routes/images.ts
var import_path3 = __toESM(require("path"), 1);
var import_express = __toESM(require("express"), 1);
var import_electron = require("electron");
var import_uuid = require("uuid");
var import_fs_extra2 = __toESM(require("fs-extra"), 1);
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
var createImagesRouter = (deps) => {
  const router = import_express.default.Router();
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
        const vectorCursor = parseVectorCursor(req.query);
        const tagIds2 = imageDb2.getTagIdsByNames(tags);
        const tagCount2 = tags.length;
        const vector = await deps.runPythonVector("encode-text", query);
        if (!vector) {
          res.json({ items: [], nextCursor: null });
          return;
        }
        const results2 = imageDb2.searchImages({
          vector,
          limit: effectiveLimit,
          tagIds: tagIds2,
          tagCount: tagCount2,
          tone,
          color,
          afterDistance: (vectorCursor == null ? void 0 : vectorCursor.distance) ?? null,
          afterRowid: (vectorCursor == null ? void 0 : vectorCursor.rowid) ?? null
        });
        const nextCursor2 = buildVectorCursor(results2);
        const items = results2.map((item) => ({ ...item, isVectorResult: true }));
        res.json({ items, nextCursor: nextCursor2 });
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
      const tags = ensureTags(payload.tags);
      const timestamp = Date.now();
      let sourceType = null;
      let sourceData = null;
      if (payload.imageBase64) {
        const base64Data = payload.imageBase64.replace(/^data:image\/\w+;base64,/, "");
        sourceType = "buffer";
        sourceData = Buffer.from(base64Data, "base64");
      } else if (payload.type && payload.data) {
        sourceType = payload.type;
        sourceData = payload.data;
      } else if (payload.imageUrl) {
        const imageUrl = payload.imageUrl;
        sourceType = imageUrl.startsWith("file://") || imageUrl.startsWith("/") ? "path" : "url";
        sourceData = imageUrl;
      }
      if (!sourceType || sourceData === null) {
        res.status(400).json({ error: "No image data" });
        return;
      }
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
      let filename = `${safeName}${ext}`;
      let counter = 1;
      while (await lockedFs.pathExists(import_path3.default.join(deps.getImageDir(), filename))) {
        if (imageDb2.getImageRowByFilename(filename)) {
          filename = `${safeName}_${counter}${ext}`;
          counter += 1;
          continue;
        }
        break;
      }
      const imagePath = import_path3.default.join("images", filename);
      const localPath = import_path3.default.join(deps.getStorageDir(), imagePath);
      if (sourceType === "buffer") {
        await withFileLock(localPath, async () => {
          await import_fs_extra2.default.writeFile(localPath, sourceData);
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
        await withFileLocks([srcPath, localPath], async () => {
          await import_fs_extra2.default.copy(srcPath, localPath);
        });
      } else {
        await deps.downloadImage(sourceData, localPath);
      }
      const id = (0, import_uuid.v4)();
      const createdAt = timestamp;
      const pageUrl = typeof payload.pageUrl === "string" ? payload.pageUrl : null;
      const { rowid } = imageDb2.insertImage({
        id,
        filename,
        imagePath,
        createdAt,
        pageUrl
      });
      imageDb2.setImageTags(id, tags);
      const meta = {
        id,
        filename,
        imagePath,
        pageUrl,
        tags,
        createdAt,
        dominantColor: null,
        tone: null,
        hasVector: false
      };
      res.json({ success: true, meta });
      void (async () => {
        var _a;
        try {
          const settings = await deps.readSettings();
          const enableVectorSearch = Boolean(settings.enableVectorSearch);
          console.log("[VectorIndex] start import", {
            id,
            rowid,
            enableVectorSearch,
            imagePath: localPath
          });
          if (enableVectorSearch) {
            const vector = await deps.runPythonVector("encode-image", localPath);
            if (vector) {
              imageDb2.setImageVector(rowid, vector);
              console.log("[VectorIndex] stored import", {
                id,
                rowid,
                length: vector.length
              });
              (_a = deps.sendToRenderer) == null ? void 0 : _a.call(deps, "image-updated", { id, hasVector: true });
            } else {
              console.error("[VectorIndex] vector missing import", { id, rowid });
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("Async vector import failed:", message);
        }
      })();
      void (async () => {
        var _a;
        try {
          const dominantColor = await deps.runPythonDominantColor(localPath);
          if (dominantColor) {
            const resolved = resolveOklchPayload(dominantColor);
            if (resolved) {
              imageDb2.updateImage({
                id,
                dominantColor: resolved.color,
                dominantL: resolved.oklch.L,
                dominantC: resolved.oklch.C,
                dominantH: resolved.oklch.h
              });
              (_a = deps.sendToRenderer) == null ? void 0 : _a.call(deps, "image-updated", { id, dominantColor: resolved.color });
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("Async dominant color update failed:", message);
        }
      })();
      void (async () => {
        var _a;
        try {
          const tone = await deps.runPythonTone(localPath);
          if (tone) {
            imageDb2.updateImage({ id, tone });
            (_a = deps.sendToRenderer) == null ? void 0 : _a.call(deps, "image-updated", { id, tone });
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
    var _a, _b, _c, _d, _e;
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
        console.log("[VectorIndex] start single", {
          id: imageId,
          rowid: row.rowid,
          imagePath: localPath
        });
        const vector = await deps.runPythonVector("encode-image", localPath);
        if (vector) {
          imageDb2.setImageVector(row.rowid, vector);
          console.log("[VectorIndex] stored single", {
            id: imageId,
            rowid: row.rowid,
            length: vector.length
          });
          (_a = deps.sendToRenderer) == null ? void 0 : _a.call(deps, "image-updated", { id: imageId, hasVector: true });
          const meta = imageDb2.getImageById(imageId);
          res.json({ success: true, meta });
          return;
        }
        console.error("[VectorIndex] vector missing single", {
          id: imageId,
          rowid: row.rowid
        });
        res.json({ success: true });
        return;
      }
      if (mode === "missing") {
        const items = imageDb2.listImages();
        const existingNames = new Set(items.map((item) => item.filename));
        const files = await listImageFiles(deps.getImageDir());
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
          imageDb2.insertImage({
            id,
            filename,
            imagePath,
            createdAt,
            pageUrl: null
          });
          imageDb2.setImageTags(id, []);
          const meta = {
            id,
            filename,
            imagePath,
            pageUrl: null,
            tags: [],
            createdAt,
            dominantColor: null,
            tone: null,
            hasVector: false
          };
          newItems.push(meta);
          existingNames.add(filename);
          created += 1;
          void (async () => {
            var _a2;
            try {
              const dominantColor = await deps.runPythonDominantColor(localPath);
              if (dominantColor) {
                const resolved = resolveOklchPayload(dominantColor);
                if (resolved) {
                  imageDb2.updateImage({
                    id,
                    dominantColor: resolved.color,
                    dominantL: resolved.oklch.L,
                    dominantC: resolved.oklch.C,
                    dominantH: resolved.oklch.h
                  });
                  (_a2 = deps.sendToRenderer) == null ? void 0 : _a2.call(deps, "image-updated", { id, dominantColor: resolved.color });
                }
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              console.error("Async dominant color update failed:", message);
            }
          })();
          void (async () => {
            var _a2;
            try {
              const tone = await deps.runPythonTone(localPath);
              if (tone) {
                imageDb2.updateImage({ id, tone });
                (_a2 = deps.sendToRenderer) == null ? void 0 : _a2.call(deps, "image-updated", { id, tone });
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
        (_b = deps.sendToRenderer) == null ? void 0 : _b.call(deps, "indexing-progress", {
          current: 0,
          total,
          statusKey: "indexing.starting"
        });
        let updated = 0;
        for (const item of candidates) {
          current += 1;
          if (current % 2 === 0 || current === total || current === 1) {
            (_c = deps.sendToRenderer) == null ? void 0 : _c.call(deps, "indexing-progress", {
              current,
              total,
              statusKey: "indexing.progress",
              statusParams: { current, total }
            });
          }
          const rowid = imageDb2.getImageRowidById(item.id);
          if (!rowid) {
            console.error("[VectorIndex] rowid missing batch", { id: item.id });
            continue;
          }
          const localPath = import_path3.default.join(deps.getStorageDir(), item.imagePath);
          console.log("[VectorIndex] start batch", {
            id: item.id,
            rowid,
            current,
            total,
            imagePath: localPath
          });
          const vector = await deps.runPythonVector("encode-image", localPath);
          if (vector) {
            imageDb2.setImageVector(rowid, vector);
            updated += 1;
            (_d = deps.sendToRenderer) == null ? void 0 : _d.call(deps, "image-updated", { id: item.id, hasVector: true });
            console.log("[VectorIndex] stored batch", {
              id: item.id,
              rowid,
              length: vector.length
            });
          } else {
            console.error("[VectorIndex] vector missing batch", {
              id: item.id,
              rowid
            });
          }
        }
        (_e = deps.sendToRenderer) == null ? void 0 : _e.call(deps, "indexing-progress", {
          current: total,
          total,
          statusKey: "indexing.completed"
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

// backend/imageAnalysis.ts
var import_sharp = __toESM(require("sharp"), 1);
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
      case bNorm:
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
async function getDominantColor(filePath) {
  try {
    const { data } = await (0, import_sharp.default)(filePath).resize(150, 150, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixelCount = data.length / 3;
    const colorCounts = /* @__PURE__ */ new Map();
    const QUANTIZATION_BITS = 5;
    const SHIFT = 8 - QUANTIZATION_BITS;
    const BIN_SIZE = 1 << SHIFT;
    const OFFSET = BIN_SIZE / 2;
    for (let i = 0; i < data.length; i += 3) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const rQ = r >> SHIFT << SHIFT;
      const gQ = g >> SHIFT << SHIFT;
      const bQ = b >> SHIFT << SHIFT;
      const key = `${rQ},${gQ},${bQ}`;
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }
    const sortedColors = Array.from(colorCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key, count]) => {
      const [r, g, b] = key.split(",").map(Number);
      return {
        r: Math.min(255, r + OFFSET),
        g: Math.min(255, g + OFFSET),
        b: Math.min(255, b + OFFSET),
        count
      };
    });
    let bestScore = -1;
    let bestHex = "#808080";
    const totalPixels = pixelCount;
    for (const color of sortedColors) {
      const { r, g, b, count } = color;
      const { s, v } = rgbToHsv(r, g, b);
      const dominance = count / totalPixels;
      let score = dominance;
      score *= 1 + s * 1.5;
      score *= 1 + v * 1.2;
      if (v < 0.2) {
        score *= 0.1;
      }
      if (s < 0.1 && v > 0.8) {
        score *= 0.5;
      }
      if (score > bestScore) {
        bestScore = score;
        bestHex = rgbToHex(r, g, b);
      }
    }
    return bestHex;
  } catch (error) {
    console.error(`Error calculating dominant color for ${filePath}:`, error);
    return "#808080";
  }
}
async function calculateTone(filePath) {
  try {
    const { data } = await (0, import_sharp.default)(filePath).resize(150, 150, { fit: "cover" }).grayscale().raw().toBuffer({ resolveWithObject: true });
    const hist = new Array(256).fill(0);
    for (let i = 0; i < data.length; i++) {
      hist[data[i]]++;
    }
    const totalPixels = data.length;
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

// backend/server.ts
var SERVER_PORT = 30001;
var CONFIG_FILE = import_path4.default.join(import_electron2.app.getPath("userData"), "picaptain_config.json");
var DEFAULT_STORAGE_DIR = import_path4.default.join(import_electron2.app.getPath("userData"), "picaptain_storage");
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
  if (import_electron2.app.isPackaged && process.platform !== "darwin") {
    try {
      const exeDir = import_path4.default.dirname(import_electron2.app.getPath("exe"));
      const portableDataDir = import_path4.default.join(exeDir, "data");
      if (await lockedFs.pathExists(portableDataDir)) {
        return portableDataDir;
      }
      const testFile = import_path4.default.join(exeDir, ".write_test");
      const writable = await withFileLock(testFile, async () => {
        try {
          await import_fs_extra3.default.writeFile(testFile, "test");
          await import_fs_extra3.default.remove(testFile);
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
var IMAGE_DIR = import_path4.default.join(STORAGE_DIR, "images");
var SETTINGS_FILE = import_path4.default.join(STORAGE_DIR, "settings.json");
var settingsCache = null;
var updateStoragePaths = (root) => {
  STORAGE_DIR = root;
  IMAGE_DIR = import_path4.default.join(STORAGE_DIR, "images");
  SETTINGS_FILE = import_path4.default.join(STORAGE_DIR, "settings.json");
};
var ensureStorageDirs = async (root) => {
  await Promise.all([
    lockedFs.ensureDir(root),
    lockedFs.ensureDir(import_path4.default.join(root, "images")),
    lockedFs.ensureDir(import_path4.default.join(root, "model"))
  ]);
};
var getStorageDir = () => STORAGE_DIR;
var setStorageRoot = async (root) => {
  const trimmed = root.trim();
  if (!trimmed) return;
  updateStoragePaths(trimmed);
  settingsCache = null;
  await ensureStorageDirs(STORAGE_DIR);
  await withFileLock(CONFIG_FILE, async () => {
    await import_fs_extra3.default.writeJson(CONFIG_FILE, { storageDir: STORAGE_DIR });
  });
  initDatabase();
};
var readSettings = async () => {
  if (settingsCache) return settingsCache;
  return withFileLock(SETTINGS_FILE, async () => {
    if (!await import_fs_extra3.default.pathExists(SETTINGS_FILE)) {
      settingsCache = {};
      return settingsCache;
    }
    try {
      const raw = await import_fs_extra3.default.readJson(SETTINGS_FILE);
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
var persistSettings = (0, import_radash.debounce)({ delay: 500 }, async (settings) => {
  await withFileLock(SETTINGS_FILE, async () => {
    try {
      await import_fs_extra3.default.writeJson(SETTINGS_FILE, settings);
    } catch (error) {
      console.error("Failed to write settings file", error);
    }
  });
});
var writeSettings = async (settings) => {
  settingsCache = settings;
  persistSettings(settings);
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
  settingsCache = null;
  await ensureStorageDirs(STORAGE_DIR);
  initDatabase();
};
var BasePythonService = class {
  process = null;
  queue = [];
  serviceName = "Python Service";
  getManagedUvPath() {
    return import_path4.default.join(
      import_electron2.app.getPath("userData"),
      "uv",
      process.platform === "win32" ? "uv.exe" : "uv"
    );
  }
  getUvCandidates() {
    var _a;
    const candidates = [];
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
        const cleaned = normalized.replace(/^\[(info|warn|warning|error)\]\s*/i, "");
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
  spawnProcess(command, args, cwd) {
    const env = {
      ...process.env,
      PROREF_MODEL_DIR: import_path4.default.join(getStorageDir(), "model"),
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
      TRANSFORMERS_VERBOSITY: "error",
      HF_HUB_DISABLE_PROGRESS_BARS: "1",
      // Use Aliyun mirror for PyPI (often more stable/accessible)
      UV_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
      // Also set PIP_INDEX_URL as fallback/standard
      PIP_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
      // Use HF mirror for model downloads
      HF_ENDPOINT: "https://hf-mirror.com"
    };
    const proc = (0, import_child_process.spawn)(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd,
      env
    });
    this.attachProcess(proc);
    return proc;
  }
  start() {
    if (this.process) return;
    let scriptPath = import_path4.default.join(__dirname, "../backend/python/tagger.py");
    if (import_electron2.app.isPackaged) {
      scriptPath = scriptPath.replace("app.asar", "app.asar.unpacked");
    }
    const pythonDir = import_path4.default.dirname(scriptPath);
    const uvArgs = ["run", "python", scriptPath];
    const uvCandidates = this.getUvCandidates();
    const trySpawn = async (index) => {
      console.log(`Trying uv candidate ${index}: ${uvCandidates[index]}`);
      if (index >= uvCandidates.length) {
        console.error(`Failed to spawn ${this.serviceName}: uv not found`);
        this.process = null;
        return;
      }
      const command = uvCandidates[index];
      if (import_path4.default.isAbsolute(command)) {
        const exists = await lockedFs.pathExists(command);
        if (!exists) {
          await trySpawn(index + 1);
          return;
        }
      }
      const proc = this.spawnProcess(command, uvArgs, pythonDir);
      this.process = proc;
      proc.once("error", (err) => {
        const code = err.code;
        if (code === "ENOENT") {
          if (this.process === proc) {
            this.process = null;
          }
          trySpawn(index + 1);
          return;
        }
        console.error(`Failed to spawn ${this.serviceName}`, err);
        if (this.process === proc) {
          this.process = null;
        }
      });
    };
    void trySpawn(0);
  }
  async sendRequest(req) {
    if (!this.process) {
      this.start();
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
  constructor() {
    super();
    this.serviceName = "Python Vector Service";
  }
  downloadModel(onProgress) {
    return new Promise((resolve, reject) => {
      let scriptPath = import_path4.default.join(__dirname, "../backend/python/tagger.py");
      if (import_electron2.app.isPackaged) {
        scriptPath = scriptPath.replace("app.asar", "app.asar.unpacked");
      }
      const pythonDir = import_path4.default.dirname(scriptPath);
      const uvArgs = ["run", "python", scriptPath, "--download-model"];
      const uvCandidates = this.getUvCandidates();
      const trySpawn = async (index) => {
        var _a;
        if (index >= uvCandidates.length) {
          reject(new Error("Failed to spawn python service: uv not found"));
          return;
        }
        const command = uvCandidates[index];
        if (import_path4.default.isAbsolute(command)) {
          const exists = await lockedFs.pathExists(command);
          if (!exists) {
            await trySpawn(index + 1);
            return;
          }
        }
        const env = {
          ...process.env,
          PROREF_MODEL_DIR: import_path4.default.join(getStorageDir(), "model"),
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1",
          TRANSFORMERS_VERBOSITY: "error",
          HF_HUB_DISABLE_PROGRESS_BARS: "1",
          UV_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
          PIP_INDEX_URL: "https://mirrors.aliyun.com/pypi/simple/",
          HF_ENDPOINT: "https://hf-mirror.com"
        };
        const proc = (0, import_child_process.spawn)(command, uvArgs, {
          stdio: ["pipe", "pipe", "pipe"],
          cwd: pythonDir,
          env
        });
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
        proc.on("error", (err) => {
          const code = err.code;
          if (code === "ENOENT") {
            void trySpawn(index + 1);
            return;
          }
          reject(err);
        });
      };
      void trySpawn(0);
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
};
var mapModelDownloadProgress = (data) => {
  if (!data || typeof data !== "object") return data;
  const d = data;
  const type = d.type;
  if (type === "error") {
    return { type: "error", reason: typeof d.message === "string" ? d.message : String(d.message ?? "") };
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
function downloadImage(url, dest) {
  return withFileLock(dest, () => new Promise((resolve, reject) => {
    if (url.startsWith("file://") || url.startsWith("/")) {
      let srcPath = url;
      if (url.startsWith("file://")) {
        srcPath = new URL(url).pathname;
        if (process.platform === "win32" && srcPath.startsWith("/") && srcPath.includes(":")) {
          srcPath = srcPath.substring(1);
        }
      }
      srcPath = decodeURIComponent(srcPath);
      import_fs_extra3.default.copy(srcPath, dest).then(() => resolve()).catch((err) => {
        import_fs_extra3.default.unlink(dest, () => {
        });
        reject(err);
      });
      return;
    }
    const file = import_fs_extra3.default.createWriteStream(dest);
    const client = url.startsWith("https") ? import_https.default : import_http.default;
    const request = client.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      } else {
        file.close();
        import_fs_extra3.default.unlink(dest, () => {
        });
        reject(
          new Error(
            `Server responded with ${response.statusCode}: ${response.statusMessage}`
          )
        );
      }
    });
    request.on("error", (err) => {
      import_fs_extra3.default.unlink(dest, () => {
      });
      reject(err);
    });
    file.on("error", (err) => {
      import_fs_extra3.default.unlink(dest, () => {
      });
      reject(err);
    });
  }));
}
async function startServer(sendToRenderer) {
  await initializeStorage();
  const server = (0, import_express5.default)();
  server.use((0, import_cors.default)());
  server.use(import_body_parser.default.json({ limit: "25mb" }));
  const vectorService = new PythonVectorService();
  await vectorService.start();
  const runPythonVector = async (mode, arg) => {
    return vectorService.run(mode, arg);
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
    const logFile = import_path4.default.join(STORAGE_DIR, "server.log");
    await withFileLock(logFile, async () => {
      await import_fs_extra3.default.ensureFile(logFile);
      await import_fs_extra3.default.appendFile(logFile, `${JSON.stringify(payload)}
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
  server.listen(SERVER_PORT, () => {
    console.log(`Local server running on port ${SERVER_PORT}`);
  });
  return;
}

// shared/i18n/locales/en.ts
var en = {
  "common.ok": "OK",
  "common.confirm": "Confirm",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.close": "Close",
  "common.loading": "Loading...",
  "common.clear": "Clear",
  "common.none": "None",
  "common.notSet": "Not set",
  "common.color": "Color",
  "common.language": "Language",
  "common.language.en": "EN",
  "common.language.zh": "\u4E2D\u6587",
  "common.reset": "Reset",
  "titleBar.settings": "Setting",
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
  "toast.indexCompleted": "Index completed: {{created}} created, {{updated}} updated",
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
  "toast.updateTagsFailed": "Failed to update tags",
  "toast.updateDominantColorFailed": "Failed to update dominant color",
  "toast.updateNameFailed": "Failed to update name",
  "toast.imageDeleted": "Image deleted",
  "toast.deleteImageFailed": "Failed to delete image",
  "toast.canvasDeleted": "Canvas deleted",
  "toast.deleteCanvasFailed": "Failed to delete canvas",
  "toast.vectorIndexed": "Vector indexed",
  "toast.vectorIndexFailed": "Failed to index vector",
  "toast.openFileFailed": "Failed to open file",
  "toast.shortcutInvalid": "Invalid shortcut",
  "toast.shortcutUpdateFailed": "Failed to update shortcut: {{error}}",
  "envInit.brandTitle": "PiCaptain",
  "envInit.heading": "Preparing PiCaptain...",
  "envInit.subheading": "First run may download tools, install dependencies, and fetch the local model. This is a one-time step.",
  "envInit.preparing": "Preparing...",
  "envInit.checkingUv": "Checking uv...",
  "envInit.downloadingUv": "Downloading uv...",
  "envInit.initializingPythonEnv": "Initializing Python environment...",
  "envInit.resolvingDependencies": "Resolving dependencies...",
  "envInit.downloadingPackages": "Downloading packages...",
  "envInit.installingPackages": "Installing packages...",
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
  "gallery.searchPlaceholder": "Search",
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
  "gallery.contextMenu.nameLabel": "Name",
  "gallery.contextMenu.imageNamePlaceholder": "Image name",
  "gallery.contextMenu.linkLabel": "Link",
  "gallery.contextMenu.tagsLabel": "Tags",
  "gallery.contextMenu.addTagPlaceholder": "Add tag...",
  "gallery.contextMenu.dominantColorLabel": "Dominant Color",
  "gallery.contextMenu.toneLabel": "Tone",
  "gallery.contextMenu.showInFolder": "Show in Folder",
  "gallery.contextMenu.indexVector": "Index Vector",
  "gallery.contextMenu.deleteImage": "Delete Image",
  "gallery.dominantColor.title": "Dominant Color",
  "gallery.empty.bodyLine1": "Your image collection starts here.",
  "gallery.empty.bodyLine2": "Drop or paste images to build your reference library.",
  "gallery.empty.dragHint": "Drag images here",
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
  "settings.llm.model": "Model"
};

// shared/i18n/locales/zh.ts
var zh = {
  "common.ok": "\u786E\u5B9A",
  "common.confirm": "\u786E\u8BA4",
  "common.cancel": "\u53D6\u6D88",
  "common.delete": "\u5220\u9664",
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
  "toast.indexCompleted": "\u7D22\u5F15\u5B8C\u6210\uFF1A\u65B0\u589E {{created}}\uFF0C\u66F4\u65B0 {{updated}}",
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
  "gallery.searchPlaceholder": "\u641C\u7D22",
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
  "gallery.empty.bodyLine2": "\u62D6\u653E\u56FE\u7247\u6765\u6307\u6325\u4F60\u7684\u5185\u5BB9\u3002",
  "gallery.empty.dragHint": "\u5C06\u56FE\u7247\u62D6\u5230\u8FD9\u91CC",
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
  "settings.llm.model": "\u6A21\u578B\u540D\u79F0"
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
var import_radash2 = require("radash");
if (!import_electron3.app.isPackaged) {
  import_electron3.app.setName("PiCaptain");
}
Object.assign(console, import_electron_log.default.functions);
import_electron_log.default.transports.file.level = "info";
import_electron_log.default.transports.file.maxSize = 5 * 1024 * 1024;
import_electron_log.default.transports.file.archiveLog = (file) => {
  const filePath = file.toString();
  const info = import_path5.default.parse(filePath);
  const dest = import_path5.default.join(info.dir, info.name + ".old" + info.ext);
  lockedFs.rename(filePath, dest).catch((e) => {
    console.warn("Could not rotate log", e);
  });
};
var mainWindow = null;
var isAppHidden = false;
var localeCache = null;
var DEFAULT_TOGGLE_WINDOW_SHORTCUT = process.platform === "darwin" ? "Command+L" : "Ctrl+L";
var toggleWindowShortcut = DEFAULT_TOGGLE_WINDOW_SHORTCUT;
var isSettingsOpen = false;
var isLocale = (value) => value === "en" || value === "zh";
async function getLocale() {
  try {
    const settingsPath = import_path5.default.join(getStorageDir(), "settings.json");
    const stat = await lockedFs.stat(settingsPath).catch(() => null);
    if (!stat) return "en";
    if (localeCache && localeCache.mtimeMs === stat.mtimeMs)
      return localeCache.locale;
    const settings = await lockedFs.readJson(settingsPath).catch(() => null);
    const raw = settings && typeof settings === "object" ? settings.language : void 0;
    const locale = isLocale(raw) ? raw : "en";
    localeCache = { locale, mtimeMs: stat.mtimeMs };
    return locale;
  } catch {
    return "en";
  }
}
async function loadShortcuts() {
  try {
    const settingsPath = import_path5.default.join(getStorageDir(), "settings.json");
    const settings = await lockedFs.readJson(settingsPath).catch(() => null);
    if (!settings || typeof settings !== "object") return;
    const rawToggle = settings.toggleWindowShortcut;
    if (typeof rawToggle === "string" && rawToggle.trim()) {
      toggleWindowShortcut = rawToggle.trim();
    }
  } catch {
  }
}
function loadMainWindow() {
  if (!mainWindow) return;
  if (!import_electron3.app.isPackaged) {
    import_electron_log.default.info("Loading renderer from localhost");
    void mainWindow.loadURL("http://localhost:5173");
  } else {
    const filePath = import_path5.default.join(__dirname, "../dist-renderer/index.html");
    import_electron_log.default.info("Loading renderer from file:", filePath);
    void mainWindow.loadFile(filePath);
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
  if (import_electron3.app.isPackaged) {
    import_electron_updater.autoUpdater.checkForUpdatesAndNotify();
  }
}
async function saveWindowBounds() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized() || mainWindow.isMaximized()) return;
  try {
    const bounds = mainWindow.getBounds();
    const settingsPath = import_path5.default.join(getStorageDir(), "settings.json");
    const settings = await lockedFs.readJson(settingsPath).catch(() => ({}));
    await lockedFs.writeJson(settingsPath, {
      ...settings,
      windowBounds: bounds
    });
  } catch (e) {
    import_electron_log.default.error("Failed to save window bounds", e);
  }
}
var debouncedSaveWindowBounds = (0, import_radash2.debounce)({ delay: 1e3 }, saveWindowBounds);
async function createWindow(options) {
  import_electron_log.default.info("Creating main window...");
  isAppHidden = false;
  const { width, height } = import_electron3.screen.getPrimaryDisplay().workAreaSize;
  let windowState = {};
  try {
    const settingsPath = import_path5.default.join(getStorageDir(), "settings.json");
    if (await lockedFs.pathExists(settingsPath)) {
      const settingsRaw = await lockedFs.readJson(settingsPath);
      if (settingsRaw && typeof settingsRaw === "object") {
        const settings = settingsRaw;
        if (settings.windowBounds) {
          windowState = settings.windowBounds;
        }
      }
    }
  } catch (e) {
    import_electron_log.default.error("Failed to load window bounds", e);
  }
  mainWindow = new import_electron3.BrowserWindow({
    width: windowState.width || Math.floor(width * 0.6),
    height: windowState.height || Math.floor(height * 0.8),
    x: windowState.x,
    y: windowState.y,
    icon: import_path5.default.join(__dirname, "../resources/icon.svg"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: import_path5.default.join(__dirname, "preload.cjs")
    },
    frame: false,
    transparent: false,
    backgroundColor: "#0a0a0a",
    alwaysOnTop: false,
    hasShadow: true
  });
  mainWindow.on("resize", debouncedSaveWindowBounds);
  mainWindow.on("move", debouncedSaveWindowBounds);
  mainWindow.webContents.on("did-finish-load", () => {
    import_electron_log.default.info("Renderer process finished loading");
  });
  if (!import_electron3.app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
  mainWindow.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription, validatedURL) => {
      import_electron_log.default.error(
        "Renderer process failed to load:",
        errorCode,
        errorDescription,
        validatedURL
      );
    }
  );
  mainWindow.webContents.on("render-process-gone", (event, details) => {
    import_electron_log.default.error("Renderer process gone:", details.reason, details.exitCode);
  });
  if ((options == null ? void 0 : options.load) !== false) {
    loadMainWindow();
  }
  setupAutoUpdater();
  import_electron3.ipcMain.on("window-min", () => mainWindow == null ? void 0 : mainWindow.minimize());
  import_electron3.ipcMain.on("window-max", () => {
    if (mainWindow == null ? void 0 : mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow == null ? void 0 : mainWindow.maximize();
    }
  });
  import_electron3.ipcMain.on("window-close", () => mainWindow == null ? void 0 : mainWindow.close());
  import_electron3.ipcMain.on("window-focus", () => mainWindow == null ? void 0 : mainWindow.focus());
  import_electron3.ipcMain.on(
    "set-window-bounds",
    (_event, bounds) => {
      if (!mainWindow) return;
      const current = mainWindow.getBounds();
      mainWindow.setBounds({
        x: bounds.x ?? current.x,
        y: bounds.y ?? current.y,
        width: bounds.width ?? current.width,
        height: bounds.height ?? current.height
      });
    }
  );
  import_electron3.ipcMain.on("log-message", (_event, level, ...args) => {
    if (typeof import_electron_log.default[level] === "function") {
      import_electron_log.default[level](...args);
    } else {
      import_electron_log.default.info(...args);
    }
  });
  import_electron3.ipcMain.handle("get-log-content", async () => {
    try {
      const logPath = import_electron_log.default.transports.file.getFile().path;
      if (await lockedFs.pathExists(logPath)) {
        const stats = await lockedFs.stat(logPath);
        const size = stats.size;
        const READ_SIZE = 50 * 1024;
        const start = Math.max(0, size - READ_SIZE);
        return await withFileLock(logPath, () => {
          return new Promise((resolve, reject) => {
            const stream = import_fs_extra4.default.createReadStream(logPath, {
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
  import_electron3.ipcMain.handle("open-external", async (_event, rawUrl) => {
    try {
      if (typeof rawUrl !== "string") {
        return { success: false, error: "Invalid URL" };
      }
      const url = new URL(rawUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { success: false, error: "Unsupported URL protocol" };
      }
      await import_electron3.shell.openExternal(url.toString());
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
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
    isAppHidden = false;
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.webContents.send("renderer-event", "app-visibility", true);
    mainWindow.focus();
    return;
  }
  if (isAppHidden) {
    isAppHidden = false;
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.webContents.send("renderer-event", "app-visibility", true);
    mainWindow.show();
    mainWindow.focus();
  } else {
    isAppHidden = true;
    mainWindow.setIgnoreMouseEvents(true, { forward: false });
    mainWindow.webContents.send("renderer-event", "app-visibility", false);
  }
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
      import_electron3.globalShortcut.unregister(prev);
    } else {
      import_electron3.globalShortcut.unregister(prev);
    }
    const ok = import_electron3.globalShortcut.register(next, handler);
    if (!ok) {
      if (prev !== next) {
        import_electron3.globalShortcut.unregister(next);
        import_electron3.globalShortcut.register(prev, handler);
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
      import_electron3.globalShortcut.unregister(next);
      import_electron3.globalShortcut.register(prev, handler);
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
  return import_path5.default.join(getStorageDir(), "model");
}
async function hasRequiredModelFiles(modelDir) {
  const hasConfig = await lockedFs.pathExists(
    import_path5.default.join(modelDir, "config.json")
  );
  const hasWeights = await lockedFs.pathExists(
    import_path5.default.join(modelDir, "model.safetensors")
  );
  const hasProcessor = await lockedFs.pathExists(
    import_path5.default.join(modelDir, "preprocessor_config.json")
  );
  const hasTokenizer = await lockedFs.pathExists(
    import_path5.default.join(modelDir, "tokenizer.json")
  );
  return hasConfig && hasWeights && hasProcessor && hasTokenizer;
}
function getUvCandidates() {
  var _a;
  const candidates = [];
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
function spawnUvPython(args, cwd, env) {
  const candidates = getUvCandidates();
  return new Promise((resolve, reject) => {
    const trySpawn = async (index) => {
      if (index >= candidates.length) {
        reject(new Error("uv not found"));
        return;
      }
      const command = candidates[index];
      if (import_path5.default.isAbsolute(command)) {
        const exists = await lockedFs.pathExists(command);
        if (!exists) {
          trySpawn(index + 1);
          return;
        }
      }
      const proc = (0, import_child_process2.spawn)(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        cwd,
        env
      });
      proc.once("error", (err) => {
        if (err.code === "ENOENT") {
          trySpawn(index + 1);
          return;
        }
        reject(err);
      });
      resolve(proc);
    };
    trySpawn(0);
  });
}
function getManagedUvPath() {
  return import_path5.default.join(
    import_electron3.app.getPath("userData"),
    "uv",
    process.platform === "win32" ? "uv.exe" : "uv"
  );
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
      const req = import_https2.default.get(u, (res) => {
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
function sendEnvInitProgress(parent, payload) {
  if (parent.isDestroyed()) return;
  parent.webContents.send("env-init-progress", payload);
}
function makeEnvInitReporter(parent) {
  return (statusKey, progress, statusParams) => {
    const normalized = Math.max(0, Math.min(1, progress));
    sendEnvInitProgress(parent, {
      isOpen: true,
      statusKey,
      statusParams,
      progress: normalized,
      percentText: `${Math.round(normalized * 100)}%`
    });
  };
}
function closeEnvInitProgress(parent) {
  if (parent.isDestroyed()) return;
  parent.webContents.send("env-init-progress", { isOpen: false });
}
function createStageReporter(report, start, end) {
  const span = Math.max(0, end - start);
  return (statusKey, progress, statusParams) => {
    const normalized = Math.max(0, Math.min(1, progress));
    report(statusKey, start + span * normalized, statusParams);
  };
}
var delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function ensureUvInstalled(onProgress) {
  const candidates = getUvCandidates();
  let existing = "";
  onProgress == null ? void 0 : onProgress("envInit.checkingUv", 0.08);
  for (const c of candidates) {
    if (import_path5.default.isAbsolute(c) && await lockedFs.pathExists(c)) {
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
  await lockedFs.ensureDir(import_path5.default.dirname(uvPath));
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
    await withFileLock(uvPath, () => import_fs_extra4.default.chmod(uvPath, 493));
  }
  process.env.PROREF_UV_PATH = uvPath;
  return uvPath;
}
function getUnpackedPath(originalPath) {
  if (import_electron3.app.isPackaged) {
    return originalPath.replace("app.asar", "app.asar.unpacked");
  }
  return originalPath;
}
async function preparePythonRuntime(parent, reportEnvInit) {
  const modelDir = getModelDir();
  process.env.PROREF_MODEL_DIR = modelDir;
  const scriptPath = getUnpackedPath(
    import_path5.default.join(__dirname, "../backend/python/tagger.py")
  );
  const pythonDir = import_path5.default.dirname(scriptPath);
  reportEnvInit("envInit.preparing", 0);
  console.log("Ensuring uv installation...");
  await ensureUvInstalled((statusKey, progress) => {
    reportEnvInit(statusKey, progress);
  });
  const venvPath = import_path5.default.join(pythonDir, ".venv");
  if (import_electron3.app.isPackaged && await lockedFs.pathExists(venvPath)) {
    console.log("Found pre-packaged python environment, skipping uv sync");
    reportEnvInit("envInit.pythonEnvReady", 1);
    await new Promise((resolve) => setTimeout(resolve, 200));
    return;
  }
  reportEnvInit("envInit.initializingPythonEnv", 0.42);
  const syncProc = await spawnUvPython(["sync", "--frozen"], pythonDir, {
    ...process.env,
    PROREF_MODEL_DIR: modelDir,
    UV_NO_COLOR: "1"
  });
  if (syncProc.stderr) {
    syncProc.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      const lower = text.toLowerCase();
      console.log({ text: lower });
      if (lower.includes("resolved")) {
        reportEnvInit("envInit.resolvingDependencies", 0.58);
        return;
      }
      if (lower.includes("downloading")) {
        reportEnvInit("envInit.downloadingPackages", 0.72);
        return;
      }
      if (lower.includes("installed") || lower.includes("installing") || lower.includes("prepared")) {
        reportEnvInit("envInit.installingPackages", 0.88);
        return;
      }
    });
  }
  const syncExit = await new Promise(
    (resolve) => syncProc.once("exit", resolve)
  );
  if (syncExit !== 0) {
    const locale = await getLocale();
    closeEnvInitProgress(parent);
    await import_electron3.dialog.showMessageBox(parent, {
      type: "error",
      title: t(locale, "dialog.pythonSetupFailedTitle"),
      message: t(locale, "dialog.pythonSetupFailedMessage"),
      detail: t(locale, "dialog.pythonSetupFailedDetail", {
        code: syncExit,
        dir: pythonDir
      })
    });
    throw new Error("Python setup failed");
  }
  reportEnvInit("envInit.verifyingEnvironment", 0.96);
  reportEnvInit("envInit.pythonEnvReady", 1);
}
async function ensureModelReady(parent, options = {}) {
  const { force = false, reportProgress } = options;
  const modelDir = getModelDir();
  process.env.PROREF_MODEL_DIR = modelDir;
  const debug = process.env.PROREF_DEBUG_MODEL === "1";
  if (debug) console.log("[model] dir:", modelDir);
  const modelMissing = !await hasRequiredModelFiles(modelDir);
  if (!force) {
    try {
      const settingsPath = import_path5.default.join(getStorageDir(), "settings.json");
      if (await lockedFs.pathExists(settingsPath)) {
        const settingsRaw = await lockedFs.readJson(settingsPath);
        if (settingsRaw && typeof settingsRaw === "object") {
          const settings = settingsRaw;
          if (!settings.enableVectorSearch) {
            if (debug)
              console.log(
                "[model] Vector search disabled, skipping model check"
              );
            return;
          }
        }
      } else {
        if (debug)
          console.log("[model] No settings file, skipping model check");
        return;
      }
    } catch (e) {
      console.error("[model] Failed to read settings:", e);
      if (!modelMissing) return;
    }
  }
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
  const scriptPath = getUnpackedPath(
    import_path5.default.join(__dirname, "../backend/python/tagger.py")
  );
  const pythonDir = import_path5.default.dirname(scriptPath);
  let percentText = "0%";
  let progress = 0;
  sendProgress("model.downloading", percentText, progress);
  const proc = await spawnUvPython(
    ["run", "python", scriptPath, "--download-model"],
    pythonDir,
    {
      ...process.env,
      PROREF_MODEL_DIR: modelDir
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
    await import_electron3.dialog.showMessageBox(parent, {
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
      force: true,
      reportProgress: reportModelInit
    });
    await delay(250);
  } finally {
    closeEnvInitProgress(parent);
  }
}
async function startServer2() {
  return startServer((channel, data) => {
    mainWindow == null ? void 0 : mainWindow.webContents.send(channel, data);
  });
}
import_electron3.ipcMain.handle("get-storage-dir", async () => {
  return getStorageDir();
});
import_electron3.ipcMain.handle("choose-storage-dir", async () => {
  const locale = await getLocale();
  const result = await import_electron3.dialog.showOpenDialog({
    title: t(locale, "dialog.chooseStorageFolderTitle"),
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  const dir = result.filePaths[0];
  await setStorageRoot(dir);
  import_electron3.app.relaunch();
  import_electron3.app.exit(0);
});
import_electron3.app.whenReady().then(async () => {
  import_electron_log.default.info("App starting...");
  import_electron_log.default.info("Log file location:", import_electron_log.default.transports.file.getFile().path);
  import_electron_log.default.info("App path:", import_electron3.app.getAppPath());
  import_electron_log.default.info("User data:", import_electron3.app.getPath("userData"));
  const taskLoadShortcuts = loadShortcuts();
  const taskCreateWindow = createWindow();
  const taskStartServer = startServer2();
  await Promise.all([taskLoadShortcuts, taskCreateWindow]);
  registerToggleWindowShortcut(toggleWindowShortcut);
  if (mainWindow) {
    try {
      await taskStartServer;
      import_electron_log.default.info("Ensuring startup initialization...");
      await ensureStartupInitialization(mainWindow);
      import_electron_log.default.info("Startup initialization ready.");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[startup] initialization failed:", message);
      import_electron_log.default.error("[startup] initialization failed:", message);
      import_electron3.app.quit();
      return;
    }
  }
  import_electron3.app.on("activate", () => {
    if (import_electron3.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
import_electron3.ipcMain.handle(
  "set-toggle-window-shortcut",
  async (_event, accelerator) => {
    return registerToggleWindowShortcut(accelerator);
  }
);
import_electron3.ipcMain.on("settings-open-changed", (_event, open) => {
  isSettingsOpen = Boolean(open);
});
import_electron3.app.on("will-quit", () => {
  import_electron3.globalShortcut.unregisterAll();
});
import_electron3.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") import_electron3.app.quit();
});
