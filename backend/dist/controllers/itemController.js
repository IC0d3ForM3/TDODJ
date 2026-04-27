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
exports.updateItem = exports.createItem = exports.getItems = void 0;
const itemService = __importStar(require("../services/itemService"));
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ITEM_TYPES = new Set(['weapon', 'armor', 'pick', 'light', 'ring', 'necklace', 'other']);
const ARMOR_SLOTS = new Set(['head', 'body', 'left-arm', 'right-arm', 'left-leg', 'right-leg']);
const EFFECT_ON_OPTIONS = new Set(['HP', 'AC', 'MP', 'Mind', 'Stamina', 'Strength', 'SP']);
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
function buildItemPayload(input, isAdmin) {
    const type = normalizeText(input.type, 'other');
    const rawArmorSlot = normalizeOptionalText(input.armorSlot ?? input.armorslot);
    const rawEffectOn = normalizeOptionalText(input.effectOn ?? input.effecton);
    return {
        name: normalizeText(input.name, 'Unnamed Item'),
        description: normalizeText(input.description, ''),
        type: ITEM_TYPES.has(type) ? type : 'other',
        range: String(normalizeNumber(input.range, 0)),
        value: Math.max(0, normalizeNumber(input.value, 0)),
        weight: Math.max(0, normalizeNumber(input.weight, 0)),
        curseId: normalizeNullableInt(input.curseId ?? input.curseid),
        effectValue: normalizeNumber(input.effectValue ?? input.effectvalue, 0),
        damage: Math.max(0, normalizeNumber(input.damage, 0)),
        armorSlot: ARMOR_SLOTS.has(rawArmorSlot) ? rawArmorSlot : null,
        effectOn: EFFECT_ON_OPTIONS.has(rawEffectOn) ? rawEffectOn : null,
        imageId: normalizeNullableInt(input.imageId ?? input.imageid),
        soundId: normalizeNullableInt(input.soundId ?? input.soundid),
        isPublic: isAdmin ? input.isPublic === true || input.ispublic === true : false,
        isTwoHanded: input.isTwoHanded === true || input.istwohanded === true,
    };
}
const getItems = async (req, res) => {
    const userkey = req.query['userkey'];
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ error: 'Valid userkey query parameter is required' });
    }
    try {
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
