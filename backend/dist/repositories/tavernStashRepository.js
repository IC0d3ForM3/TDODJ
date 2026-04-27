"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawFromStash = exports.depositToStash = exports.getStash = void 0;
const db_1 = __importDefault(require("../db"));
const getStash = async (userguid) => {
    const result = await db_1.default.query(`SELECT stash_json FROM tavern_stash WHERE userguid = $1`, [userguid]);
    if (result.rows.length === 0)
        return [];
    const raw = result.rows[0].stash_json;
    return Array.isArray(raw) ? raw : [];
};
exports.getStash = getStash;
const depositToStash = async (userguid, items) => {
    const existing = await (0, exports.getStash)(userguid);
    const updated = [...existing, ...items];
    await db_1.default.query(`INSERT INTO tavern_stash (userguid, stash_json)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (userguid) DO UPDATE SET stash_json = EXCLUDED.stash_json`, [userguid, JSON.stringify(updated)]);
    return updated;
};
exports.depositToStash = depositToStash;
const withdrawFromStash = async (userguid, itemIndexes) => {
    const existing = await (0, exports.getStash)(userguid);
    const indexSet = new Set(itemIndexes);
    const remaining = existing.filter((_, i) => !indexSet.has(i));
    const withdrawn = existing.filter((_, i) => indexSet.has(i));
    await db_1.default.query(`INSERT INTO tavern_stash (userguid, stash_json)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (userguid) DO UPDATE SET stash_json = EXCLUDED.stash_json`, [userguid, JSON.stringify(remaining)]);
    return { remaining, withdrawn };
};
exports.withdrawFromStash = withdrawFromStash;
