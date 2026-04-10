import pool from '../db';

export interface PcRecord {
  id: number;
  userguid: string;
  name: string;
  species: string;
  type: string;
  imageId: number | null;
  issample: boolean;
  maxHP: number;
  currentHP: number;
  ac: number;
  actionEconomy: number;
  poisonResest: number;
  magicPower: number;
  mind: number;
  stamina: number;
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
  ring1ItemId: number | null;
  ring2ItemId: number | null;
  ring3ItemId: number | null;
  ring4ItemId: number | null;
  ring5ItemId: number | null;
  necklaceItemId: number | null;
  hand1ItemId: number | null;
  hand2ItemId: number | null;
  createdAt: string;
  updatedAt: string;
  sp: number;
}

export interface UpsertPcPayload {
  name: string;
  species: string;
  type: string;
  imageId: number | null;
  maxHP: number;
  currentHP: number;
  ac: number;
  actionEconomy: number;
  poisonResest: number;
  magicPower: number;
  mind: number;
  stamina: number;
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
  ring1ItemId: number | null;
  ring2ItemId: number | null;
  ring3ItemId: number | null;
  ring4ItemId: number | null;
  ring5ItemId: number | null;
  necklaceItemId: number | null;
  hand1ItemId: number | null;
  hand2ItemId: number | null;
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
       actioneconomy AS "actionEconomy",
       poisonresest AS "poisonResest",
       mp AS "magicPower",
       mind,
       stamina,
       COALESCE(sp, 0) AS sp,
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
       ring1itemid AS "ring1ItemId",
       ring2itemid AS "ring2ItemId",
       ring3itemid AS "ring3ItemId",
       ring4itemid AS "ring4ItemId",
       ring5itemid AS "ring5ItemId",
       necklaceitemid AS "necklaceItemId",
       hand1itemid AS "hand1ItemId",
       hand2itemid AS "hand2ItemId",
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
       actioneconomy AS "actionEconomy",
       poisonresest AS "poisonResest",
       mp AS "magicPower",
       mind,
       stamina,
       COALESCE(sp, 0) AS sp,
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
       ring1itemid AS "ring1ItemId",
       ring2itemid AS "ring2ItemId",
       ring3itemid AS "ring3ItemId",
       ring4itemid AS "ring4ItemId",
       ring5itemid AS "ring5ItemId",
       necklaceitemid AS "necklaceItemId",
       hand1itemid AS "hand1ItemId",
       hand2itemid AS "hand2ItemId",
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM pcs
     WHERE id = $1 AND userguid = $2`,
    [id, userguid]
  );

  return rows[0] ?? null;
};

export const addSpToPc = async (
  id: number,
  userguid: string,
  amount: number
): Promise<number | null> => {
  const { rows } = await pool.query<{ sp: number }>(
    `UPDATE pcs
     SET sp = COALESCE(sp, 0) + $3,
         updatedat = NOW()
     WHERE id = $1 AND userguid = $2
     RETURNING COALESCE(sp, 0) AS sp`,
    [id, userguid, Math.max(0, Math.floor(amount))]
  );

  return rows[0]?.sp ?? null;
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
       actioneconomy,
       poisonresest,
       mp,
       mind,
       stamina,
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
       ring1itemid,
       ring2itemid,
       ring3itemid,
       ring4itemid,
       ring5itemid,
       necklaceitemid,
       hand1itemid,
       hand2itemid,
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
       $19::jsonb,
       $20,
       $21,
       $22,
       $23,
       $24,
       $25,
       $26,
       $27,
       $28,
       $29,
       $30,
       $31,
       $32,
       $33,
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
       actioneconomy AS "actionEconomy",
       poisonresest AS "poisonResest",
       mp AS "magicPower",
       mind,
       stamina,
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
       ring1itemid AS "ring1ItemId",
       ring2itemid AS "ring2ItemId",
       ring3itemid AS "ring3ItemId",
       ring4itemid AS "ring4ItemId",
       ring5itemid AS "ring5ItemId",
       necklaceitemid AS "necklaceItemId",
       hand1itemid AS "hand1ItemId",
       hand2itemid AS "hand2ItemId",
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
      payload.actionEconomy,
      payload.poisonResest,
      payload.magicPower,
      payload.mind,
      payload.stamina,
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
      payload.ring1ItemId,
      payload.ring2ItemId,
      payload.ring3ItemId,
      payload.ring4ItemId,
      payload.ring5ItemId,
      payload.necklaceItemId,
      payload.hand1ItemId,
      payload.hand2ItemId,
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
       actioneconomy = $10,
       poisonresest = $11,
       mp = $12,
       mind = $13,
       stamina = $14,
       level = $15,
       strength = $16,
       rangeofview = $17,
       primarytresherid = $18,
       weapontresherid = $19,
       tresherids = $20::jsonb,
       headarmortresherid = $21,
       bodyarmortresherid = $22,
       leftarmarmortresherid = $23,
       rightarmarmortresherid = $24,
       leftlegarmortresherid = $25,
       rightlegarmortresherid = $26,
       ring1itemid = $27,
       ring2itemid = $28,
       ring3itemid = $29,
       ring4itemid = $30,
       ring5itemid = $31,
       necklaceitemid = $32,
       hand1itemid = $33,
       hand2itemid = $34,
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
       actioneconomy AS "actionEconomy",
       poisonresest AS "poisonResest",
       mp AS "magicPower",
       mind,
       stamina,
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
       ring1itemid AS "ring1ItemId",
       ring2itemid AS "ring2ItemId",
       ring3itemid AS "ring3ItemId",
       ring4itemid AS "ring4ItemId",
       ring5itemid AS "ring5ItemId",
       necklaceitemid AS "necklaceItemId",
       hand1itemid AS "hand1ItemId",
       hand2itemid AS "hand2ItemId",
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
      payload.actionEconomy,
      payload.poisonResest,
      payload.magicPower,
      payload.mind,
      payload.stamina,
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
      payload.ring1ItemId,
      payload.ring2ItemId,
      payload.ring3ItemId,
      payload.ring4ItemId,
      payload.ring5ItemId,
      payload.necklaceItemId,
      payload.hand1ItemId,
      payload.hand2ItemId,
    ]
  );

  return rows[0] ?? null;
};

export interface SamplePcRecord {
  id: number;
  name: string;
  species: string;
  type: string;
  maxHP: number;
  currentHP: number;
  ac: number;
  actionEconomy: number;
  strength: number;
  stamina: number;
  mind: number;
  magicPower: number;
  rangeOfView: number;
}

export interface AdminPcRecord {
  id: number;
  name: string;
  species: string;
  type: string;
  issample: boolean;
}

export const getSamplePcsFromDb = async (): Promise<SamplePcRecord[]> => {
  const { rows } = await pool.query<SamplePcRecord>(
    `SELECT
       id,
       name,
       species,
       type,
       maxhp AS "maxHP",
       currenthp AS "currentHP",
       ac,
       actioneconomy AS "actionEconomy",
       strength,
       stamina,
       mind,
       mp AS "magicPower",
       rangeofview AS "rangeOfView"
     FROM pcs
     WHERE issample = TRUE
     ORDER BY id ASC`
  );
  return rows;
};

export const setSamplePcInDb = async (id: number, issample: boolean): Promise<boolean> => {
  const { rowCount } = await pool.query(
    `UPDATE pcs SET issample = $2 WHERE id = $1`,
    [id, issample]
  );
  return (rowCount ?? 0) > 0;
};

export const getPcByIdPublic = async (id: number): Promise<PcRecord | null> => {
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
       actioneconomy AS "actionEconomy",
       poisonresest AS "poisonResest",
       mp AS "magicPower",
       mind,
       stamina,
       COALESCE(sp, 0) AS sp,
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
       ring1itemid AS "ring1ItemId",
       ring2itemid AS "ring2ItemId",
       ring3itemid AS "ring3ItemId",
       ring4itemid AS "ring4ItemId",
       ring5itemid AS "ring5ItemId",
       necklaceitemid AS "necklaceItemId",
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM pcs
     WHERE id = $1 AND issample = TRUE`,
    [id]
  );
  return rows[0] ?? null;
};

export const getAllPcsForAdmin = async (): Promise<AdminPcRecord[]> => {
  const { rows } = await pool.query<AdminPcRecord>(
    `SELECT
       id,
       name,
       species,
       type,
       COALESCE(issample, FALSE) AS issample
     FROM pcs
     ORDER BY id DESC`
  );
  return rows;
};
