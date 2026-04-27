"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllPcsForAdmin = exports.upgradeStat = exports.getPcByIdPublic = exports.setIsMainGamePcInDb = exports.setSamplePcInDb = exports.getSamplePcsFromDb = exports.upgradeNod = exports.upgradeNoa = exports.updatePcForUser = exports.insertPcForUser = exports.addTresherIdToPcInDb = exports.addSpToPc = exports.getPcByIdForUser = exports.getPcsByUserGuid = void 0;
const db_1 = __importDefault(require("../db"));
const getPcsByUserGuid = async (userguid) => {
    const { rows } = await db_1.default.query(`SELECT
       id,
       userguid::text AS userguid,
       name,
       species,
       type,
       imageid AS "imageId",
       maxhp AS "maxHP",
       currenthp AS "currentHP",
       ac,
       actioneconomy AS "actionEconomy",
       poisonresest AS "poisonResest",
       mp AS "magicPower",
       mind,
       stamina,
       COALESCE(sp, 0) AS sp,
       level,
       strength,
       rangeofview AS "rangeOfView",
       primarytresherid AS "primaryTresherId",
       weapontresherid AS "weaponTresherId",
       COALESCE(tresherids, '[]'::jsonb) AS "tresherIds",
       headarmortresherid AS "headArmorTresherId",
       bodyarmortresherid AS "bodyArmorTresherId",
       leftarmarmortresherid AS "leftArmArmorTresherId",
       rightarmarmortresherid AS "rightArmArmorTresherId",
       leftlegarmortresherid AS "leftLegArmorTresherId",
       rightlegarmortresherid AS "rightLegArmorTresherId",
       ring1itemid AS "ring1ItemId",
       ring2itemid AS "ring2ItemId",
       ring3itemid AS "ring3ItemId",
       ring4itemid AS "ring4ItemId",
       ring5itemid AS "ring5ItemId",
       necklaceitemid AS "necklaceItemId",
       hand1itemid AS "hand1ItemId",
       hand2itemid AS "hand2ItemId",
       COALESCE(numberofattacks, 1) AS "numberOfAttacks",
       COALESCE(numberofdefends, 1) AS "numberOfDefends",
       COALESCE(issample, FALSE) AS issample,
       COALESCE(ismaingame, FALSE) AS ismaingame,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM pcs
     WHERE userguid = $1
     ORDER BY updatedat DESC, id DESC`, [userguid]);
    return rows;
};
exports.getPcsByUserGuid = getPcsByUserGuid;
const getPcByIdForUser = async (id, userguid) => {
    const { rows } = await db_1.default.query(`SELECT
       id,
       userguid::text AS userguid,
       name,
       species,
       type,
       imageid AS "imageId",
       maxhp AS "maxHP",
       currenthp AS "currentHP",
       ac,
       actioneconomy AS "actionEconomy",
       poisonresest AS "poisonResest",
       mp AS "magicPower",
       mind,
       stamina,
       COALESCE(sp, 0) AS sp,
       level,
       strength,
       rangeofview AS "rangeOfView",
       primarytresherid AS "primaryTresherId",
       weapontresherid AS "weaponTresherId",
       COALESCE(tresherids, '[]'::jsonb) AS "tresherIds",
       headarmortresherid AS "headArmorTresherId",
       bodyarmortresherid AS "bodyArmorTresherId",
       leftarmarmortresherid AS "leftArmArmorTresherId",
       rightarmarmortresherid AS "rightArmArmorTresherId",
       leftlegarmortresherid AS "leftLegArmorTresherId",
       rightlegarmortresherid AS "rightLegArmorTresherId",
       ring1itemid AS "ring1ItemId",
       ring2itemid AS "ring2ItemId",
       ring3itemid AS "ring3ItemId",
       ring4itemid AS "ring4ItemId",
       ring5itemid AS "ring5ItemId",
       necklaceitemid AS "necklaceItemId",
       hand1itemid AS "hand1ItemId",
       hand2itemid AS "hand2ItemId",
       COALESCE(numberofattacks, 1) AS "numberOfAttacks",
       COALESCE(numberofdefends, 1) AS "numberOfDefends",
       COALESCE(issample, FALSE) AS issample,
       COALESCE(ismaingame, FALSE) AS ismaingame,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM pcs
     WHERE id = $1 AND userguid = $2`, [id, userguid]);
    return rows[0] ?? null;
};
exports.getPcByIdForUser = getPcByIdForUser;
const addSpToPc = async (id, userguid, amount) => {
    const { rows } = await db_1.default.query(`UPDATE pcs
     SET sp = COALESCE(sp, 0) + $3,
         updatedat = NOW()
     WHERE id = $1 AND userguid = $2
     RETURNING COALESCE(sp, 0) AS sp`, [id, userguid, Math.max(0, Math.floor(amount))]);
    return rows[0]?.sp ?? null;
};
exports.addSpToPc = addSpToPc;
/** Append a single tresher id to the PC's tresherids JSON array. */
const addTresherIdToPcInDb = async (pcId, tresherId) => {
    await db_1.default.query(`UPDATE pcs
     SET tresherids = COALESCE(tresherids, '[]'::jsonb) || to_jsonb($2::int),
         updatedat = NOW()
     WHERE id = $1`, [pcId, tresherId]);
};
exports.addTresherIdToPcInDb = addTresherIdToPcInDb;
const insertPcForUser = async (userguid, payload) => {
    const { rows } = await db_1.default.query(`INSERT INTO pcs (
       userguid,
       name,
       species,
       type,
       imageid,
       maxhp,
       currenthp,
       ac,
       actioneconomy,
       poisonresest,
       mp,
       mind,
       stamina,
       level,
       strength,
       rangeofview,
       primarytresherid,
       weapontresherid,
       tresherids,
       headarmortresherid,
       bodyarmortresherid,
       leftarmarmortresherid,
       rightarmarmortresherid,
       leftlegarmortresherid,
       rightlegarmortresherid,
       ring1itemid,
       ring2itemid,
       ring3itemid,
       ring4itemid,
       ring5itemid,
       necklaceitemid,
       hand1itemid,
       hand2itemid,
       numberofattacks,
       ismaingame,
       updatedat
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       $6,
       $7,
       $8,
       $9,
       $10,
       $11,
       $12,
       $13,
       $14,
       $15,
       $16,
       $17,
       $18,
       $19::jsonb,
       $20,
       $21,
       $22,
       $23,
       $24,
       $25,
       $26,
       $27,
       $28,
       $29,
       $30,
       $31,
       $32,
       $33,
       $34,
       $35,
       NOW()
     )
     RETURNING
       id,
       userguid::text AS userguid,
       name,
       species,
       type,
       imageid AS "imageId",
       maxhp AS "maxHP",
       currenthp AS "currentHP",
       ac,
       actioneconomy AS "actionEconomy",
       poisonresest AS "poisonResest",
       mp AS "magicPower",
       mind,
       stamina,
       level,
       strength,
       rangeofview AS "rangeOfView",
       primarytresherid AS "primaryTresherId",
       weapontresherid AS "weaponTresherId",
       COALESCE(tresherids, '[]'::jsonb) AS "tresherIds",
       headarmortresherid AS "headArmorTresherId",
       bodyarmortresherid AS "bodyArmorTresherId",
       leftarmarmortresherid AS "leftArmArmorTresherId",
       rightarmarmortresherid AS "rightArmArmorTresherId",
       leftlegarmortresherid AS "leftLegArmorTresherId",
       rightlegarmortresherid AS "rightLegArmorTresherId",
       ring1itemid AS "ring1ItemId",
       ring2itemid AS "ring2ItemId",
       ring3itemid AS "ring3ItemId",
       ring4itemid AS "ring4ItemId",
       ring5itemid AS "ring5ItemId",
       necklaceitemid AS "necklaceItemId",
       hand1itemid AS "hand1ItemId",
       hand2itemid AS "hand2ItemId",
       COALESCE(numberofattacks, 1) AS "numberOfAttacks",
       COALESCE(numberofdefends, 1) AS "numberOfDefends",
       COALESCE(issample, FALSE) AS issample,
       COALESCE(ismaingame, FALSE) AS ismaingame,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"`, [
        userguid,
        payload.name,
        payload.species,
        payload.type,
        payload.imageId,
        payload.maxHP,
        payload.currentHP,
        payload.ac,
        payload.actionEconomy,
        payload.poisonResest,
        payload.magicPower,
        payload.mind,
        payload.stamina,
        payload.level,
        payload.strength,
        payload.rangeOfView,
        payload.primaryTresherId,
        payload.weaponTresherId,
        JSON.stringify(payload.tresherIds),
        payload.headArmorTresherId,
        payload.bodyArmorTresherId,
        payload.leftArmArmorTresherId,
        payload.rightArmArmorTresherId,
        payload.leftLegArmorTresherId,
        payload.rightLegArmorTresherId,
        payload.ring1ItemId,
        payload.ring2ItemId,
        payload.ring3ItemId,
        payload.ring4ItemId,
        payload.ring5ItemId,
        payload.necklaceItemId,
        payload.hand1ItemId,
        payload.hand2ItemId,
        Math.max(1, Math.floor(payload.numberOfAttacks ?? 1)),
        payload.ismaingame === true,
    ]);
    return rows[0];
};
exports.insertPcForUser = insertPcForUser;
const updatePcForUser = async (id, userguid, payload) => {
    const { rows } = await db_1.default.query(`UPDATE pcs
     SET
       name = $3,
       species = $4,
       type = $5,
       imageid = $6,
       maxhp = $7,
       currenthp = $8,
       ac = $9,
       actioneconomy = $10,
       poisonresest = $11,
       mp = $12,
       mind = $13,
       stamina = $14,
       level = $15,
       strength = $16,
       rangeofview = $17,
       primarytresherid = $18,
       weapontresherid = $19,
       tresherids = $20::jsonb,
       headarmortresherid = $21,
       bodyarmortresherid = $22,
       leftarmarmortresherid = $23,
       rightarmarmortresherid = $24,
       leftlegarmortresherid = $25,
       rightlegarmortresherid = $26,
       ring1itemid = $27,
       ring2itemid = $28,
       ring3itemid = $29,
       ring4itemid = $30,
       ring5itemid = $31,
       necklaceitemid = $32,
       hand1itemid = $33,
       hand2itemid = $34,
       numberofattacks = $35,
       updatedat = NOW()
     WHERE id = $1 AND userguid = $2
     RETURNING
       id,
       userguid::text AS userguid,
       name,
       species,
       type,
       imageid AS "imageId",
       maxhp AS "maxHP",
       currenthp AS "currentHP",
       ac,
       actioneconomy AS "actionEconomy",
       poisonresest AS "poisonResest",
       mp AS "magicPower",
       mind,
       stamina,
       level,
       strength,
       rangeofview AS "rangeOfView",
       primarytresherid AS "primaryTresherId",
       weapontresherid AS "weaponTresherId",
       COALESCE(tresherids, '[]'::jsonb) AS "tresherIds",
       headarmortresherid AS "headArmorTresherId",
       bodyarmortresherid AS "bodyArmorTresherId",
       leftarmarmortresherid AS "leftArmArmorTresherId",
       rightarmarmortresherid AS "rightArmArmorTresherId",
       leftlegarmortresherid AS "leftLegArmorTresherId",
       rightlegarmortresherid AS "rightLegArmorTresherId",
       ring1itemid AS "ring1ItemId",
       ring2itemid AS "ring2ItemId",
       ring3itemid AS "ring3ItemId",
       ring4itemid AS "ring4ItemId",
       ring5itemid AS "ring5ItemId",
       necklaceitemid AS "necklaceItemId",
       hand1itemid AS "hand1ItemId",
       hand2itemid AS "hand2ItemId",
       COALESCE(numberofattacks, 1) AS "numberOfAttacks",
       COALESCE(numberofdefends, 1) AS "numberOfDefends",
       COALESCE(issample, FALSE) AS issample,
       COALESCE(ismaingame, FALSE) AS ismaingame,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"`, [
        id,
        userguid,
        payload.name,
        payload.species,
        payload.type,
        payload.imageId,
        payload.maxHP,
        payload.currentHP,
        payload.ac,
        payload.actionEconomy,
        payload.poisonResest,
        payload.magicPower,
        payload.mind,
        payload.stamina,
        payload.level,
        payload.strength,
        payload.rangeOfView,
        payload.primaryTresherId,
        payload.weaponTresherId,
        JSON.stringify(payload.tresherIds),
        payload.headArmorTresherId,
        payload.bodyArmorTresherId,
        payload.leftArmArmorTresherId,
        payload.rightArmArmorTresherId,
        payload.leftLegArmorTresherId,
        payload.rightLegArmorTresherId,
        payload.ring1ItemId,
        payload.ring2ItemId,
        payload.ring3ItemId,
        payload.ring4ItemId,
        payload.ring5ItemId,
        payload.necklaceItemId,
        payload.hand1ItemId,
        payload.hand2ItemId,
        Math.max(1, Math.floor(payload.numberOfAttacks ?? 1)),
    ]);
    return rows[0] ?? null;
};
exports.updatePcForUser = updatePcForUser;
const upgradeNoa = async (id, userguid, spCost, goldCost, tresherId) => {
    const client = await db_1.default.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`UPDATE pcs
       SET sp = GREATEST(0, COALESCE(sp, 0) - $3),
           numberofattacks = COALESCE(numberofattacks, 1) + 1,
           updatedat = NOW()
       WHERE id = $1 AND userguid = $2 AND COALESCE(sp, 0) >= $3
       RETURNING COALESCE(sp, 0) AS sp, COALESCE(numberofattacks, 1) AS numberofattacks`, [id, userguid, spCost]);
        if (!rows[0]) {
            await client.query('ROLLBACK');
            return null;
        }
        let newGold = null;
        if (goldCost > 0 && tresherId !== null) {
            const goldResult = await client.query(`UPDATE treshers
         SET gold = GREATEST(0, COALESCE(gold, 0) - $3),
             updatedat = NOW()
         WHERE id = $1 AND userguid = $2 AND COALESCE(gold, 0) >= $3
         RETURNING COALESCE(gold, 0) AS gold`, [tresherId, userguid, goldCost]);
            if (!goldResult.rows[0]) {
                await client.query('ROLLBACK');
                return null;
            }
            newGold = goldResult.rows[0].gold;
        }
        await client.query('COMMIT');
        return { sp: rows[0].sp, numberOfAttacks: rows[0].numberofattacks, newGold };
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
};
exports.upgradeNoa = upgradeNoa;
const upgradeNod = async (id, userguid, spCost, goldCost, tresherId) => {
    const client = await db_1.default.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`UPDATE pcs
       SET sp = GREATEST(0, COALESCE(sp, 0) - $3),
           numberofdefends = COALESCE(numberofdefends, 1) + 1,
           updatedat = NOW()
       WHERE id = $1 AND userguid = $2 AND COALESCE(sp, 0) >= $3
       RETURNING COALESCE(sp, 0) AS sp, COALESCE(numberofdefends, 1) AS numberofdefends`, [id, userguid, spCost]);
        if (!rows[0]) {
            await client.query('ROLLBACK');
            return null;
        }
        let newGold = null;
        if (goldCost > 0 && tresherId !== null) {
            const goldResult = await client.query(`UPDATE treshers
         SET gold = GREATEST(0, COALESCE(gold, 0) - $3),
             updatedat = NOW()
         WHERE id = $1 AND userguid = $2 AND COALESCE(gold, 0) >= $3
         RETURNING COALESCE(gold, 0) AS gold`, [tresherId, userguid, goldCost]);
            if (!goldResult.rows[0]) {
                await client.query('ROLLBACK');
                return null;
            }
            newGold = goldResult.rows[0].gold;
        }
        await client.query('COMMIT');
        return { sp: rows[0].sp, numberOfDefends: rows[0].numberofdefends, newGold };
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
};
exports.upgradeNod = upgradeNod;
const getSamplePcsFromDb = async () => {
    const { rows } = await db_1.default.query(`SELECT
       id,
       name,
       species,
       type,
       maxhp AS "maxHP",
       currenthp AS "currentHP",
       ac,
       actioneconomy AS "actionEconomy",
       strength,
       stamina,
       mind,
       mp AS "magicPower",
       rangeofview AS "rangeOfView"
     FROM pcs
     WHERE issample = TRUE
     ORDER BY id ASC`);
    return rows;
};
exports.getSamplePcsFromDb = getSamplePcsFromDb;
const setSamplePcInDb = async (id, issample) => {
    const { rowCount } = await db_1.default.query(`UPDATE pcs SET issample = $2 WHERE id = $1`, [id, issample]);
    return (rowCount ?? 0) > 0;
};
exports.setSamplePcInDb = setSamplePcInDb;
const setIsMainGamePcInDb = async (id, ismaingame) => {
    const { rowCount } = await db_1.default.query(`UPDATE pcs SET ismaingame = $2 WHERE id = $1`, [id, ismaingame]);
    return (rowCount ?? 0) > 0;
};
exports.setIsMainGamePcInDb = setIsMainGamePcInDb;
const getPcByIdPublic = async (id) => {
    const { rows } = await db_1.default.query(`SELECT
       id,
       userguid::text AS userguid,
       name,
       species,
       type,
       imageid AS "imageId",
       maxhp AS "maxHP",
       currenthp AS "currentHP",
       ac,
       actioneconomy AS "actionEconomy",
       poisonresest AS "poisonResest",
       mp AS "magicPower",
       mind,
       stamina,
       COALESCE(sp, 0) AS sp,
       level,
       strength,
       rangeofview AS "rangeOfView",
       primarytresherid AS "primaryTresherId",
       weapontresherid AS "weaponTresherId",
       COALESCE(tresherids, '[]'::jsonb) AS "tresherIds",
       headarmortresherid AS "headArmorTresherId",
       bodyarmortresherid AS "bodyArmorTresherId",
       leftarmarmortresherid AS "leftArmArmorTresherId",
       rightarmarmortresherid AS "rightArmArmorTresherId",
       leftlegarmortresherid AS "leftLegArmorTresherId",
       rightlegarmortresherid AS "rightLegArmorTresherId",
       ring1itemid AS "ring1ItemId",
       ring2itemid AS "ring2ItemId",
       ring3itemid AS "ring3ItemId",
       ring4itemid AS "ring4ItemId",
       ring5itemid AS "ring5ItemId",
       necklaceitemid AS "necklaceItemId",
       COALESCE(issample, FALSE) AS issample,
       COALESCE(ismaingame, FALSE) AS ismaingame,
       createdat::text AS "createdAt",
       updatedat::text AS "updatedAt"
     FROM pcs
     WHERE id = $1 AND issample = TRUE`, [id]);
    return rows[0] ?? null;
};
exports.getPcByIdPublic = getPcByIdPublic;
const STAT_COLUMN_MAP = {
    strength: { column: 'strength', cost: 1 },
    stamina: { column: 'stamina', cost: 1 },
    mind: { column: 'mind', cost: 1 },
    magicPower: { column: 'mp', cost: 1 },
    numberOfAttacks: { column: 'numberofattacks', cost: 5 },
    numberOfDefends: { column: 'numberofdefends', cost: 5 },
};
const upgradeStat = async (id, userguid, stat) => {
    const mapping = STAT_COLUMN_MAP[stat];
    if (!mapping)
        return null;
    const { column, cost } = mapping;
    // column is safe: it comes from our hardcoded whitelist, not user input.
    const { rows } = await db_1.default.query(`UPDATE pcs
     SET sp = GREATEST(0, COALESCE(sp, 0) - $3),
         ${column} = COALESCE(${column}, 0) + 1,
         updatedat = NOW()
     WHERE id = $1 AND userguid = $2 AND COALESCE(sp, 0) >= $3
     RETURNING COALESCE(sp, 0) AS sp, COALESCE(${column}, 0) AS newvalue`, [id, userguid, cost]);
    if (!rows[0])
        return null;
    return { sp: rows[0].sp, newValue: rows[0].newvalue };
};
exports.upgradeStat = upgradeStat;
const getAllPcsForAdmin = async () => {
    const { rows } = await db_1.default.query(`SELECT
       id,
       name,
       species,
       type,
       COALESCE(issample, FALSE) AS issample,
       COALESCE(ismaingame, FALSE) AS ismaingame
     FROM pcs
     ORDER BY id DESC`);
    return rows;
};
exports.getAllPcsForAdmin = getAllPcsForAdmin;
