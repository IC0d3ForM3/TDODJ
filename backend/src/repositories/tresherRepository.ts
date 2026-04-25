import pool from '../db';

export interface TresherRecord {
  id: number;
  userguid: string;
  type: string;
  name: string;
  description: string;
  gold: number;
  silver: number;
  copper: number;
  zinc: number;
  item1Id: number | null;
  item2Id: number | null;
  item3Id: number | null;
  item4Id: number | null;
  spell1Id: number | null;
  spell2Id: number | null;
  spell3Id: number | null;
  spell4Id: number | null;
  curse1Id: number | null;
  curse2Id: number | null;
  isPublic: boolean;
  isquest: boolean;
  createdAt: string;
  updatedAt: string;
  spReward: number;
  imageId: number | null;
  soundId: number | null;
  potion1Id: number | null;
  potion2Id: number | null;
  potion3Id: number | null;
}

export interface UpsertTresherPayload {
  type: string;
  name: string;
  description: string;
  gold: number;
  silver: number;
  copper: number;
  zinc: number;
  item1Id: number | null;
  item2Id: number | null;
  item3Id: number | null;
  item4Id: number | null;
  spell1Id: number | null;
  spell2Id: number | null;
  spell3Id: number | null;
  spell4Id: number | null;
  curse1Id: number | null;
  curse2Id: number | null;
  isPublic: boolean;
  isquest: boolean;
  spReward: number;
  imageId: number | null;
  soundId: number | null;
  potion1Id: number | null;
  potion2Id: number | null;
  potion3Id: number | null;
}

const SELECT_TRESHER_FIELDS = `
  id,
  userguid::text AS userguid,
  type,
  name,
  description,
  COALESCE(gold, 0) AS gold,
  COALESCE(silver, 0) AS silver,
  COALESCE(copper, 0) AS copper,
  COALESCE(zinc, 0) AS zinc,
  item1id AS "item1Id",
  item2id AS "item2Id",
  item3id AS "item3Id",
  item4id AS "item4Id",
  spell1id AS "spell1Id",
  spell2id AS "spell2Id",
  spell3id AS "spell3Id",
  spell4id AS "spell4Id",
  curse1id AS "curse1Id",
  curse2id AS "curse2Id",
  ispublic AS "isPublic",
  createdat::text AS "createdAt",
  updatedat::text AS "updatedAt",
  COALESCE(spreward, 0) AS "spReward",
  imageid AS "imageId",
  soundid AS "soundId",
  potion1id AS "potion1Id",
  potion2id AS "potion2Id",
  potion3id AS "potion3Id",
  COALESCE(isquest, FALSE) AS isquest
`;

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
    `SELECT ${SELECT_TRESHER_FIELDS}
     FROM treshers
     WHERE userguid = $1
     ORDER BY LOWER(name) ASC, id ASC`,
    [userguid]
  );

  return rows;
};

export const getTresherLibraryByUserGuid = async (
  userguid: string
): Promise<TresherRecord[]> => {
  const { rows } = await pool.query<TresherRecord>(
    `SELECT ${SELECT_TRESHER_FIELDS}
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
    `SELECT ${SELECT_TRESHER_FIELDS}
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
       gold,
       silver,
       copper,
       zinc,
       item1id,
       item2id,
       item3id,
       item4id,
       spell1id,
       spell2id,
       spell3id,
       spell4id,
       curse1id,
       curse2id,
       ispublic,
       isquest,
       spreward,
       imageid,
       soundid,
       potion1id,
       potion2id,
       potion3id,
       updatedat
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
       NOW()
     )
     RETURNING ${SELECT_TRESHER_FIELDS}`,
    [
      userguid,
      payload.type,
      payload.name,
      payload.description,
      payload.gold,
      payload.silver,
      payload.copper,
      payload.zinc,
      payload.item1Id,
      payload.item2Id,
      payload.item3Id,
      payload.item4Id,
      payload.spell1Id,
      payload.spell2Id,
      payload.spell3Id,
      payload.spell4Id,
      payload.curse1Id,
      payload.curse2Id,
      payload.isPublic,
      payload.isquest,
      payload.spReward,
      payload.imageId,
      payload.soundId,
      payload.potion1Id,
      payload.potion2Id,
      payload.potion3Id,
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
       gold = $6,
       silver = $7,
       copper = $8,
       zinc = $9,
       item1id = $10,
       item2id = $11,
       item3id = $12,
       item4id = $13,
       spell1id = $14,
       spell2id = $15,
       spell3id = $16,
       spell4id = $17,
       curse1id = $18,
       curse2id = $19,
       ispublic = $20,
       isquest = $21,
       spreward = $22,
       imageid = $23,
       soundid = $24,
       potion1id = $25,
       potion2id = $26,
       potion3id = $27,
       updatedat = NOW()
     WHERE id = $1 AND userguid = $2
     RETURNING ${SELECT_TRESHER_FIELDS}`,
    [
      id,
      userguid,
      payload.type,
      payload.name,
      payload.description,
      payload.gold,
      payload.silver,
      payload.copper,
      payload.zinc,
      payload.item1Id,
      payload.item2Id,
      payload.item3Id,
      payload.item4Id,
      payload.spell1Id,
      payload.spell2Id,
      payload.spell3Id,
      payload.spell4Id,
      payload.curse1Id,
      payload.curse2Id,
      payload.isPublic,
      payload.isquest,
      payload.spReward,
      payload.imageId,
      payload.soundId,
      payload.potion1Id,
      payload.potion2Id,
      payload.potion3Id,
    ]
  );

  return rows[0] ?? null;
};

/** Look up isquest treshers by IDs, sum their spReward, award SP to PC. */
export const tavernTurnInQuestItems = async (
  pcId: number,
  userguid: string,
  tresherIds: number[]
): Promise<{ spAwarded: number; newSp: number } | null> => {
  if (tresherIds.length === 0) return { spAwarded: 0, newSp: 0 };

  // Fetch SP rewards for the given tresher IDs — only accept isquest=true ones
  const placeholders = tresherIds.map((_, i) => `$${i + 1}`).join(', ');
  const { rows: tresherRows } = await pool.query<{ id: number; spreward: number }>(
    `SELECT id, COALESCE(spreward, 0) AS spreward FROM treshers WHERE id IN (${placeholders}) AND isquest = TRUE`,
    tresherIds
  );

  const spAwarded = tresherRows.reduce((sum, r) => sum + r.spreward, 0);
  if (spAwarded === 0) return { spAwarded: 0, newSp: 0 };

  // Award SP to the PC
  const { rows: pcRows } = await pool.query<{ sp: number }>(
    `UPDATE pcs SET sp = COALESCE(sp, 0) + $1 WHERE id = $2 AND userguid = $3 RETURNING sp`,
    [spAwarded, pcId, userguid]
  );

  if (!pcRows[0]) return null;
  return { spAwarded, newSp: pcRows[0].sp };
};
