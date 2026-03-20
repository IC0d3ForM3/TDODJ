import pool from '../db';

export interface PcRecord {
  id: number;
  userguid: string;
  name: string;
  species: string;
  type: string;
  imageId: number | null;
  maxHP: number;
  currentHP: number;
  ac: number;
  movementEconomy: number;
  poisonResest: number;
  magicPower: number;
  level: number;
  strength: number;
  rangeOfView: number;
  primaryTresherId: number | null;
  weaponTresherId: number | null;
  tresherIds: number[];
  headArmorTresherId: number | null;
  bodyArmorTresherId: number | null;
  leftArmArmorTresherId: number | null;
  rightArmArmorTresherId: number | null;
  leftLegArmorTresherId: number | null;
  rightLegArmorTresherId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertPcPayload {
  name: string;
  species: string;
  type: string;
  imageId: number | null;
  maxHP: number;
  currentHP: number;
  ac: number;
  movementEconomy: number;
  poisonResest: number;
  magicPower: number;
  level: number;
  strength: number;
  rangeOfView: number;
  primaryTresherId: number | null;
  weaponTresherId: number | null;
  tresherIds: number[];
  headArmorTresherId: number | null;
  bodyArmorTresherId: number | null;
  leftArmArmorTresherId: number | null;
  rightArmArmorTresherId: number | null;
  leftLegArmorTresherId: number | null;
  rightLegArmorTresherId: number | null;
}

export const getPcsByUserGuid = async (userguid: string): Promise<PcRecord[]> => {
  const { rows } = await pool.query<PcRecord>(
    `SELECT
       id,
       userguid::text AS userguid,
       name,
       species,
       type,
       imageid AS "imageId",
       maxhp AS "maxHP",
       currenthp AS "currentHP",
       ac,
       movmenteconomy AS "movementEconomy",
       poisonresest AS "poisonResest",
       mp AS "magicPower",
       level,
       strength,
       rangeofview AS "rangeOfView",
       primarytresherid AS "primaryTresherId",
       weapontresherid AS "weaponTresherId",
       COALESCE(tresherids, '[]'::jsonb) AS "tresherIds",
       headarmortresherid AS "headArmorTresherId",
       bodyarmortresherid AS "bodyArmorTresherId",
       leftarmarmortresherid AS "leftArmArmorTresherId",
       rightarmarmortresherid AS "rightArmArmorTresherId",
       leftlegarmortresherid AS "leftLegArmorTresherId",
       rightlegarmortresherid AS "rightLegArmorTresherId",
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM pcs
     WHERE userguid = $1
     ORDER BY updatedat DESC, id DESC`,
    [userguid]
  );

  return rows;
};

export const getPcByIdForUser = async (
  id: number,
  userguid: string
): Promise<PcRecord | null> => {
  const { rows } = await pool.query<PcRecord>(
    `SELECT
       id,
       userguid::text AS userguid,
       name,
       species,
       type,
       imageid AS "imageId",
       maxhp AS "maxHP",
       currenthp AS "currentHP",
       ac,
       movmenteconomy AS "movementEconomy",
       poisonresest AS "poisonResest",
       mp AS "magicPower",
       level,
       strength,
       rangeofview AS "rangeOfView",
       primarytresherid AS "primaryTresherId",
       weapontresherid AS "weaponTresherId",
       COALESCE(tresherids, '[]'::jsonb) AS "tresherIds",
       headarmortresherid AS "headArmorTresherId",
       bodyarmortresherid AS "bodyArmorTresherId",
       leftarmarmortresherid AS "leftArmArmorTresherId",
       rightarmarmortresherid AS "rightArmArmorTresherId",
       leftlegarmortresherid AS "leftLegArmorTresherId",
       rightlegarmortresherid AS "rightLegArmorTresherId",
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM pcs
     WHERE id = $1 AND userguid = $2`,
    [id, userguid]
  );

  return rows[0] ?? null;
};

export const insertPcForUser = async (
  userguid: string,
  payload: UpsertPcPayload
): Promise<PcRecord> => {
  const { rows } = await pool.query<PcRecord>(
    `INSERT INTO pcs (
       userguid,
       name,
       species,
       type,
       imageid,
       maxhp,
       currenthp,
       ac,
       movmenteconomy,
       poisonresest,
       mp,
       level,
       strength,
       rangeofview,
       primarytresherid,
       weapontresherid,
       tresherids,
       headarmortresherid,
       bodyarmortresherid,
       leftarmarmortresherid,
       rightarmarmortresherid,
       leftlegarmortresherid,
       rightlegarmortresherid,
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
       $17::jsonb,
       $18,
       $19,
       $20,
       $21,
       $22,
       $23,
       NOW()
     )
     RETURNING
       id,
       userguid::text AS userguid,
       name,
       species,
       type,
       imageid AS "imageId",
       maxhp AS "maxHP",
       currenthp AS "currentHP",
       ac,
       movmenteconomy AS "movementEconomy",
       poisonresest AS "poisonResest",
       mp AS "magicPower",
       level,
       strength,
       rangeofview AS "rangeOfView",
       primarytresherid AS "primaryTresherId",
       weapontresherid AS "weaponTresherId",
       COALESCE(tresherids, '[]'::jsonb) AS "tresherIds",
       headarmortresherid AS "headArmorTresherId",
       bodyarmortresherid AS "bodyArmorTresherId",
       leftarmarmortresherid AS "leftArmArmorTresherId",
       rightarmarmortresherid AS "rightArmArmorTresherId",
       leftlegarmortresherid AS "leftLegArmorTresherId",
       rightlegarmortresherid AS "rightLegArmorTresherId",
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"`,
    [
      userguid,
      payload.name,
      payload.species,
      payload.type,
      payload.imageId,
      payload.maxHP,
      payload.currentHP,
      payload.ac,
      payload.movementEconomy,
      payload.poisonResest,
      payload.magicPower,
      payload.level,
      payload.strength,
      payload.rangeOfView,
      payload.primaryTresherId,
      payload.weaponTresherId,
      JSON.stringify(payload.tresherIds),
      payload.headArmorTresherId,
      payload.bodyArmorTresherId,
      payload.leftArmArmorTresherId,
      payload.rightArmArmorTresherId,
      payload.leftLegArmorTresherId,
      payload.rightLegArmorTresherId,
    ]
  );

  return rows[0];
};

export const updatePcForUser = async (
  id: number,
  userguid: string,
  payload: UpsertPcPayload
): Promise<PcRecord | null> => {
  const { rows } = await pool.query<PcRecord>(
    `UPDATE pcs
     SET
       name = $3,
       species = $4,
       type = $5,
       imageid = $6,
       maxhp = $7,
       currenthp = $8,
       ac = $9,
       movmenteconomy = $10,
       poisonresest = $11,
       mp = $12,
       level = $13,
       strength = $14,
       rangeofview = $15,
       primarytresherid = $16,
       weapontresherid = $17,
       tresherids = $18::jsonb,
       headarmortresherid = $19,
       bodyarmortresherid = $20,
       leftarmarmortresherid = $21,
       rightarmarmortresherid = $22,
       leftlegarmortresherid = $23,
       rightlegarmortresherid = $24,
       updatedat = NOW()
     WHERE id = $1 AND userguid = $2
     RETURNING
       id,
       userguid::text AS userguid,
       name,
       species,
       type,
       imageid AS "imageId",
       maxhp AS "maxHP",
       currenthp AS "currentHP",
       ac,
       movmenteconomy AS "movementEconomy",
       poisonresest AS "poisonResest",
       mp AS "magicPower",
       level,
       strength,
       rangeofview AS "rangeOfView",
       primarytresherid AS "primaryTresherId",
       weapontresherid AS "weaponTresherId",
       COALESCE(tresherids, '[]'::jsonb) AS "tresherIds",
       headarmortresherid AS "headArmorTresherId",
       bodyarmortresherid AS "bodyArmorTresherId",
       leftarmarmortresherid AS "leftArmArmorTresherId",
       rightarmarmortresherid AS "rightArmArmorTresherId",
       leftlegarmortresherid AS "leftLegArmorTresherId",
       rightlegarmortresherid AS "rightLegArmorTresherId",
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"`,
    [
      id,
      userguid,
      payload.name,
      payload.species,
      payload.type,
      payload.imageId,
      payload.maxHP,
      payload.currentHP,
      payload.ac,
      payload.movementEconomy,
      payload.poisonResest,
      payload.magicPower,
      payload.level,
      payload.strength,
      payload.rangeOfView,
      payload.primaryTresherId,
      payload.weaponTresherId,
      JSON.stringify(payload.tresherIds),
      payload.headArmorTresherId,
      payload.bodyArmorTresherId,
      payload.leftArmArmorTresherId,
      payload.rightArmArmorTresherId,
      payload.leftLegArmorTresherId,
      payload.rightLegArmorTresherId,
    ]
  );

  return rows[0] ?? null;
};
