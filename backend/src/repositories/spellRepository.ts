import pool from '../db';

const PG_UNDEFINED_COLUMN = '42703';

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
  effectDiceCount: number;
  effectDiceSides: number;
  effectAmount2DiceCount: number;
  effectAmount2DiceSides: number;
  value: number;
  sp: number;
  minLtsp: number;
  learnCostGp: number;
  successTestValue: number;
  magicCost: number;
  costToLearn: number;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
  numberOfTargets: number;
  effectType: string;
  effectColor: string;
  effectOnPc1: boolean;
  effectOnPc2: boolean;
  range1: number;
  range2: number;
  lastFor1: number;
  lastFor2: number;
  createdAt: string;
  updatedAt: string;
  username?: string;
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
  effectDiceCount: number;
  effectDiceSides: number;
  effectAmount2DiceCount: number;
  effectAmount2DiceSides: number;
  value: number;
  sp: number;
  minLtsp: number;
  learnCostGp: number;
  successTestValue: number;
  magicCost: number;
  costToLearn: number;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
  numberOfTargets: number;
  effectType: string;
  effectColor: string;
  effectOnPc1: boolean;
  effectOnPc2: boolean;
  range1: number;
  range2: number;
  lastFor1: number;
  lastFor2: number;
}

const SELECT_SPELL_FIELDS = `
  id,
  userguid::text AS userguid,
  name,
  description,
  COALESCE(range1, range, 0) AS range,
  effecton AS "effectOn",
  COALESCE(effecton2, '') AS "effectOn2",
  COALESCE(lastfor1, lastfor, 0) AS "lastFor",
  damage AS "effectAmount",
  COALESCE(effectamount2, 0) AS "effectAmount2",
  COALESCE(effectdicecount, 1) AS "effectDiceCount",
  COALESCE(effectdicesides, GREATEST(0, damage)) AS "effectDiceSides",
  COALESCE(effectamount2dicecount, CASE WHEN COALESCE(effectamount2, 0) > 0 THEN 1 ELSE 0 END) AS "effectAmount2DiceCount",
  COALESCE(effectamount2dicesides, GREATEST(0, COALESCE(effectamount2, 0))) AS "effectAmount2DiceSides",
  COALESCE(value, 0) AS value,
  COALESCE(sp, 0) AS sp,
  COALESCE(minltsp, COALESCE(sp, 0)) AS "minLtsp",
  COALESCE(learncostgp, 0) AS "learnCostGp",
  COALESCE(successtestvalue, 0) AS "successTestValue",
  COALESCE(magiccost, 1) AS "magicCost",
  COALESCE(costtolearn, 0) AS "costToLearn",
  imageid AS "imageId",
  soundid AS "soundId",
  ispublic AS "isPublic",
  COALESCE(numberoftargets, 1) AS "numberOfTargets",
  COALESCE(effecttype, 'Other') AS "effectType",
  COALESCE(effectcolor, '#ffffff') AS "effectColor",
  COALESCE(effectonpc1, FALSE) AS "effectOnPc1",
  COALESCE(effectonpc2, FALSE) AS "effectOnPc2",
  COALESCE(range1, range, 0) AS "range1",
  COALESCE(range2, range, 0) AS "range2",
  COALESCE(lastfor1, lastfor, 0) AS "lastFor1",
  COALESCE(lastfor2, lastfor, 0) AS "lastFor2",
  createdat::text AS "createdAt",
  updatedat::text AS "updatedAt"
`;

const SELECT_SPELL_FIELDS_LEGACY = `
  id,
  userguid::text AS userguid,
  name,
  description,
  COALESCE(range1, range, 0) AS range,
  effecton AS "effectOn",
  COALESCE(effecton2, '') AS "effectOn2",
  COALESCE(lastfor1, lastfor, 0) AS "lastFor",
  damage AS "effectAmount",
  COALESCE(effectamount2, 0) AS "effectAmount2",
  CASE WHEN GREATEST(0, COALESCE(damage, 0)) > 0 THEN 1 ELSE 0 END AS "effectDiceCount",
  GREATEST(0, COALESCE(damage, 0)) AS "effectDiceSides",
  CASE WHEN GREATEST(0, COALESCE(effectamount2, 0)) > 0 THEN 1 ELSE 0 END AS "effectAmount2DiceCount",
  GREATEST(0, COALESCE(effectamount2, 0)) AS "effectAmount2DiceSides",
  COALESCE(value, 0) AS value,
  COALESCE(sp, 0) AS sp,
  COALESCE(sp, 0) AS "minLtsp",
  0 AS "learnCostGp",
  COALESCE(successtestvalue, 0) AS "successTestValue",
  COALESCE(magiccost, 1) AS "magicCost",
  COALESCE(costtolearn, 0) AS "costToLearn",
  imageid AS "imageId",
  soundid AS "soundId",
  ispublic AS "isPublic",
  COALESCE(numberoftargets, 1) AS "numberOfTargets",
  COALESCE(effecttype, 'Other') AS "effectType",
  COALESCE(effectcolor, '#ffffff') AS "effectColor",
  COALESCE(effectonpc1, FALSE) AS "effectOnPc1",
  COALESCE(effectonpc2, FALSE) AS "effectOnPc2",
  COALESCE(range1, range, 0) AS "range1",
  COALESCE(range2, range, 0) AS "range2",
  COALESCE(lastfor1, lastfor, 0) AS "lastFor1",
  COALESCE(lastfor2, lastfor, 0) AS "lastFor2",
  createdat::text AS "createdAt",
  updatedat::text AS "updatedAt"
`;

