import pool from '../db';

export interface SpellRecord {
  id: number;
  userguid: string;
  name: string;
  description: string;
  range: number;
  effectOn: string;
  effectOn2: string;
  lastFor: number;
  effectAmount: number;
  effectAmount2: number;
  value: number;
  sp: number;
  successTestValue: number;
  magicCost: number;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertSpellPayload {
  name: string;
  description: string;
  range: number;
  effectOn: string;
  effectOn2: string;
  lastFor: number;
  effectAmount: number;
  effectAmount2: number;
  value: number;
  sp: number;
  successTestValue: number;
  magicCost: number;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
}

const SELECT_SPELL_FIELDS = `
  id,
  userguid::text AS userguid,
  name,
  description,
  range,
  effecton AS "effectOn",
  COALESCE(effecton2, '') AS "effectOn2",
  lastfor AS "lastFor",
  damage AS "effectAmount",
  COALESCE(effectamount2, 0) AS "effectAmount2",
  COALESCE(value, 0) AS value,
  COALESCE(sp, 0) AS sp,
  COALESCE(successtestvalue, 0) AS "successTestValue",
  COALESCE(magiccost, 1) AS "magicCost",
  imageid AS "imageId",
  soundid AS "soundId",
  ispublic AS "isPublic",
  createdat::text AS "createdAt",
  updatedat::text AS "updatedAt"
`;

export const fetchSpellsByIds = async (ids: number[]): Promise<SpellRecord[]> => {
  if (ids.length === 0) return [];
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query<SpellRecord>(
    `SELECT ${SELECT_SPELL_FIELDS} FROM spells WHERE id IN (${placeholders})`,
    ids
  );
  return rows;
};

export const isAdminUserByGuid = async (userguid: string): Promise<boolean> => {
  const { rows } = await pool.query<{ isadmin: boolean }>(
    'SELECT isadmin FROM users WHERE key = $1',
    [userguid]
  );
  return rows[0]?.isadmin === true;
};

export const getSpellsByUserGuid = async (userguid: string): Promise<SpellRecord[]> => {
  const { rows } = await pool.query<SpellRecord>(
    `SELECT ${SELECT_SPELL_FIELDS}
     FROM spells
     WHERE userguid = $1
     ORDER BY updatedat DESC, id DESC`,
    [userguid]
  );
  return rows;
};

export const insertSpellForUser = async (
  userguid: string,
  payload: UpsertSpellPayload
): Promise<SpellRecord> => {
  const { rows } = await pool.query<SpellRecord>(
    `INSERT INTO spells
       (userguid, name, description, range, effecton, effecton2, lastfor, damage,
        effectamount2, effectto, value, sp, successtestvalue, magiccost, imageid, soundid, ispublic)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING ${SELECT_SPELL_FIELDS}`,
    [
      userguid,
      payload.name,
      payload.description,
      payload.range,
      payload.effectOn,
      payload.effectOn2,
      payload.lastFor,
      payload.effectAmount,
      payload.effectAmount2,
      '',
      payload.value,
      payload.sp,
      payload.successTestValue,
      payload.magicCost,
      payload.imageId,
      payload.soundId,
      payload.isPublic,
    ]
  );
  return rows[0];
};

export const updateSpellForUser = async (
  id: number,
  userguid: string,
  payload: UpsertSpellPayload
): Promise<SpellRecord | null> => {
  const { rows } = await pool.query<SpellRecord>(
    `UPDATE spells
     SET
       name = $3,
       description = $4,
       range = $5,
       effecton = $6,
       effecton2 = $7,
       lastfor = $8,
       damage = $9,
       effectamount2 = $10,
       value = $11,
       sp = $12,
       successtestvalue = $13,
       magiccost = $14,
       imageid = $15,
       soundid = $16,
       ispublic = $17,
       updatedat = NOW()
     WHERE id = $1 AND userguid = $2
     RETURNING ${SELECT_SPELL_FIELDS}`,
    [
      id,
      userguid,
      payload.name,
      payload.description,
      payload.range,
      payload.effectOn,
      payload.effectOn2,
      payload.lastFor,
      payload.effectAmount,
      payload.effectAmount2,
      payload.value,
      payload.sp,
      payload.successTestValue,
      payload.magicCost,
      payload.imageId,
      payload.soundId,
      payload.isPublic,
    ]
  );
  return rows[0] ?? null;
};
