import pool from '../db';

const PG_UNDEFINED_COLUMN = '42703';

export interface ItemRecord {
  id: number;
  userguid: string;
  name: string;
  description: string;
  type: string;
  range: string;
  value: number;
  weight: number;
  curseId: number | null;
  effectValue: number;
  damage: number;
  armorSlot: string | null;
  effectOn: string | null;
  effectToPc: string | null;
  effectToPcValue: number;
  note: string | null;
  minMindToRead: number;
  weaponEffectType: string;
  weaponEffectColor: string;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
  isTwoHanded: boolean;
  uses: number | null;
  scrollSpellId: number | null;
  magicCost: number;
  createdAt: string;
  updatedAt: string;
  username?: string;
}

export interface UpsertItemPayload {
  name: string;
  description: string;
  type: string;
  range: string;
  value: number;
  weight: number;
  curseId: number | null;
  effectValue: number;
  damage: number;
  armorSlot: string | null;
  effectOn: string | null;
  effectToPc: string | null;
  effectToPcValue: number;
  note: string | null;
  minMindToRead: number;
  weaponEffectType: string;
  weaponEffectColor: string;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
  isTwoHanded: boolean;
  uses: number | null;
  scrollSpellId: number | null;
  magicCost: number;
}

const SELECT_ITEM_FIELDS = `
  id,
  userguid::text AS userguid,
  name,
  description,
  type,
  COALESCE(NULLIF(range, '')::int, 0) AS range,
  value,
  weight,
  curseid AS "curseId",
  COALESCE(effectvalue, 0) AS "effectValue",
  COALESCE(damage, 0) AS "damage",
  armorslot AS "armorSlot",
  effecton AS "effectOn",
  effecttopc AS "effectToPc",
  COALESCE(effecttopcvalue, 0) AS "effectToPcValue",
  NULLIF(note, '') AS note,
  COALESCE(minmindtoread, 0) AS "minMindToRead",
  COALESCE(weaponeffecttype, 'Blood') AS "weaponEffectType",
  COALESCE(weaponeffectcolor, '#cc0000') AS "weaponEffectColor",
  imageid AS "imageId",
  soundid AS "soundId",
  ispublic AS "isPublic",
  COALESCE(istwohanded, false) AS "isTwoHanded",
  uses,
  scrollspellid AS "scrollSpellId",
  COALESCE(magiccost, 1) AS "magicCost",
  createdat::text AS "createdAt",
  updatedat::text AS "updatedAt"
`;

const SELECT_ITEM_FIELDS_LEGACY = `
  id,
  userguid::text AS userguid,
  name,
  description,
  type,
  COALESCE(NULLIF(range, '')::int, 0) AS range,
  value,
  weight,
  curseid AS "curseId",
  COALESCE(effectvalue, 0) AS "effectValue",
  COALESCE(damage, 0) AS "damage",
  armorslot AS "armorSlot",
  effecton AS "effectOn",
  effecttopc AS "effectToPc",
  COALESCE(effecttopcvalue, 0) AS "effectToPcValue",
  NULL::text AS note,
  0 AS "minMindToRead",
  COALESCE(weaponeffecttype, 'Blood') AS "weaponEffectType",
  COALESCE(weaponeffectcolor, '#cc0000') AS "weaponEffectColor",
  imageid AS "imageId",
  soundid AS "soundId",
  ispublic AS "isPublic",
  COALESCE(istwohanded, false) AS "isTwoHanded",
  uses,
  NULL::int AS "scrollSpellId",
  1 AS "magicCost",
  createdat::text AS "createdAt",
  updatedat::text AS "updatedAt"
`;

interface PgErrorWithCode {
  code?: string;
}

function isUndefinedColumnError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as PgErrorWithCode).code === PG_UNDEFINED_COLUMN;
}

export const isAdminUserByGuid = async (userguid: string): Promise<boolean> => {
  const { rows } = await pool.query<{ isadmin: boolean }>(
    'SELECT isadmin FROM users WHERE key = $1',
    [userguid]
  );
  return rows[0]?.isadmin === true;
};

