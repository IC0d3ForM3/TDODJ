"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSoundForUser = exports.checkSoundInUse = exports.updateSoundForUser = exports.insertSoundForUser = exports.isSoundAccessibleByIdForUser = exports.getSoundsByIds = exports.getAllSoundsWithUsername = exports.getSoundLibraryByUserGuid = exports.getSoundsByUserGuid = exports.isAdminUserByGuid = void 0;
const db_1 = __importDefault(require("../db"));
const isAdminUserByGuid = async (userguid) => {
    const { rows } = await db_1.default.query('SELECT isadmin FROM users WHERE key = $1', [userguid]);
    if (!rows[0]) {
        return false;
    }
    return rows[0].isadmin === true;
};
exports.isAdminUserByGuid = isAdminUserByGuid;
const getSoundsByUserGuid = async (userguid) => {
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
     FROM sounds
     WHERE userguid = $1
     ORDER BY updatedat DESC, id DESC`, [userguid]);
    return rows;
};
exports.getSoundsByUserGuid = getSoundsByUserGuid;
const getSoundLibraryByUserGuid = async (userguid) => {
    const { rows } = await db_1.default.query(`SELECT
       s.id,
       s.userguid::text AS userguid,
       s.path,
       s.ispublic AS "isPublic",
       s.isactive AS "isActive",
       s.name,
       s.assettype::text AS assettype,
       s.createdat::text AS "createdAt",
       s.updatedat::text AS "updatedAt",
       COALESCE(u.username, '') AS username
     FROM sounds s
     LEFT JOIN users u ON u.key::text = s.userguid::text
     WHERE (s.userguid = $1 OR s.ispublic = true) AND s.isactive = true
     ORDER BY
       CASE WHEN s.userguid = $1 THEN 0 ELSE 1 END,
       s.updatedat DESC,
       s.id DESC`, [userguid]);
    return rows;
};
exports.getSoundLibraryByUserGuid = getSoundLibraryByUserGuid;
const getAllSoundsWithUsername = async () => {
    const { rows } = await db_1.default.query(`SELECT
       s.id,
       s.userguid::text AS userguid,
       s.path,
       s.ispublic AS "isPublic",
       s.isactive AS "isActive",
       s.name,
       s.assettype::text AS assettype,
       s.createdat::text AS "createdAt",
       s.updatedat::text AS "updatedAt",
       COALESCE(u.username, '') AS username
     FROM sounds s
     LEFT JOIN users u ON u.key::text = s.userguid::text
     WHERE s.isactive = true
     ORDER BY u.username ASC, s.updatedat DESC, s.id DESC`);
    return rows;
};
exports.getAllSoundsWithUsername = getAllSoundsWithUsername;
const getSoundsByIds = async (ids) => {
    if (ids.length === 0) {
        return [];
    }
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
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
     FROM sounds
     WHERE id IN (${placeholders})`, ids);
    return rows;
};
exports.getSoundsByIds = getSoundsByIds;
const isSoundAccessibleByIdForUser = async (soundId, userguid) => {
    const { rows } = await db_1.default.query(`SELECT id
     FROM sounds
     WHERE id = $1
       AND (userguid = $2 OR ispublic = true)
     LIMIT 1`, [soundId, userguid]);
    return rows.length > 0;
};
exports.isSoundAccessibleByIdForUser = isSoundAccessibleByIdForUser;
const insertSoundForUser = async (userguid, payload) => {
    const { rows } = await db_1.default.query(`INSERT INTO sounds (
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
exports.insertSoundForUser = insertSoundForUser;
const updateSoundForUser = async (id, userguid, payload) => {
    const { rows } = await db_1.default.query(`UPDATE sounds
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
exports.updateSoundForUser = updateSoundForUser;
const checkSoundInUse = async (id) => {
    const results = await Promise.all([
        db_1.default.query('SELECT 1 FROM monsters WHERE soundid = $1 LIMIT 1', [id]),
        db_1.default.query('SELECT 1 FROM spells WHERE soundid = $1 LIMIT 1', [id]),
        db_1.default.query('SELECT 1 FROM curses WHERE soundid = $1 LIMIT 1', [id]),
        db_1.default.query('SELECT 1 FROM potions WHERE soundid = $1 LIMIT 1', [id]),
        db_1.default.query('SELECT 1 FROM items WHERE soundid = $1 LIMIT 1', [id]),
        db_1.default.query('SELECT 1 FROM treshers WHERE soundid = $1 LIMIT 1', [id]),
    ]);
    return results.some((r) => r.rows.length > 0);
};
exports.checkSoundInUse = checkSoundInUse;
const deleteSoundForUser = async (id, userguid) => {
    const { rowCount } = await db_1.default.query('DELETE FROM sounds WHERE id = $1 AND userguid = $2', [id, userguid]);
    return (rowCount ?? 0) > 0;
};
exports.deleteSoundForUser = deleteSoundForUser;
