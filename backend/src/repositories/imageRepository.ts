import pool from '../db';

export interface ImageRecord {
  id: number;
  userguid: string;
  path: string;
  isPublic: boolean;
  isActive: boolean;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateImagePayload {
  path: string;
  isPublic: boolean;
  isActive: boolean;
  name: string;
}

export interface UpdateImagePayload {
  path: string;
  isPublic: boolean;
  isActive: boolean;
  name: string;
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

export const getImagesByUserGuid = async (userguid: string): Promise<ImageRecord[]> => {
  const { rows } = await pool.query<ImageRecord>(
    `SELECT
       id,
       userguid::text AS userguid,
       path,
       ispublic AS "isPublic",
       isactive AS "isActive",
       name,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM images
     WHERE userguid = $1
     ORDER BY updatedat DESC, id DESC`,
    [userguid]
  );

  return rows;
};

export const getImageLibraryByUserGuid = async (userguid: string): Promise<ImageRecord[]> => {
  const { rows } = await pool.query<ImageRecord>(
    `SELECT
       id,
       userguid::text AS userguid,
       path,
       ispublic AS "isPublic",
       isactive AS "isActive",
       name,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM images
     WHERE (userguid = $1 OR ispublic = true) AND isactive = true
     ORDER BY
       CASE WHEN userguid = $1 THEN 0 ELSE 1 END,
       updatedat DESC,
       id DESC`,
    [userguid]
  );

  return rows;
};

export const isImageAccessibleByIdForUser = async (
  imageId: number,
  userguid: string
): Promise<boolean> => {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id
     FROM images
     WHERE id = $1
       AND (userguid = $2 OR ispublic = true)
     LIMIT 1`,
    [imageId, userguid]
  );

  return rows.length > 0;
};

export const insertImageForUser = async (
  userguid: string,
  payload: CreateImagePayload
): Promise<ImageRecord> => {
  const { rows } = await pool.query<ImageRecord>(
    `INSERT INTO images (
       userguid,
       path,
       ispublic,
       isactive,
       name,
       updatedat
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       NOW()
     )
     RETURNING
       id,
       userguid::text AS userguid,
       path,
       ispublic AS "isPublic",
       isactive AS "isActive",
       name,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"`,
    [userguid, payload.path, payload.isPublic, payload.isActive, payload.name]
  );

  return rows[0];
};

export const updateImageForUser = async (
  id: number,
  userguid: string,
  payload: UpdateImagePayload
): Promise<ImageRecord | null> => {
  const { rows } = await pool.query<ImageRecord>(
    `UPDATE images
     SET
       path = $3,
       ispublic = $4,
       isactive = $5,
       name = $6,
       updatedat = NOW()
     WHERE id = $1 AND userguid = $2
     RETURNING
       id,
       userguid::text AS userguid,
       path,
       ispublic AS "isPublic",
       isactive AS "isActive",
       name,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"`,
    [id, userguid, payload.path, payload.isPublic, payload.isActive, payload.name]
  );

  return rows[0] ?? null;
};
