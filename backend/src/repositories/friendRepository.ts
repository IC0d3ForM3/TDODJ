import pool from '../db';

export interface FriendUserLookupRecord {
  key: string;
  email: string;
}

export interface FriendRecord {
  id: number;
  userurid: string;
  friendurid: string;
  isActiveFriend: boolean;
  friendEmail: string;
}

export const getUserByEmail = async (
  email: string
): Promise<FriendUserLookupRecord | null> => {
  const { rows } = await pool.query<FriendUserLookupRecord>(
    `SELECT
       key::text AS key,
       email
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email]
  );

  return rows[0] ?? null;
};

export const getActiveFriendsByUserKey = async (
  userkey: string
): Promise<FriendRecord[]> => {
  const { rows } = await pool.query<FriendRecord>(
    `SELECT
       f.id,
       f.userurid::text AS userurid,
       f.friendurid::text AS friendurid,
       f.isactivefriend AS "isActiveFriend",
       u.email AS "friendEmail"
     FROM friends f
     INNER JOIN users u
       ON u.key = f.friendurid
     WHERE f.userurid = $1
       AND f.isactivefriend = TRUE
     ORDER BY LOWER(u.email) ASC, f.id ASC`,
    [userkey]
  );

  return rows;
};

export const upsertActiveFriend = async (
  userkey: string,
  friendkey: string
): Promise<FriendRecord> => {
  const { rows } = await pool.query<FriendRecord>(
    `INSERT INTO friends (
       userurid,
       friendurid,
       isactivefriend
     )
     VALUES ($1, $2, TRUE)
     ON CONFLICT (userurid, friendurid)
     DO UPDATE SET isactivefriend = EXCLUDED.isactivefriend
     RETURNING
       id,
       userurid::text AS userurid,
       friendurid::text AS friendurid,
       isactivefriend AS "isActiveFriend",
       (SELECT email FROM users WHERE key = friendurid) AS "friendEmail"`,
    [userkey, friendkey]
  );

  return rows[0];
};
