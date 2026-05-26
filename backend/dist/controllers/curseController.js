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
exports.updateCurse = exports.createCurse = exports.getCurses = void 0;
const curseService = __importStar(require("../services/curseService"));
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EFFECT_TO_OPTIONS = new Set([
    'HP', 'Defense', 'Stamina', 'Mind', 'Magic', 'ROS', 'AE', '# of Attacks', 'Boost Dice',
]);
function normalizeCurseEffectTarget(value, fallback = 'HP') {
    if (typeof value !== 'string')
        return fallback;
    const normalized = value.trim().toLowerCase();
    switch (normalized) {
        case 'hp':
            return 'HP';
        case 'defense':
            return 'Defense';
        case 'stamina':
            return 'Stamina';
        case 'mind':
            return 'Mind';
        case 'magic':
            return 'Magic';
        case 'sight':
        case 'range of sight':
        case 'ros':
            return 'ROS';
        case 'ae':
        case 'action economy':
        case 'action econame':
            return 'AE';
        case '# of attacks':
        case '# of attacks #oa':
        case 'noa':
            return '# of Attacks';
        case 'boost dice':
            return 'Boost Dice';
        default:
            return fallback;
    }
}
function normalizeText(value, fallback) {
    if (typeof value === 'string')
        return value.trim() || fallback;
    return fallback;
}
function normalizeNullableText(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed || null;
}
function normalizeNumber(value, fallback) {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
function normalizeNullableInt(value) {
    if (value === null || value === undefined)
        return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}
function buildCursePayload(input, isAdmin) {
    const effectTo = normalizeCurseEffectTarget(input.effectTo ?? input.effectto, 'HP') ?? 'HP';
    const effectTo2 = normalizeCurseEffectTarget(input.effectTo2 ?? input.effectto2, null);
    return {
        name: normalizeText(input.name, 'Unnamed Curse'),
        description: normalizeText(input.description, ''),
        effectTo: EFFECT_TO_OPTIONS.has(effectTo) ? effectTo : 'HP',
        effectTo2: effectTo2 && EFFECT_TO_OPTIONS.has(effectTo2) ? effectTo2 : null,
        damage: Math.max(0, normalizeNumber(input.damage, 0)),
        damage2: Math.max(0, normalizeNumber(input.damage2, 0)),
        lastFor: Math.max(0, normalizeNumber(input.lastFor ?? input.lastfor, 0)),
        imageId: normalizeNullableInt(input.imageId ?? input.imageid),
        soundId: normalizeNullableInt(input.soundId ?? input.soundid),
        isPublic: isAdmin ? input.isPublic === true || input.ispublic === true : false,
    };
}
const getCurses = async (req, res) => {
    const userkey = req.query['userkey'];
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ error: 'Valid userkey query parameter is required' });
    }
    try {
        const curses = await curseService.fetchCursesByUserGuid(userkey.trim());
        return res.json(curses);
    }
    catch {
        return res.status(500).json({ error: 'Failed to load curses' });
    }
};
exports.getCurses = getCurses;
const createCurse = async (req, res) => {
    const body = req.body;
    const userkey = body.userkey;
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: 0, error: 'Valid userkey is required' });
    }
    const userguid = userkey.trim();
    const input = (body.curse ?? {});
    try {
        const isAdmin = await curseService.checkUserIsAdminByGuid(userguid);
        const payload = buildCursePayload(input, isAdmin);
        const curse = await curseService.createCurseForUser(userguid, payload);
        return res.status(201).json({ result: 1, curse });
    }
    catch {
        return res.status(500).json({ result: 0, error: 'Failed to create curse' });
    }
};
exports.createCurse = createCurse;
const updateCurse = async (req, res) => {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ result: 0, error: 'Valid curse id is required' });
    }
    const body = req.body;
    const userkey = body.userkey;
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: 0, error: 'Valid userkey is required' });
    }
    const userguid = userkey.trim();
    const input = (body.curse ?? {});
    try {
        const isAdmin = await curseService.checkUserIsAdminByGuid(userguid);
        const payload = buildCursePayload(input, isAdmin);
        const curse = await curseService.saveCurseForUser(id, userguid, payload);
        if (!curse) {
            return res.status(404).json({ result: 0, error: 'Curse not found or access denied' });
        }
        return res.json({ result: 1, curse });
    }
    catch {
        return res.status(500).json({ result: 0, error: 'Failed to update curse' });
    }
};
exports.updateCurse = updateCurse;
