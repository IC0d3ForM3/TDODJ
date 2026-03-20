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
exports.createFriend = exports.getFriends = void 0;
const friendService = __importStar(require("../services/friendService"));
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const getFriends = async (req, res) => {
    const userkey = req.query['userkey'];
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ error: 'Valid userkey query parameter is required' });
    }
    try {
        const friends = await friendService.fetchActiveFriendsByUserKey(userkey.trim());
        return res.json(friends);
    }
    catch (error) {
        console.error('Error fetching friends:', error);
        return res.status(500).json({ error: 'Failed to fetch friends' });
    }
};
exports.getFriends = getFriends;
const createFriend = async (req, res) => {
    const { userkey, email } = req.body;
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    if (typeof email !== 'string' || !email.trim()) {
        return res.status(400).json({ result: -1, error: 'Friend email is required' });
    }
    const normalizedUserKey = userkey.trim();
    const normalizedEmail = email.trim();
    try {
        const friendUser = await friendService.fetchUserByEmail(normalizedEmail);
        if (!friendUser) {
            return res.status(404).json({ result: -1, error: 'No user found with that email.' });
        }
        if (friendUser.key === normalizedUserKey) {
            return res
                .status(400)
                .json({ result: -1, error: 'You cannot add yourself as a friend.' });
        }
        const friend = await friendService.createOrActivateFriend(normalizedUserKey, friendUser.key);
        return res.status(201).json({ result: 1, friend });
    }
    catch (error) {
        console.error('Error creating friend:', error);
        return res.status(500).json({ result: -1, error: 'Failed to save friend' });
    }
};
exports.createFriend = createFriend;
