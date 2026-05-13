"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSoundForUser = exports.insertSoundForUser = exports.isSoundAccessibleByIdForUser = exports.getSoundsByIds = exports.getSoundLibraryByUserGuid = exports.getSoundsByUserGuid = exports.isAdminUserByGuid = void 0;
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
       id,
       userguid::text AS userguid,
       path,
       ispublic AS "isPublic",
       isactive AS "isActive",
       name,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM sounds
     WHERE (userguid = $1 OR ispublic = true) AND isactive = true
     ORDER BY
       CASE WHEN userguid = $1 THEN 0 ELSE 1 END,
       updatedat DESC,
       id DESC`, [userguid]);
    return rows;
};
exports.getSoundLibraryByUserGuid = getSoundLibraryByUserGuid;
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
       updatedat
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       NOW()
     )
     RETURNING
       id,
       userguid::text AS userguid,
       path,
       ispublic AS "isPublic",
       isactive AS "isActive",
       name,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"`, [userguid, payload.path, payload.isPublic, payload.isActive, payload.name]);
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
       updatedat = NOW()
     WHERE id = $1 AND userguid = $2
     RETURNING
       id,
       userguid::text AS userguid,
       path,
       ispublic AS "isPublic",
       isactive AS "isActive",
       name,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"`, [id, userguid, payload.path, payload.isPublic, payload.isActive, payload.name]);
    return rows[0] ?? null;
};
exports.updateSoundForUser = updateSoundForUser;
