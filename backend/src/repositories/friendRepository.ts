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

export interface FriendInviteRecord {
  id: number;
  inviterkey: string;
  inviteekey: string;
  code: string;
  isused: boolean;
  createdat: string;
}

export const createFriendInvite = async (
  inviterkey: string,
  inviteekey: string
): Promise<FriendInviteRecord> => {
  const { rows } = await pool.query<FriendInviteRecord>(
    `INSERT INTO friend_invites (inviterkey, inviteekey, code)
     VALUES ($1, $2, UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 8)))
     RETURNING id, inviterkey::text AS inviterkey, inviteekey::text AS inviteekey, code, isused, createdat::text AS createdat`,
    [inviterkey, inviteekey]
  );
  return rows[0];
};

export const getInviteByCode = async (code: string): Promise<FriendInviteRecord | null> => {
  const { rows } = await pool.query<FriendInviteRecord>(
    `SELECT id, inviterkey::text AS inviterkey, inviteekey::text AS inviteekey, code, isused, createdat::text AS createdat
     FROM friend_invites
     WHERE UPPER(code) = UPPER($1) AND isused = FALSE`,
    [code.trim()]
  );
  return rows[0] ?? null;
};

export const markInviteUsed = async (id: number): Promise<void> => {
  await pool.query('UPDATE friend_invites SET isused = TRUE WHERE id = $1', [id]);
};
