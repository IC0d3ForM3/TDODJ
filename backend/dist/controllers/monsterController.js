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
exports.updateMonster = exports.createMonster = exports.getMonsters = void 0;
const userRepository_1 = require("../repositories/userRepository");
const monsterService = __importStar(require("../services/monsterService"));
const imageService = __importStar(require("../services/imageService"));
const tresherService = __importStar(require("../services/tresherService"));
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const getMonsters = async (req, res) => {
    const userkey = req.query['userkey'];
    const scope = req.query['scope'];
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ error: 'Valid userkey query parameter is required' });
    }
    try {
        const shouldIncludePublic = typeof scope === 'string' && scope.toLowerCase() === 'library';
        if (shouldIncludePublic && await (0, userRepository_1.isMasterAdminByGuid)(userkey.trim())) {
            return res.json(await monsterService.fetchAllMonstersWithUsername());
        }
        const monsters = shouldIncludePublic
            ? await monsterService.fetchMonsterLibraryByUserGuid(userkey.trim())
            : await monsterService.fetchMonstersByUserGuid(userkey.trim());
        return res.json(monsters);
    }
    catch (error) {
        console.error('Error fetching monsters:', error);
        return res.status(500).json({ error: 'Failed to fetch monsters' });
    }
};
exports.getMonsters = getMonsters;
const createMonster = async (req, res) => {
    const { userkey, monster } = req.body;
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    const normalizedPayload = normalizeMonsterPayload(monster);
    if (!normalizedPayload) {
        return res.status(400).json({ result: -1, error: 'Valid monster payload is required' });
    }
    try {
        const isAdmin = await monsterService.checkUserIsAdminByGuid(userkey.trim());
        if (normalizedPayload.isPublic && !isAdmin) {
            return res
                .status(403)
                .json({ result: -1, error: 'Only admin users can set a monster as public.' });
        }
        if (normalizedPayload.imageId !== null) {
            const canUseImage = await imageService.checkImageAccessibleByIdForUser(normalizedPayload.imageId, userkey.trim());
            if (!canUseImage) {
                return res.status(400).json({
                    result: -1,
                    error: 'Selected image is not available for this user.',
                });
            }
        }
        const invalidTresherId = await findFirstInvalidTresherIdForUser(normalizedPayload.tresherIds, userkey.trim());
        if (invalidTresherId !== null) {
            return res.status(400).json({
                result: -1,
                error: `Selected tresher ${invalidTresherId} is not available for this user.`,
            });
        }
        const created = await monsterService.createMonsterForUser(userkey.trim(), {
            ...normalizedPayload,
            isPublic: normalizedPayload.isPublic && isAdmin,
        });
        return res.status(201).json({ result: 1, monster: created });
    }
    catch (error) {
        console.error('Error creating monster:', error);
        return res.status(500).json({ result: -1, error: 'Failed to create monster' });
    }
};
exports.createMonster = createMonster;
const updateMonster = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const { userkey, monster } = req.body;
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid monster id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    const normalizedPayload = normalizeMonsterPayload(monster);
    if (!normalizedPayload) {
        return res.status(400).json({ result: -1, error: 'Valid monster payload is required' });
    }
    try {
        const isAdmin = await monsterService.checkUserIsAdminByGuid(userkey.trim());
        if (normalizedPayload.isPublic && !isAdmin) {
            return res
                .status(403)
                .json({ result: -1, error: 'Only admin users can set a monster as public.' });
        }
        if (normalizedPayload.imageId !== null) {
            const canUseImage = await imageService.checkImageAccessibleByIdForUser(normalizedPayload.imageId, userkey.trim());
            if (!canUseImage) {
                return res.status(400).json({
                    result: -1,
                    error: 'Selected image is not available for this user.',
                });
            }
        }
        const invalidTresherId = await findFirstInvalidTresherIdForUser(normalizedPayload.tresherIds, userkey.trim());
        if (invalidTresherId !== null) {
            return res.status(400).json({
                result: -1,
                error: `Selected tresher ${invalidTresherId} is not available for this user.`,
            });
        }
        const updated = await monsterService.saveMonsterForUser(id, userkey.trim(), {
            ...normalizedPayload,
            isPublic: normalizedPayload.isPublic && isAdmin,
        });
        if (!updated) {
            return res.status(404).json({ result: -1, error: 'Monster not found' });
        }
        return res.json({ result: 1, monster: updated });
    }
    catch (error) {
        console.error('Error updating monster:', error);
        return res.status(500).json({ result: -1, error: 'Failed to update monster' });
    }
};
exports.updateMonster = updateMonster;
const normalizeMonsterPayload = (value) => {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const input = value;
    const attacks = normalizeMonsterAttacks(input.attacks);
    const numberOfAttacksInput = normalizeNumber(input.numberOfAttacks ?? input.nuberOfAttacks, attacks.length);
    const numberOfAttacks = Math.max(0, Math.max(numberOfAttacksInput, attacks.length));
    const callsReinforcements = normalizeBoolean(input.callsReinforcements);
    const reinforcementCount = callsReinforcements
        ? Math.max(1, normalizeNumber(input.reinforcementCount, 1))
        : 0;
    return {
        imageId: normalizeNullableNumber(input.imageId ?? input.imageid),
        soundId: normalizeNullableNumber(input.soundId),
        tresherIds: normalizeIdList(input.tresherIds ?? input.tresherids ?? input.trusherIds ?? input.trusherids),
        keyIds: normalizeIdList(input.keyIds ?? input.keyids),
        name: normalizeText(input.name, 'Unnamed Monster'),
        type: normalizeText(input.type, 'Unknown'),
        description: normalizeText(input.description ?? input.discription, ''),
        hp: Math.max(0, normalizeNumber(input.hp, 1)),
        movementEconomy: Math.max(0, normalizeNumber(input.movementEconomy ?? input.movmentEconomy, 0)),
        ac: Math.max(0, normalizeNumber(input.ac, 10)),
        runAt: Math.max(0, normalizeNumber(input.runAt ?? input.runat, 0)),
        numberOfAttacks,
        attacks,
        isPublic: normalizeBoolean(input.isPublic ?? input.ispublic),
        spReward: Math.max(0, normalizeNumber(input.spReward, 0)),
        magic: Math.max(0, normalizeNumber(input.magic, 0)),
        magicResistance: Math.max(0, normalizeNumber(input.magicResistance, 0)),
        callsReinforcements,
        reinforcementCount,
        reinforcementMonsterName: callsReinforcements
            ? normalizeNullableText(input.reinforcementMonsterName)
            : null,
        toHitPlusNeeded: Math.max(0, normalizeNumber(input.toHitPlusNeeded, 0)),
        npcGreeting: normalizeNullableText(input.npcGreeting),
        npcInfo1: normalizeNullableText(input.npcInfo1),
        npcInfo2: normalizeNullableText(input.npcInfo2),
        npcInfo3: normalizeNullableText(input.npcInfo3),
        npcOnlyAttackWhenAttacked: normalizeBoolean(input.npcOnlyAttackWhenAttacked),
        npcGivesInfoAfterDamaged: normalizeBoolean(input.npcGivesInfoAfterDamaged),
        npcAttacksAfterInfo: normalizeBoolean(input.npcAttacksAfterInfo),
        npcCanTrade: normalizeBoolean(input.npcCanTrade),
        awareness: Math.max(1, normalizeNumber(input.awareness, 5)),
    };
};
const normalizeMonsterAttacks = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => {
        if (!item || typeof item !== 'object') {
            return null;
        }
        const source = item;
        return {
            type: normalizeText(source.type, 'Weapon'),
            description: normalizeText(source.description ?? source.discription, ''),
            damage: Math.max(0, normalizeNumber(source.damage, 0)),
            plusToHit: normalizeNumber(source.plusToHit ?? source.plushToHit, 0),
            weaponItemId: normalizeNullableNumber(source.weaponItemId),
            spellId: normalizeNullableNumber(source.spellId),
            curseId: normalizeNullableNumber(source.curseId),
        };
    })
        .filter((item) => item !== null);
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
const findFirstInvalidTresherIdForUser = async (tresherIds, userguid) => {
    for (const tresherId of tresherIds) {
        const isAccessible = await tresherService.checkTresherAccessibleByIdForUser(tresherId, userguid);
        if (!isAccessible) {
            return tresherId;
        }
    }
    return null;
};
const normalizeBoolean = (value) => value === true;
const normalizeNullableText = (value) => {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed || null;
};
