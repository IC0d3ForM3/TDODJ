import pool from '../db';

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
  weaponEffectType: string;
  weaponEffectColor: string;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
  isTwoHanded: boolean;
  uses: number | null;
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
  weaponEffectType: string;
  weaponEffectColor: string;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
  isTwoHanded: boolean;
  uses: number | null;
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
  COALESCE(weaponeffecttype, 'Blood') AS "weaponEffectType",
  COALESCE(weaponeffectcolor, '#cc0000') AS "weaponEffectColor",
  imageid AS "imageId",
  soundid AS "soundId",
  ispublic AS "isPublic",
  COALESCE(istwohanded, false) AS "isTwoHanded",
  uses,
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

export const getItemsByUserGuid = async (userguid: string): Promise<ItemRecord[]> => {
  const { rows } = await pool.query<ItemRecord>(
    `SELECT ${SELECT_ITEM_FIELDS}
     FROM items
     WHERE userguid = $1
     ORDER BY LOWER(name) ASC, id ASC`,
    [userguid]
  );
  return rows;
};

export const getItemsLibraryByUserGuid = async (userguid: string): Promise<ItemRecord[]> => {
  const { rows } = await pool.query<ItemRecord>(
    `SELECT ${SELECT_ITEM_FIELDS}
     FROM items
     WHERE userguid = $1 OR ispublic = true
     ORDER BY LOWER(name) ASC, id ASC`,
    [userguid]
  );
  return rows;
};

export const getAllItemsWithUsername = async (): Promise<ItemRecord[]> => {
  const { rows } = await pool.query<ItemRecord>(
    `SELECT i.id, i.userguid::text AS userguid, i.name, i.description, i.type,
       COALESCE(NULLIF(i.range, '')::int, 0) AS range,
       i.value, i.weight, i.curseid AS "curseId",
       COALESCE(i.effectvalue, 0) AS "effectValue", COALESCE(i.damage, 0) AS "damage",
       i.armorslot AS "armorSlot", i.effecton AS "effectOn",
       i.effecttopc AS "effectToPc", COALESCE(i.effecttopcvalue, 0) AS "effectToPcValue",
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
};

export const insertItemForUser = async (
  userguid: string,
  payload: UpsertItemPayload
): Promise<ItemRecord> => {
  const { rows } = await pool.query<ItemRecord>(
    `INSERT INTO items
       (userguid, name, description, type, range, value, weight, curseid,
        effectvalue, damage, armorslot, effecton, effecttopc, effecttopcvalue, weaponeffecttype, weaponeffectcolor, imageid, soundid, ispublic, istwohanded, uses)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
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
      payload.weaponEffectType,
      payload.weaponEffectColor,
      payload.imageId,
      payload.soundId,
      payload.isPublic,
      payload.isTwoHanded,
      payload.uses,
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
         weaponeffecttype = $14,
         weaponeffectcolor = $15,
         imageid = $16,
         soundid = $17,
         ispublic = $18,
         istwohanded = $19,
         uses = $20,
         updatedat = NOW()
       WHERE id = $21 AND userguid = $22
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
      payload.weaponEffectType,
      payload.weaponEffectColor,
      payload.imageId,
      payload.soundId,
      payload.isPublic,
      payload.isTwoHanded,
      payload.uses,
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
  const { rows } = await pool.query<ItemRecord>(
    `SELECT ${SELECT_ITEM_FIELDS}
     FROM items
     WHERE id IN (${placeholders})`,
    ids
  );

  return rows;
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
  const { rows } = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM items WHERE ispublic = TRUE AND name IN (${placeholders})`,
    names
  );
  return rows;
};
