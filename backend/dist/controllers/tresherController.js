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
exports.updateTresher = exports.createTresher = exports.getTreshers = void 0;
const userRepository_1 = require("../repositories/userRepository");
const tresherService = __importStar(require("../services/tresherService"));
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const getTreshers = async (req, res) => {
    const userkey = req.query['userkey'];
    const scope = req.query['scope'];
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ error: 'Valid userkey query parameter is required' });
    }
    try {
        const shouldIncludePublic = typeof scope === 'string' && scope.toLowerCase() === 'library';
        if (shouldIncludePublic && await (0, userRepository_1.isMasterAdminByGuid)(userkey.trim())) {
            return res.json(await tresherService.fetchAllTreshersWithUsername());
        }
        const treshers = shouldIncludePublic
            ? await tresherService.fetchTresherLibraryByUserGuid(userkey.trim())
            : await tresherService.fetchTreshersByUserGuid(userkey.trim());
        return res.json(treshers);
    }
    catch (error) {
        console.error('Error fetching treshers:', error);
        return res.status(500).json({ error: 'Failed to fetch treshers' });
    }
};
exports.getTreshers = getTreshers;
const createTresher = async (req, res) => {
    const { userkey, tresher } = req.body;
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    const normalizedPayload = normalizeTresherPayload(tresher);
    if (!normalizedPayload) {
        return res.status(400).json({ result: -1, error: 'Valid tresher payload is required' });
    }
    try {
        const isAdmin = await tresherService.checkUserIsAdminByGuid(userkey.trim());
        if (normalizedPayload.isPublic && !isAdmin) {
            return res
                .status(403)
                .json({ result: -1, error: 'Only admin users can set a tresher as public.' });
        }
        const created = await tresherService.createTresherForUser(userkey.trim(), {
            ...normalizedPayload,
            isPublic: normalizedPayload.isPublic && isAdmin,
        });
        return res.status(201).json({ result: 1, tresher: created });
    }
    catch (error) {
        console.error('Error creating tresher:', error);
        return res.status(500).json({ result: -1, error: 'Failed to create tresher' });
    }
};
exports.createTresher = createTresher;
const updateTresher = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const { userkey, tresher } = req.body;
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid tresher id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    const normalizedPayload = normalizeTresherPayload(tresher);
    if (!normalizedPayload) {
        return res.status(400).json({ result: -1, error: 'Valid tresher payload is required' });
    }
    try {
        const isAdmin = await tresherService.checkUserIsAdminByGuid(userkey.trim());
        if (normalizedPayload.isPublic && !isAdmin) {
            return res
                .status(403)
                .json({ result: -1, error: 'Only admin users can set a tresher as public.' });
        }
        const updated = await tresherService.saveTresherForUser(id, userkey.trim(), {
            ...normalizedPayload,
            isPublic: normalizedPayload.isPublic && isAdmin,
        });
        if (!updated) {
            return res.status(404).json({ result: -1, error: 'Tresher not found' });
        }
        return res.json({ result: 1, tresher: updated });
    }
    catch (error) {
        console.error('Error updating tresher:', error);
        return res.status(500).json({ result: -1, error: 'Failed to update tresher' });
    }
};
exports.updateTresher = updateTresher;
const normalizeTresherPayload = (value) => {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const input = value;
    return {
        type: normalizeTresherType(input.type),
        name: normalizeText(input.name, 'Unnamed Tresher'),
        description: normalizeText(input.description, ''),
        gold: Math.max(0, normalizeNumber(input.gold, 0)),
        silver: Math.max(0, normalizeNumber(input.silver, 0)),
        copper: Math.max(0, normalizeNumber(input.copper, 0)),
        zinc: Math.max(0, normalizeNumber(input.zinc, 0)),
        item1Id: normalizeNullableNumber(input.item1Id),
        item2Id: normalizeNullableNumber(input.item2Id),
        item3Id: normalizeNullableNumber(input.item3Id),
        item4Id: normalizeNullableNumber(input.item4Id),
        spell1Id: normalizeNullableNumber(input.spell1Id),
        spell2Id: normalizeNullableNumber(input.spell2Id),
        spell3Id: normalizeNullableNumber(input.spell3Id),
        spell4Id: normalizeNullableNumber(input.spell4Id),
        curse1Id: normalizeNullableNumber(input.curse1Id),
        curse2Id: normalizeNullableNumber(input.curse2Id),
        isPublic: normalizeBoolean(input.isPublic ?? input.ispublic),
        isquest: normalizeBoolean(input.isquest),
        spReward: Math.max(0, normalizeNumber(input.spReward ?? input.spreward, 0)),
        imageId: normalizeNullableNumber(input.imageId),
        soundId: normalizeNullableNumber(input.soundId),
        potion1Id: normalizeNullableNumber(input.potion1Id),
        potion2Id: normalizeNullableNumber(input.potion2Id),
        potion3Id: normalizeNullableNumber(input.potion3Id),
    };
};
const normalizeText = (value, fallback) => {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    return trimmed || fallback;
};
const normalizeNullableText = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
};
const normalizeNumber = (value, fallback) => {
    const asNumber = typeof value === 'number'
        ? value
        : typeof value === 'string'
            ? Number.parseInt(value.trim(), 10)
            : Number.NaN;
    if (!Number.isFinite(asNumber)) {
        return fallback;
    }
    return Math.trunc(asNumber);
};
const normalizeNullableNumber = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const normalized = normalizeNumber(value, Number.NaN);
    return Number.isFinite(normalized) ? normalized : null;
};
const normalizeBoolean = (value) => value === true;
const VALID_TRESHER_TYPES = ['Weapon', 'Armor', 'Coins', 'Potion', 'OtherTresher'];
const normalizeTresherType = (value) => {
    if (typeof value === 'string') {
        const match = VALID_TRESHER_TYPES.find((t) => t.toLowerCase() === value.trim().toLowerCase());
        if (match)
            return match;
    }
    return 'OtherTresher';
};
