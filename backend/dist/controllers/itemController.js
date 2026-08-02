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
exports.deleteItem = exports.updateItem = exports.createItem = exports.getItems = void 0;
const userRepository_1 = require("../repositories/userRepository");
const itemService = __importStar(require("../services/itemService"));
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ITEM_TYPES = new Set(['weapon', 'armor', 'pick', 'light', 'ring', 'necklace', 'neckless', 'gem', 'scroll', 'other']);
const ARMOR_SLOTS = new Set(['none', 'hand', 'shield', 'head', 'body', 'left-arm', 'right-arm', 'left-leg', 'right-leg']);
const EFFECT_ON_OPTIONS = new Set(['HP', 'AC', 'MP', 'Mind', 'Stamina', 'Strength', 'SP', 'AE', 'NOA', 'ROS', 'Door Trap', 'To Pick', 'Placed Trap']);
const EFFECT_TO_PC_OPTIONS = new Set(['HP', 'AC', 'Magic', 'Mind', 'Stamina', 'Strength', 'AE', 'NOA', 'ROS', 'ToHit', 'Damage']);
const COLOR_HEX_REGEX = /^#[0-9a-f]{6}$/i;
function normalizeText(value, fallback) {
    if (typeof value === 'string')
        return value.trim() || fallback;
    return fallback;
}
function normalizeOptionalText(value) {
    if (typeof value === 'string')
        return value.trim();
    return '';
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
function normalizeOptionalNullableText(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function normalizeWeaponEffectType(value) {
    const raw = normalizeOptionalText(value).toLowerCase();
    if (raw === 'fire')
        return 'Fire';
    if (raw === 'cold')
        return 'Cold';
    if (raw === 'lightning' || raw === 'lighing')
        return 'Lightning';
    if (raw === 'blood')
        return 'Blood';
    return 'Blood';
}
function normalizeWeaponEffectColor(value) {
    const raw = normalizeOptionalText(value);
    if (COLOR_HEX_REGEX.test(raw)) {
        return raw;
    }
    return '#cc0000';
}
function normalizeEffectToPc(value) {
    const raw = normalizeOptionalText(value);
    if (!raw)
        return null;
    if (raw.toLowerCase() === 'mp')
        return 'Magic';
    if (raw.toLowerCase() === 'magic')
        return 'Magic';
    if (raw.toLowerCase() === 'mind')
        return 'Mind';
    if (raw.toLowerCase() === 'staman')
        return 'Stamina';
    if (raw.toLowerCase() === 'stamina')
        return 'Stamina';
    if (raw.toLowerCase() === 'strench')
        return 'Strength';
    if (raw.toLowerCase() === 'strength')
        return 'Strength';
    if (raw.toLowerCase() === 'tohit')
        return 'ToHit';
    if (raw.toLowerCase() === 'damage')
        return 'Damage';
    if (raw.toLowerCase() === 'ae' || raw.toLowerCase() === 'action economy')
        return 'AE';
    if (raw.toLowerCase() === 'noa' || raw.toLowerCase() === '# of attacks' || raw.toLowerCase() === '#oa' || raw.toLowerCase() === 'number of attacks')
        return 'NOA';
    if (raw.toLowerCase() === 'hp')
        return 'HP';
    if (raw.toLowerCase() === 'ac')
        return 'AC';
    if (raw.toLowerCase() === 'ros' || raw.toLowerCase() === 'sight' || raw.toLowerCase() === 'range of sight')
        return 'ROS';
    return EFFECT_TO_PC_OPTIONS.has(raw) ? raw : null;
}
function buildItemPayload(input, isAdmin) {
    const type = normalizeText(input.type, 'other');
    const rawArmorSlot = normalizeOptionalText(input.armorSlot ?? input.armorslot);
    const rawEffectOn = normalizeOptionalText(input.effectOn ?? input.effecton);
    const effectToPc = normalizeEffectToPc(input.effectToPc ?? input.effecttopc);
    const effectToPcValue = normalizeNumber(input.effectToPcValue ?? input.effecttopcvalue, 0);
    const note = normalizeOptionalNullableText(input.note);
    const minMindToRead = Math.max(0, normalizeNumber(input.minMindToRead ?? input.minmindtoread, 0));
    const weaponEffectType = normalizeWeaponEffectType(input.weaponEffectType ?? input.weaponeffecttype);
    const weaponEffectColor = normalizeWeaponEffectColor(input.weaponEffectColor ?? input.weaponeffectcolor);
    const normalizedType = ITEM_TYPES.has(type) ? type : 'other';
    const canonicalType = normalizedType === 'neckless' ? 'necklace' : normalizedType;
    const allowsPcEffect = canonicalType === 'weapon' || canonicalType === 'armor' || canonicalType === 'ring' || canonicalType === 'necklace' || canonicalType === 'other';
    const isScroll = canonicalType === 'scroll';
    return {
        name: normalizeText(input.name, 'Unnamed Item'),
        description: normalizeText(input.description, ''),
        type: canonicalType,
        range: String(normalizeNumber(input.range, 0)),
        value: Math.max(0, normalizeNumber(input.value, 0)),
        weight: Math.max(0, normalizeNumber(input.weight, 0)),
        curseId: normalizeNullableInt(input.curseId ?? input.curseid),
        effectValue: normalizeNumber(input.effectValue ?? input.effectvalue, 0),
        damage: Math.max(0, normalizeNumber(input.damage, 0)),
        armorSlot: ARMOR_SLOTS.has(rawArmorSlot) ? rawArmorSlot : null,
        effectOn: EFFECT_ON_OPTIONS.has(rawEffectOn) ? rawEffectOn : null,
        effectToPc: allowsPcEffect ? effectToPc : null,
        effectToPcValue: allowsPcEffect ? effectToPcValue : 0,
        note,
        minMindToRead: note || isScroll ? minMindToRead : 0,
        weaponEffectType: canonicalType === 'weapon' ? weaponEffectType : 'Blood',
        weaponEffectColor: canonicalType === 'weapon' ? weaponEffectColor : '#cc0000',
        imageId: normalizeNullableInt(input.imageId ?? input.imageid),
        soundId: normalizeNullableInt(input.soundId ?? input.soundid),
        isPublic: isAdmin ? input.isPublic === true || input.ispublic === true : false,
        isTwoHanded: input.isTwoHanded === true || input.istwohanded === true,
        uses: normalizeNullableInt(input.uses),
        scrollSpellId: isScroll ? normalizeNullableInt(input.scrollSpellId ?? input.scrollspellid) : null,
        magicCost: isScroll ? Math.max(1, normalizeNumber(input.magicCost ?? input.magiccost, 1)) : 1,
    };
}
const getItems = async (req, res) => {
    const userkey = req.query['userkey'];
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ error: 'Valid userkey query parameter is required' });
    }
    const scope = req.query['scope'];
    try {
        if (await (0, userRepository_1.isMasterAdminByGuid)(userkey.trim())) {
            return res.json(await itemService.fetchAllItemsWithUsername());
        }
        if (scope === 'library') {
            return res.json(await itemService.fetchItemsLibraryByUserGuid(userkey.trim()));
        }
        const items = await itemService.fetchItemsByUserGuid(userkey.trim());
        return res.json(items);
    }
    catch {
        return res.status(500).json({ error: 'Failed to load items' });
    }
};
exports.getItems = getItems;
const createItem = async (req, res) => {
    const body = req.body;
    const userkey = body.userkey;
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: 0, error: 'Valid userkey is required' });
    }
    const userguid = userkey.trim();
    const input = (body.item ?? {});
    try {
        const isAdmin = await itemService.checkUserIsAdminByGuid(userguid);
        const payload = buildItemPayload(input, isAdmin);
        const item = await itemService.createItemForUser(userguid, payload);
        return res.status(201).json({ result: 1, item });
    }
    catch {
        return res.status(500).json({ result: 0, error: 'Failed to create item' });
    }
};
exports.createItem = createItem;
const updateItem = async (req, res) => {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ result: 0, error: 'Valid item id is required' });
    }
    const body = req.body;
    const userkey = body.userkey;
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: 0, error: 'Valid userkey is required' });
    }
    const userguid = userkey.trim();
    const input = (body.item ?? {});
    try {
        const isAdmin = await itemService.checkUserIsAdminByGuid(userguid);
        const payload = buildItemPayload(input, isAdmin);
        const item = await itemService.saveItemForUser(id, userguid, payload);
        if (!item) {
            return res.status(404).json({ result: 0, error: 'Item not found or access denied' });
        }
        return res.json({ result: 1, item });
    }
    catch {
        return res.status(500).json({ result: 0, error: 'Failed to update item' });
    }
};
exports.updateItem = updateItem;
const deleteItem = async (req, res) => {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ result: 0, error: 'Valid item id is required' });
    }
    const userkey = req.query['userkey'];
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: 0, error: 'Valid userkey is required' });
    }
    try {
        const deleted = await itemService.removeItemForUser(id, userkey.trim());
        if (!deleted) {
            return res.status(404).json({ result: 0, error: 'Item not found or access denied' });
        }
        return res.json({ result: 1 });
    }
    catch {
        return res.status(500).json({ result: 0, error: 'Failed to delete item' });
    }
};
exports.deleteItem = deleteItem;
