import pool from '../db';

export type PublishVisibility = 'public' | 'friends' | 'private';

export interface DungonRecord {
  id: number;
  key: string;
  userkey: string;
  name: string;
  description: string;
  intro: string;
  dungenJson?: unknown;
  ispublic: boolean;
  status: 'inproces' | 'published' | 'pending' | 'approved';
  approvedby: string | null;
  approveddate: string | null;
  minsplifetime: number;
  maxsplifetime: number;
  ismaingame: boolean;
  issample: boolean;
  resettable_per_pc: boolean;
  imageid: number | null;
}

export interface PublishDungonOptions {
  visibility: PublishVisibility;
  friendUserKeys: string[];
  isAdminUser?: boolean;
}

export interface PublishedDungonListItemRecord {
  id: number;
  name: string;
  status: DungonRecord['status'];
  ismaingame: boolean;
  issample: boolean;
  imagePath: string | null;
}

export interface GameRecord {
  id: number;
  dungonid: number;
  userkey: string;
  createguidid: string;
  name: string;
  description: string;
  intro: string;
  dungenJson: unknown;
  inventory: unknown;
  monsters: unknown;
  pcid: number | null;
  lastupdated: string;
  createdat: string;
}

export interface ActiveGameListItemRecord {
  id: number;
  dungonid: number;
  name: string;
  pcid: number | null;
  lastupdated: string;
  createdat: string;
}

export interface NewDungon {
  userkey: string;
  name: string;
  description: string;
  intro: string;
  minsplifetime?: number;
  maxsplifetime?: number;
  ismaingame?: boolean;
  issample?: boolean;
  resettable_per_pc?: boolean;
  imageid?: number | null;
}

export const getDungonsByUserKey = async (
  userkey: string
): Promise<DungonRecord[]> => {
  const { rows } = await pool.query<DungonRecord>(
    `SELECT id, key, userkey, name, description, intro, ispublic, status, approvedby, approveddate, minsplifetime, maxsplifetime, ismaingame, issample, resettable_per_pc, imageid
     FROM dungons
     WHERE userkey = $1
     ORDER BY LOWER(name) ASC, id ASC`,
    [userkey]
  );

  return rows;
};

export const getPublishedDungons = async (
  userkey: string | null = null
): Promise<PublishedDungonListItemRecord[]> => {
  if (userkey) {
    const { rows } = await pool.query<PublishedDungonListItemRecord>(
      `SELECT d.id, d.name, d.status, COALESCE(d.ismaingame, FALSE) AS ismaingame, COALESCE(d.issample, FALSE) AS issample, i.path AS "imagePath"
       FROM dungons d
       LEFT JOIN images i ON i.id = d.imageid
       WHERE d.status = 'published'
         AND (
           COALESCE(d.issample, FALSE) = TRUE
           OR d.ispublic = TRUE
           OR d.userkey = $1
           OR EXISTS (
             SELECT 1
             FROM dungonfriends df
             WHERE df.dungonid = d.id
               AND df.friendurid = $1::uuid
               AND df.isactivefriend = TRUE
           )
         )
       ORDER BY LOWER(d.name) ASC, d.id ASC`,
      [userkey]
    );

    return rows;
  }

  const { rows } = await pool.query<PublishedDungonListItemRecord>(
    `SELECT d.id, d.name, d.status, COALESCE(d.ismaingame, FALSE) AS ismaingame, COALESCE(d.issample, FALSE) AS issample, i.path AS "imagePath"
     FROM dungons d
     LEFT JOIN images i ON i.id = d.imageid
     WHERE d.status = 'published'
       AND (
         d.ispublic = TRUE
         OR COALESCE(d.issample, FALSE) = TRUE
       )
      ORDER BY LOWER(d.name) ASC, d.id ASC`
  );

  return rows;
};

