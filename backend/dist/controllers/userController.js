"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserFlags = exports.createUser = exports.getUser = exports.loginUser = exports.getAllUsers = void 0;
const userService = __importStar(require("../services/userService"));
const getAllUsers = async (req, res) => {
    const users = await userService.getAllUsers();
    res.json(users);
};
exports.getAllUsers = getAllUsers;
const loginUser = async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Missing username or password' });
    }
    const user = await userService.loginUser(username, password);
    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials or user not active' });
    }
    res.json(user);
};
exports.loginUser = loginUser;
const getUser = async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid user id' });
    }
    const user = await userService.fetchUser(id);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
};
exports.getUser = getUser;
const createUser = async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ result: -1, error: 'Missing fields' });
    }
    const result = await userService.createUser({ username, email, password });
    res.json({ result });
};
exports.createUser = createUser;
const updateUserFlags = async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid user id' });
    }
    const { isactive, isadmin, iscreator } = req.body;
    if (typeof isactive !== 'boolean' ||
        typeof isadmin !== 'boolean' ||
        typeof iscreator !== 'boolean') {
        return res.status(400).json({
            error: 'isactive, isadmin, and iscreator must be boolean values',
        });
    }
    const updatedUser = await userService.updateUserFlags(id, {
        isactive,
        isadmin,
        iscreator,
    });
    if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json(updatedUser);
};
exports.updateUserFlags = updateUserFlags;
