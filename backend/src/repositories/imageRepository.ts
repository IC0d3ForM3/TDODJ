import pool from '../db';

export interface ImageRecord {
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

export interface CreateImagePayload {
  path: string;
  isPublic: boolean;
  isActive: boolean;
  name: string;
  assettype: string;
}

export interface UpdateImagePayload {
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

export const getImagesByUserGuid = async (userguid: string): Promise<ImageRecord[]> => {
  const { rows } = await pool.query<ImageRecord>(
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
       i.id,
       i.userguid::text AS userguid,
       i.path,
       i.ispublic AS "isPublic",
       i.isactive AS "isActive",
       i.name,
       i.assettype::text AS assettype,
       i.createdat::text AS "createdAt",
       i.updatedat::text AS "updatedAt",
       COALESCE(u.username, '') AS username
     FROM images i
     LEFT JOIN users u ON u.key::text = i.userguid::text
     WHERE (i.userguid = $1 OR i.ispublic = true) AND i.isactive = true
     ORDER BY
       CASE WHEN i.userguid = $1 THEN 0 ELSE 1 END,
       i.updatedat DESC,
       i.id DESC`,
    [userguid]
  );

  return rows;
};

export const getAllImagesWithUsername = async (): Promise<ImageRecord[]> => {
  const { rows } = await pool.query<ImageRecord>(
    `SELECT
       i.id,
       i.userguid::text AS userguid,
       i.path,
       i.ispublic AS "isPublic",
       i.isactive AS "isActive",
       i.name,
       i.assettype::text AS assettype,
       i.createdat::text AS "createdAt",
       i.updatedat::text AS "updatedAt",
       COALESCE(u.username, '') AS username
     FROM images i
     LEFT JOIN users u ON u.key::text = i.userguid::text
     WHERE i.isactive = true
     ORDER BY u.username ASC, i.updatedat DESC, i.id DESC`
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

export const getImagesByIds = async (ids: number[]): Promise<ImageRecord[]> => {
  if (ids.length === 0) {
    return [];
  }
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query<ImageRecord>(
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
     FROM images
     WHERE id IN (${placeholders})`,
    ids
  );
  return rows;
};

export const getPublicImagesByIds = async (ids: number[]): Promise<ImageRecord[]> => {
  if (ids.length === 0) {
    return [];
  }
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query<ImageRecord>(
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
     FROM images
     WHERE id IN (${placeholders}) AND ispublic = true AND isactive = true`,
    ids
  );
  return rows;
};

export const checkImageInUse = async (id: number): Promise<boolean> => {
  const results = await Promise.all([
    pool.query('SELECT 1 FROM monsters WHERE imageid = $1 LIMIT 1', [id]),
    pool.query('SELECT 1 FROM spells WHERE imageid = $1 LIMIT 1', [id]),
    pool.query('SELECT 1 FROM curses WHERE imageid = $1 LIMIT 1', [id]),
    pool.query('SELECT 1 FROM potions WHERE imageid = $1 LIMIT 1', [id]),
    pool.query('SELECT 1 FROM items WHERE imageid = $1 LIMIT 1', [id]),
    pool.query('SELECT 1 FROM treshers WHERE imageid = $1 LIMIT 1', [id]),
    pool.query('SELECT 1 FROM dungons WHERE imageid = $1 LIMIT 1', [id]),
    pool.query('SELECT 1 FROM pcs WHERE imageid = $1 LIMIT 1', [id]),
  ]);
  return results.some((r) => r.rows.length > 0);
};

export const deleteImageForUser = async (id: number, userguid: string): Promise<boolean> => {
  const { rowCount } = await pool.query(
    'DELETE FROM images WHERE id = $1 AND userguid = $2',
    [id, userguid]
  );
  return (rowCount ?? 0) > 0;
};
