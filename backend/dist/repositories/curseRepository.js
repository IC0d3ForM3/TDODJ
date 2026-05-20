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
const CURSE_CURE_SPELL_RANGE = 5;
function buildCurseCureName(curseName) {
    const trimmed = (curseName ?? '').trim();
    return `Cures-${trimmed || 'Unnamed Curse'}`;
}
async function ensureCurseCureSpellAndPotion(client, userguid, curseName, isPublic, imageId, soundId) {
    const cureName = buildCurseCureName(curseName);
    const cureDescription = `Removes the effects of ${curseName || 'a curse'}.`;
    const spellExists = await client.query(`SELECT id
     FROM spells
     WHERE userguid = $1 AND LOWER(name) = LOWER($2)
     LIMIT 1`, [userguid, cureName]);
    if (spellExists.rowCount === 0) {
        await client.query(`INSERT INTO spells
         (userguid, name, description, range, effecton, effecton2, lastfor, damage,
         effectamount2, value, sp, successtestvalue, magiccost, costtolearn,
          imageid, soundid, ispublic, numberoftargets, effecttype, effectcolor,
          effectonpc1, effectonpc2, range1, range2, lastfor1, lastfor2)
       VALUES
         ($1, $2, $3, $4, 'Remove Curse', '', 0, 0,
         0, 0, 0, 0, 1, 0,
          $5, $6, $7, 1, 'Other', '#ffffff',
          FALSE, FALSE, $4, $4, 0, 0)`, [userguid, cureName, cureDescription, CURSE_CURE_SPELL_RANGE, imageId, soundId, isPublic]);
    }
    const potionExists = await client.query(`SELECT id
     FROM potions
     WHERE userguid = $1 AND LOWER(name) = LOWER($2)
     LIMIT 1`, [userguid, cureName]);
    if (potionExists.rowCount === 0) {
        await client.query(`INSERT INTO potions
         (userguid, name, description, effectto, effectto2, effecttime, effectnumber,
          effectamount2, value, imageid, soundid, ispublic)
       VALUES
         ($1, $2, $3, 'Remove Curse', NULL, 0, 0,
          0, 0, $4, $5, $6)`, [userguid, cureName, cureDescription, imageId, soundId, isPublic]);
    }
}
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
    const client = await db_1.default.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`INSERT INTO curses
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
        const created = rows[0];
        await ensureCurseCureSpellAndPotion(client, userguid, created.name, created.isPublic, created.imageId, created.soundId);
        await client.query('COMMIT');
        return created;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
};
exports.insertCurseForUser = insertCurseForUser;
const updateCurseForUser = async (id, userguid, payload) => {
    const client = await db_1.default.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`UPDATE curses
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
        const updated = rows[0] ?? null;
        if (updated) {
            await ensureCurseCureSpellAndPotion(client, userguid, updated.name, updated.isPublic, updated.imageId, updated.soundId);
        }
        await client.query('COMMIT');
        return updated;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
};
exports.updateCurseForUser = updateCurseForUser;
