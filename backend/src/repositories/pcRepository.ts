import pool from '../db';

export interface PcRecord {
  id: number;
  userguid: string;
  name: string;
  species: string;
  type: string;
  imageId: number | null;
  issample: boolean;
  ismaingame: boolean;
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
  spLifetime: number;
  agility: number;
  numberOfAttacks: number;
  numberOfDefends: number;
  username?: string;
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
  numberOfAttacks: number;
  numberOfDefends: number;
  agility: number;
  ismaingame?: boolean;
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
       COALESCE(sp_bank, 0) AS sp,
       COALESCE(sp_lifetime, 0) AS "spLifetime",
       COALESCE(agility, 3) AS agility,
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
       COALESCE(numberofattacks, 1) AS "numberOfAttacks",
       COALESCE(numberofdefends, 1) AS "numberOfDefends",
       COALESCE(issample, FALSE) AS issample,
       COALESCE(ismaingame, FALSE) AS ismaingame,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM pcs
     WHERE userguid = $1
     ORDER BY LOWER(name) ASC, id ASC`,
    [userguid]
  );

  return rows;
};

export const getAllPcsWithUsername = async (): Promise<PcRecord[]> => {
  const { rows } = await pool.query<PcRecord>(
    `SELECT
       p.id,
       p.userguid::text AS userguid,
       p.name, p.species, p.type,
       p.imageid AS "imageId",
       p.maxhp AS "maxHP", p.currenthp AS "currentHP", p.ac,
       p.actioneconomy AS "actionEconomy", p.poisonresest AS "poisonResest",
       p.mp AS "magicPower", p.mind, p.stamina,
       COALESCE(p.sp_bank, 0) AS sp,
       COALESCE(p.sp_lifetime, 0) AS "spLifetime",
       COALESCE(p.agility, 3) AS agility,
       p.level, p.strength,
       p.rangeofview AS "rangeOfView",
       p.primarytresherid AS "primaryTresherId",
       p.weapontresherid AS "weaponTresherId",
       COALESCE(p.tresherids, '[]'::jsonb) AS "tresherIds",
       p.headarmortresherid AS "headArmorTresherId",
       p.bodyarmortresherid AS "bodyArmorTresherId",
       p.leftarmarmortresherid AS "leftArmArmorTresherId",
       p.rightarmarmortresherid AS "rightArmArmorTresherId",
       p.leftlegarmortresherid AS "leftLegArmorTresherId",
       p.rightlegarmortresherid AS "rightLegArmorTresherId",
       p.ring1itemid AS "ring1ItemId", p.ring2itemid AS "ring2ItemId",
       p.ring3itemid AS "ring3ItemId", p.ring4itemid AS "ring4ItemId",
       p.ring5itemid AS "ring5ItemId",
       p.necklaceitemid AS "necklaceItemId",
       p.hand1itemid AS "hand1ItemId", p.hand2itemid AS "hand2ItemId",
       COALESCE(p.numberofattacks, 1) AS "numberOfAttacks",
       COALESCE(p.numberofdefends, 1) AS "numberOfDefends",
       COALESCE(p.issample, FALSE) AS issample,
       COALESCE(p.ismaingame, FALSE) AS ismaingame,
       p.createdat::text AS "createdAt", p.updatedat::text AS "updatedAt",
       COALESCE(u.username, '') AS username
     FROM pcs p
     LEFT JOIN users u ON u.key::text = p.userguid::text
      ORDER BY LOWER(p.name) ASC, p.id ASC`
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
       COALESCE(sp_bank, 0) AS sp,
       COALESCE(sp_lifetime, 0) AS "spLifetime",
       COALESCE(agility, 3) AS agility,
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
       COALESCE(numberofattacks, 1) AS "numberOfAttacks",
       COALESCE(numberofdefends, 1) AS "numberOfDefends",
       COALESCE(issample, FALSE) AS issample,
       COALESCE(ismaingame, FALSE) AS ismaingame,
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
): Promise<{ sp: number; spLifetime: number } | null> => {
  const safeAmount = Math.max(0, Math.floor(amount));
  const { rows } = await pool.query<{ sp: number; spLifetime: number }>(
    `UPDATE pcs
     SET sp_lifetime = COALESCE(sp_lifetime, 0) + $3,
         sp_bank = COALESCE(sp_bank, 0) + $3,
         updatedat = NOW()
     WHERE id = $1 AND userguid = $2
     RETURNING COALESCE(sp_bank, 0) AS sp, COALESCE(sp_lifetime, 0) AS "spLifetime"`,
    [id, userguid, safeAmount]
  );

  return rows[0] ?? null;
};

export const completeDungonRewardOnce = async (
  id: number,
  userguid: string,
  dungonId: number,
  spReward: number
): Promise<{ awarded: boolean; sp: number; spLifetime: number } | null> => {
  const safeDungonId = Math.max(1, Math.floor(dungonId));
  const safeReward = Math.max(0, Math.floor(spReward));
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: existingRows } = await client.query<{
      completedDungonIds: number[];
      sp: number;
      spLifetime: number;
    }>(
      `SELECT
         COALESCE(completed_dungon_ids, '[]'::jsonb) AS "completedDungonIds",
         COALESCE(sp_bank, 0) AS sp,
         COALESCE(sp_lifetime, 0) AS "spLifetime"
       FROM pcs
       WHERE id = $1 AND userguid = $2
       FOR UPDATE`,
      [id, userguid]
    );

    if (!existingRows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    const completedDungonIds = Array.isArray(existingRows[0].completedDungonIds)
      ? existingRows[0].completedDungonIds
      : [];
    const alreadyCompleted = completedDungonIds.includes(safeDungonId);

    if (alreadyCompleted || safeReward <= 0) {
      await client.query(
        `UPDATE pcs
         SET completed_dungon_ids = CASE
           WHEN COALESCE(completed_dungon_ids, '[]'::jsonb) @> to_jsonb(ARRAY[$3]::int[])
             THEN COALESCE(completed_dungon_ids, '[]'::jsonb)
           ELSE COALESCE(completed_dungon_ids, '[]'::jsonb) || to_jsonb($3::int)
         END,
         updatedat = NOW()
         WHERE id = $1 AND userguid = $2`,
        [id, userguid, safeDungonId]
      );

      await client.query('COMMIT');
      return {
        awarded: false,
        sp: existingRows[0].sp,
        spLifetime: existingRows[0].spLifetime,
      };
    }

    const { rows: updatedRows } = await client.query<{ sp: number; spLifetime: number }>(
      `UPDATE pcs
       SET completed_dungon_ids = COALESCE(completed_dungon_ids, '[]'::jsonb) || to_jsonb($3::int),
           sp_bank = COALESCE(sp_bank, 0) + $4,
           sp_lifetime = COALESCE(sp_lifetime, 0) + $4,
           updatedat = NOW()
       WHERE id = $1 AND userguid = $2
       RETURNING COALESCE(sp_bank, 0) AS sp, COALESCE(sp_lifetime, 0) AS "spLifetime"`,
      [id, userguid, safeDungonId, safeReward]
    );

    await client.query('COMMIT');
    return {
      awarded: true,
      sp: updatedRows[0]?.sp ?? existingRows[0].sp,
      spLifetime: updatedRows[0]?.spLifetime ?? existingRows[0].spLifetime,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/** Append a single tresher id to the PC's tresherids JSON array. */
export const addTresherIdToPcInDb = async (pcId: number, tresherId: number): Promise<void> => {
  await pool.query(
    `UPDATE pcs
     SET tresherids = COALESCE(tresherids, '[]'::jsonb) || to_jsonb($2::int),
         updatedat = NOW()
     WHERE id = $1`,
    [pcId, tresherId]
  );
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
       numberofattacks,
       agility,
       ismaingame,
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
       $34,
       $35,
       $36,
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
       COALESCE(sp_bank, 0) AS sp,
       COALESCE(sp_lifetime, 0) AS "spLifetime",
       COALESCE(agility, 3) AS agility,
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
       COALESCE(numberofattacks, 1) AS "numberOfAttacks",
       COALESCE(numberofdefends, 1) AS "numberOfDefends",
       COALESCE(issample, FALSE) AS issample,
       COALESCE(ismaingame, FALSE) AS ismaingame,
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
      Math.max(1, Math.floor(payload.numberOfAttacks ?? 1)),
      Math.max(0, Math.floor(payload.agility ?? 3)),
      payload.ismaingame === true,
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
       numberofattacks = $35,
       agility = $36,
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
       COALESCE(sp_bank, 0) AS sp,
       COALESCE(sp_lifetime, 0) AS "spLifetime",
       COALESCE(agility, 3) AS agility,
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
       COALESCE(numberofattacks, 1) AS "numberOfAttacks",
       COALESCE(numberofdefends, 1) AS "numberOfDefends",
       COALESCE(issample, FALSE) AS issample,
       COALESCE(ismaingame, FALSE) AS ismaingame,
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
      Math.max(1, Math.floor(payload.numberOfAttacks ?? 1)),
      Math.max(0, Math.floor(payload.agility ?? 3)),
    ]
  );

  return rows[0] ?? null;
};

export const deletePcForUser = async (id: number, userguid: string): Promise<boolean> => {
  const { rowCount } = await pool.query(
    'DELETE FROM pcs WHERE id = $1 AND userguid = $2',
    [id, userguid]
  );
  return (rowCount ?? 0) > 0;
};

export const upgradeNoa = async (
  id: number,
  userguid: string,
  spCost: number,
  goldCost: number,
  tresherId: number | null
): Promise<{ sp: number; numberOfAttacks: number; newGold: number | null } | null> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{ sp: number; numberofattacks: number }>(
      `UPDATE pcs
       SET sp_bank = GREATEST(0, COALESCE(sp_bank, 0) - $3),
           numberofattacks = COALESCE(numberofattacks, 1) + 1,
           updatedat = NOW()
       WHERE id = $1 AND userguid = $2 AND COALESCE(sp_bank, 0) >= $3
       RETURNING COALESCE(sp_bank, 0) AS sp, COALESCE(numberofattacks, 1) AS numberofattacks`,
      [id, userguid, spCost]
    );

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    let newGold: number | null = null;
    if (goldCost > 0 && tresherId !== null) {
      const goldResult = await client.query<{ gold: number }>(
        `UPDATE treshers
         SET gold = GREATEST(0, COALESCE(gold, 0) - $3),
             updatedat = NOW()
         WHERE id = $1 AND userguid = $2 AND COALESCE(gold, 0) >= $3
         RETURNING COALESCE(gold, 0) AS gold`,
        [tresherId, userguid, goldCost]
      );
      if (!goldResult.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      newGold = goldResult.rows[0].gold;
    }

    await client.query('COMMIT');
    return { sp: rows[0].sp, numberOfAttacks: rows[0].numberofattacks, newGold };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const upgradeNod = async (
  id: number,
  userguid: string,
  spCost: number,
  goldCost: number,
  tresherId: number | null
): Promise<{ sp: number; numberOfDefends: number; newGold: number | null } | null> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{ sp: number; numberofdefends: number }>(
      `UPDATE pcs
       SET sp_bank = GREATEST(0, COALESCE(sp_bank, 0) - $3),
           numberofdefends = COALESCE(numberofdefends, 1) + 1,
           updatedat = NOW()
       WHERE id = $1 AND userguid = $2 AND COALESCE(sp_bank, 0) >= $3
       RETURNING COALESCE(sp_bank, 0) AS sp, COALESCE(numberofdefends, 1) AS numberofdefends`,
      [id, userguid, spCost]
    );

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    let newGold: number | null = null;
    if (goldCost > 0 && tresherId !== null) {
      const goldResult = await client.query<{ gold: number }>(
        `UPDATE treshers
         SET gold = GREATEST(0, COALESCE(gold, 0) - $3),
             updatedat = NOW()
         WHERE id = $1 AND userguid = $2 AND COALESCE(gold, 0) >= $3
         RETURNING COALESCE(gold, 0) AS gold`,
        [tresherId, userguid, goldCost]
      );
      if (!goldResult.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      newGold = goldResult.rows[0].gold;
    }

    await client.query('COMMIT');
    return { sp: rows[0].sp, numberOfDefends: rows[0].numberofdefends, newGold };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export interface SamplePcRecord {
  id: number;
  name: string;
  species: string;
  type: string;
  imagePath: string | null;
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
  ismaingame: boolean;
}

export const getSamplePcsFromDb = async (): Promise<SamplePcRecord[]> => {
  const { rows } = await pool.query<SamplePcRecord>(
    `SELECT
       p.id,
       p.name,
       p.species,
       p.type,
       i.path AS "imagePath",
       p.maxhp AS "maxHP",
       p.currenthp AS "currentHP",
       p.ac,
       p.actioneconomy AS "actionEconomy",
       p.strength,
       p.stamina,
       p.mind,
       p.mp AS "magicPower",
       p.rangeofview AS "rangeOfView"
     FROM pcs p
     LEFT JOIN images i ON i.id = p.imageid AND i.isactive = true
     WHERE p.issample = TRUE
     ORDER BY p.id ASC`
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

export const setIsMainGamePcInDb = async (id: number, ismaingame: boolean): Promise<boolean> => {
  const { rowCount } = await pool.query(
    `UPDATE pcs SET ismaingame = $2 WHERE id = $1`,
    [id, ismaingame]
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
      COALESCE(sp_bank, 0) AS sp,
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
       COALESCE(issample, FALSE) AS issample,
       COALESCE(ismaingame, FALSE) AS ismaingame,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM pcs
     WHERE id = $1 AND issample = TRUE`,
    [id]
  );
  return rows[0] ?? null;
};

