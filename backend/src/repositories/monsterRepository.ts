import pool from '../db';

export interface MonsterAttackRecord {
  type: string;
  description: string;
  plusToHit: number;
  damage: number;
  weaponItemId: number | null;
  spellId: number | null;
  curseId: number | null;
}

export interface MonsterRecord {
  id: number;
  userguid: string;
  imageId: number | null;
  soundId: number | null;
  tresherIds: number[];
  keyIds: number[];
  name: string;
  type: string;
  description: string;
  hp: number;
  movementEconomy: number;
  ac: number;
  runAt: number;
  numberOfAttacks: number;
  attacks: MonsterAttackRecord[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  spReward: number;
  magic: number;
  magicResistance: number;
  callsReinforcements: boolean;
  toHitPlusNeeded: number;
  npcGreeting: string | null;
  npcInfo1: string | null;
  npcInfo2: string | null;
  npcInfo3: string | null;
  npcOnlyAttackWhenAttacked: boolean;
  npcGivesInfoAfterDamaged: boolean;
  npcAttacksAfterInfo: boolean;
  npcCanTrade: boolean;
  awareness: number;
}

export interface UpsertMonsterPayload {
  imageId: number | null;
  soundId: number | null;
  tresherIds: number[];
  keyIds: number[];
  name: string;
  type: string;
  description: string;
  hp: number;
  movementEconomy: number;
  ac: number;
  runAt: number;
  numberOfAttacks: number;
  attacks: MonsterAttackRecord[];
  isPublic: boolean;
  spReward: number;
  magic: number;
  magicResistance: number;
  callsReinforcements: boolean;
  toHitPlusNeeded: number;
  npcGreeting: string | null;
  npcInfo1: string | null;
  npcInfo2: string | null;
  npcInfo3: string | null;
  npcOnlyAttackWhenAttacked: boolean;
  npcGivesInfoAfterDamaged: boolean;
  npcAttacksAfterInfo: boolean;
  npcCanTrade: boolean;
  awareness: number;
}

export const isAdminUserByGuid = async (userguid: string): Promise<boolean> => {
  const { rows } = await pool.query<{ isadmin: boolean }>(
    'SELECT isadmin FROM users WHERE key = $1',
    [userguid]
  );

  if (!rows[0]) {
    return false;
  }

  return rows[0].isadmin === true;
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
  COALESCE(callsreinforcements, FALSE) AS "callsReinforcements",
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

export const getMonstersByUserGuid = async (userguid: string): Promise<MonsterRecord[]> => {
  const { rows } = await pool.query<MonsterRecord>(
    `SELECT ${SELECT_MONSTER_FIELDS}
     FROM monsters
     WHERE userguid = $1
     ORDER BY LOWER(name) ASC, id ASC`,
    [userguid]
  );

  return rows;
};

export const getMonsterLibraryByUserGuid = async (
  userguid: string
): Promise<MonsterRecord[]> => {
  const { rows } = await pool.query<MonsterRecord>(
    `SELECT ${SELECT_MONSTER_FIELDS}
     FROM monsters
     WHERE userguid = $1 OR ispublic = true
     ORDER BY
       CASE WHEN userguid = $1 THEN 0 ELSE 1 END,
       updatedat DESC,
       id DESC`,
    [userguid]
  );

  return rows;
};

export const insertMonsterForUser = async (
  userguid: string,
  payload: UpsertMonsterPayload
): Promise<MonsterRecord> => {
  const { rows } = await pool.query<MonsterRecord>(
    `INSERT INTO monsters (
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
       $14, $15, $16, $17, $18, $19, $20,
       $21, $22, $23, $24, $25, $26, $27, $28,
       $29,
       NOW()
     )
     RETURNING ${SELECT_MONSTER_FIELDS}`,
    [
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
    ]
  );

  return rows[0];
};

export const updateMonsterForUser = async (
  id: number,
  userguid: string,
  payload: UpsertMonsterPayload
): Promise<MonsterRecord | null> => {
  const { rows } = await pool.query<MonsterRecord>(
    `UPDATE monsters
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
       tohitplusneeded = $21,
       npc_greeting = $22,
       npc_info_1 = $23,
       npc_info_2 = $24,
       npc_info_3 = $25,
       npc_only_attack_when_attacked = $26,
       npc_gives_info_after_damaged = $27,
       npc_attacks_after_info = $28,
       npc_can_trade = $29,
       awareness = $30,
       updatedat = NOW()
     WHERE id = $1 AND userguid = $2
     RETURNING ${SELECT_MONSTER_FIELDS}`,
    [
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
    ]
  );

  return rows[0] ?? null;
};
