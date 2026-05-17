"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePotionForUser = exports.insertPotionForUser = exports.getPublicPotionsByNames = exports.getPotionsByIds = exports.getAllPotionsWithUsername = exports.getPotionsByUserGuid = exports.isAdminUserByGuid = void 0;
const db_1 = __importDefault(require("../db"));
const SELECT_POTION_FIELDS = `
  id,
  userguid::text AS userguid,
  name,
  description,
  effectto AS "effectTo",
  effectto2 AS "effectTo2",
  effecttime AS "lastFor",
  effectnumber AS "effectAmount",
  COALESCE(effectamount2, 0) AS "effectAmount2",
  value,
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
const getPotionsByUserGuid = async (userguid) => {
    const { rows } = await db_1.default.query(`SELECT ${SELECT_POTION_FIELDS}
     FROM potions
     WHERE userguid = $1
     ORDER BY LOWER(name) ASC, id ASC`, [userguid]);
    return rows;
};
exports.getPotionsByUserGuid = getPotionsByUserGuid;
const getAllPotionsWithUsername = async () => {
    const { rows } = await db_1.default.query(`SELECT p.id, p.userguid::text AS userguid, p.name, p.description,
       p.effectto AS "effectTo", p.effectto2 AS "effectTo2",
       p.effecttime AS "lastFor", p.effectnumber AS "effectAmount",
       COALESCE(p.effectamount2, 0) AS "effectAmount2",
       p.value, p.imageid AS "imageId", p.soundid AS "soundId",
       p.ispublic AS "isPublic",
       p.createdat::text AS "createdAt", p.updatedat::text AS "updatedAt",
       COALESCE(u.username, '') AS username
     FROM potions p
     LEFT JOIN users u ON u.key::text = p.userguid::text
     ORDER BY LOWER(p.name) ASC, p.id ASC`);
    return rows;
};
exports.getAllPotionsWithUsername = getAllPotionsWithUsername;
const getPotionsByIds = async (ids) => {
    if (ids.length === 0)
        return [];
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db_1.default.query(`SELECT ${SELECT_POTION_FIELDS}
     FROM potions
     WHERE id IN (${placeholders})`, ids);
    return rows;
};
exports.getPotionsByIds = getPotionsByIds;
/** Look up public potions by exact name and return their id + name. */
const getPublicPotionsByNames = async (names) => {
    if (names.length === 0)
        return [];
    const placeholders = names.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db_1.default.query(`SELECT id, name FROM potions WHERE ispublic = TRUE AND name IN (${placeholders})`, names);
    return rows;
};
exports.getPublicPotionsByNames = getPublicPotionsByNames;
const insertPotionForUser = async (userguid, payload) => {
    const { rows } = await db_1.default.query(`INSERT INTO potions
       (userguid, name, description, effectto, effectto2, effecttime, effectnumber,
        effectamount2, value, imageid, soundid, ispublic)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING ${SELECT_POTION_FIELDS}`, [
        userguid,
        payload.name,
        payload.description,
        payload.effectTo,
        payload.effectTo2,
        payload.lastFor,
        payload.effectAmount,
        payload.effectAmount2,
        payload.value,
        payload.imageId,
        payload.soundId,
        payload.isPublic,
    ]);
    return rows[0];
};
exports.insertPotionForUser = insertPotionForUser;
const updatePotionForUser = async (id, userguid, payload) => {
    const { rows } = await db_1.default.query(`UPDATE potions
     SET
       name = $3,
       description = $4,
       effectto = $5,
       effectto2 = $6,
       effecttime = $7,
       effectnumber = $8,
       effectamount2 = $9,
       value = $10,
       imageid = $11,
       soundid = $12,
       ispublic = $13,
       updatedat = NOW()
     WHERE id = $1 AND userguid = $2
     RETURNING ${SELECT_POTION_FIELDS}`, [
        id,
        userguid,
        payload.name,
        payload.description,
        payload.effectTo,
        payload.effectTo2,
        payload.lastFor,
        payload.effectAmount,
        payload.effectAmount2,
        payload.value,
        payload.imageId,
        payload.soundId,
        payload.isPublic,
    ]);
    return rows[0] ?? null;
};
exports.updatePotionForUser = updatePotionForUser;
