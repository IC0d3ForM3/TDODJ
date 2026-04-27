"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicItemsByNames = exports.getItemsByIds = exports.updateItemForUser = exports.insertItemForUser = exports.getItemsByUserGuid = exports.isAdminUserByGuid = void 0;
const db_1 = __importDefault(require("../db"));
const SELECT_ITEM_FIELDS = `
  id,
  userguid::text AS userguid,
  name,
  description,
  type,
  COALESCE(NULLIF(range, '')::int, 0) AS range,
  value,
  weight,
  curseid AS "curseId",
  COALESCE(effectvalue, 0) AS "effectValue",
  COALESCE(damage, 0) AS "damage",
  armorslot AS "armorSlot",
  effecton AS "effectOn",
  imageid AS "imageId",
  soundid AS "soundId",
  ispublic AS "isPublic",
  COALESCE(istwohanded, false) AS "isTwoHanded",
  createdat::text AS "createdAt",
  updatedat::text AS "updatedAt"
`;
const isAdminUserByGuid = async (userguid) => {
    const { rows } = await db_1.default.query('SELECT isadmin FROM users WHERE key = $1', [userguid]);
    return rows[0]?.isadmin === true;
};
exports.isAdminUserByGuid = isAdminUserByGuid;
const getItemsByUserGuid = async (userguid) => {
    const { rows } = await db_1.default.query(`SELECT ${SELECT_ITEM_FIELDS}
     FROM items
     WHERE userguid = $1
     ORDER BY LOWER(name) ASC, id ASC`, [userguid]);
    return rows;
};
exports.getItemsByUserGuid = getItemsByUserGuid;
const insertItemForUser = async (userguid, payload) => {
    const { rows } = await db_1.default.query(`INSERT INTO items
       (userguid, name, description, type, range, value, weight, curseid,
        effectvalue, damage, armorslot, effecton, imageid, soundid, ispublic, istwohanded)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING ${SELECT_ITEM_FIELDS}`, [
        userguid,
        payload.name,
        payload.description,
        payload.type,
        payload.range,
        payload.value,
        payload.weight,
        payload.curseId,
        payload.effectValue,
        payload.damage,
        payload.armorSlot,
        payload.effectOn,
        payload.imageId,
        payload.soundId,
        payload.isPublic,
        payload.isTwoHanded,
    ]);
    return rows[0];
};
exports.insertItemForUser = insertItemForUser;
const updateItemForUser = async (id, userguid, payload) => {
    const { rows } = await db_1.default.query(`UPDATE items
     SET name = $1,
         description = $2,
         type = $3,
         range = $4,
         value = $5,
         weight = $6,
         curseid = $7,
         effectvalue = $8,
         damage = $9,
         armorslot = $10,
         effecton = $11,
         imageid = $12,
         soundid = $13,
         ispublic = $14,
         istwohanded = $15,
         updatedat = NOW()
     WHERE id = $16 AND userguid = $17
     RETURNING ${SELECT_ITEM_FIELDS}`, [
        payload.name,
        payload.description,
        payload.type,
        payload.range,
        payload.value,
        payload.weight,
        payload.curseId,
        payload.effectValue,
        payload.damage,
        payload.armorSlot,
        payload.effectOn,
        payload.imageId,
        payload.soundId,
        payload.isPublic,
        payload.isTwoHanded,
        id,
        userguid,
    ]);
    return rows[0] ?? null;
};
exports.updateItemForUser = updateItemForUser;
const getItemsByIds = async (ids) => {
    if (ids.length === 0) {
        return [];
    }
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db_1.default.query(`SELECT ${SELECT_ITEM_FIELDS}
     FROM items
     WHERE id IN (${placeholders})`, ids);
    return rows;
};
exports.getItemsByIds = getItemsByIds;
/** Look up public items by exact name and return their id + name. */
const getPublicItemsByNames = async (names) => {
    if (names.length === 0)
        return [];
    const placeholders = names.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db_1.default.query(`SELECT id, name FROM items WHERE ispublic = TRUE AND name IN (${placeholders})`, names);
    return rows;
};
exports.getPublicItemsByNames = getPublicItemsByNames;