export const getDungonIsMainGameStatusById = async (
  id: number
): Promise<{ ismaingame: boolean; resettable_per_pc: boolean } | null> => {
  const { rows } = await pool.query<{ ismaingame: boolean; resettable_per_pc: boolean }>(
    `SELECT ismaingame, resettable_per_pc FROM dungons WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
};

export const getDungonByIdForUser = async (
  id: number,
  userkey: string
): Promise<DungonRecord | null> => {
  const { rows } = await pool.query<DungonRecord>(
    `SELECT id, key, userkey, name, description, intro, "dungenJson" AS "dungenJson", ispublic, status, approvedby, approveddate, minsplifetime, maxsplifetime, ismaingame, issample, resettable_per_pc, imageid
     FROM dungons
     WHERE id = $1 AND userkey = $2`,
    [id, userkey]
  );

  return rows[0] ?? null;
};

export const updateDungonJsonForUser = async (
  id: number,
  userkey: string,
  dungonJson: unknown
): Promise<boolean> => {
  const result = await pool.query(
    `UPDATE dungons
     SET "dungenJson" = $3::jsonb
     WHERE id = $1 AND userkey = $2`,
    [id, userkey, JSON.stringify(dungonJson)]
  );

  return (result.rowCount ?? 0) > 0;
};

export const publishDungonForUser = async (
  id: number,
  userkey: string,
  options: PublishDungonOptions
): Promise<boolean> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const isPublicRequest = options.visibility === 'public';
    const isFriendShared = options.visibility === 'friends';
    const isAdminUser = options.isAdminUser === true;

    // Admins publish directly as public; creators submit a pending request
    const newStatus = (isPublicRequest && !isAdminUser) ? 'pending' : 'published';
    const newIspublic = isPublicRequest && isAdminUser;
    const requestedFriendUserKeys = Array.from(
      new Set(
        options.friendUserKeys
          .map((friendUserKey) => friendUserKey.trim())
          .filter((friendUserKey) => friendUserKey.length > 0)
      )
    );

    const published = await client.query<{ id: number }>(
      `UPDATE dungons
       SET status = $3,
           ispublic = $4
       WHERE id = $1 AND userkey = $2
       RETURNING id`,
      [id, userkey, newStatus, newIspublic]
    );

    if ((published.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    await client.query(
      `DELETE FROM dungonfriends WHERE dungonid = $1`,
      [id]
    );

    if (isFriendShared) {
      const allowedFriends = await client.query<{ friendurid: string }>(
        `SELECT friendurid::text AS friendurid
         FROM friends
         WHERE userurid = $1
           AND isactivefriend = TRUE
           AND friendurid = ANY($2::uuid[])`,
        [userkey, requestedFriendUserKeys]
      );

      const allowedFriendUserKeys = allowedFriends.rows.map((row) => row.friendurid);
      if (allowedFriendUserKeys.length !== requestedFriendUserKeys.length) {
        throw new Error('INVALID_FRIEND_SELECTION');
      }

      if (allowedFriendUserKeys.length === 0) {
        throw new Error('EMPTY_FRIEND_SELECTION');
      }

      await client.query(
        `INSERT INTO dungonfriends (dungonid, friendurid, isactivefriend)
         SELECT $1, friendurid::uuid, TRUE
         FROM UNNEST($2::text[]) AS friendurid
         ON CONFLICT (dungonid, friendurid)
         DO UPDATE SET isactivefriend = EXCLUDED.isactivefriend`,
        [id, allowedFriendUserKeys]
      );
    }

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const startGameFromPublishedDungon = async (
  dungonId: number,
  userkey: string,
  pcId: number
): Promise<GameRecord | null> => {
  const { rows } = await pool.query<GameRecord>(
    `WITH source AS (
       SELECT
         id,
         key,
         name,
         description,
         intro,
         "dungenJson",
         inventory,
         monsters
       FROM dungons
       WHERE id = $1
         AND status = 'published'
         AND (
           ispublic = TRUE
           OR userkey = $2::uuid
           OR EXISTS (
             SELECT 1
             FROM dungonfriends
             WHERE dungonfriends.dungonid = dungons.id
               AND dungonfriends.friendurid = $2::uuid
               AND dungonfriends.isactivefriend = TRUE
           )
         )
     )
     INSERT INTO games (
       dungonid,
       userkey,
       createguidid,
       name,
       description,
       intro,
       "dungenJson",
       inventory,
       monsters,
       pcid,
       lastupdated
     )
     SELECT
       source.id,
       $2::uuid,
       source.key,
       source.name,
       source.description,
       source.intro,
       source."dungenJson",
       source.inventory,
       source.monsters,
       $3,
       NOW()
     FROM source
     ON CONFLICT ON CONSTRAINT uq_games_dungonid_userkey
     DO UPDATE SET
       "dungenJson" = EXCLUDED."dungenJson",
       inventory = EXCLUDED.inventory,
       monsters = EXCLUDED.monsters,
       pcid = EXCLUDED.pcid,
       lastupdated = NOW()
     RETURNING
       id,
       dungonid,
       userkey,
       createguidid,
       name,
       description,
       intro,
       "dungenJson" AS "dungenJson",
       inventory,
       monsters,
       pcid,
       lastupdated::text AS lastupdated,
       createdat::text AS createdat`,
    [dungonId, userkey, pcId]
  );

  return rows[0] ?? null;
};

export const getGamesForUser = async (
  userkey: string
): Promise<ActiveGameListItemRecord[]> => {
  const { rows } = await pool.query<ActiveGameListItemRecord>(
    `SELECT
       id,
       dungonid,
       name,
       pcid,
       lastupdated::text AS lastupdated,
       createdat::text AS createdat
     FROM games
     WHERE userkey = $1
     ORDER BY LOWER(name) ASC, id ASC`,
    [userkey]
  );

  return rows;
};

export const getGameByIdForUser = async (
  id: number,
  userkey: string
): Promise<GameRecord | null> => {
  const { rows } = await pool.query<GameRecord>(
    `SELECT
       id,
       dungonid,
       userkey,
       createguidid,
       name,
       description,
       intro,
       "dungenJson" AS "dungenJson",
       inventory,
       monsters,
       pcid,
       lastupdated::text AS lastupdated,
       createdat::text AS createdat
     FROM games
     WHERE id = $1 AND userkey = $2`,
    [id, userkey]
  );

  const row = rows[0] ?? null;
  return row;
};

export const updateGameDungenJson = async (
  id: number,
  userkey: string,
  dungenJson: unknown
): Promise<GameRecord | null> => {
  const { rows } = await pool.query<GameRecord>(
    `UPDATE games
     SET "dungenJson" = $3::jsonb, lastupdated = NOW()
     WHERE id = $1 AND userkey = $2
     RETURNING
       id,
       dungonid,
       userkey,
       createguidid,
       name,
       description,
       intro,
       "dungenJson" AS "dungenJson",
       inventory,
       monsters,
       lastupdated::text AS lastupdated,
       createdat::text AS createdat`,
    [id, userkey, JSON.stringify(dungenJson)]
  );

  return rows[0] ?? null;
};

export const deleteGameForUser = async (
  id: number,
  userkey: string
): Promise<boolean> => {
  const { rowCount } = await pool.query(
    `DELETE FROM games WHERE id = $1 AND userkey = $2`,
    [id, userkey]
  );

  return (rowCount ?? 0) > 0;
};

export const deleteDungonForUser = async (
  id: number,
  userkey: string
): Promise<boolean> => {
  const { rowCount } = await pool.query(
    `DELETE FROM dungons WHERE id = $1 AND userkey = $2`,
    [id, userkey]
  );

  return (rowCount ?? 0) > 0;
};

export const insertDungon = async (
  payload: NewDungon
): Promise<DungonRecord> => {
  const { rows } = await pool.query<DungonRecord>(
    `INSERT INTO dungons (key, userkey, userguid, name, description, intro, status, minsplifetime, maxsplifetime, ismaingame, issample, resettable_per_pc, imageid)
     VALUES ($1, $1, $1, $2, $3, $4, 'inproces', COALESCE($5, 0), COALESCE($6, 1000000), COALESCE($7, FALSE), COALESCE($8, FALSE), COALESCE($9, FALSE), $10)
     RETURNING id, key, userkey, name, description, intro, ispublic, status, approvedby, approveddate, minsplifetime, maxsplifetime, ismaingame, issample, resettable_per_pc, imageid`,
    [payload.userkey, payload.name, payload.description, payload.intro, payload.minsplifetime, payload.maxsplifetime, payload.ismaingame, payload.issample, payload.resettable_per_pc, payload.imageid ?? null]
  );

  return rows[0];
};

export const updateDungonMetadataForUser = async (
  id: number,
  userkey: string,
  metadata: Partial<Pick<DungonRecord, 'name' | 'description' | 'intro' | 'minsplifetime' | 'maxsplifetime' | 'resettable_per_pc' | 'imageid'>>
): Promise<DungonRecord | null> => {
  const updates: string[] = [];
  const values: unknown[] = [id, userkey];
  let paramIndex = 3;

  if (typeof metadata.name === 'string') {
    updates.push(`name = $${paramIndex++}`);
    values.push(metadata.name);
  }
  if (typeof metadata.description === 'string') {
    updates.push(`description = $${paramIndex++}`);
    values.push(metadata.description);
  }
  if (typeof metadata.intro === 'string') {
    updates.push(`intro = $${paramIndex++}`);
    values.push(metadata.intro);
  }
  if (typeof metadata.minsplifetime === 'number') {
    updates.push(`minsplifetime = $${paramIndex++}`);
    values.push(metadata.minsplifetime);
  }
  if (typeof metadata.maxsplifetime === 'number') {
    updates.push(`maxsplifetime = $${paramIndex++}`);
    values.push(metadata.maxsplifetime);
  }
  if (typeof metadata.resettable_per_pc === 'boolean') {
    updates.push(`resettable_per_pc = $${paramIndex++}`);
    values.push(metadata.resettable_per_pc);
  }
  if ('imageid' in metadata) {
    updates.push(`imageid = $${paramIndex++}`);
    values.push(metadata.imageid ?? null);
  }

  if (updates.length === 0) {
    return null;
  }

  const { rows } = await pool.query<DungonRecord>(
    `UPDATE dungons
     SET ${updates.join(', ')}
     WHERE id = $1 AND userkey = $2
     RETURNING id, key, userkey, name, description, intro, ispublic, status, approvedby, approveddate, minsplifetime, maxsplifetime, resettable_per_pc, imageid`,
    values
  );

  return rows[0] ?? null;
};

export const approveDungon = async (
  id: number,
  adminKey: string
): Promise<boolean> => {
  const { rowCount } = await pool.query(
    `UPDATE dungons
     SET status = 'published',
         ispublic = TRUE,
         approvedby = $2,
         approveddate = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [id, adminKey]
  );

  return (rowCount ?? 0) > 0;
};

