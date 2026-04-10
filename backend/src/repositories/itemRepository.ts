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
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
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
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
}

const SELECT_ITEM_FIELDS = `
  id,
  userguid::text AS userguid,
  name,
  description,
  type,
  range,
  value,
  weight,
  curseid AS "curseId",
  COALESCE(effectvalue, 0) AS "effectValue",
  COALESCE(damage, 0) AS "damage",
  armorslot AS "armorSlot",
  effecton AS "effectOn",
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

export const getItemsByUserGuid = async (userguid: string): Promise<ItemRecord[]> => {
  const { rows } = await pool.query<ItemRecord>(
    `SELECT ${SELECT_ITEM_FIELDS}
     FROM items
     WHERE userguid = $1
     ORDER BY updatedat DESC, id DESC`,
    [userguid]
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
        effectvalue, damage, armorslot, effecton, imageid, soundid, ispublic)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
      payload.imageId,
      payload.soundId,
      payload.isPublic,
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
         imageid = $12,
         soundid = $13,
         ispublic = $14,
         updatedat = NOW()
     WHERE id = $15 AND userguid = $16
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
      payload.imageId,
      payload.soundId,
      payload.isPublic,
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