export const getItemsByUserGuid = async (userguid: string): Promise<ItemRecord[]> => {
  try {
    const { rows } = await pool.query<ItemRecord>(
      `SELECT ${SELECT_ITEM_FIELDS}
       FROM items
       WHERE userguid = $1
       ORDER BY LOWER(name) ASC, id ASC`,
      [userguid]
    );
    return rows;
  } catch (err) {
    if (!isUndefinedColumnError(err)) throw err;
    const { rows } = await pool.query<ItemRecord>(
      `SELECT ${SELECT_ITEM_FIELDS_LEGACY}
       FROM items
       WHERE userguid = $1
       ORDER BY LOWER(name) ASC, id ASC`,
      [userguid]
    );
    return rows;
  }
};

export const getItemsLibraryByUserGuid = async (userguid: string): Promise<ItemRecord[]> => {
  try {
    const { rows } = await pool.query<ItemRecord>(
      `SELECT ${SELECT_ITEM_FIELDS}
       FROM items
       WHERE userguid = $1 OR ispublic = true
       ORDER BY LOWER(name) ASC, id ASC`,
      [userguid]
    );
    return rows;
  } catch (err) {
    if (!isUndefinedColumnError(err)) throw err;
    const { rows } = await pool.query<ItemRecord>(
      `SELECT ${SELECT_ITEM_FIELDS_LEGACY}
       FROM items
       WHERE userguid = $1 OR ispublic = true
       ORDER BY LOWER(name) ASC, id ASC`,
      [userguid]
    );
    return rows;
  }
};

export const getAllItemsWithUsername = async (): Promise<ItemRecord[]> => {
  try {
    const { rows } = await pool.query<ItemRecord>(
      `SELECT i.id, i.userguid::text AS userguid, i.name, i.description, i.type,
         COALESCE(NULLIF(i.range, '')::int, 0) AS range,
         i.value, i.weight, i.curseid AS "curseId",
         COALESCE(i.effectvalue, 0) AS "effectValue", COALESCE(i.damage, 0) AS "damage",
         i.armorslot AS "armorSlot", i.effecton AS "effectOn",
         i.effecttopc AS "effectToPc", COALESCE(i.effecttopcvalue, 0) AS "effectToPcValue",
         NULLIF(i.note, '') AS note,
         COALESCE(i.minmindtoread, 0) AS "minMindToRead",
         COALESCE(i.weaponeffecttype, 'Blood') AS "weaponEffectType",
         COALESCE(i.weaponeffectcolor, '#cc0000') AS "weaponEffectColor",
         i.imageid AS "imageId", i.soundid AS "soundId",
         i.ispublic AS "isPublic",
         COALESCE(i.istwohanded, false) AS "isTwoHanded",
         i.uses,
         i.createdat::text AS "createdAt", i.updatedat::text AS "updatedAt",
         COALESCE(u.username, '') AS username
       FROM items i
       LEFT JOIN users u ON u.key::text = i.userguid::text
       ORDER BY LOWER(i.name) ASC, i.id ASC`
    );
    return rows;
  } catch (err) {
    if (!isUndefinedColumnError(err)) throw err;
    const { rows } = await pool.query<ItemRecord>(
      `SELECT i.id, i.userguid::text AS userguid, i.name, i.description, i.type,
         COALESCE(NULLIF(i.range, '')::int, 0) AS range,
         i.value, i.weight, i.curseid AS "curseId",
         COALESCE(i.effectvalue, 0) AS "effectValue", COALESCE(i.damage, 0) AS "damage",
         i.armorslot AS "armorSlot", i.effecton AS "effectOn",
         i.effecttopc AS "effectToPc", COALESCE(i.effecttopcvalue, 0) AS "effectToPcValue",
         NULL::text AS note,
         0 AS "minMindToRead",
         COALESCE(i.weaponeffecttype, 'Blood') AS "weaponEffectType",
         COALESCE(i.weaponeffectcolor, '#cc0000') AS "weaponEffectColor",
         i.imageid AS "imageId", i.soundid AS "soundId",
         i.ispublic AS "isPublic",
         COALESCE(i.istwohanded, false) AS "isTwoHanded",
         i.uses,
         i.createdat::text AS "createdAt", i.updatedat::text AS "updatedAt",
         COALESCE(u.username, '') AS username
       FROM items i
       LEFT JOIN users u ON u.key::text = i.userguid::text
       ORDER BY LOWER(i.name) ASC, i.id ASC`
    );
    return rows;
  }
};

