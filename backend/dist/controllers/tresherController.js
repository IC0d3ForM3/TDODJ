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
const tresherService = __importStar(require("../services/tresherService"));
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_TRESHER_TYPES = [
    'Weapon',
    'Armor',
    'Coins',
    'Potion',
    'OtherTresher',
];
const VALID_ARMOR_TYPES = [
    'head',
    'hand',
    'body',
    'arms',
    'legs',
];
const VALID_COIN_TYPES = ['Gold', 'Silver', 'Copper', 'Tin'];
const VALID_POTION_EFFECT_TARGETS = ['Health', 'AC', 'AE'];
const getTreshers = async (req, res) => {
    const userkey = req.query['userkey'];
    const scope = req.query['scope'];
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ error: 'Valid userkey query parameter is required' });
    }
    try {
        const shouldIncludePublic = typeof scope === 'string' && scope.toLowerCase() === 'library';
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
    const type = normalizeTresherType(input.type);
    if (!type) {
        return null;
    }
    const payload = {
        type,
        name: normalizeText(input.name, 'Unnamed Tresher'),
        description: normalizeText(input.description, ''),
        worth: Math.max(0, normalizeNumber(input.worth, 0)),
        curseID: normalizeNullableNumber(input.curseID ?? input.curseId),
        trapID: normalizeNullableNumber(input.trapID ?? input.trapId),
        HP: null,
        damage: null,
        hands: null,
        range: null,
        ammoType: null,
        speedReduction: null,
        armorType: null,
        coinType: null,
        effectNumber: null,
        effectTarget: null,
        effectDuration: null,
        isPublic: normalizeBoolean(input.isPublic ?? input.ispublic),
    };
    if (type === 'Weapon') {
        payload.HP = normalizeNumber(input.HP ?? input.hp, 10);
        payload.damage = normalizeNumber(input.damage, 0);
        payload.hands = Math.max(1, normalizeNumber(input.hands, 1));
        payload.range = Math.max(0, normalizeNumber(input.range, 0));
        payload.ammoType = normalizeNullableText(input.ammoType);
        return payload;
    }
    if (type === 'Armor') {
        payload.HP = normalizeNumber(input.HP ?? input.hp, 10);
        payload.hands = Math.max(0, normalizeNumber(input.hands, 0));
        payload.speedReduction = normalizeNumber(input.speedReduction, 0);
        payload.armorType = normalizeArmorType(input.armorType);
        return payload;
    }
    if (type === 'Coins') {
        payload.coinType = normalizeCoinType(input.coinType);
        return payload;
    }
    if (type === 'Potion') {
        payload.effectNumber = normalizeNumber(input.effectNumber, 0);
        payload.effectTarget = normalizePotionEffectTarget(input.effectTarget);
        const target = payload.effectTarget;
        if (target === 'AC' || target === 'AE') {
            payload.effectDuration = Math.max(0, normalizeNumber(input.effectDuration, 1));
        }
        return payload;
    }
    payload.HP = normalizeNumber(input.HP ?? input.hp, 10);
    return payload;
};
const normalizeTresherType = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    return VALID_TRESHER_TYPES.includes(value)
        ? value
        : null;
};
const normalizeArmorType = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    return VALID_ARMOR_TYPES.includes(value)
        ? value
        : null;
};
const normalizeCoinType = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    return VALID_COIN_TYPES.includes(value)
        ? value
        : null;
};
const normalizePotionEffectTarget = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    return VALID_POTION_EFFECT_TARGETS.includes(value)
        ? value
        : null;
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
