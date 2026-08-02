"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMonsterForUser = exports.insertMonsterForUser = exports.getAllMonstersWithUsername = exports.getMonsterLibraryByUserGuid = exports.getMonstersByIds = exports.getMonstersByUserGuid = exports.isAdminUserByGuid = void 0;
const db_1 = __importDefault(require("../db"));
const isAdminUserByGuid = async (userguid) => {
    const { rows } = await db_1.default.query('SELECT isadmin FROM users WHERE key = $1', [userguid]);
    if (!rows[0]) {
        return false;
    }
    return rows[0].isadmin === true;
};
exports.isAdminUserByGuid = isAdminUserByGuid;
let hasCastPlusColumnCache = null;
const hasMonsterCastPlusColumn = async (forceRefresh = false) => {
    if (!forceRefresh && hasCastPlusColumnCache !== null) {
        return hasCastPlusColumnCache;
    }
    const { rows } = await db_1.default.query(`SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_name = 'monsters'
         AND column_name = 'castplus'
     ) AS "exists"`);
    hasCastPlusColumnCache = rows[0]?.exists === true;
    return hasCastPlusColumnCache;
};
const SELECT_MONSTER_FIELDS = `
  id,
  userguid::text AS userguid,
  imageid AS "imageId",
  soundid AS "soundId",
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
  updatedat::text AS "updatedAt",
  COALESCE(spreward, 0) AS "spReward",
  COALESCE(magic, 0) AS magic,
  COALESCE(magicresistance, 0) AS "magicResistance",
  COALESCE((to_jsonb(monsters)->>'castplus')::int, 0) AS "castPlus",
  COALESCE(callsreinforcements, FALSE) AS "callsReinforcements",
  COALESCE(reinforcementcount, 0) AS "reinforcementCount",
  reinforcementmonstername AS "reinforcementMonsterName",
  COALESCE(tohitplusneeded, 0) AS "toHitPlusNeeded",
  npc_greeting AS "npcGreeting",
  npc_info_1 AS "npcInfo1",
  npc_info_2 AS "npcInfo2",
  npc_info_3 AS "npcInfo3",
  COALESCE(npc_only_attack_when_attacked, FALSE) AS "npcOnlyAttackWhenAttacked",
  COALESCE(npc_gives_info_after_damaged, FALSE) AS "npcGivesInfoAfterDamaged",
  COALESCE(npc_attacks_after_info, FALSE) AS "npcAttacksAfterInfo",
  COALESCE(npc_can_trade, FALSE) AS "npcCanTrade",
  COALESCE(awareness, 5) AS awareness
`;
const getMonstersByUserGuid = async (userguid) => {
    const { rows } = await db_1.default.query(`SELECT ${SELECT_MONSTER_FIELDS}
     FROM monsters
     WHERE userguid = $1
     ORDER BY LOWER(name) ASC, id ASC`, [userguid]);
    return rows;
};
exports.getMonstersByUserGuid = getMonstersByUserGuid;
const getMonstersByIds = async (ids) => {
    if (ids.length === 0)
        return [];
    const { rows } = await db_1.default.query(`SELECT ${SELECT_MONSTER_FIELDS}
     FROM monsters
     WHERE id = ANY($1::int[])`, [ids]);
    return rows;
};
exports.getMonstersByIds = getMonstersByIds;
const getMonsterLibraryByUserGuid = async (userguid) => {
    const { rows } = await db_1.default.query(`SELECT
       m.id, m.userguid::text AS userguid,
       m.imageid AS "imageId", m.soundid AS "soundId",
       COALESCE(m.tresherids, '[]'::jsonb) AS "tresherIds",
       COALESCE(m.keyids, '[]'::jsonb) AS "keyIds",
       m.name, m.type, m.description, m.hp,
       m.movmenteconomy AS "movementEconomy", m.ac, m.runat AS "runAt",
       m.numberofattacks AS "numberOfAttacks", m.attacks,
       m.ispublic AS "isPublic",
       m.createdat::text AS "createdAt", m.updatedat::text AS "updatedAt",
       COALESCE(m.spreward, 0) AS "spReward",
      COALESCE(m.magic, 0) AS magic, COALESCE(m.magicresistance, 0) AS "magicResistance",
      COALESCE((to_jsonb(m)->>'castplus')::int, 0) AS "castPlus",
       COALESCE(m.callsreinforcements, FALSE) AS "callsReinforcements",
       COALESCE(m.reinforcementcount, 0) AS "reinforcementCount",
       m.reinforcementmonstername AS "reinforcementMonsterName",
       COALESCE(m.tohitplusneeded, 0) AS "toHitPlusNeeded",
       m.npc_greeting AS "npcGreeting", m.npc_info_1 AS "npcInfo1",
       m.npc_info_2 AS "npcInfo2", m.npc_info_3 AS "npcInfo3",
       COALESCE(m.npc_only_attack_when_attacked, FALSE) AS "npcOnlyAttackWhenAttacked",
       COALESCE(m.npc_gives_info_after_damaged, FALSE) AS "npcGivesInfoAfterDamaged",
       COALESCE(m.npc_attacks_after_info, FALSE) AS "npcAttacksAfterInfo",
       COALESCE(m.npc_can_trade, FALSE) AS "npcCanTrade",
       COALESCE(m.awareness, 5) AS awareness,
       COALESCE(u.username, '') AS username
     FROM monsters m
     LEFT JOIN users u ON u.key::text = m.userguid::text
     WHERE m.userguid = $1 OR m.ispublic = true
     ORDER BY
       CASE WHEN m.userguid = $1 THEN 0 ELSE 1 END,
       m.updatedat DESC,
       m.id DESC`, [userguid]);
    return rows;
};
exports.getMonsterLibraryByUserGuid = getMonsterLibraryByUserGuid;
const getAllMonstersWithUsername = async () => {
    const { rows } = await db_1.default.query(`SELECT
       m.id, m.userguid::text AS userguid,
       m.imageid AS "imageId", m.soundid AS "soundId",
       COALESCE(m.tresherids, '[]'::jsonb) AS "tresherIds",
       COALESCE(m.keyids, '[]'::jsonb) AS "keyIds",
       m.name, m.type, m.description, m.hp,
       m.movmenteconomy AS "movementEconomy", m.ac, m.runat AS "runAt",
       m.numberofattacks AS "numberOfAttacks", m.attacks,
       m.ispublic AS "isPublic",
       m.createdat::text AS "createdAt", m.updatedat::text AS "updatedAt",
       COALESCE(m.spreward, 0) AS "spReward",
      COALESCE(m.magic, 0) AS magic, COALESCE(m.magicresistance, 0) AS "magicResistance",
      COALESCE((to_jsonb(m)->>'castplus')::int, 0) AS "castPlus",
       COALESCE(m.callsreinforcements, FALSE) AS "callsReinforcements",
       COALESCE(m.reinforcementcount, 0) AS "reinforcementCount",
       m.reinforcementmonstername AS "reinforcementMonsterName",
       COALESCE(m.tohitplusneeded, 0) AS "toHitPlusNeeded",
       m.npc_greeting AS "npcGreeting", m.npc_info_1 AS "npcInfo1",
       m.npc_info_2 AS "npcInfo2", m.npc_info_3 AS "npcInfo3",
       COALESCE(m.npc_only_attack_when_attacked, FALSE) AS "npcOnlyAttackWhenAttacked",
       COALESCE(m.npc_gives_info_after_damaged, FALSE) AS "npcGivesInfoAfterDamaged",
       COALESCE(m.npc_attacks_after_info, FALSE) AS "npcAttacksAfterInfo",
       COALESCE(m.npc_can_trade, FALSE) AS "npcCanTrade",
       COALESCE(m.awareness, 5) AS awareness,
       COALESCE(u.username, '') AS username
     FROM monsters m
     LEFT JOIN users u ON u.key::text = m.userguid::text
     ORDER BY LOWER(m.name) ASC, m.id ASC`);
    return rows;
};
exports.getAllMonstersWithUsername = getAllMonstersWithUsername;
const insertMonsterForUser = async (userguid, payload) => {
    let hasCastPlusColumn = await hasMonsterCastPlusColumn();
    if (!hasCastPlusColumn && payload.castPlus !== 0) {
        // Re-check after migrations because cache may be stale in long-running processes.
        hasCastPlusColumn = await hasMonsterCastPlusColumn(true);
    }
    if (!hasCastPlusColumn) {
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
         spreward,
         soundid,
         magic,
         magicresistance,
         callsreinforcements,
        reinforcementcount,
        reinforcementmonstername,
         tohitplusneeded,
         npc_greeting,
         npc_info_1,
         npc_info_2,
         npc_info_3,
         npc_only_attack_when_attacked,
         npc_gives_info_after_damaged,
         npc_attacks_after_info,
         npc_can_trade,
         awareness,
         updatedat
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11::jsonb, $12::jsonb, $13::jsonb,
         $14, $15, $16, $17, $18, $19, $20, $21, $22,
         $23, $24, $25, $26, $27, $28, $29, $30,
         $31,
         NOW()
       )
       RETURNING ${SELECT_MONSTER_FIELDS}`, [
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
            payload.spReward,
            payload.soundId,
            payload.magic,
            payload.magicResistance,
            payload.callsReinforcements,
            payload.reinforcementCount,
            payload.reinforcementMonsterName,
            payload.toHitPlusNeeded,
            payload.npcGreeting,
            payload.npcInfo1,
            payload.npcInfo2,
            payload.npcInfo3,
            payload.npcOnlyAttackWhenAttacked,
            payload.npcGivesInfoAfterDamaged,
            payload.npcAttacksAfterInfo,
            payload.npcCanTrade,
            payload.awareness,
        ]);
        return rows[0];
    }
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
       spreward,
       soundid,
       magic,
       magicresistance,
      castplus,
       callsreinforcements,
      reinforcementcount,
      reinforcementmonstername,
       tohitplusneeded,
       npc_greeting,
       npc_info_1,
       npc_info_2,
       npc_info_3,
       npc_only_attack_when_attacked,
       npc_gives_info_after_damaged,
       npc_attacks_after_info,
       npc_can_trade,
       awareness,
       updatedat
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11::jsonb, $12::jsonb, $13::jsonb,
       $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
       $24, $25, $26, $27, $28, $29, $30, $31,
       $32,
       NOW()
     )
     RETURNING ${SELECT_MONSTER_FIELDS}`, [
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
        payload.spReward,
        payload.soundId,
        payload.magic,
        payload.magicResistance,
        payload.castPlus,
        payload.callsReinforcements,
        payload.reinforcementCount,
        payload.reinforcementMonsterName,
        payload.toHitPlusNeeded,
        payload.npcGreeting,
        payload.npcInfo1,
        payload.npcInfo2,
        payload.npcInfo3,
        payload.npcOnlyAttackWhenAttacked,
        payload.npcGivesInfoAfterDamaged,
        payload.npcAttacksAfterInfo,
        payload.npcCanTrade,
        payload.awareness,
    ]);
    return rows[0];
};
exports.insertMonsterForUser = insertMonsterForUser;
const updateMonsterForUser = async (id, userguid, payload) => {
    let hasCastPlusColumn = await hasMonsterCastPlusColumn();
    if (!hasCastPlusColumn && payload.castPlus !== 0) {
        // Re-check after migrations because cache may be stale in long-running processes.
        hasCastPlusColumn = await hasMonsterCastPlusColumn(true);
    }
    if (!hasCastPlusColumn) {
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
         spreward = $16,
         soundid = $17,
         magic = $18,
         magicresistance = $19,
         callsreinforcements = $20,
        reinforcementcount = $21,
        reinforcementmonstername = $22,
        tohitplusneeded = $23,
        npc_greeting = $24,
        npc_info_1 = $25,
        npc_info_2 = $26,
        npc_info_3 = $27,
        npc_only_attack_when_attacked = $28,
        npc_gives_info_after_damaged = $29,
        npc_attacks_after_info = $30,
        npc_can_trade = $31,
        awareness = $32,
         updatedat = NOW()
       WHERE id = $1 AND userguid = $2
       RETURNING ${SELECT_MONSTER_FIELDS}`, [
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
            payload.spReward,
            payload.soundId,
            payload.magic,
            payload.magicResistance,
            payload.callsReinforcements,
            payload.reinforcementCount,
            payload.reinforcementMonsterName,
            payload.toHitPlusNeeded,
            payload.npcGreeting,
            payload.npcInfo1,
            payload.npcInfo2,
            payload.npcInfo3,
            payload.npcOnlyAttackWhenAttacked,
            payload.npcGivesInfoAfterDamaged,
            payload.npcAttacksAfterInfo,
            payload.npcCanTrade,
            payload.awareness,
        ]);
        return rows[0] ?? null;
    }
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
       spreward = $16,
       soundid = $17,
       magic = $18,
       magicresistance = $19,
       castplus = $20,
       callsreinforcements = $21,
      reinforcementcount = $22,
      reinforcementmonstername = $23,
      tohitplusneeded = $24,
      npc_greeting = $25,
      npc_info_1 = $26,
      npc_info_2 = $27,
      npc_info_3 = $28,
      npc_only_attack_when_attacked = $29,
      npc_gives_info_after_damaged = $30,
      npc_attacks_after_info = $31,
      npc_can_trade = $32,
      awareness = $33,
       updatedat = NOW()
     WHERE id = $1 AND userguid = $2
     RETURNING ${SELECT_MONSTER_FIELDS}`, [
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
        payload.spReward,
        payload.soundId,
        payload.magic,
        payload.magicResistance,
        payload.castPlus,
        payload.callsReinforcements,
        payload.reinforcementCount,
        payload.reinforcementMonsterName,
        payload.toHitPlusNeeded,
        payload.npcGreeting,
        payload.npcInfo1,
        payload.npcInfo2,
        payload.npcInfo3,
        payload.npcOnlyAttackWhenAttacked,
        payload.npcGivesInfoAfterDamaged,
        payload.npcAttacksAfterInfo,
        payload.npcCanTrade,
        payload.awareness,
    ]);
    return rows[0] ?? null;
};
exports.updateMonsterForUser = updateMonsterForUser;
