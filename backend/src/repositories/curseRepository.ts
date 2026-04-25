import pool from '../db';

export interface CurseRecord {
  id: number;
  userguid: string;
  name: string;
  description: string;
  effectTo: string;
  effectTo2: string | null;
  damage: number;
  damage2: number;
  lastFor: number;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCursePayload {
  name: string;
  description: string;
  effectTo: string;
  effectTo2: string | null;
  damage: number;
  damage2: number;
  lastFor: number;
  imageId: number | null;
  soundId: number | null;
  isPublic: boolean;
}

const SELECT_CURSE_FIELDS = `
  id,
  userguid::text AS userguid,
  name,
  description,
  effectto AS "effectTo",
  effectto2 AS "effectTo2",
  damage,
  COALESCE(damage2, 0) AS damage2,
  lastfor AS "lastFor",
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

export const getCursesByUserGuid = async (userguid: string): Promise<CurseRecord[]> => {
  const { rows } = await pool.query<CurseRecord>(
    `SELECT ${SELECT_CURSE_FIELDS}
     FROM curses
     WHERE userguid = $1
     ORDER BY LOWER(name) ASC, id ASC`,
    [userguid]
  );
  return rows;
};

export const insertCurseForUser = async (
  userguid: string,
  payload: UpsertCursePayload
): Promise<CurseRecord> => {
  const { rows } = await pool.query<CurseRecord>(
    `INSERT INTO curses
       (userguid, name, description, effectto, effectto2, damage, damage2, lastfor, imageid, soundid, ispublic)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${SELECT_CURSE_FIELDS}`,
    [
      userguid,
      payload.name,
      payload.description,
      payload.effectTo,
      payload.effectTo2,
      payload.damage,
      payload.damage2,
      payload.lastFor,
      payload.imageId,
      payload.soundId,
      payload.isPublic,
    ]
  );
  return rows[0];
};

export const updateCurseForUser = async (
  id: number,
  userguid: string,
  payload: UpsertCursePayload
): Promise<CurseRecord | null> => {
  const { rows } = await pool.query<CurseRecord>(
    `UPDATE curses
     SET name = $1,
         description = $2,
         effectto = $3,
         effectto2 = $4,
         damage = $5,
         damage2 = $6,
         lastfor = $7,
         imageid = $8,
         soundid = $9,
         ispublic = $10,
         updatedat = NOW()
     WHERE id = $11 AND userguid = $12
     RETURNING ${SELECT_CURSE_FIELDS}`,
    [
      payload.name,
      payload.description,
      payload.effectTo,
      payload.effectTo2,
      payload.damage,
      payload.damage2,
      payload.lastFor,
      payload.imageId,
      payload.soundId,
      payload.isPublic,
      id,
      userguid,
    ]
  );
  return rows[0] ?? null;
};
