"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveUserByCredentials = exports.updateUserFlags = exports.insertUser = exports.isEmailUsed = exports.getUserById = exports.getAllUsers = void 0;
const getAllUsers = async () => {
    const { rows } = await db_1.default.query('SELECT id, username, email, isactive, isconfirmed, isadmin, ismasteradmin, iscreator, key FROM users');
    return rows;
};
exports.getAllUsers = getAllUsers;
const db_1 = __importDefault(require("../db"));
const getUserById = async (id) => {
    const { rows } = await db_1.default.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] || null;
};
exports.getUserById = getUserById;
const isEmailUsed = async (email) => {
    const { rows } = await db_1.default.query('SELECT 1 FROM users WHERE email = $1 LIMIT 1', [email]);
    return rows.length > 0;
};
exports.isEmailUsed = isEmailUsed;
const insertUser = async (user) => {
    try {
        await db_1.default.query(`INSERT INTO users (username, email, password, isactive, isconfirmed, isadmin, ismasteradmin, iscreator, key)
       VALUES ($1, $2, $3, false, false, false, false, false, gen_random_uuid())`, [user.username, user.email, user.password]);
        return true;
    }
    catch (err) {
        return false;
    }
};
exports.insertUser = insertUser;
const updateUserFlags = async (id, flags) => {
    const { rows } = await db_1.default.query(`UPDATE users
         SET isactive = $1,
             isadmin = $2,
             iscreator = $3
         WHERE id = $4
         RETURNING id, username, email, isactive, isconfirmed, isadmin, ismasteradmin, iscreator, key`, [flags.isactive, flags.isadmin, flags.iscreator, id]);
    return rows[0] || null;
};
exports.updateUserFlags = updateUserFlags;
const getActiveUserByCredentials = async (username, password) => {
    const { rows } = await db_1.default.query('SELECT username, key, isadmin, ismasteradmin, iscreator FROM users WHERE username = $1 AND password = $2 AND isactive = true', [username, password]);
    return rows[0] || null;
};
exports.getActiveUserByCredentials = getActiveUserByCredentials;
