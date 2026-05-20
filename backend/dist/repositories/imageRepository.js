"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteImageForUser = exports.checkImageInUse = exports.getPublicImagesByIds = exports.getImagesByIds = exports.updateImageForUser = exports.insertImageForUser = exports.isImageAccessibleByIdForUser = exports.getAllImagesWithUsername = exports.getImageLibraryByUserGuid = exports.getImagesByUserGuid = exports.isAdminUserByGuid = void 0;
const db_1 = __importDefault(require("../db"));
const isAdminUserByGuid = async (userguid) => {
    const { rows } = await db_1.default.query('SELECT isadmin FROM users WHERE key = $1', [userguid]);
    if (!rows[0]) {
        return false;
    }
    return rows[0].isadmin === true;
};
exports.isAdminUserByGuid = isAdminUserByGuid;
const getImagesByUserGuid = async (userguid) => {
    const { rows } = await db_1.default.query(`SELECT
       id,
       userguid::text AS userguid,
       path,
       ispublic AS "isPublic",
       isactive AS "isActive",
       name,
       assettype::text AS assettype,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM images
     WHERE userguid = $1
     ORDER BY LOWER(name) ASC, id ASC`, [userguid]);
    return rows;
};
exports.getImagesByUserGuid = getImagesByUserGuid;
const getImageLibraryByUserGuid = async (userguid) => {
    const { rows } = await db_1.default.query(`SELECT
       i.id,
       i.userguid::text AS userguid,
       i.path,
       i.ispublic AS "isPublic",
       i.isactive AS "isActive",
       i.name,
       i.assettype::text AS assettype,
       i.createdat::text AS "createdAt",
       i.updatedat::text AS "updatedAt",
       COALESCE(u.username, '') AS username
     FROM images i
     LEFT JOIN users u ON u.key::text = i.userguid::text
     WHERE (i.userguid = $1 OR i.ispublic = true) AND i.isactive = true
     ORDER BY LOWER(i.name) ASC, i.id ASC`, [userguid]);
    return rows;
};
exports.getImageLibraryByUserGuid = getImageLibraryByUserGuid;
const getAllImagesWithUsername = async () => {
    const { rows } = await db_1.default.query(`SELECT
       i.id,
       i.userguid::text AS userguid,
       i.path,
       i.ispublic AS "isPublic",
       i.isactive AS "isActive",
       i.name,
       i.assettype::text AS assettype,
       i.createdat::text AS "createdAt",
       i.updatedat::text AS "updatedAt",
       COALESCE(u.username, '') AS username
     FROM images i
     LEFT JOIN users u ON u.key::text = i.userguid::text
     WHERE i.isactive = true
      ORDER BY LOWER(i.name) ASC, i.id ASC`);
    return rows;
};
exports.getAllImagesWithUsername = getAllImagesWithUsername;
const isImageAccessibleByIdForUser = async (imageId, userguid) => {
    const { rows } = await db_1.default.query(`SELECT id
     FROM images
     WHERE id = $1
       AND (userguid = $2 OR ispublic = true)
     LIMIT 1`, [imageId, userguid]);
    return rows.length > 0;
};
exports.isImageAccessibleByIdForUser = isImageAccessibleByIdForUser;
const insertImageForUser = async (userguid, payload) => {
    const { rows } = await db_1.default.query(`INSERT INTO images (
       userguid,
       path,
       ispublic,
       isactive,
       name,
       assettype,
       updatedat
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       $6,
       NOW()
     )
     RETURNING
       id,
       userguid::text AS userguid,
       path,
       ispublic AS "isPublic",
       isactive AS "isActive",
       name,
       assettype::text AS assettype,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"`, [userguid, payload.path, payload.isPublic, payload.isActive, payload.name, payload.assettype]);
    return rows[0];
};
exports.insertImageForUser = insertImageForUser;
const updateImageForUser = async (id, userguid, payload) => {
    const { rows } = await db_1.default.query(`UPDATE images
     SET
       path = $3,
       ispublic = $4,
       isactive = $5,
       name = $6,
       assettype = $7,
       updatedat = NOW()
     WHERE id = $1 AND userguid = $2
     RETURNING
       id,
       userguid::text AS userguid,
       path,
       ispublic AS "isPublic",
       isactive AS "isActive",
       name,
       assettype::text AS assettype,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"`, [id, userguid, payload.path, payload.isPublic, payload.isActive, payload.name, payload.assettype]);
    return rows[0] ?? null;
};
exports.updateImageForUser = updateImageForUser;
const getImagesByIds = async (ids) => {
    if (ids.length === 0) {
        return [];
    }
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db_1.default.query(`SELECT
       id,
       userguid::text AS userguid,
       path,
       ispublic AS "isPublic",
       isactive AS "isActive",
       name,
       assettype::text AS assettype,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM images
     WHERE id IN (${placeholders})`, ids);
    return rows;
};
exports.getImagesByIds = getImagesByIds;
const getPublicImagesByIds = async (ids) => {
    if (ids.length === 0) {
        return [];
    }
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db_1.default.query(`SELECT
       id,
       userguid::text AS userguid,
       path,
       ispublic AS "isPublic",
       isactive AS "isActive",
       name,
       assettype::text AS assettype,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM images
     WHERE id IN (${placeholders}) AND ispublic = true AND isactive = true`, ids);
    return rows;
};
exports.getPublicImagesByIds = getPublicImagesByIds;
const checkImageInUse = async (id) => {
    const results = await Promise.all([
        db_1.default.query('SELECT 1 FROM monsters WHERE imageid = $1 LIMIT 1', [id]),
        db_1.default.query('SELECT 1 FROM spells WHERE imageid = $1 LIMIT 1', [id]),
        db_1.default.query('SELECT 1 FROM curses WHERE imageid = $1 LIMIT 1', [id]),
        db_1.default.query('SELECT 1 FROM potions WHERE imageid = $1 LIMIT 1', [id]),
        db_1.default.query('SELECT 1 FROM items WHERE imageid = $1 LIMIT 1', [id]),
        db_1.default.query('SELECT 1 FROM treshers WHERE imageid = $1 LIMIT 1', [id]),
        db_1.default.query('SELECT 1 FROM dungons WHERE imageid = $1 LIMIT 1', [id]),
        db_1.default.query('SELECT 1 FROM pcs WHERE imageid = $1 LIMIT 1', [id]),
    ]);
    return results.some((r) => r.rows.length > 0);
};
exports.checkImageInUse = checkImageInUse;
const deleteImageForUser = async (id, userguid) => {
    const { rowCount } = await db_1.default.query('DELETE FROM images WHERE id = $1 AND userguid = $2', [id, userguid]);
    return (rowCount ?? 0) > 0;
};
exports.deleteImageForUser = deleteImageForUser;
