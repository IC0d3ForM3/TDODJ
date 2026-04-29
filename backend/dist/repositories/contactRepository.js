"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateContactFlags = exports.getAllContactRequests = exports.insertContactRequest = void 0;
const db_1 = __importDefault(require("../db"));
const insertContactRequest = async (req) => {
    try {
        await db_1.default.query(`INSERT INTO contact_requests (name, email, problem, username, message)
       VALUES ($1, $2, $3, $4, $5)`, [req.name, req.email, req.problem, req.username || null, req.message]);
        return true;
    }
    catch {
        return false;
    }
};
exports.insertContactRequest = insertContactRequest;
const getAllContactRequests = async () => {
    const { rows } = await db_1.default.query('SELECT * FROM contact_requests ORDER BY createdat DESC');
    return rows;
};
exports.getAllContactRequests = getAllContactRequests;
const updateContactFlags = async (id, isread, isresponded) => {
    const { rows } = await db_1.default.query(`UPDATE contact_requests SET isread = $1, isresponded = $2 WHERE id = $3 RETURNING *`, [isread, isresponded, id]);
    return rows[0] || null;
};
exports.updateContactFlags = updateContactFlags;
