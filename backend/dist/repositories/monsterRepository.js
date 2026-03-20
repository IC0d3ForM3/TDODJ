"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMonsterForUser = exports.insertMonsterForUser = exports.getMonsterLibraryByUserGuid = exports.getMonstersByUserGuid = exports.isAdminUserByGuid = void 0;
const db_1 = __importDefault(require("../db"));
const isAdminUserByGuid = async (userguid) => {
    const { rows } = await db_1.default.query('SELECT isadmin FROM users WHERE key = $1', [userguid]);
    if (!rows[0]) {
        return false;
    }
    return rows[0].isadmin === true;
};
exports.isAdminUserByGuid = isAdminUserByGuid;
const getMonstersByUserGuid = async (userguid) => {
    const { rows } = await db_1.default.query(`SELECT
       id,
       userguid::text AS userguid,
      imageid AS "imageId",
      COALESCE(tresherids, '[]'::jsonb) AS "tresherIds",
      COALESCE(keyids, '[]'::jsonb) AS "keyIds",
       name,
       type,
       description,
       hp,
       movmenteconomy AS "movementEconomy",
       ac,
       runat AS "runAt",
       numberofattacks AS "numberOfAttacks",
       attacks,
       ispublic AS "isPublic",
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM monsters
     WHERE userguid = $1
     ORDER BY updatedat DESC, id DESC`, [userguid]);
    return rows;
};
exports.getMonstersByUserGuid = getMonstersByUserGuid;
const getMonsterLibraryByUserGuid = async (userguid) => {
    const { rows } = await db_1.default.query(`SELECT
       id,
       userguid::text AS userguid,
      imageid AS "imageId",
      COALESCE(tresherids, '[]'::jsonb) AS "tresherIds",
      COALESCE(keyids, '[]'::jsonb) AS "keyIds",
       name,
       type,
       description,
       hp,
       movmenteconomy AS "movementEconomy",
       ac,
       runat AS "runAt",
       numberofattacks AS "numberOfAttacks",
       attacks,
       ispublic AS "isPublic",
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM monsters
     WHERE userguid = $1 OR ispublic = true
     ORDER BY
       CASE WHEN userguid = $1 THEN 0 ELSE 1 END,
       updatedat DESC,
       id DESC`, [userguid]);
    return rows;
};
exports.getMonsterLibraryByUserGuid = getMonsterLibraryByUserGuid;
const insertMonsterForUser = async (userguid, payload) => {
    const { rows } = await db_1.default.query(`INSERT INTO monsters (
       userguid,
      imageid,
       name,
       type,
       description,
       hp,
       movmenteconomy,
       ac,
       runat,
       numberofattacks,
      tresherids,
      keyids,
       attacks,
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
       $11::jsonb,
       $12::jsonb,
       $13::jsonb,
       $14,
       NOW()
     )
     RETURNING
       id,
       userguid::text AS userguid,
       imageid AS "imageId",
       COALESCE(tresherids, '[]'::jsonb) AS "tresherIds",
       COALESCE(keyids, '[]'::jsonb) AS "keyIds",
       name,
       type,
       description,
       hp,
       movmenteconomy AS "movementEconomy",
       ac,
       runat AS "runAt",
       numberofattacks AS "numberOfAttacks",
       attacks,
       ispublic AS "isPublic",
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"`, [
        userguid,
        payload.imageId,
        payload.name,
        payload.type,
        payload.description,
        payload.hp,
        payload.movementEconomy,
        payload.ac,
        payload.runAt,
        payload.numberOfAttacks,
        JSON.stringify(payload.tresherIds),
        JSON.stringify(payload.keyIds),
        JSON.stringify(payload.attacks),
        payload.isPublic,
    ]);
    return rows[0];
};
exports.insertMonsterForUser = insertMonsterForUser;
const updateMonsterForUser = async (id, userguid, payload) => {
    const { rows } = await db_1.default.query(`UPDATE monsters
     SET
       name = $3,
       type = $4,
       description = $5,
       hp = $6,
       movmenteconomy = $7,
       ac = $8,
       runat = $9,
       numberofattacks = $10,
       imageid = $11,
       tresherids = $12::jsonb,
       keyids = $13::jsonb,
       attacks = $14::jsonb,
       ispublic = $15,
       updatedat = NOW()
     WHERE id = $1 AND userguid = $2
     RETURNING
       id,
       userguid::text AS userguid,
       imageid AS "imageId",
       COALESCE(tresherids, '[]'::jsonb) AS "tresherIds",
       COALESCE(keyids, '[]'::jsonb) AS "keyIds",
       name,
       type,
       description,
       hp,
       movmenteconomy AS "movementEconomy",
       ac,
       runat AS "runAt",
       numberofattacks AS "numberOfAttacks",
       attacks,
       ispublic AS "isPublic",
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"`, [
        id,
        userguid,
        payload.name,
        payload.type,
        payload.description,
        payload.hp,
        payload.movementEconomy,
        payload.ac,
        payload.runAt,
        payload.numberOfAttacks,
        payload.imageId,
        JSON.stringify(payload.tresherIds),
        JSON.stringify(payload.keyIds),
        JSON.stringify(payload.attacks),
        payload.isPublic,
    ]);
    return rows[0] ?? null;
};
exports.updateMonsterForUser = updateMonsterForUser;
