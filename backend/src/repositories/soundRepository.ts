import pool from '../db';

export interface SoundRecord {
  id: number;
  userguid: string;
  path: string;
  isPublic: boolean;
  isActive: boolean;
  name: string;
  assettype: string;
  createdAt: string;
  updatedAt: string;
  username?: string;
}

export interface CreateSoundPayload {
  path: string;
  isPublic: boolean;
  isActive: boolean;
  name: string;
  assettype: string;
}

export interface UpdateSoundPayload {
  path: string;
  isPublic: boolean;
  isActive: boolean;
  name: string;
  assettype: string;
}

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

export const getSoundsByUserGuid = async (userguid: string): Promise<SoundRecord[]> => {
  const { rows } = await pool.query<SoundRecord>(
    `SELECT
       id,
       userguid::text AS userguid,
       path,
       ispublic AS "isPublic",
       isactive AS "isActive",
       name,
       assettype::text AS assettype,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM sounds
     WHERE userguid = $1
     ORDER BY updatedat DESC, id DESC`,
    [userguid]
  );

  return rows;
};

export const getSoundLibraryByUserGuid = async (userguid: string): Promise<SoundRecord[]> => {
  const { rows } = await pool.query<SoundRecord>(
    `SELECT
       s.id,
       s.userguid::text AS userguid,
       s.path,
       s.ispublic AS "isPublic",
       s.isactive AS "isActive",
       s.name,
       s.assettype::text AS assettype,
       s.createdat::text AS "createdAt",
       s.updatedat::text AS "updatedAt",
       COALESCE(u.username, '') AS username
     FROM sounds s
     LEFT JOIN users u ON u.key::text = s.userguid::text
     WHERE (s.userguid = $1 OR s.ispublic = true) AND s.isactive = true
     ORDER BY
       CASE WHEN s.userguid = $1 THEN 0 ELSE 1 END,
       s.updatedat DESC,
       s.id DESC`,
    [userguid]
  );

  return rows;
};

export const getAllSoundsWithUsername = async (): Promise<SoundRecord[]> => {
  const { rows } = await pool.query<SoundRecord>(
    `SELECT
       s.id,
       s.userguid::text AS userguid,
       s.path,
       s.ispublic AS "isPublic",
       s.isactive AS "isActive",
       s.name,
       s.assettype::text AS assettype,
       s.createdat::text AS "createdAt",
       s.updatedat::text AS "updatedAt",
       COALESCE(u.username, '') AS username
     FROM sounds s
     LEFT JOIN users u ON u.key::text = s.userguid::text
     WHERE s.isactive = true
     ORDER BY u.username ASC, s.updatedat DESC, s.id DESC`
  );
  return rows;
};

export const getSoundsByIds = async (ids: number[]): Promise<SoundRecord[]> => {
  if (ids.length === 0) {
    return [];
  }

  const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
  const { rows } = await pool.query<SoundRecord>(
    `SELECT
       id,
       userguid::text AS userguid,
       path,
       ispublic AS "isPublic",
       isactive AS "isActive",
       name,
       assettype::text AS assettype,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM sounds
     WHERE id IN (${placeholders})`,
    ids
  );

  return rows;
};

export const isSoundAccessibleByIdForUser = async (
  soundId: number,
  userguid: string
): Promise<boolean> => {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id
     FROM sounds
     WHERE id = $1
       AND (userguid = $2 OR ispublic = true)
     LIMIT 1`,
    [soundId, userguid]
  );

  return rows.length > 0;
};

export const insertSoundForUser = async (
  userguid: string,
  payload: CreateSoundPayload
): Promise<SoundRecord> => {
  const { rows } = await pool.query<SoundRecord>(
    `INSERT INTO sounds (
       userguid,
       path,
       ispublic,
       isactive,
       name,
       assettype,
       updatedat
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       $6,
       NOW()
     )
     RETURNING
       id,
       userguid::text AS userguid,
       path,
       ispublic AS "isPublic",
       isactive AS "isActive",
       name,
       assettype::text AS assettype,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"`,
    [userguid, payload.path, payload.isPublic, payload.isActive, payload.name, payload.assettype]
  );

  return rows[0];
};

export const updateSoundForUser = async (
  id: number,
  userguid: string,
  payload: UpdateSoundPayload
): Promise<SoundRecord | null> => {
  const { rows } = await pool.query<SoundRecord>(
    `UPDATE sounds
     SET
       path = $3,
       ispublic = $4,
       isactive = $5,
       name = $6,
       assettype = $7,
       updatedat = NOW()
     WHERE id = $1 AND userguid = $2
     RETURNING
       id,
       userguid::text AS userguid,
       path,
       ispublic AS "isPublic",
       isactive AS "isActive",
       name,
       assettype::text AS assettype,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"`,
    [id, userguid, payload.path, payload.isPublic, payload.isActive, payload.name, payload.assettype]
  );

  return rows[0] ?? null;
};

export const checkSoundInUse = async (id: number): Promise<boolean> => {
  const results = await Promise.all([
    pool.query('SELECT 1 FROM monsters WHERE soundid = $1 LIMIT 1', [id]),
    pool.query('SELECT 1 FROM spells WHERE soundid = $1 LIMIT 1', [id]),
    pool.query('SELECT 1 FROM curses WHERE soundid = $1 LIMIT 1', [id]),
    pool.query('SELECT 1 FROM potions WHERE soundid = $1 LIMIT 1', [id]),
    pool.query('SELECT 1 FROM items WHERE soundid = $1 LIMIT 1', [id]),
    pool.query('SELECT 1 FROM treshers WHERE soundid = $1 LIMIT 1', [id]),
  ]);
  return results.some((r) => r.rows.length > 0);
};

export const deleteSoundForUser = async (id: number, userguid: string): Promise<boolean> => {
  const { rowCount } = await pool.query(
    'DELETE FROM sounds WHERE id = $1 AND userguid = $2',
    [id, userguid]
  );
  return (rowCount ?? 0) > 0;
};
