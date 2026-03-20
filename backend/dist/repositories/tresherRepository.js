"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTresherForUser = exports.insertTresherForUser = exports.isTresherAccessibleByIdForUser = exports.getTreshersByIds = exports.getTresherLibraryByUserGuid = exports.getTreshersByUserGuid = exports.isAdminUserByGuid = void 0;
const db_1 = __importDefault(require("../db"));
const isAdminUserByGuid = async (userguid) => {
    const { rows } = await db_1.default.query('SELECT isadmin FROM users WHERE key = $1', [userguid]);
    if (!rows[0]) {
        return false;
    }
    return rows[0].isadmin === true;
};
exports.isAdminUserByGuid = isAdminUserByGuid;
const getTreshersByUserGuid = async (userguid) => {
    const { rows } = await db_1.default.query(`SELECT
       id,
       userguid::text AS userguid,
       type,
       name,
       description,
       worth,
       curseid AS "curseID",
       trapid AS "trapID",
       hp AS "HP",
       damage,
       hands,
       "range" AS range,
       ammotype AS "ammoType",
       speedreduction AS "speedReduction",
       armortype AS "armorType",
       cointype AS "coinType",
       effectnumber AS "effectNumber",
       effecttarget AS "effectTarget",
       effectduration AS "effectDuration",
       ispublic AS "isPublic",
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM treshers
     WHERE userguid = $1
     ORDER BY updatedat DESC, id DESC`, [userguid]);
    return rows;
};
exports.getTreshersByUserGuid = getTreshersByUserGuid;
const getTresherLibraryByUserGuid = async (userguid) => {
    const { rows } = await db_1.default.query(`SELECT
       id,
       userguid::text AS userguid,
       type,
       name,
       description,
       worth,
       curseid AS "curseID",
       trapid AS "trapID",
       hp AS "HP",
       damage,
       hands,
       "range" AS range,
       ammotype AS "ammoType",
       speedreduction AS "speedReduction",
       armortype AS "armorType",
       cointype AS "coinType",
       effectnumber AS "effectNumber",
       effecttarget AS "effectTarget",
       effectduration AS "effectDuration",
       ispublic AS "isPublic",
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM treshers
     WHERE userguid = $1 OR ispublic = true
     ORDER BY
       CASE WHEN userguid = $1 THEN 0 ELSE 1 END,
       updatedat DESC,
       id DESC`, [userguid]);
    return rows;
};
exports.getTresherLibraryByUserGuid = getTresherLibraryByUserGuid;
const getTreshersByIds = async (ids) => {
    if (ids.length === 0) {
        return [];
    }
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db_1.default.query(`SELECT
       id,
       userguid::text AS userguid,
       type,
       name,
       description,
       worth,
       curseid AS "curseID",
       trapid AS "trapID",
       hp AS "HP",
       damage,
       hands,
       "range" AS range,
       ammotype AS "ammoType",
       speedreduction AS "speedReduction",
       armortype AS "armorType",
       cointype AS "coinType",
       effectnumber AS "effectNumber",
       effecttarget AS "effectTarget",
       effectduration AS "effectDuration",
       ispublic AS "isPublic",
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM treshers
     WHERE id IN (${placeholders})`, ids);
    return rows;
};
exports.getTreshersByIds = getTreshersByIds;
const isTresherAccessibleByIdForUser = async (tresherId, userguid) => {
    const { rows } = await db_1.default.query(`SELECT id
     FROM treshers
     WHERE id = $1
       AND (userguid = $2 OR ispublic = true)
     LIMIT 1`, [tresherId, userguid]);
    return rows.length > 0;
};
exports.isTresherAccessibleByIdForUser = isTresherAccessibleByIdForUser;
const insertTresherForUser = async (userguid, payload) => {
    const { rows } = await db_1.default.query(`INSERT INTO treshers (
       userguid,
       type,
       name,
       description,
       worth,
       curseid,
       trapid,
       hp,
       damage,
       hands,
       "range",
       ammotype,
       speedreduction,
       armortype,
       cointype,
       effectnumber,
       effecttarget,
       effectduration,
       ispublic,
       updatedat
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       $6,
       $7,
       $8,
       $9,
       $10,
       $11,
       $12,
       $13,
       $14,
       $15,
       $16,
       $17,
       $18,
       $19,
       NOW()
     )
     RETURNING
       id,
       userguid::text AS userguid,
       type,
       name,
       description,
       worth,
       curseid AS "curseID",
       trapid AS "trapID",
       hp AS "HP",
       damage,
       hands,
       "range" AS range,
       ammotype AS "ammoType",
       speedreduction AS "speedReduction",
       armortype AS "armorType",
       cointype AS "coinType",
       effectnumber AS "effectNumber",
       effecttarget AS "effectTarget",
       effectduration AS "effectDuration",
       ispublic AS "isPublic",
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"`, [
        userguid,
        payload.type,
        payload.name,
        payload.description,
        payload.worth,
        payload.curseID,
        payload.trapID,
        payload.HP,
        payload.damage,
        payload.hands,
        payload.range,
        payload.ammoType,
        payload.speedReduction,
        payload.armorType,
        payload.coinType,
        payload.effectNumber,
        payload.effectTarget,
        payload.effectDuration,
        payload.isPublic,
    ]);
    return rows[0];
};
exports.insertTresherForUser = insertTresherForUser;
const updateTresherForUser = async (id, userguid, payload) => {
    const { rows } = await db_1.default.query(`UPDATE treshers
     SET
       type = $3,
       name = $4,
       description = $5,
       worth = $6,
       curseid = $7,
       trapid = $8,
       hp = $9,
       damage = $10,
       hands = $11,
       "range" = $12,
       ammotype = $13,
       speedreduction = $14,
       armortype = $15,
       cointype = $16,
       effectnumber = $17,
       effecttarget = $18,
       effectduration = $19,
       ispublic = $20,
       updatedat = NOW()
     WHERE id = $1 AND userguid = $2
     RETURNING
       id,
       userguid::text AS userguid,
       type,
       name,
       description,
       worth,
       curseid AS "curseID",
       trapid AS "trapID",
       hp AS "HP",
       damage,
       hands,
       "range" AS range,
       ammotype AS "ammoType",
       speedreduction AS "speedReduction",
       armortype AS "armorType",
       cointype AS "coinType",
       effectnumber AS "effectNumber",
       effecttarget AS "effectTarget",
       effectduration AS "effectDuration",
       ispublic AS "isPublic",
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"`, [
        id,
        userguid,
        payload.type,
        payload.name,
        payload.description,
        payload.worth,
        payload.curseID,
        payload.trapID,
        payload.HP,
        payload.damage,
        payload.hands,
        payload.range,
        payload.ammoType,
        payload.speedReduction,
        payload.armorType,
        payload.coinType,
        payload.effectNumber,
        payload.effectTarget,
        payload.effectDuration,
        payload.isPublic,
    ]);
    return rows[0] ?? null;
};
exports.updateTresherForUser = updateTresherForUser;
