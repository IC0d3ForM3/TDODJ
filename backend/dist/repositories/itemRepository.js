"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicItemsByNames = exports.getItemsByIds = exports.updateItemForUser = exports.insertItemForUser = exports.getAllItemsWithUsername = exports.getItemsLibraryByUserGuid = exports.getItemsByUserGuid = exports.isAdminUserByGuid = void 0;
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
  effecttopc AS "effectToPc",
  COALESCE(effecttopcvalue, 0) AS "effectToPcValue",
  COALESCE(weaponeffecttype, 'Blood') AS "weaponEffectType",
  COALESCE(weaponeffectcolor, '#cc0000') AS "weaponEffectColor",
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
const getItemsLibraryByUserGuid = async (userguid) => {
    const { rows } = await db_1.default.query(`SELECT ${SELECT_ITEM_FIELDS}
     FROM items
     WHERE userguid = $1 OR ispublic = true
     ORDER BY LOWER(name) ASC, id ASC`, [userguid]);
    return rows;
};
exports.getItemsLibraryByUserGuid = getItemsLibraryByUserGuid;
const getAllItemsWithUsername = async () => {
    const { rows } = await db_1.default.query(`SELECT i.id, i.userguid::text AS userguid, i.name, i.description, i.type,
       COALESCE(NULLIF(i.range, '')::int, 0) AS range,
       i.value, i.weight, i.curseid AS "curseId",
       COALESCE(i.effectvalue, 0) AS "effectValue", COALESCE(i.damage, 0) AS "damage",
       i.armorslot AS "armorSlot", i.effecton AS "effectOn",
       i.effecttopc AS "effectToPc", COALESCE(i.effecttopcvalue, 0) AS "effectToPcValue",
       COALESCE(i.weaponeffecttype, 'Blood') AS "weaponEffectType",
       COALESCE(i.weaponeffectcolor, '#cc0000') AS "weaponEffectColor",
       i.imageid AS "imageId", i.soundid AS "soundId",
       i.ispublic AS "isPublic",
       COALESCE(i.istwohanded, false) AS "isTwoHanded",
       i.createdat::text AS "createdAt", i.updatedat::text AS "updatedAt",
       COALESCE(u.username, '') AS username
     FROM items i
     LEFT JOIN users u ON u.key::text = i.userguid::text
     ORDER BY LOWER(i.name) ASC, i.id ASC`);
    return rows;
};
exports.getAllItemsWithUsername = getAllItemsWithUsername;
const insertItemForUser = async (userguid, payload) => {
    const { rows } = await db_1.default.query(`INSERT INTO items
       (userguid, name, description, type, range, value, weight, curseid,
        effectvalue, damage, armorslot, effecton, effecttopc, effecttopcvalue, weaponeffecttype, weaponeffectcolor, imageid, soundid, ispublic, istwohanded)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
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
        payload.effectToPc,
        payload.effectToPcValue,
        payload.weaponEffectType,
        payload.weaponEffectColor,
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
         effecttopc = $12,
         effecttopcvalue = $13,
         weaponeffecttype = $14,
         weaponeffectcolor = $15,
         imageid = $16,
         soundid = $17,
         ispublic = $18,
         istwohanded = $19,
         updatedat = NOW()
       WHERE id = $20 AND userguid = $21
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
        payload.effectToPc,
        payload.effectToPcValue,
        payload.weaponEffectType,
        payload.weaponEffectColor,
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