export const insertItemForUser = async (
  userguid: string,
  payload: UpsertItemPayload
): Promise<ItemRecord> => {
  const { rows } = await pool.query<ItemRecord>(
    `INSERT INTO items
       (userguid, name, description, type, range, value, weight, curseid,
        effectvalue, damage, armorslot, effecton, effecttopc, effecttopcvalue, note, minmindtoread, weaponeffecttype, weaponeffectcolor, imageid, soundid, ispublic, istwohanded, uses, scrollspellid, magiccost)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
     RETURNING ${SELECT_ITEM_FIELDS}`,
    [
      userguid,
      payload.name,
      payload.description,
      payload.type,
      payload.range,
      payload.value,
      payload.weight,
      payload.curseId,
      payload.effectValue,
      payload.damage,
      payload.armorSlot,
      payload.effectOn,
      payload.effectToPc,
      payload.effectToPcValue,
      payload.note,
      payload.minMindToRead,
      payload.weaponEffectType,
      payload.weaponEffectColor,
      payload.imageId,
      payload.soundId,
      payload.isPublic,
      payload.isTwoHanded,
      payload.uses,
      payload.scrollSpellId,
      payload.magicCost,
    ]
  );
  return rows[0];
};

export const updateItemForUser = async (
  id: number,
  userguid: string,
  payload: UpsertItemPayload
): Promise<ItemRecord | null> => {
  const { rows } = await pool.query<ItemRecord>(
    `UPDATE items
     SET name = $1,
         description = $2,
         type = $3,
         range = $4,
         value = $5,
         weight = $6,
         curseid = $7,
         effectvalue = $8,
         damage = $9,
         armorslot = $10,
         effecton = $11,
         effecttopc = $12,
         effecttopcvalue = $13,
         note = $14,
         minmindtoread = $15,
         weaponeffecttype = $16,
         weaponeffectcolor = $17,
         imageid = $18,
         soundid = $19,
         ispublic = $20,
         istwohanded = $21,
         uses = $22,
         scrollspellid = $23,
         magiccost = $24,
         updatedat = NOW()
       WHERE id = $25 AND userguid = $26
     RETURNING ${SELECT_ITEM_FIELDS}`,
    [
      payload.name,
      payload.description,
      payload.type,
      payload.range,
      payload.value,
      payload.weight,
      payload.curseId,
      payload.effectValue,
      payload.damage,
      payload.armorSlot,
      payload.effectOn,
      payload.effectToPc,
      payload.effectToPcValue,
      payload.note,
      payload.minMindToRead,
      payload.weaponEffectType,
      payload.weaponEffectColor,
      payload.imageId,
      payload.soundId,
      payload.isPublic,
      payload.isTwoHanded,
      payload.uses,
      payload.scrollSpellId,
      payload.magicCost,
      id,
      userguid,
    ]
  );
  return rows[0] ?? null;
};

export const getItemsByIds = async (ids: number[]): Promise<ItemRecord[]> => {
  if (ids.length === 0) {
    return [];
  }

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  try {
    const { rows } = await pool.query<ItemRecord>(
      `SELECT ${SELECT_ITEM_FIELDS}
       FROM items
       WHERE id IN (${placeholders})`,
      ids
    );
    return rows;
  } catch (err) {
    if (!isUndefinedColumnError(err)) throw err;
    const { rows } = await pool.query<ItemRecord>(
      `SELECT ${SELECT_ITEM_FIELDS_LEGACY}
       FROM items
       WHERE id IN (${placeholders})`,
      ids
    );
    return rows;
  }
};

export const deleteItemForUser = async (id: number, userguid: string): Promise<boolean> => {
  const { rowCount } = await pool.query(
    'DELETE FROM items WHERE id = $1 AND userguid = $2',
    [id, userguid]
  );
  return (rowCount ?? 0) > 0;
};

/** Look up public items by exact name and return their id + name. */
export const getPublicItemsByNames = async (names: string[]): Promise<Array<{ id: number; name: string }>> => {
  if (names.length === 0) return [];
  const placeholders = names.map((_, i) => `$${i + 1}`).join(', ');
  try {
    const { rows } = await pool.query<{ id: number; name: string }>(
      `SELECT id, name FROM items WHERE ispublic = TRUE AND name IN (${placeholders})`,
      names
    );
    return rows;
  } catch (err) {
    if (!isUndefinedColumnError(err)) throw err;
    const { rows } = await pool.query<{ id: number; name: string }>(
      `SELECT id, itemname AS name FROM items WHERE ispublic = TRUE AND itemname IN (${placeholders})`,
      names
    );
    return rows;
  }
};
