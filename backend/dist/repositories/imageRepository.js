"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateImageForUser = exports.insertImageForUser = exports.isImageAccessibleByIdForUser = exports.getImageLibraryByUserGuid = exports.getImagesByUserGuid = exports.isAdminUserByGuid = void 0;
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
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM images
     WHERE userguid = $1
     ORDER BY updatedat DESC, id DESC`, [userguid]);
    return rows;
};
exports.getImagesByUserGuid = getImagesByUserGuid;
const getImageLibraryByUserGuid = async (userguid) => {
    const { rows } = await db_1.default.query(`SELECT
       id,
       userguid::text AS userguid,
       path,
       ispublic AS "isPublic",
       isactive AS "isActive",
       name,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM images
     WHERE (userguid = $1 OR ispublic = true) AND isactive = true
     ORDER BY
       CASE WHEN userguid = $1 THEN 0 ELSE 1 END,
       updatedat DESC,
       id DESC`, [userguid]);
    return rows;
};
exports.getImageLibraryByUserGuid = getImageLibraryByUserGuid;
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
exports.insertImageForUser = insertImageForUser;
const updateImageForUser = async (id, userguid, payload) => {
    const { rows } = await db_1.default.query(`UPDATE images
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
exports.updateImageForUser = updateImageForUser;
