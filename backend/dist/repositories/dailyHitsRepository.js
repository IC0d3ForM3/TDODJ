"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecentDailyHits = exports.incrementLogins = exports.incrementHomeHits = void 0;
const db_1 = __importDefault(require("../db"));
const upsertIncrement = async (field) => {
    const { rows } = await db_1.default.query(`INSERT INTO dailyhits (datetime, ${field})
     VALUES (CURRENT_DATE, 1)
     ON CONFLICT (datetime)
     DO UPDATE SET ${field} = dailyhits.${field} + 1
     RETURNING id, homehits, logins, datetime`);
    return rows[0];
};
const incrementHomeHits = async () => {
    return upsertIncrement('homehits');
};
exports.incrementHomeHits = incrementHomeHits;
const incrementLogins = async () => {
    return upsertIncrement('logins');
};
exports.incrementLogins = incrementLogins;
const getRecentDailyHits = async (limit = 30) => {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 30;
    const { rows } = await db_1.default.query(`SELECT id, homehits, logins, datetime
     FROM dailyhits
     ORDER BY datetime DESC
     LIMIT $1`, [safeLimit]);
    return rows;
};
exports.getRecentDailyHits = getRecentDailyHits;
