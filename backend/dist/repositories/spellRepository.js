"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSpellForUser = exports.insertSpellForUser = exports.getAllSpellsWithUsername = exports.getSpellsByUserGuid = exports.isAdminUserByGuid = exports.getPublicSpellsByNames = exports.fetchSpellsByIds = void 0;
const db_1 = __importDefault(require("../db"));
const SELECT_SPELL_FIELDS = `
  id,
  userguid::text AS userguid,
  name,
  description,
  COALESCE(range1, range, 0) AS range,
  effecton AS "effectOn",
  COALESCE(effecton2, '') AS "effectOn2",
  COALESCE(lastfor1, lastfor, 0) AS "lastFor",
  damage AS "effectAmount",
  COALESCE(effectamount2, 0) AS "effectAmount2",
  COALESCE(value, 0) AS value,
  COALESCE(sp, 0) AS sp,
  COALESCE(successtestvalue, 0) AS "successTestValue",
  COALESCE(magiccost, 1) AS "magicCost",
  COALESCE(costtolearn, 0) AS "costToLearn",
  imageid AS "imageId",
  soundid AS "soundId",
  ispublic AS "isPublic",
  COALESCE(numberoftargets, 1) AS "numberOfTargets",
  COALESCE(effecttype, 'Other') AS "effectType",
  COALESCE(effectcolor, '#ffffff') AS "effectColor",
  COALESCE(effectonpc1, FALSE) AS "effectOnPc1",
  COALESCE(effectonpc2, FALSE) AS "effectOnPc2",
  COALESCE(range1, range, 0) AS "range1",
  COALESCE(range2, range, 0) AS "range2",
  COALESCE(lastfor1, lastfor, 0) AS "lastFor1",
  COALESCE(lastfor2, lastfor, 0) AS "lastFor2",
  createdat::text AS "createdAt",
  updatedat::text AS "updatedAt"
`;
const fetchSpellsByIds = async (ids) => {
    if (ids.length === 0)
        return [];
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db_1.default.query(`SELECT ${SELECT_SPELL_FIELDS} FROM spells WHERE id IN (${placeholders})`, ids);
    return rows;
};
exports.fetchSpellsByIds = fetchSpellsByIds;
/** Look up public spells by exact name and return their id + name. */
const getPublicSpellsByNames = async (names) => {
    if (names.length === 0)
        return [];
    const placeholders = names.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db_1.default.query(`SELECT id, name FROM spells WHERE ispublic = TRUE AND name IN (${placeholders})`, names);
    return rows;
};
exports.getPublicSpellsByNames = getPublicSpellsByNames;
const isAdminUserByGuid = async (userguid) => {
    const { rows } = await db_1.default.query('SELECT isadmin FROM users WHERE key = $1', [userguid]);
    return rows[0]?.isadmin === true;
};
exports.isAdminUserByGuid = isAdminUserByGuid;
const getSpellsByUserGuid = async (userguid) => {
    const { rows } = await db_1.default.query(`SELECT ${SELECT_SPELL_FIELDS}
     FROM spells
     WHERE userguid = $1
     ORDER BY LOWER(name) ASC, id ASC`, [userguid]);
    return rows;
};
exports.getSpellsByUserGuid = getSpellsByUserGuid;
const getAllSpellsWithUsername = async () => {
    const { rows } = await db_1.default.query(`SELECT s.id, s.userguid::text AS userguid, s.name, s.description,
       COALESCE(s.range1, s.range, 0) AS range,
       s.effecton AS "effectOn", COALESCE(s.effecton2, '') AS "effectOn2",
       COALESCE(s.lastfor1, s.lastfor, 0) AS "lastFor",
       s.damage AS "effectAmount", COALESCE(s.effectamount2, 0) AS "effectAmount2",
       COALESCE(s.value, 0) AS value, COALESCE(s.sp, 0) AS sp,
       COALESCE(s.successtestvalue, 0) AS "successTestValue",
       COALESCE(s.magiccost, 1) AS "magicCost", COALESCE(s.costtolearn, 0) AS "costToLearn",
       s.imageid AS "imageId", s.soundid AS "soundId",
       s.ispublic AS "isPublic",
       COALESCE(s.numberoftargets, 1) AS "numberOfTargets",
       COALESCE(s.effecttype, 'Other') AS "effectType",
       COALESCE(s.effectcolor, '#ffffff') AS "effectColor",
       COALESCE(s.effectonpc1, FALSE) AS "effectOnPc1",
       COALESCE(s.effectonpc2, FALSE) AS "effectOnPc2",
       COALESCE(s.range1, s.range, 0) AS "range1",
       COALESCE(s.range2, s.range, 0) AS "range2",
       COALESCE(s.lastfor1, s.lastfor, 0) AS "lastFor1",
       COALESCE(s.lastfor2, s.lastfor, 0) AS "lastFor2",
       s.createdat::text AS "createdAt", s.updatedat::text AS "updatedAt",
       COALESCE(u.username, '') AS username
     FROM spells s
     LEFT JOIN users u ON u.key::text = s.userguid::text
     ORDER BY LOWER(s.name) ASC, s.id ASC`);
    return rows;
};
exports.getAllSpellsWithUsername = getAllSpellsWithUsername;
const insertSpellForUser = async (userguid, payload) => {
    const { rows } = await db_1.default.query(`INSERT INTO spells
       (userguid, name, description, range, effecton, effecton2, lastfor, damage,
        effectamount2, effectto, value, sp, successtestvalue, magiccost, costtolearn, imageid, soundid, ispublic, numberoftargets, effecttype, effectcolor,
        effectonpc1, effectonpc2, range1, range2, lastfor1, lastfor2)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
     RETURNING ${SELECT_SPELL_FIELDS}`, [
        userguid,
        payload.name,
        payload.description,
        payload.range,
        payload.effectOn,
        payload.effectOn2,
        payload.lastFor,
        payload.effectAmount,
        payload.effectAmount2,
        '',
        payload.value,
        payload.sp,
        payload.successTestValue,
        payload.magicCost,
        payload.costToLearn,
        payload.imageId,
        payload.soundId,
        payload.isPublic,
        payload.numberOfTargets,
        payload.effectType,
        payload.effectColor,
        payload.effectOnPc1,
        payload.effectOnPc2,
        payload.range1,
        payload.range2,
        payload.lastFor1,
        payload.lastFor2,
    ]);
    return rows[0];
};
exports.insertSpellForUser = insertSpellForUser;
const updateSpellForUser = async (id, userguid, payload) => {
    const { rows } = await db_1.default.query(`UPDATE spells
     SET
       name = $3,
       description = $4,
       range = $5,
       effecton = $6,
       effecton2 = $7,
       lastfor = $8,
       damage = $9,
       effectamount2 = $10,
       value = $11,
       sp = $12,
       successtestvalue = $13,
       magiccost = $14,
       costtolearn = $15,
       imageid = $16,
       soundid = $17,
       ispublic = $18,
       numberoftargets = $19,
       effecttype = $20,
       effectcolor = $21,
       effectonpc1 = $22,
       effectonpc2 = $23,
       range1 = $24,
       range2 = $25,
       lastfor1 = $26,
       lastfor2 = $27,
       updatedat = NOW()
     WHERE id = $1 AND userguid = $2
     RETURNING ${SELECT_SPELL_FIELDS}`, [
        id,
        userguid,
        payload.name,
        payload.description,
        payload.range,
        payload.effectOn,
        payload.effectOn2,
        payload.lastFor,
        payload.effectAmount,
        payload.effectAmount2,
        payload.value,
        payload.sp,
        payload.successTestValue,
        payload.magicCost,
        payload.costToLearn,
        payload.imageId,
        payload.soundId,
        payload.isPublic,
        payload.numberOfTargets,
        payload.effectType,
        payload.effectColor,
        payload.effectOnPc1,
        payload.effectOnPc2,
        payload.range1,
        payload.range2,
        payload.lastFor1,
        payload.lastFor2,
    ]);
    return rows[0] ?? null;
};
exports.updateSpellForUser = updateSpellForUser;
