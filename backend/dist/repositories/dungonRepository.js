"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllPublishedDungonsForAdmin = exports.setSampleDungonInDb = exports.getSampleDungonFullFromDb = exports.getSampleDungonFromDb = exports.getDungonImageIdById = exports.getDungonSpRewardById = exports.approveDungon = exports.updateDungonMetadataForUser = exports.insertDungon = exports.deleteDungonForUser = exports.deleteGameForUser = exports.updateGameDungenJson = exports.getGameByIdForUser = exports.getGamesForUser = exports.startGameFromPublishedDungon = exports.publishDungonForUser = exports.updateDungonJsonForUser = exports.getDungonByIdForUser = exports.getDungonIsMainGameStatusById = exports.getPublishedDungons = exports.getDungonsByUserKey = void 0;
const db_1 = __importDefault(require("../db"));
const getDungonsByUserKey = async (userkey) => {
    const { rows } = await db_1.default.query(`SELECT id, key, userkey, name, description, intro, ispublic, status, approvedby, approveddate, minsplifetime, maxsplifetime, ismaingame, issample, resettable_per_pc, imageid
     FROM dungons
     WHERE userkey = $1
     ORDER BY id DESC`, [userkey]);
    return rows;
};
exports.getDungonsByUserKey = getDungonsByUserKey;
const getPublishedDungons = async (userkey = null) => {
    if (userkey) {
        const { rows } = await db_1.default.query(`SELECT d.id, d.name, d.status, COALESCE(d.ismaingame, FALSE) AS ismaingame, COALESCE(d.issample, FALSE) AS issample, i.path AS "imagePath"
       FROM dungons d
       LEFT JOIN images i ON i.id = d.imageid
       WHERE d.status = 'published'
         AND (
           d.ispublic = TRUE
           OR d.userkey = $1
           OR EXISTS (
             SELECT 1
             FROM dungonfriends df
             WHERE df.dungonid = d.id
               AND df.friendurid = $1::uuid
               AND df.isactivefriend = TRUE
           )
         )
       ORDER BY d.id DESC`, [userkey]);
        return rows;
    }
    const { rows } = await db_1.default.query(`SELECT d.id, d.name, d.status, COALESCE(d.ismaingame, FALSE) AS ismaingame, COALESCE(d.issample, FALSE) AS issample, i.path AS "imagePath"
     FROM dungons d
     LEFT JOIN images i ON i.id = d.imageid
     WHERE d.status = 'published' AND d.ispublic = TRUE
     ORDER BY d.id DESC`);
    return rows;
};
exports.getPublishedDungons = getPublishedDungons;
const getDungonIsMainGameStatusById = async (id) => {
    const { rows } = await db_1.default.query(`SELECT ismaingame, resettable_per_pc FROM dungons WHERE id = $1`, [id]);
    return rows[0] ?? null;
};
exports.getDungonIsMainGameStatusById = getDungonIsMainGameStatusById;
const getDungonByIdForUser = async (id, userkey) => {
    const { rows } = await db_1.default.query(`SELECT id, key, userkey, name, description, intro, "dungenJson" AS "dungenJson", ispublic, status, approvedby, approveddate, minsplifetime, maxsplifetime, ismaingame, issample, resettable_per_pc, imageid
     FROM dungons
     WHERE id = $1 AND userkey = $2`, [id, userkey]);
    return rows[0] ?? null;
};
exports.getDungonByIdForUser = getDungonByIdForUser;
const updateDungonJsonForUser = async (id, userkey, dungonJson) => {
    const result = await db_1.default.query(`UPDATE dungons
     SET "dungenJson" = $3::jsonb
     WHERE id = $1 AND userkey = $2`, [id, userkey, JSON.stringify(dungonJson)]);
    return (result.rowCount ?? 0) > 0;
};
exports.updateDungonJsonForUser = updateDungonJsonForUser;
const publishDungonForUser = async (id, userkey, options) => {
    const client = await db_1.default.connect();
    try {
        await client.query('BEGIN');
        const isPublicRequest = options.visibility === 'public';
        const isFriendShared = options.visibility === 'friends';
        const isAdminUser = options.isAdminUser === true;
        // Admins publish directly as public; creators submit a pending request
        const newStatus = (isPublicRequest && !isAdminUser) ? 'pending' : 'published';
        const newIspublic = isPublicRequest && isAdminUser;
        const requestedFriendUserKeys = Array.from(new Set(options.friendUserKeys
            .map((friendUserKey) => friendUserKey.trim())
            .filter((friendUserKey) => friendUserKey.length > 0)));
        const published = await client.query(`UPDATE dungons
       SET status = $3,
           ispublic = $4
       WHERE id = $1 AND userkey = $2
       RETURNING id`, [id, userkey, newStatus, newIspublic]);
        if ((published.rowCount ?? 0) === 0) {
            await client.query('ROLLBACK');
            return false;
        }
        await client.query(`DELETE FROM dungonfriends WHERE dungonid = $1`, [id]);
        if (isFriendShared) {
            const allowedFriends = await client.query(`SELECT friendurid::text AS friendurid
         FROM friends
         WHERE userurid = $1
           AND isactivefriend = TRUE
           AND friendurid = ANY($2::uuid[])`, [userkey, requestedFriendUserKeys]);
            const allowedFriendUserKeys = allowedFriends.rows.map((row) => row.friendurid);
            if (allowedFriendUserKeys.length !== requestedFriendUserKeys.length) {
                throw new Error('INVALID_FRIEND_SELECTION');
            }
            if (allowedFriendUserKeys.length === 0) {
                throw new Error('EMPTY_FRIEND_SELECTION');
            }
            await client.query(`INSERT INTO dungonfriends (dungonid, friendurid, isactivefriend)
         SELECT $1, friendurid::uuid, TRUE
         FROM UNNEST($2::text[]) AS friendurid
         ON CONFLICT (dungonid, friendurid)
         DO UPDATE SET isactivefriend = EXCLUDED.isactivefriend`, [id, allowedFriendUserKeys]);
        }
        await client.query('COMMIT');
        return true;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
};
exports.publishDungonForUser = publishDungonForUser;
const startGameFromPublishedDungon = async (dungonId, userkey, pcId) => {
    const { rows } = await db_1.default.query(`WITH source AS (
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
       createdat::text AS createdat`, [dungonId, userkey, pcId]);
    return rows[0] ?? null;
};
exports.startGameFromPublishedDungon = startGameFromPublishedDungon;
const getGamesForUser = async (userkey) => {
    const { rows } = await db_1.default.query(`SELECT
       id,
       dungonid,
       name,
       pcid,
       lastupdated::text AS lastupdated,
       createdat::text AS createdat
     FROM games
     WHERE userkey = $1
     ORDER BY lastupdated DESC`, [userkey]);
    return rows;
};
exports.getGamesForUser = getGamesForUser;
const getGameByIdForUser = async (id, userkey) => {
    const { rows } = await db_1.default.query(`SELECT
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
     WHERE id = $1 AND userkey = $2`, [id, userkey]);
    const row = rows[0] ?? null;
    return row;
};
exports.getGameByIdForUser = getGameByIdForUser;
const updateGameDungenJson = async (id, userkey, dungenJson) => {
    const { rows } = await db_1.default.query(`UPDATE games
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
       createdat::text AS createdat`, [id, userkey, JSON.stringify(dungenJson)]);
    return rows[0] ?? null;
};
exports.updateGameDungenJson = updateGameDungenJson;
const deleteGameForUser = async (id, userkey) => {
    const { rowCount } = await db_1.default.query(`DELETE FROM games WHERE id = $1 AND userkey = $2`, [id, userkey]);
    return (rowCount ?? 0) > 0;
};
exports.deleteGameForUser = deleteGameForUser;
const deleteDungonForUser = async (id, userkey) => {
    const { rowCount } = await db_1.default.query(`DELETE FROM dungons WHERE id = $1 AND userkey = $2`, [id, userkey]);
    return (rowCount ?? 0) > 0;
};
exports.deleteDungonForUser = deleteDungonForUser;
const insertDungon = async (payload) => {
    const { rows } = await db_1.default.query(`INSERT INTO dungons (key, userkey, userguid, name, description, intro, status, minsplifetime, maxsplifetime, ismaingame, issample, resettable_per_pc, imageid)
     VALUES ($1, $1, $1, $2, $3, $4, 'inproces', COALESCE($5, 0), COALESCE($6, 1000000), COALESCE($7, FALSE), COALESCE($8, FALSE), COALESCE($9, FALSE), $10)
     RETURNING id, key, userkey, name, description, intro, ispublic, status, approvedby, approveddate, minsplifetime, maxsplifetime, ismaingame, issample, resettable_per_pc, imageid`, [payload.userkey, payload.name, payload.description, payload.intro, payload.minsplifetime, payload.maxsplifetime, payload.ismaingame, payload.issample, payload.resettable_per_pc, payload.imageid ?? null]);
    return rows[0];
};
exports.insertDungon = insertDungon;
const updateDungonMetadataForUser = async (id, userkey, metadata) => {
    const updates = [];
    const values = [id, userkey];
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
    const { rows } = await db_1.default.query(`UPDATE dungons
     SET ${updates.join(', ')}
     WHERE id = $1 AND userkey = $2
     RETURNING id, key, userkey, name, description, intro, ispublic, status, approvedby, approveddate, minsplifetime, maxsplifetime, resettable_per_pc, imageid`, values);
    return rows[0] ?? null;
};
exports.updateDungonMetadataForUser = updateDungonMetadataForUser;
const approveDungon = async (id, adminKey) => {
    const { rowCount } = await db_1.default.query(`UPDATE dungons
     SET status = 'published',
         ispublic = TRUE,
         approvedby = $2,
         approveddate = NOW()
     WHERE id = $1 AND status = 'pending'`, [id, adminKey]);
    return (rowCount ?? 0) > 0;
};
exports.approveDungon = approveDungon;
const getDungonSpRewardById = async (id) => {
    const { rows } = await db_1.default.query(`SELECT COALESCE(spreward, 0) AS spreward FROM dungons WHERE id = $1`, [id]);
    return rows[0]?.spreward ?? 0;
};
exports.getDungonSpRewardById = getDungonSpRewardById;
const getDungonImageIdById = async (id) => {
    const { rows } = await db_1.default.query(`SELECT imageid FROM dungons WHERE id = $1`, [id]);
    return rows[0]?.imageid ?? null;
};
exports.getDungonImageIdById = getDungonImageIdById;
const getSampleDungonFromDb = async () => {
    const { rows } = await db_1.default.query(`SELECT id, name, description, intro
     FROM dungons
     WHERE issample = TRUE AND status = 'published'
     LIMIT 1`);
    return rows[0] ?? null;
};
exports.getSampleDungonFromDb = getSampleDungonFromDb;
const getSampleDungonFullFromDb = async () => {
    const { rows } = await db_1.default.query(`SELECT id, name, description, intro, "dungenJson" AS "dungenJson", COALESCE(spreward, 0) AS spreward, imageid
     FROM dungons
     WHERE issample = TRUE AND status = 'published'
     LIMIT 1`);
    return rows[0] ?? null;
};
exports.getSampleDungonFullFromDb = getSampleDungonFullFromDb;
const setSampleDungonInDb = async (id) => {
    await db_1.default.query(`UPDATE dungons SET issample = FALSE WHERE issample = TRUE`);
    const { rowCount } = await db_1.default.query(`UPDATE dungons SET issample = TRUE WHERE id = $1 AND status = 'published'`, [id]);
    return (rowCount ?? 0) > 0;
};
exports.setSampleDungonInDb = setSampleDungonInDb;
const getAllPublishedDungonsForAdmin = async () => {
    const { rows } = await db_1.default.query(`SELECT id, name, issample
     FROM dungons
     WHERE status = 'published'
     ORDER BY id DESC`);
    return rows;
};
exports.getAllPublishedDungonsForAdmin = getAllPublishedDungonsForAdmin;
