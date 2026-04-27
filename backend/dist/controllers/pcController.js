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
exports.tavernTurnIn = exports.upgradeNod = exports.upgradeNoa = exports.upgradeStatController = exports.getAdminPcs = exports.setSamplePc = exports.setIsMainGamePc = exports.getSamplePcs = exports.updatePc = exports.awardSpToPc = exports.createPc = exports.getPcs = void 0;
const userRepository_1 = require("../repositories/userRepository");
const imageService = __importStar(require("../services/imageService"));
const pcService = __importStar(require("../services/pcService"));
const tresherService = __importStar(require("../services/tresherService"));
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_SPECIES = ['Human', 'Elph', 'DwarPh', 'Shorties'];
const VALID_TYPES = ['Fighter', 'Mage', 'thieph', 'Healer'];
const getPcs = async (req, res) => {
    const userkey = req.query['userkey'];
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ error: 'Valid userkey query parameter is required' });
    }
    try {
        const pcs = await pcService.fetchPcsByUserGuid(userkey.trim());
        return res.json(pcs);
    }
    catch (error) {
        console.error('Error fetching pcs:', error);
        return res.status(500).json({ error: 'Failed to fetch pcs' });
    }
};
exports.getPcs = getPcs;
const createPc = async (req, res) => {
    const { userkey, pc } = req.body;
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    const normalizedPayload = normalizePcPayload(pc);
    if (!normalizedPayload) {
        return res.status(400).json({ result: -1, error: 'Valid pc payload is required' });
    }
    try {
        const validationError = await validatePcReferencesForUser(normalizedPayload, userkey.trim());
        if (validationError) {
            return res.status(400).json({ result: -1, error: validationError });
        }
        const created = await pcService.createPcForUser(userkey.trim(), normalizedPayload);
        return res.status(201).json({ result: 1, pc: created });
    }
    catch (error) {
        console.error('Error creating pc:', error);
        return res.status(500).json({ result: -1, error: 'Failed to create pc' });
    }
};
exports.createPc = createPc;
const awardSpToPc = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const { userkey, amount } = req.body;
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid pc id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid positive amount is required' });
    }
    try {
        const newSp = await pcService.awardSpToPc(id, userkey.trim(), amount);
        if (newSp === null) {
            return res.status(404).json({ result: -1, error: 'PC not found' });
        }
        return res.json({ result: 1, sp: newSp });
    }
    catch (error) {
        console.error('Error awarding SP to pc:', error);
        return res.status(500).json({ result: -1, error: 'Failed to award SP' });
    }
};
exports.awardSpToPc = awardSpToPc;
const updatePc = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const { userkey, pc } = req.body;
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid pc id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    const normalizedPayload = normalizePcPayload(pc);
    if (!normalizedPayload) {
        return res.status(400).json({ result: -1, error: 'Valid pc payload is required' });
    }
    try {
        const validationError = await validatePcReferencesForUser(normalizedPayload, userkey.trim());
        if (validationError) {
            return res.status(400).json({ result: -1, error: validationError });
        }
        const updated = await pcService.savePcForUser(id, userkey.trim(), normalizedPayload);
        if (!updated) {
            return res.status(404).json({ result: -1, error: 'PC not found' });
        }
        return res.json({ result: 1, pc: updated });
    }
    catch (error) {
        console.error('Error updating pc:', error);
        return res.status(500).json({ result: -1, error: 'Failed to update pc' });
    }
};
exports.updatePc = updatePc;
const normalizePcPayload = (value) => {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const input = value;
    const species = normalizeSpecies(input.species);
    const type = normalizePcType(input.type);
    if (!species || !type) {
        return null;
    }
    const maxHP = Math.max(1, normalizeNumber(input.maxHP ?? input.maxhp, 10));
    const currentHP = Math.max(0, Math.min(maxHP, normalizeNumber(input.currentHP ?? input.currenthp, maxHP)));
    const tresherIds = normalizeIdList(input.tresherIds ?? input.tresherids ?? input.trusherIds ?? input.trusherids);
    const rangeOfView = rangeOfViewBySpecies(species);
    return {
        name: normalizeText(input.name, 'Unnamed PC'),
        species,
        type,
        imageId: normalizeNullableNumber(input.imageId ?? input.imageid),
        maxHP,
        currentHP,
        ac: Math.max(0, normalizeNumber(input.ac, 10)),
        actionEconomy: Math.max(0, normalizeNumber(input.actionEconomy ?? input.actioneconomy ?? input.movementEconomy ?? input.movmentEconomy ?? input.movementEconay, 0)),
        poisonResest: normalizeNumber(input.poisonResest ?? input.poisonresest, 0),
        magicPower: normalizeNumber(input.magicPower ?? input.magicpower ?? input.mp, 0),
        mind: Math.max(0, normalizeNumber(input.mind, 0)),
        stamina: Math.max(0, normalizeNumber(input.stamina, 0)),
        level: Math.max(1, normalizeNumber(input.level, 1)),
        strength: normalizeNumber(input.strength ?? input.strenth, 0),
        rangeOfView,
        primaryTresherId: normalizeNullableNumber(input.primaryTresherId ??
            input.primarytresherid ??
            input.primaryTrusherId ??
            input.primarytrusherid),
        weaponTresherId: normalizeNullableNumber(input.weaponTresherId ??
            input.weapontresherid ??
            input.weaponTrusherId ??
            input.weapontrusherid),
        tresherIds,
        headArmorTresherId: normalizeNullableNumber(input.headArmorTresherId ?? input.headarmortresherid),
        bodyArmorTresherId: normalizeNullableNumber(input.bodyArmorTresherId ?? input.bodyarmortresherid),
        leftArmArmorTresherId: normalizeNullableNumber(input.leftArmArmorTresherId ?? input.leftarmarmortresherid),
        rightArmArmorTresherId: normalizeNullableNumber(input.rightArmArmorTresherId ?? input.rightarmarmortresherid),
        leftLegArmorTresherId: normalizeNullableNumber(input.leftLegArmorTresherId ?? input.leftlegarmortresherid),
        rightLegArmorTresherId: normalizeNullableNumber(input.rightLegArmorTresherId ?? input.rightlegarmortresherid),
        ring1ItemId: normalizeNullableNumber(input.ring1ItemId ?? input.ring1itemid),
        ring2ItemId: normalizeNullableNumber(input.ring2ItemId ?? input.ring2itemid),
        ring3ItemId: normalizeNullableNumber(input.ring3ItemId ?? input.ring3itemid),
        ring4ItemId: normalizeNullableNumber(input.ring4ItemId ?? input.ring4itemid),
        ring5ItemId: normalizeNullableNumber(input.ring5ItemId ?? input.ring5itemid),
        necklaceItemId: normalizeNullableNumber(input.necklaceItemId ?? input.necklaceitemid),
        hand1ItemId: normalizeNullableNumber(input.hand1ItemId ?? input.hand1itemid),
        hand2ItemId: normalizeNullableNumber(input.hand2ItemId ?? input.hand2itemid),
        numberOfAttacks: Math.max(1, normalizeNumber(input.numberOfAttacks ?? input.numberofattacks, 1)),
        numberOfDefends: Math.max(1, normalizeNumber(input.numberOfDefends, 1)),
        ismaingame: input.ismaingame === true,
    };
};
const validatePcReferencesForUser = async (payload, userguid) => {
    if (payload.imageId !== null) {
        const canUseImage = await imageService.checkImageAccessibleByIdForUser(payload.imageId, userguid);
        if (!canUseImage) {
            return 'Selected image is not available for this user.';
        }
    }
    const uniqueTresherIds = Array.from(new Set(payload.tresherIds));
    for (const tresherId of uniqueTresherIds) {
        const canUseTresher = await tresherService.checkTresherAccessibleByIdForUser(tresherId, userguid);
        if (!canUseTresher) {
            return `Selected tresher ${tresherId} is not available for this user.`;
        }
    }
    const inventoryIds = new Set(uniqueTresherIds);
    const equippedTresherRefs = [
        ['primaryTresherId', payload.primaryTresherId],
        ['weaponTresherId', payload.weaponTresherId],
        ['headArmorTresherId', payload.headArmorTresherId],
        ['bodyArmorTresherId', payload.bodyArmorTresherId],
        ['leftArmArmorTresherId', payload.leftArmArmorTresherId],
        ['rightArmArmorTresherId', payload.rightArmArmorTresherId],
        ['leftLegArmorTresherId', payload.leftLegArmorTresherId],
        ['rightLegArmorTresherId', payload.rightLegArmorTresherId],
    ];
    for (const [field, value] of equippedTresherRefs) {
        if (value !== null && !inventoryIds.has(value)) {
            return `${field} must reference a tresher selected in Treshers.`;
        }
    }
    return null;
};
const normalizeSpecies = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const lower = value.trim().toLowerCase();
    if (lower === 'human') {
        return 'Human';
    }
    if (lower === 'elph') {
        return 'Elph';
    }
    if (lower === 'dwarph' || lower === 'dwarph') {
        return 'DwarPh';
    }
    if (lower === 'shorties') {
        return 'Shorties';
    }
    return null;
};
const normalizePcType = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const lower = value.trim().toLowerCase();
    if (lower === 'figher' || lower === 'fighter') {
        return 'Fighter';
    }
    if (lower === 'mage') {
        return 'Mage';
    }
    if (lower === 'thieph') {
        return 'thieph';
    }
    if (lower === 'healer') {
        return 'Healer';
    }
    return null;
};
const rangeOfViewBySpecies = (species) => {
    if (species === 'Elph') {
        return 6;
    }
    if (species === 'DwarPh') {
        return 7;
    }
    return 5;
};
const normalizeText = (value, fallback) => {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    return trimmed || fallback;
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
const normalizeIdList = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }
    const normalized = value
        .map((entry) => normalizeNullableNumber(entry))
        .filter((entry) => entry !== null && entry > 0);
    return Array.from(new Set(normalized));
};
const getSamplePcs = async (_req, res) => {
    try {
        const pcs = await pcService.fetchSamplePcs();
        return res.json(pcs);
    }
    catch (error) {
        console.error('Error fetching sample pcs:', error);
        return res.status(500).json({ error: 'Failed to fetch sample pcs' });
    }
};
exports.getSamplePcs = getSamplePcs;
const setIsMainGamePc = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const { userkey, ismaingame } = req.body;
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid pc id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    if (typeof ismaingame !== 'boolean') {
        return res.status(400).json({ result: -1, error: 'ismaingame must be a boolean' });
    }
    const trimmedKey = userkey.trim();
    const user = await (0, userRepository_1.getUserByKey)(trimmedKey);
    if (!user || (!user.isadmin && !user.ismasteradmin)) {
        return res.status(403).json({ result: -1, error: 'Only admins can set main game pcs' });
    }
    try {
        const wasSet = await pcService.setMainGamePc(id, ismaingame);
        if (!wasSet) {
            return res.status(404).json({ result: -1, error: 'PC not found' });
        }
        return res.json({ result: 1 });
    }
    catch (error) {
        console.error('Error setting ismaingame on pc:', error);
        return res.status(500).json({ result: -1, error: 'Failed to set ismaingame on pc' });
    }
};
exports.setIsMainGamePc = setIsMainGamePc;
const setSamplePc = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const { userkey, issample } = req.body;
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid pc id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    if (typeof issample !== 'boolean') {
        return res.status(400).json({ result: -1, error: 'issample must be a boolean' });
    }
    const trimmedKey = userkey.trim();
    const user = await (0, userRepository_1.getUserByKey)(trimmedKey);
    if (!user || (!user.isadmin && !user.ismasteradmin)) {
        return res.status(403).json({ result: -1, error: 'Only admins can set sample pcs' });
    }
    try {
        const wasSet = await pcService.setSamplePc(id, issample);
        if (!wasSet) {
            return res.status(404).json({ result: -1, error: 'PC not found' });
        }
        return res.json({ result: 1 });
    }
    catch (error) {
        console.error('Error setting sample pc:', error);
        return res.status(500).json({ result: -1, error: 'Failed to set sample pc' });
    }
};
exports.setSamplePc = setSamplePc;
const getAdminPcs = async (req, res) => {
    const userkey = req.query['userkey'];
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ error: 'Valid userkey query parameter is required' });
    }
    const trimmedKey = userkey.trim();
    const user = await (0, userRepository_1.getUserByKey)(trimmedKey);
    if (!user || (!user.isadmin && !user.ismasteradmin)) {
        return res.status(403).json({ error: 'Only admins can access this endpoint' });
    }
    try {
        const pcs = await pcService.fetchAllPcsForAdmin();
        return res.json(pcs);
    }
    catch (error) {
        console.error('Error fetching pcs for admin:', error);
        return res.status(500).json({ error: 'Failed to fetch pcs' });
    }
};
exports.getAdminPcs = getAdminPcs;
const upgradeStatController = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const { userkey, stat } = req.body;
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid pc id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    const allowed = ['strength', 'stamina', 'mind', 'magicPower'];
    if (typeof stat !== 'string' || !allowed.includes(stat)) {
        return res.status(400).json({ result: -1, error: 'Valid stat name is required' });
    }
    try {
        const result = await pcService.upgradeStat(id, userkey.trim(), stat);
        if (!result) {
            return res.status(400).json({ result: -1, error: 'Not enough SP or PC not found' });
        }
        return res.json({ result: 1, sp: result.sp, newValue: result.newValue });
    }
    catch (error) {
        console.error('Error upgrading stat:', error);
        return res.status(500).json({ result: -1, error: 'Failed to upgrade stat' });
    }
};
exports.upgradeStatController = upgradeStatController;
const upgradeNoa = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const { userkey, spCost, goldCost, tresherId } = req.body;
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid pc id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    const resolvedSpCost = typeof spCost === 'number' && spCost >= 0 ? Math.floor(spCost) : 0;
    const resolvedGoldCost = typeof goldCost === 'number' && goldCost >= 0 ? Math.floor(goldCost) : 0;
    const resolvedTresherId = typeof tresherId === 'number' && tresherId > 0 ? tresherId : null;
    try {
        const result = await pcService.upgradeNoa(id, userkey.trim(), resolvedSpCost, resolvedGoldCost, resolvedTresherId);
        if (!result) {
            return res.status(400).json({ result: -1, error: 'Not enough SP or gold, or PC not found' });
        }
        return res.json({ result: 1, sp: result.sp, numberOfAttacks: result.numberOfAttacks, tresherId: resolvedTresherId, newGold: result.newGold });
    }
    catch (error) {
        console.error('Error upgrading NOA:', error);
        return res.status(500).json({ result: -1, error: 'Failed to upgrade NOA' });
    }
};
exports.upgradeNoa = upgradeNoa;
const upgradeNod = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const { userkey, spCost, goldCost, tresherId } = req.body;
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid pc id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    const resolvedSpCost = typeof spCost === 'number' && spCost >= 0 ? Math.floor(spCost) : 0;
    const resolvedGoldCost = typeof goldCost === 'number' && goldCost >= 0 ? Math.floor(goldCost) : 0;
    const resolvedTresherId = typeof tresherId === 'number' && tresherId > 0 ? tresherId : null;
    try {
        const result = await pcService.upgradeNod(id, userkey.trim(), resolvedSpCost, resolvedGoldCost, resolvedTresherId);
        if (!result) {
            return res.status(400).json({ result: -1, error: 'Not enough SP or gold, or PC not found' });
        }
        return res.json({ result: 1, sp: result.sp, numberOfDefends: result.numberOfDefends, tresherId: resolvedTresherId, newGold: result.newGold });
    }
    catch (error) {
        console.error('Error upgrading NOD:', error);
        return res.status(500).json({ result: -1, error: 'Failed to upgrade NOD' });
    }
};
exports.upgradeNod = upgradeNod;
const tavernTurnIn = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const { userkey, tresherIds } = req.body;
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid pc id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    if (!Array.isArray(tresherIds) || tresherIds.length === 0) {
        return res.status(400).json({ result: -1, error: 'tresherIds must be a non-empty array' });
    }
    const ids = tresherIds.map((v) => Number.parseInt(String(v), 10)).filter(Number.isInteger);
    if (ids.length === 0) {
        return res.status(400).json({ result: -1, error: 'No valid tresher ids provided' });
    }
    try {
        const result = await pcService.tavernTurnIn(id, userkey.trim(), ids);
        if (!result) {
            return res.status(404).json({ result: -1, error: 'PC not found or not authorized' });
        }
        return res.json({ result: 1, spAwarded: result.spAwarded, newSp: result.newSp });
    }
    catch (error) {
        console.error('Error during tavern turn-in:', error);
        return res.status(500).json({ result: -1, error: 'Failed to complete tavern turn-in' });
    }
};
exports.tavernTurnIn = tavernTurnIn;
