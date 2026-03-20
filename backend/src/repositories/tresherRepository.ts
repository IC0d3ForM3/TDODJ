import pool from '../db';

export type TresherTypeValue = 'Weapon' | 'Armor' | 'Coins' | 'Potion' | 'OtherTresher';
export type ArmorTypeValue = 'head' | 'hand' | 'body' | 'arms' | 'legs';
export type CoinTypeValue = 'Gold' | 'Silver' | 'Copper' | 'Tin';
export type PotionEffectTargetValue = 'Health' | 'AC' | 'AE';

export interface TresherRecord {
  id: number;
  userguid: string;
  type: TresherTypeValue;
  name: string;
  description: string;
  worth: number;
  curseID: number | null;
  trapID: number | null;
  HP: number | null;
  damage: number | null;
  hands: number | null;
  range: number | null;
  ammoType: string | null;
  speedReduction: number | null;
  armorType: ArmorTypeValue | null;
  coinType: CoinTypeValue | null;
  effectNumber: number | null;
  effectTarget: PotionEffectTargetValue | null;
  effectDuration: number | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  spReward: number;
}

export interface UpsertTresherPayload {
  type: TresherTypeValue;
  name: string;
  description: string;
  worth: number;
  curseID: number | null;
  trapID: number | null;
  HP: number | null;
  damage: number | null;
  hands: number | null;
  range: number | null;
  ammoType: string | null;
  speedReduction: number | null;
  armorType: ArmorTypeValue | null;
  coinType: CoinTypeValue | null;
  effectNumber: number | null;
  effectTarget: PotionEffectTargetValue | null;
  effectDuration: number | null;
  isPublic: boolean;
  spReward: number;
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

export const getTreshersByUserGuid = async (
  userguid: string
): Promise<TresherRecord[]> => {
  const { rows } = await pool.query<TresherRecord>(
    `SELECT
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
     ORDER BY updatedat DESC, id DESC`,
    [userguid]
  );

  return rows;
};

export const getTresherLibraryByUserGuid = async (
  userguid: string
): Promise<TresherRecord[]> => {
  const { rows } = await pool.query<TresherRecord>(
    `SELECT
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
       id DESC`,
    [userguid]
  );

  return rows;
};

export const getTreshersByIds = async (
  ids: number[]
): Promise<TresherRecord[]> => {
  if (ids.length === 0) {
    return [];
  }

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query<TresherRecord>(
    `SELECT
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
     WHERE id IN (${placeholders})`,
    ids
  );

  return rows;
};

export const isTresherAccessibleByIdForUser = async (
  tresherId: number,
  userguid: string
): Promise<boolean> => {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id
     FROM treshers
     WHERE id = $1
       AND (userguid = $2 OR ispublic = true)
     LIMIT 1`,
    [tresherId, userguid]
  );

  return rows.length > 0;
};

export const insertTresherForUser = async (
  userguid: string,
  payload: UpsertTresherPayload
): Promise<TresherRecord> => {
  const { rows } = await pool.query<TresherRecord>(
    `INSERT INTO treshers (
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
       updatedat::text AS "updatedAt"`,
    [
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
    ]
  );

  return rows[0];
};

export const updateTresherForUser = async (
  id: number,
  userguid: string,
  payload: UpsertTresherPayload
): Promise<TresherRecord | null> => {
  const { rows } = await pool.query<TresherRecord>(
    `UPDATE treshers
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
       updatedat::text AS "updatedAt"`,
    [
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
    ]
  );

  return rows[0] ?? null;
};
