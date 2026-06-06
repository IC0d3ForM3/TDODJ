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
exports.updatePotion = exports.createPotion = exports.getPotions = void 0;
const userRepository_1 = require("../repositories/userRepository");
const potionService = __importStar(require("../services/potionService"));
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EFFECT_TO_OPTIONS = new Set([
    'HP', 'Defense', 'Stamina', 'Mind', 'Magic', 'Sight', 'ROS', 'AE', 'Action Economy', '# of Attacks', '# of attacks #OA', 'Remove Curse',
]);
function normalizeNumber(value, fallback) {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
function normalizeText(value, fallback) {
    if (typeof value === 'string')
        return value.trim() || fallback;
    return fallback;
}
function normalizeNullableInt(value) {
    if (value === null || value === undefined)
        return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}
function buildPotionPayload(input, isAdmin) {
    const effectTo = normalizeText(input.effectTo ?? input.effectto, 'HP');
    const effectTo2Raw = typeof (input.effectTo2 ?? input.effectto2) === 'string'
        ? String(input.effectTo2 ?? input.effectto2).trim()
        : null;
    const effectTo2 = effectTo2Raw && EFFECT_TO_OPTIONS.has(effectTo2Raw) ? effectTo2Raw : null;
    const legacyAmount1 = Math.max(0, normalizeNumber(input.effectAmount ?? input.effectamount, 0));
    const legacyAmount2 = Math.max(0, normalizeNumber(input.effectAmount2 ?? input.effectamount2, 0));
    const effectAmountMin = normalizeNumber(input.effectAmountMin ?? input.effectamountmin, 0);
    const effectAmount2Min = normalizeNumber(input.effectAmount2Min ?? input.effectamount2min, 0);
    const effectAmountDiceSides = Math.max(0, normalizeNumber(input.effectAmountDiceSides ?? input.effectamountdicesides, legacyAmount1));
    const effectAmount2DiceSides = Math.max(0, normalizeNumber(input.effectAmount2DiceSides ?? input.effectamount2dicesides, legacyAmount2));
    const effectAmountDiceCount = Math.max(0, normalizeNumber(input.effectAmountDiceCount ?? input.effectamountdicecount, effectAmountDiceSides > 0 ? 1 : 0));
    const effectAmount2DiceCount = Math.max(0, normalizeNumber(input.effectAmount2DiceCount ?? input.effectamount2dicecount, effectAmount2DiceSides > 0 ? 1 : 0));
    return {
        name: normalizeText(input.name, 'Unnamed Potion'),
        description: normalizeText(input.description, ''),
        effectTo: EFFECT_TO_OPTIONS.has(effectTo) ? effectTo : 'HP',
        effectTo2,
        lastFor: Math.max(0, normalizeNumber(input.lastFor ?? input.lastfor, 0)),
        effectAmount: effectAmountDiceSides,
        effectAmount2: effectAmount2DiceSides,
        effectAmountMin,
        effectAmountDiceCount,
        effectAmountDiceSides,
        effectAmount2Min,
        effectAmount2DiceCount,
        effectAmount2DiceSides,
        value: Math.max(0, normalizeNumber(input.value, 0)),
        imageId: normalizeNullableInt(input.imageId ?? input.imageid),
        soundId: normalizeNullableInt(input.soundId ?? input.soundid),
        isPublic: isAdmin ? input.isPublic === true || input.ispublic === true : false,
    };
}
const getPotions = async (req, res) => {
    const userkey = req.query['userkey'];
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ error: 'Valid userkey query parameter is required' });
    }
    try {
        if (await (0, userRepository_1.isMasterAdminByGuid)(userkey.trim())) {
            return res.json(await potionService.fetchAllPotionsWithUsername());
        }
        const potions = await potionService.fetchPotionsByUserGuid(userkey.trim());
        return res.json(potions);
    }
    catch {
        return res.status(500).json({ error: 'Failed to load potions' });
    }
};
exports.getPotions = getPotions;
const createPotion = async (req, res) => {
    const body = req.body;
    const userkey = body.userkey;
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: 0, error: 'Valid userkey is required' });
    }
    const userguid = userkey.trim();
    const input = (body.potion ?? {});
    try {
        const isAdmin = await potionService.checkUserIsAdminByGuid(userguid);
        const payload = buildPotionPayload(input, isAdmin);
        const potion = await potionService.createPotionForUser(userguid, payload);
        return res.status(201).json({ result: 1, potion });
    }
    catch {
        return res.status(500).json({ result: 0, error: 'Failed to create potion' });
    }
};
exports.createPotion = createPotion;
const updatePotion = async (req, res) => {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ result: 0, error: 'Valid potion id is required' });
    }
    const body = req.body;
    const userkey = body.userkey;
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: 0, error: 'Valid userkey is required' });
    }
    const userguid = userkey.trim();
    const input = (body.potion ?? {});
    try {
        const isAdmin = await potionService.checkUserIsAdminByGuid(userguid);
        const payload = buildPotionPayload(input, isAdmin);
        const potion = await potionService.savePotionForUser(id, userguid, payload);
        if (!potion) {
            return res.status(404).json({ result: 0, error: 'Potion not found or access denied' });
        }
        return res.json({ result: 1, potion });
    }
    catch {
        return res.status(500).json({ result: 0, error: 'Failed to update potion' });
    }
};
exports.updatePotion = updatePotion;