export type UpgradeStatName = 'strength' | 'stamina' | 'mind' | 'magicPower' | 'agility' | 'numberOfAttacks' | 'numberOfDefends';

const STAT_COLUMN_MAP: Record<UpgradeStatName, { column: string; cost: number }> = {
  strength:        { column: 'strength',        cost: 1 },
  stamina:         { column: 'stamina',          cost: 1 },
  mind:            { column: 'mind',             cost: 1 },
  magicPower:      { column: 'mp',               cost: 1 },
  agility:         { column: 'agility',          cost: 1 },
  numberOfAttacks: { column: 'numberofattacks',  cost: 5 },
  numberOfDefends: { column: 'numberofdefends',  cost: 5 },
};

export const upgradeStat = async (
  id: number,
  userguid: string,
  stat: UpgradeStatName
): Promise<{ sp: number; newValue: number } | null> => {
  const mapping = STAT_COLUMN_MAP[stat];
  if (!mapping) return null;
  const { column, cost } = mapping;
  // column is safe: it comes from our hardcoded whitelist, not user input.
  const { rows } = await pool.query<{ sp: number; newvalue: number }>(
    `UPDATE pcs
     SET sp_bank = GREATEST(0, COALESCE(sp_bank, 0) - $3),
         ${column} = COALESCE(${column}, 0) + 1,
         updatedat = NOW()
     WHERE id = $1 AND userguid = $2 AND COALESCE(sp_bank, 0) >= $3
     RETURNING COALESCE(sp_bank, 0) AS sp, COALESCE(${column}, 0) AS newvalue`,
    [id, userguid, cost]
  );
  if (!rows[0]) return null;
  return { sp: rows[0].sp, newValue: rows[0].newvalue };
};

export const getAllPcsForAdmin = async (): Promise<AdminPcRecord[]> => {
  const { rows } = await pool.query<AdminPcRecord>(
    `SELECT
       id,
       name,
       species,
       type,
       COALESCE(issample, FALSE) AS issample,
       COALESCE(ismaingame, FALSE) AS ismaingame
     FROM pcs
     ORDER BY LOWER(name) ASC, id ASC`
  );
  return rows;
};
