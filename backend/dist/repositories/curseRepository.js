"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCurseForUser = exports.insertCurseForUser = exports.getCursesByUserGuid = exports.isAdminUserByGuid = void 0;
const db_1 = __importDefault(require("../db"));
const SELECT_CURSE_FIELDS = `
  id,
  userguid::text AS userguid,
  name,
  description,
  effectto AS "effectTo",
  effectto2 AS "effectTo2",
  damage,
  COALESCE(damage2, 0) AS damage2,
  lastfor AS "lastFor",
  imageid AS "imageId",
  soundid AS "soundId",
  ispublic AS "isPublic",
  createdat::text AS "createdAt",
  updatedat::text AS "updatedAt"
`;
const isAdminUserByGuid = async (userguid) => {
    const { rows } = await db_1.default.query('SELECT isadmin FROM users WHERE key = $1', [userguid]);
    return rows[0]?.isadmin === true;
};
exports.isAdminUserByGuid = isAdminUserByGuid;
const getCursesByUserGuid = async (userguid) => {
    const { rows } = await db_1.default.query(`SELECT ${SELECT_CURSE_FIELDS}
     FROM curses
     WHERE userguid = $1
     ORDER BY LOWER(name) ASC, id ASC`, [userguid]);
    return rows;
};
exports.getCursesByUserGuid = getCursesByUserGuid;
const insertCurseForUser = async (userguid, payload) => {
    const { rows } = await db_1.default.query(`INSERT INTO curses
       (userguid, name, description, effectto, effectto2, damage, damage2, lastfor, imageid, soundid, ispublic)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${SELECT_CURSE_FIELDS}`, [
        userguid,
        payload.name,
        payload.description,
        payload.effectTo,
        payload.effectTo2,
        payload.damage,
        payload.damage2,
        payload.lastFor,
        payload.imageId,
        payload.soundId,
        payload.isPublic,
    ]);
    return rows[0];
};
exports.insertCurseForUser = insertCurseForUser;
const updateCurseForUser = async (id, userguid, payload) => {
    const { rows } = await db_1.default.query(`UPDATE curses
     SET name = $1,
         description = $2,
         effectto = $3,
         effectto2 = $4,
         damage = $5,
         damage2 = $6,
         lastfor = $7,
         imageid = $8,
         soundid = $9,
         ispublic = $10,
         updatedat = NOW()
     WHERE id = $11 AND userguid = $12
     RETURNING ${SELECT_CURSE_FIELDS}`, [
        payload.name,
        payload.description,
        payload.effectTo,
        payload.effectTo2,
        payload.damage,
        payload.damage2,
        payload.lastFor,
        payload.imageId,
        payload.soundId,
        payload.isPublic,
        id,
        userguid,
    ]);
    return rows[0] ?? null;
};
exports.updateCurseForUser = updateCurseForUser;
