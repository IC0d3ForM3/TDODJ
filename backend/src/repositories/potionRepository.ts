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
  effectAmountMin: number;
  effectAmountDiceCount: number;
  effectAmountDiceSides: number;
  effectAmount2Min: number;
  effectAmount2DiceCount: number;
  effectAmount2DiceSides: number;
  value: number;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  username?: string;
}

export interface UpsertPotionPayload {
  name: string;
  description: string;
  effectTo: string;
  effectTo2: string | null;
  lastFor: number;
  effectAmount: number;
  effectAmount2: number;
  effectAmountMin: number;
  effectAmountDiceCount: number;
  effectAmountDiceSides: number;
  effectAmount2Min: number;
  effectAmount2DiceCount: number;
  effectAmount2DiceSides: number;
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
  COALESCE(effectnumbermin, 0) AS "effectAmountMin",
  COALESCE(effectnumberdicecount, CASE WHEN COALESCE(effectnumber, 0) > 0 THEN 1 ELSE 0 END) AS "effectAmountDiceCount",
  COALESCE(effectnumberdicesides, GREATEST(0, COALESCE(effectnumber, 0))) AS "effectAmountDiceSides",
  COALESCE(effectamount2min, 0) AS "effectAmount2Min",
  COALESCE(effectamount2dicecount, CASE WHEN COALESCE(effectamount2, 0) > 0 THEN 1 ELSE 0 END) AS "effectAmount2DiceCount",
  COALESCE(effectamount2dicesides, GREATEST(0, COALESCE(effectamount2, 0))) AS "effectAmount2DiceSides",
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

export const getAllPotionsWithUsername = async (): Promise<PotionRecord[]> => {
  const { rows } = await pool.query<PotionRecord>(
    `SELECT p.id, p.userguid::text AS userguid, p.name, p.description,
       p.effectto AS "effectTo", p.effectto2 AS "effectTo2",
       p.effecttime AS "lastFor", p.effectnumber AS "effectAmount",
       COALESCE(p.effectamount2, 0) AS "effectAmount2",
      COALESCE(p.effectnumbermin, 0) AS "effectAmountMin",
      COALESCE(p.effectnumberdicecount, CASE WHEN COALESCE(p.effectnumber, 0) > 0 THEN 1 ELSE 0 END) AS "effectAmountDiceCount",
      COALESCE(p.effectnumberdicesides, GREATEST(0, COALESCE(p.effectnumber, 0))) AS "effectAmountDiceSides",
      COALESCE(p.effectamount2min, 0) AS "effectAmount2Min",
      COALESCE(p.effectamount2dicecount, CASE WHEN COALESCE(p.effectamount2, 0) > 0 THEN 1 ELSE 0 END) AS "effectAmount2DiceCount",
      COALESCE(p.effectamount2dicesides, GREATEST(0, COALESCE(p.effectamount2, 0))) AS "effectAmount2DiceSides",
       p.value, p.imageid AS "imageId", p.soundid AS "soundId",
       p.ispublic AS "isPublic",
       p.createdat::text AS "createdAt", p.updatedat::text AS "updatedAt",
       COALESCE(u.username, '') AS username
     FROM potions p
     LEFT JOIN users u ON u.key::text = p.userguid::text
     ORDER BY LOWER(p.name) ASC, p.id ASC`
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
        effectamount2, effectnumbermin, effectnumberdicecount, effectnumberdicesides, effectamount2min, effectamount2dicecount, effectamount2dicesides, value, imageid, soundid, ispublic)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
      payload.effectAmountMin,
      payload.effectAmountDiceCount,
      payload.effectAmountDiceSides,
      payload.effectAmount2Min,
      payload.effectAmount2DiceCount,
      payload.effectAmount2DiceSides,
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
       effectnumbermin = $10,
       effectnumberdicecount = $11,
       effectnumberdicesides = $12,
       effectamount2min = $13,
       effectamount2dicecount = $14,
       effectamount2dicesides = $15,
       value = $16,
       imageid = $17,
       soundid = $18,
       ispublic = $19,
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
      payload.effectAmountMin,
      payload.effectAmountDiceCount,
      payload.effectAmountDiceSides,
      payload.effectAmount2Min,
      payload.effectAmount2DiceCount,
      payload.effectAmount2DiceSides,
      payload.value,
      payload.imageId,
      payload.soundId,
      payload.isPublic,
    ]
  );
  return rows[0] ?? null;
};
