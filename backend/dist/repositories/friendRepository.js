"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertActiveFriend = exports.getActiveFriendsByUserKey = exports.getUserByEmail = void 0;
const db_1 = __importDefault(require("../db"));
const getUserByEmail = async (email) => {
    const { rows } = await db_1.default.query(`SELECT
       key::text AS key,
       email
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`, [email]);
    return rows[0] ?? null;
};
exports.getUserByEmail = getUserByEmail;
const getActiveFriendsByUserKey = async (userkey) => {
    const { rows } = await db_1.default.query(`SELECT
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
     ORDER BY LOWER(u.email) ASC, f.id ASC`, [userkey]);
    return rows;
};
exports.getActiveFriendsByUserKey = getActiveFriendsByUserKey;
const upsertActiveFriend = async (userkey, friendkey) => {
    const { rows } = await db_1.default.query(`INSERT INTO friends (
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
       (SELECT email FROM users WHERE key = friendurid) AS "friendEmail"`, [userkey, friendkey]);
    return rows[0];
};
exports.upsertActiveFriend = upsertActiveFriend;