interface PgErrorWithCode {
  code?: string;
}

function isUndefinedColumnError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as PgErrorWithCode).code === PG_UNDEFINED_COLUMN;
}

export const fetchSpellsByIds = async (ids: number[]): Promise<SpellRecord[]> => {
  if (ids.length === 0) return [];
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  try {
    const { rows } = await pool.query<SpellRecord>(
      `SELECT ${SELECT_SPELL_FIELDS} FROM spells WHERE id IN (${placeholders})`,
      ids
    );
    return rows;
  } catch (err) {
    if (!isUndefinedColumnError(err)) throw err;
    const { rows } = await pool.query<SpellRecord>(
      `SELECT ${SELECT_SPELL_FIELDS_LEGACY} FROM spells WHERE id IN (${placeholders})`,
      ids
    );
    return rows;
  }
};

/** Look up public spells by exact name and return their id + name. */
export const getPublicSpellsByNames = async (names: string[]): Promise<Array<{ id: number; name: string }>> => {
  if (names.length === 0) return [];
  const placeholders = names.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM spells WHERE ispublic = TRUE AND name IN (${placeholders})`,
    names
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
  try {
    const { rows } = await pool.query<SpellRecord>(
      `SELECT ${SELECT_SPELL_FIELDS}
       FROM spells
       WHERE userguid = $1
       ORDER BY LOWER(name) ASC, id ASC`,
      [userguid]
    );
    return rows;
  } catch (err) {
    if (!isUndefinedColumnError(err)) throw err;
    const { rows } = await pool.query<SpellRecord>(
      `SELECT ${SELECT_SPELL_FIELDS_LEGACY}
       FROM spells
       WHERE userguid = $1
       ORDER BY LOWER(name) ASC, id ASC`,
      [userguid]
    );
    return rows;
  }
};

export const getAllSpellsWithUsername = async (): Promise<SpellRecord[]> => {
  try {
    const { rows } = await pool.query<SpellRecord>(
      `SELECT s.id, s.userguid::text AS userguid, s.name, s.description,
         COALESCE(s.range1, s.range, 0) AS range,
         s.effecton AS "effectOn", COALESCE(s.effecton2, '') AS "effectOn2",
         COALESCE(s.lastfor1, s.lastfor, 0) AS "lastFor",
         s.damage AS "effectAmount", COALESCE(s.effectamount2, 0) AS "effectAmount2",
         COALESCE(s.effectdicecount, 1) AS "effectDiceCount",
         COALESCE(s.effectdicesides, GREATEST(0, s.damage)) AS "effectDiceSides",
         COALESCE(s.effectamount2dicecount, CASE WHEN COALESCE(s.effectamount2, 0) > 0 THEN 1 ELSE 0 END) AS "effectAmount2DiceCount",
         COALESCE(s.effectamount2dicesides, GREATEST(0, COALESCE(s.effectamount2, 0))) AS "effectAmount2DiceSides",
         COALESCE(s.value, 0) AS value, COALESCE(s.sp, 0) AS sp,
         COALESCE(s.minltsp, COALESCE(s.sp, 0)) AS "minLtsp",
         COALESCE(s.learncostgp, 0) AS "learnCostGp",
         COALESCE(s.successtestvalue, 0) AS "successTestValue",
         COALESCE(s.magiccost, 1) AS "magicCost", COALESCE(s.costtolearn, 0) AS "costToLearn",
         s.imageid AS "imageId", s.soundid AS "soundId",
         s.ispublic AS "isPublic",
         COALESCE(s.numberoftargets, 1) AS "numberOfTargets",
         COALESCE(s.effecttype, 'Other') AS "effectType",
         COALESCE(s.effectcolor, '#ffffff') AS "effectColor",
         COALESCE(s.effectonpc1, FALSE) AS "effectOnPc1",
         COALESCE(s.effectonpc2, FALSE) AS "effectOnPc2",
         COALESCE(s.range1, s.range, 0) AS "range1",
         COALESCE(s.range2, s.range, 0) AS "range2",
         COALESCE(s.lastfor1, s.lastfor, 0) AS "lastFor1",
         COALESCE(s.lastfor2, s.lastfor, 0) AS "lastFor2",
         s.createdat::text AS "createdAt", s.updatedat::text AS "updatedAt",
         COALESCE(u.username, '') AS username
       FROM spells s
       LEFT JOIN users u ON u.key::text = s.userguid::text
       ORDER BY LOWER(s.name) ASC, s.id ASC`
    );
    return rows;
  } catch (err) {
    if (!isUndefinedColumnError(err)) throw err;
    const { rows } = await pool.query<SpellRecord>(
      `SELECT s.id, s.userguid::text AS userguid, s.name, s.description,
         COALESCE(s.range1, s.range, 0) AS range,
         s.effecton AS "effectOn", COALESCE(s.effecton2, '') AS "effectOn2",
         COALESCE(s.lastfor1, s.lastfor, 0) AS "lastFor",
         s.damage AS "effectAmount", COALESCE(s.effectamount2, 0) AS "effectAmount2",
         CASE WHEN GREATEST(0, COALESCE(s.damage, 0)) > 0 THEN 1 ELSE 0 END AS "effectDiceCount",
         GREATEST(0, COALESCE(s.damage, 0)) AS "effectDiceSides",
         CASE WHEN GREATEST(0, COALESCE(s.effectamount2, 0)) > 0 THEN 1 ELSE 0 END AS "effectAmount2DiceCount",
         GREATEST(0, COALESCE(s.effectamount2, 0)) AS "effectAmount2DiceSides",
         COALESCE(s.value, 0) AS value, COALESCE(s.sp, 0) AS sp,
         COALESCE(s.sp, 0) AS "minLtsp",
         0 AS "learnCostGp",
         COALESCE(s.successtestvalue, 0) AS "successTestValue",
         COALESCE(s.magiccost, 1) AS "magicCost", COALESCE(s.costtolearn, 0) AS "costToLearn",
         s.imageid AS "imageId", s.soundid AS "soundId",
         s.ispublic AS "isPublic",
         COALESCE(s.numberoftargets, 1) AS "numberOfTargets",
         COALESCE(s.effecttype, 'Other') AS "effectType",
         COALESCE(s.effectcolor, '#ffffff') AS "effectColor",
         COALESCE(s.effectonpc1, FALSE) AS "effectOnPc1",
         COALESCE(s.effectonpc2, FALSE) AS "effectOnPc2",
         COALESCE(s.range1, s.range, 0) AS "range1",
         COALESCE(s.range2, s.range, 0) AS "range2",
         COALESCE(s.lastfor1, s.lastfor, 0) AS "lastFor1",
         COALESCE(s.lastfor2, s.lastfor, 0) AS "lastFor2",
         s.createdat::text AS "createdAt", s.updatedat::text AS "updatedAt",
         COALESCE(u.username, '') AS username
       FROM spells s
       LEFT JOIN users u ON u.key::text = s.userguid::text
       ORDER BY LOWER(s.name) ASC, s.id ASC`
    );
    return rows;
  }
};

export const insertSpellForUser = async (
  userguid: string,
  payload: UpsertSpellPayload
): Promise<SpellRecord> => {
  const { rows } = await pool.query<SpellRecord>(
    `INSERT INTO spells
       (userguid, name, description, range, effecton, effecton2, lastfor, damage,
        effectamount2, effectdicecount, effectdicesides, effectamount2dicecount, effectamount2dicesides, effectto, value, sp, minltsp, learncostgp, successtestvalue, magiccost, costtolearn, imageid, soundid, ispublic, numberoftargets, effecttype, effectcolor,
        effectonpc1, effectonpc2, range1, range2, lastfor1, lastfor2)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)
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
      payload.effectDiceCount,
      payload.effectDiceSides,
      payload.effectAmount2DiceCount,
      payload.effectAmount2DiceSides,
      '',
      payload.value,
      payload.sp,
      payload.minLtsp,
      payload.learnCostGp,
      payload.successTestValue,
      payload.magicCost,
      payload.costToLearn,
      payload.imageId,
      payload.soundId,
      payload.isPublic,
      payload.numberOfTargets,
      payload.effectType,
      payload.effectColor,
      payload.effectOnPc1,
      payload.effectOnPc2,
      payload.range1,
      payload.range2,
      payload.lastFor1,
      payload.lastFor2,
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
       effectdicecount = $11,
       effectdicesides = $12,
       effectamount2dicecount = $13,
       effectamount2dicesides = $14,
       value = $15,
       sp = $16,
       minltsp = $17,
       learncostgp = $18,
       successtestvalue = $19,
       magiccost = $20,
       costtolearn = $21,
       imageid = $22,
       soundid = $23,
       ispublic = $24,
       numberoftargets = $25,
       effecttype = $26,
       effectcolor = $27,
       effectonpc1 = $28,
       effectonpc2 = $29,
       range1 = $30,
       range2 = $31,
       lastfor1 = $32,
       lastfor2 = $33,
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
      payload.effectDiceCount,
      payload.effectDiceSides,
      payload.effectAmount2DiceCount,
      payload.effectAmount2DiceSides,
      payload.value,
      payload.sp,
      payload.minLtsp,
      payload.learnCostGp,
      payload.successTestValue,
      payload.magicCost,
      payload.costToLearn,
      payload.imageId,
      payload.soundId,
      payload.isPublic,
      payload.numberOfTargets,
      payload.effectType,
      payload.effectColor,
      payload.effectOnPc1,
      payload.effectOnPc2,
      payload.range1,
      payload.range2,
      payload.lastFor1,
      payload.lastFor2,
    ]
  );
  return rows[0] ?? null;
};
