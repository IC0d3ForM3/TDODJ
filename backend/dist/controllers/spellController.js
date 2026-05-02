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
exports.updateSpell = exports.createSpell = exports.getSpells = void 0;
const spellService = __importStar(require("../services/spellService"));
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EFFECT_TO_OPTIONS = new Set([
    'HP', 'Defense', 'Stamina', 'Mind', 'Magic', 'Sight', 'Action Economy',
]);
const EFFECT_TYPE_OPTIONS = new Set(['Fire', 'Ice', 'Lightning', 'Other']);
const EFFECT_TYPE_DEFAULT_COLORS = {
    Fire: '#ee3300',
    Ice: '#88ddff',
    Lightning: '#4466ff',
    Other: '#ffffff',
};
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{3,8}$/;
function normalizeEffectType(value) {
    if (typeof value === 'string' && EFFECT_TYPE_OPTIONS.has(value))
        return value;
    return 'Other';
}
function normalizeEffectColor(value, effectType) {
    if (typeof value === 'string' && HEX_COLOR_REGEX.test(value))
        return value.toLowerCase();
    return EFFECT_TYPE_DEFAULT_COLORS[effectType] ?? '#ffffff';
}
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
function buildSpellPayload(input, isAdmin) {
    const effectOn = normalizeText(input.effectOn ?? input.effecton, '');
    const effectOn2 = normalizeText(input.effectOn2 ?? input.effecton2, '');
    return {
        name: normalizeText(input.name, 'Unnamed Spell'),
        description: normalizeText(input.description, ''),
        range: Math.max(0, normalizeNumber(input.range, 0)),
        effectOn: EFFECT_TO_OPTIONS.has(effectOn) ? effectOn : '',
        effectOn2: EFFECT_TO_OPTIONS.has(effectOn2) ? effectOn2 : '',
        lastFor: Math.max(0, normalizeNumber(input.lastFor ?? input.lastfor, 0)),
        effectAmount: normalizeNumber(input.effectAmount, 0),
        effectAmount2: normalizeNumber(input.effectAmount2, 0),
        value: Math.max(0, normalizeNumber(input.value, 0)),
        sp: Math.max(0, normalizeNumber(input.sp, 0)),
        successTestValue: Math.max(0, normalizeNumber(input.successTestValue ?? input.successtestvalue, 0)),
        magicCost: Math.max(1, normalizeNumber(input.magicCost ?? input.magiccost, 1)),
        costToLearn: Math.max(0, normalizeNumber(input.costToLearn ?? input.costtolearn, 0)),
        imageId: normalizeNullableInt(input.imageId ?? input.imageid),
        soundId: normalizeNullableInt(input.soundId ?? input.soundid),
        isPublic: isAdmin ? input.isPublic === true || input.ispublic === true : false,
        numberOfTargets: Math.max(1, normalizeNumber(input.numberOfTargets ?? input.numberoftargets, 1)),
        effectType: normalizeEffectType(input.effectType ?? input.effecttype),
        effectColor: normalizeEffectColor(input.effectColor ?? input.effectcolor, normalizeEffectType(input.effectType ?? input.effecttype)),
    };
}
const getSpells = async (req, res) => {
    const userkey = req.query['userkey'];
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ error: 'Valid userkey query parameter is required' });
    }
    try {
        const spells = await spellService.fetchSpellsByUserGuid(userkey.trim());
        return res.json(spells);
    }
    catch {
        return res.status(500).json({ error: 'Failed to load spells' });
    }
};
exports.getSpells = getSpells;
const createSpell = async (req, res) => {
    const body = req.body;
    const userkey = body.userkey;
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: 0, error: 'Valid userkey is required' });
    }
    const userguid = userkey.trim();
    const input = (body.spell ?? {});
    try {
        const isAdmin = await spellService.checkUserIsAdminByGuid(userguid);
        const payload = buildSpellPayload(input, isAdmin);
        const spell = await spellService.createSpellForUser(userguid, payload);
        return res.status(201).json({ result: 1, spell });
    }
    catch {
        return res.status(500).json({ result: 0, error: 'Failed to create spell' });
    }
};
exports.createSpell = createSpell;
const updateSpell = async (req, res) => {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ result: 0, error: 'Valid spell id is required' });
    }
    const body = req.body;
    const userkey = body.userkey;
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: 0, error: 'Valid userkey is required' });
    }
    const userguid = userkey.trim();
    const input = (body.spell ?? {});
    try {
        const isAdmin = await spellService.checkUserIsAdminByGuid(userguid);
        const payload = buildSpellPayload(input, isAdmin);
        const spell = await spellService.saveSpellForUser(id, userguid, payload);
        if (!spell) {
            return res.status(404).json({ result: 0, error: 'Spell not found or access denied' });
        }
        return res.json({ result: 1, spell });
    }
    catch {
        return res.status(500).json({ result: 0, error: 'Failed to update spell' });
    }
};
exports.updateSpell = updateSpell;
