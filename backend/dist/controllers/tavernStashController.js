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
exports.withdrawFromStash = exports.depositToStash = exports.getStash = void 0;
const tavernStashService = __importStar(require("../services/tavernStashService"));
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_STASH_SIZE = 50;
const getStash = async (req, res) => {
    const userkey = req.query['userkey'];
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    try {
        const items = await tavernStashService.getStash(userkey.trim());
        return res.json({ result: 1, items });
    }
    catch (error) {
        console.error('Error fetching tavern stash:', error);
        return res.status(500).json({ result: -1, error: 'Failed to fetch stash' });
    }
};
exports.getStash = getStash;
const depositToStash = async (req, res) => {
    const { userkey, items } = req.body;
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ result: -1, error: 'items must be a non-empty array' });
    }
    try {
        // Validate and sanitize each item
        const normalized = [];
        for (const raw of items) {
            if (!raw || typeof raw !== 'object')
                continue;
            const src = raw;
            const id = typeof src['id'] === 'number' ? Math.floor(src['id']) : 0;
            const name = typeof src['name'] === 'string' ? src['name'].slice(0, 200) : 'Unknown';
            const description = typeof src['description'] === 'string' ? src['description'].slice(0, 1000) : '';
            const type = typeof src['type'] === 'string' ? src['type'].slice(0, 100) : 'OtherTresher';
            const gold = typeof src['gold'] === 'number' ? Math.max(0, Math.floor(src['gold'])) : 0;
            const silver = typeof src['silver'] === 'number' ? Math.max(0, Math.floor(src['silver'])) : 0;
            const copper = typeof src['copper'] === 'number' ? Math.max(0, Math.floor(src['copper'])) : 0;
            const zinc = typeof src['zinc'] === 'number' ? Math.max(0, Math.floor(src['zinc'])) : 0;
            const spReward = typeof src['spReward'] === 'number' ? Math.max(0, Math.floor(src['spReward'])) : 0;
            const imageId = typeof src['imageId'] === 'number' ? Math.floor(src['imageId']) : null;
            const soundId = typeof src['soundId'] === 'number' ? Math.floor(src['soundId']) : null;
            const isquest = src['isquest'] === true;
            normalized.push({ id, name, description, type, gold, silver, copper, zinc, spReward, imageId, soundId, isquest });
        }
        if (normalized.length === 0) {
            return res.status(400).json({ result: -1, error: 'No valid items provided' });
        }
        const current = await tavernStashService.getStash(userkey.trim());
        if (current.length + normalized.length > MAX_STASH_SIZE) {
            return res.status(400).json({ result: -1, error: `Stash is full (max ${MAX_STASH_SIZE} items)` });
        }
        const updated = await tavernStashService.depositToStash(userkey.trim(), normalized);
        return res.json({ result: 1, items: updated });
    }
    catch (error) {
        console.error('Error depositing to stash:', error);
        return res.status(500).json({ result: -1, error: 'Failed to deposit to stash' });
    }
};
exports.depositToStash = depositToStash;
const withdrawFromStash = async (req, res) => {
    const { userkey, itemIndexes } = req.body;
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    if (!Array.isArray(itemIndexes) || itemIndexes.length === 0) {
        return res.status(400).json({ result: -1, error: 'itemIndexes must be a non-empty array' });
    }
    const indexes = itemIndexes
        .map((v) => Number.parseInt(String(v), 10))
        .filter((n) => Number.isInteger(n) && n >= 0);
    if (indexes.length === 0) {
        return res.status(400).json({ result: -1, error: 'No valid item indexes provided' });
    }
    try {
        const { remaining, withdrawn } = await tavernStashService.withdrawFromStash(userkey.trim(), indexes);
        return res.json({ result: 1, remaining, withdrawn });
    }
    catch (error) {
        console.error('Error withdrawing from stash:', error);
        return res.status(500).json({ result: -1, error: 'Failed to withdraw from stash' });
    }
};
exports.withdrawFromStash = withdrawFromStash;
