import pool from '../db';

export interface PotionRecord {
  id: number;
  userguid: string;
  name: string;
  description: string;
  effectTo: string;
  effectTo2: string | null;
  lastFor: number;
  effectAmount: number;
  effectAmount2: number;
  value: number;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertPotionPayload {
  name: string;
  description: string;
  effectTo: string;
  effectTo2: string | null;
  lastFor: number;
  effectAmount: number;
  effectAmount2: number;
  value: number;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
}

const SELECT_POTION_FIELDS = `
  id,
  userguid::text AS userguid,
  name,
  description,
  effectto AS "effectTo",
  effectto2 AS "effectTo2",
  effecttime AS "lastFor",
  effectnumber AS "effectAmount",
  COALESCE(effectamount2, 0) AS "effectAmount2",
  value,
  imageid AS "imageId",
  soundid AS "soundId",
  ispublic AS "isPublic",
  createdat::text AS "createdAt",
  updatedat::text AS "updatedAt"
`;

export const isAdminUserByGuid = async (userguid: string): Promise<boolean> => {
  const { rows } = await pool.query<{ isadmin: boolean }>(
    'SELECT isadmin FROM users WHERE key = $1',
    [userguid]
  );
  return rows[0]?.isadmin === true;
};

export const getPotionsByUserGuid = async (userguid: string): Promise<PotionRecord[]> => {
  const { rows } = await pool.query<PotionRecord>(
    `SELECT ${SELECT_POTION_FIELDS}
     FROM potions
     WHERE userguid = $1
     ORDER BY LOWER(name) ASC, id ASC`,
    [userguid]
  );
  return rows;
};

export const getPotionsByIds = async (ids: number[]): Promise<PotionRecord[]> => {
  if (ids.length === 0) return [];
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query<PotionRecord>(
    `SELECT ${SELECT_POTION_FIELDS}
     FROM potions
     WHERE id IN (${placeholders})`,
    ids
  );
  return rows;
};

/** Look up public potions by exact name and return their id + name. */
export const getPublicPotionsByNames = async (names: string[]): Promise<Array<{ id: number; name: string }>> => {
  if (names.length === 0) return [];
  const placeholders = names.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM potions WHERE ispublic = TRUE AND name IN (${placeholders})`,
    names
  );
  return rows;
};

export const insertPotionForUser = async (
  userguid: string,
  payload: UpsertPotionPayload
): Promise<PotionRecord> => {
  const { rows } = await pool.query<PotionRecord>(
    `INSERT INTO potions
       (userguid, name, description, effectto, effectto2, effecttime, effectnumber,
        effectamount2, value, imageid, soundid, ispublic)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING ${SELECT_POTION_FIELDS}`,
    [
      userguid,
      payload.name,
      payload.description,
      payload.effectTo,
      payload.effectTo2,
      payload.lastFor,
      payload.effectAmount,
      payload.effectAmount2,
      payload.value,
      payload.imageId,
      payload.soundId,
      payload.isPublic,
    ]
  );
  return rows[0];
};

export const updatePotionForUser = async (
  id: number,
  userguid: string,
  payload: UpsertPotionPayload
): Promise<PotionRecord | null> => {
  const { rows } = await pool.query<PotionRecord>(
    `UPDATE potions
     SET
       name = $3,
       description = $4,
       effectto = $5,
       effectto2 = $6,
       effecttime = $7,
       effectnumber = $8,
       effectamount2 = $9,
       value = $10,
       imageid = $11,
       soundid = $12,
       ispublic = $13,
       updatedat = NOW()
     WHERE id = $1 AND userguid = $2
     RETURNING ${SELECT_POTION_FIELDS}`,
    [
      id,
      userguid,
      payload.name,
      payload.description,
      payload.effectTo,
      payload.effectTo2,
      payload.lastFor,
      payload.effectAmount,
      payload.effectAmount2,
      payload.value,
      payload.imageId,
      payload.soundId,
      payload.isPublic,
    ]
  );
  return rows[0] ?? null;
};