export const getDungonSpRewardById = async (id: number): Promise<number> => {
  const { rows } = await pool.query<{ spreward: number }>(
    `SELECT COALESCE(spreward, 0) AS spreward FROM dungons WHERE id = $1`,
    [id]
  );

  return rows[0]?.spreward ?? 0;
};

export const getDungonImageIdById = async (id: number): Promise<number | null> => {
  const { rows } = await pool.query<{ imageid: number | null }>(
    `SELECT imageid FROM dungons WHERE id = $1`,
    [id]
  );
  return rows[0]?.imageid ?? null;
};

export const getSampleDungonFromDb = async (): Promise<{ id: number; name: string; description: string; intro: string } | null> => {
  const { rows } = await pool.query<{ id: number; name: string; description: string; intro: string }>(
    `SELECT id, name, description, intro
     FROM dungons
     WHERE issample = TRUE AND status = 'published'
     LIMIT 1`
  );
  return rows[0] ?? null;
};

export const getSampleDungonFullFromDb = async (): Promise<{ id: number; name: string; description: string; intro: string; dungenJson: unknown; spreward: number; imageid: number | null } | null> => {
  const { rows } = await pool.query<{ id: number; name: string; description: string; intro: string; dungenJson: unknown; spreward: number; imageid: number | null }>(
    `SELECT id, name, description, intro, "dungenJson" AS "dungenJson", COALESCE(spreward, 0) AS spreward, imageid
     FROM dungons
     WHERE issample = TRUE AND status = 'published'
     LIMIT 1`
  );
  return rows[0] ?? null;
};

export const setSampleDungonInDb = async (id: number): Promise<boolean> => {
  await pool.query(`UPDATE dungons SET issample = FALSE WHERE issample = TRUE`);
  const { rowCount } = await pool.query(
    `UPDATE dungons SET issample = TRUE WHERE id = $1 AND status = 'published'`,
    [id]
  );
  return (rowCount ?? 0) > 0;
};

export const getAllPublishedDungonsForAdmin = async (): Promise<{ id: number; name: string; issample: boolean }[]> => {
  const { rows } = await pool.query<{ id: number; name: string; issample: boolean }>(
    `SELECT id, name, issample
     FROM dungons
     WHERE status = 'published'
     ORDER BY LOWER(name) ASC, id ASC`
  );
  return rows;
};
