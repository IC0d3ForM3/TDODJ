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
exports.getSampleGameSession = exports.getAdminPublishedDungons = exports.setSampleDungon = exports.getSampleDungon = exports.approveDungon = exports.deleteGame = exports.deleteDungon = exports.saveGame = exports.getGameById = exports.getGamesForUser = exports.startGameFromPublishedDungon = exports.publishDungon = exports.updateDungonMetadata = exports.updateDungonJson = exports.createDungon = exports.getDungonById = exports.getDungons = exports.getPublishedDungons = void 0;
const dungonService = __importStar(require("../services/dungonService"));
const pcService = __importStar(require("../services/pcService"));
const tresherService = __importStar(require("../services/tresherService"));
const itemService = __importStar(require("../services/itemService"));
const potionService = __importStar(require("../services/potionService"));
const spellService = __importStar(require("../services/spellService"));
const imageService = __importStar(require("../services/imageService"));
const userRepository_1 = require("../repositories/userRepository");
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const getPublishedDungons = async (req, res) => {
    const userkeyQuery = req.query['userkey'];
    let userkey = null;
    if (typeof userkeyQuery === 'string') {
        const trimmedUserKey = userkeyQuery.trim();
        if (!UUID_REGEX.test(trimmedUserKey)) {
            return res.status(400).json({ error: 'Valid userkey query parameter is required' });
        }
        userkey = trimmedUserKey;
    }
    try {
        const dungons = await dungonService.fetchPublishedDungons(userkey);
        return res.json(dungons);
    }
    catch (error) {
        console.error('Error fetching published dungons:', error);
        return res.status(500).json({ error: 'Failed to fetch published dungons' });
    }
};
exports.getPublishedDungons = getPublishedDungons;
const getDungons = async (req, res) => {
    const userkey = req.query['userkey'];
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ error: 'Valid userkey query parameter is required' });
    }
    try {
        const dungons = await dungonService.fetchDungonsByUserKey(userkey.trim());
        return res.json(dungons);
    }
    catch (error) {
        console.error('Error fetching dungons:', error);
        return res.status(500).json({ error: 'Failed to fetch dungons' });
    }
};
exports.getDungons = getDungons;
const getDungonById = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const userkey = req.query['userkey'];
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Valid dungon id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ error: 'Valid userkey query parameter is required' });
    }
    try {
        const dungon = await dungonService.fetchDungonByIdForUser(id, userkey.trim());
        if (!dungon) {
            return res.status(404).json({ error: 'Dungon not found' });
        }
        return res.json(dungon);
    }
    catch (error) {
        console.error('Error fetching dungon by id:', error);
        return res.status(500).json({ error: 'Failed to fetch dungon' });
    }
};
exports.getDungonById = getDungonById;
const createDungon = async (req, res) => {
    const { userkey, name, description, intro, ismaingame, issample, resettable_per_pc, imageid } = req.body;
    if (typeof userkey !== 'string' ||
        typeof name !== 'string' ||
        typeof description !== 'string' ||
        typeof intro !== 'string') {
        return res.status(400).json({
            result: -1,
            error: 'userkey, name, description, and intro are required strings',
        });
    }
    const trimmedUserKey = userkey.trim();
    if (!UUID_REGEX.test(trimmedUserKey)) {
        return res.status(400).json({ result: -1, error: 'Invalid userkey format' });
    }
    // Look up the caller to verify permissions
    const user = await (0, userRepository_1.getUserByKey)(trimmedUserKey);
    if (!user) {
        return res.status(403).json({ result: -1, error: 'User not found or inactive' });
    }
    const isAdmin = user.isadmin || user.ismasteradmin;
    const isCreator = user.iscreator;
    if (!isAdmin && !isCreator) {
        return res.status(403).json({ result: -1, error: 'Only creators and admins can create dungons' });
    }
    if (ismaingame === true && !isAdmin) {
        return res.status(403).json({ result: -1, error: 'Only admins can create a Main Game dungon' });
    }
    if (issample === true && !isAdmin) {
        return res.status(403).json({ result: -1, error: 'Only admins can mark a dungon as a sample' });
    }
    if (resettable_per_pc === true && !isAdmin) {
        return res.status(403).json({ result: -1, error: 'Only admins can mark a dungon as resettable per PC' });
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
        return res.status(400).json({ result: -1, error: 'Name is required' });
    }
    try {
        const dungon = await dungonService.createDungon({
            userkey: trimmedUserKey,
            name: trimmedName,
            description: description.trim(),
            intro: intro.trim(),
            ismaingame: isAdmin ? !!ismaingame : false,
            issample: isAdmin ? !!issample : false,
            resettable_per_pc: isAdmin ? !!resettable_per_pc : false,
            imageid: typeof imageid === 'number' ? imageid : null,
        });
        return res.status(201).json({ result: 1, dungon });
    }
    catch (error) {
        console.error('Error creating dungon:', error);
        return res.status(500).json({ result: -1, error: 'Failed to create dungon' });
    }
};
exports.createDungon = createDungon;
const updateDungonJson = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const { userkey, dungonJson } = req.body;
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid dungon id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    if (dungonJson === null || typeof dungonJson !== 'object') {
        return res
            .status(400)
            .json({ result: -1, error: 'dungonJson must be a JSON object value' });
    }
    try {
        const wasUpdated = await dungonService.saveDungonJsonForUser(id, userkey.trim(), dungonJson);
        if (!wasUpdated) {
            return res.status(404).json({ result: -1, error: 'Dungon not found' });
        }
        return res.json({ result: 1 });
    }
    catch (error) {
        console.error('Error saving dungon json:', error);
        return res.status(500).json({ result: -1, error: 'Failed to save dungon json' });
    }
};
exports.updateDungonJson = updateDungonJson;
const updateDungonMetadata = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const { userkey, name, description, intro, minsplifetime, maxsplifetime, resettable_per_pc, imageid } = req.body;
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid dungon id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    // Validate SP fields if provided
    if (typeof minsplifetime === 'number' && typeof maxsplifetime === 'number') {
        if (minsplifetime < 0 || maxsplifetime < 0) {
            return res.status(400).json({ result: -1, error: 'SP values must be non-negative' });
        }
        if (minsplifetime > maxsplifetime) {
            return res.status(400).json({ result: -1, error: 'minsplifetime must be less than or equal to maxsplifetime' });
        }
    }
    try {
        const user = await (0, userRepository_1.getUserByKey)(userkey.trim());
        const isAdmin = user ? (user.isadmin || user.ismasteradmin) : false;
        const updated = await dungonService.updateDungonMetadata(id, userkey.trim(), {
            ...(typeof name === 'string' && { name }),
            ...(typeof description === 'string' && { description }),
            ...(typeof intro === 'string' && { intro }),
            ...(typeof minsplifetime === 'number' && { minsplifetime }),
            ...(typeof maxsplifetime === 'number' && { maxsplifetime }),
            ...(typeof resettable_per_pc === 'boolean' && isAdmin && { resettable_per_pc }),
            ...('imageid' in req.body && { imageid: typeof imageid === 'number' ? imageid : null }),
        });
        if (!updated) {
            return res.status(404).json({ result: -1, error: 'Dungon not found' });
        }
        return res.json({ result: 1, dungon: updated });
    }
    catch (error) {
        console.error('Error updating dungon metadata:', error);
        return res.status(500).json({ result: -1, error: 'Failed to update dungon metadata' });
    }
};
exports.updateDungonMetadata = updateDungonMetadata;
const publishDungon = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const { userkey, visibility, friendUserKeys } = req.body;
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid dungon id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    const normalizedVisibility = visibility === 'friends' || visibility === 'private' ? visibility : 'public';
    const normalizedFriendUserKeys = Array.isArray(friendUserKeys)
        ? Array.from(new Set(friendUserKeys
            .filter((item) => typeof item === 'string')
            .map((item) => item.trim())
            .filter((item) => UUID_REGEX.test(item))))
        : [];
    if (normalizedVisibility === 'friends' && normalizedFriendUserKeys.length === 0) {
        return res.status(400).json({ result: -1, error: 'Select at least one friend for friend visibility.' });
    }
    // Determine if the user is an admin (admins publish public directly; creators go to pending)
    let isAdminUser = false;
    try {
        const user = await (0, userRepository_1.getUserByKey)(userkey.trim());
        isAdminUser = !!(user?.isadmin || user?.ismasteradmin);
    }
    catch {
        // Non-fatal — default to non-admin
    }
    try {
        const wasPublished = await dungonService.publishDungonForUserKey(id, userkey.trim(), {
            visibility: normalizedVisibility,
            friendUserKeys: normalizedFriendUserKeys,
            isAdminUser,
        });
        if (!wasPublished) {
            return res.status(404).json({ result: -1, error: 'Dungon not found' });
        }
        // Non-admin requesting public → status becomes 'pending'
        const resultStatus = (normalizedVisibility === 'public' && !isAdminUser) ? 'pending' : 'published';
        return res.json({ result: 1, status: resultStatus, visibility: normalizedVisibility });
    }
    catch (error) {
        if (error instanceof Error && error.message === 'INVALID_FRIEND_SELECTION') {
            return res.status(400).json({ result: -1, error: 'One or more selected friends are not active friends.' });
        }
        if (error instanceof Error && error.message === 'EMPTY_FRIEND_SELECTION') {
            return res.status(400).json({ result: -1, error: 'Select at least one friend for friend visibility.' });
        }
        console.error('Error publishing dungon:', error);
        return res.status(500).json({ result: -1, error: 'Failed to publish dungon' });
    }
};
exports.publishDungon = publishDungon;
const startGameFromPublishedDungon = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const { userkey, pcId } = req.body;
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid dungon id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    if (typeof pcId !== 'number' || !Number.isInteger(pcId) || pcId <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid pcId is required' });
    }
    const trimmedUserKey = userkey.trim();
    // Check the PC and dungeon are compatible (both ismaingame or both not)
    const [dungonStatus, pc] = await Promise.all([
        dungonService.fetchDungonIsMainGameStatus(id),
        pcService.fetchPcByIdForUser(pcId, trimmedUserKey),
    ]);
    if (!dungonStatus) {
        return res.status(404).json({ result: -1, error: 'Published dungon not found' });
    }
    if (!pc) {
        return res.status(403).json({ result: -1, error: 'PC not found or does not belong to this user' });
    }
    if (dungonStatus.ismaingame && !pc.ismaingame) {
        return res.status(403).json({ result: -1, error: 'Only main game PCs can play main game dungons' });
    }
    if (!dungonStatus.ismaingame && pc.ismaingame) {
        return res.status(403).json({ result: -1, error: 'Main game PCs can only play main game dungons' });
    }
    try {
        const game = await dungonService.startGameForUserFromPublishedDungon(id, trimmedUserKey, pcId);
        if (!game) {
            return res
                .status(404)
                .json({ result: -1, error: 'Published dungon not found' });
        }
        return res.json({
            result: 1,
            game: {
                id: game.id,
                dungonid: game.dungonid,
                userkey: game.userkey,
                createguidid: game.createguidid,
                name: game.name,
                lastupdated: game.lastupdated,
            },
        });
    }
    catch (error) {
        console.error('Error starting game from published dungon:', error);
        return res.status(500).json({ result: -1, error: 'Failed to start game' });
    }
};
exports.startGameFromPublishedDungon = startGameFromPublishedDungon;
const getGamesForUser = async (req, res) => {
    const userkey = req.query['userkey'];
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ error: 'Valid userkey query parameter is required' });
    }
    try {
        const games = await dungonService.fetchGamesForUser(userkey.trim());
        return res.json(games);
    }
    catch (error) {
        console.error('Error fetching games for user:', error);
        return res.status(500).json({ error: 'Failed to fetch games' });
    }
};
exports.getGamesForUser = getGamesForUser;
const getGameById = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const userkey = req.query['userkey'];
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Valid game id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ error: 'Valid userkey query parameter is required' });
    }
    try {
        const game = await dungonService.fetchGameByIdForUser(id, userkey.trim());
        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }
        let pcTreshers = [];
        let pcTresherItems = [];
        let pcTresherPotions = [];
        let pcTresherSpells = [];
        let pcCurrentHP = null;
        let pcMaxHP = null;
        let pcSp = null;
        let pcMind = 0;
        let pcStamina = 0;
        let pcStrength = 0;
        let pcMagicPower = 0;
        let pcNumberOfAttacks = 1;
        let pcNumberOfDefends = 1;
        let pcType = null;
        let pcSpecies = null;
        let pcName = null;
        const currentPcId = game.pcid ?? null;
        if (game.pcid !== null && game.pcid > 0) {
            const pc = await pcService.fetchPcByIdForUser(game.pcid, userkey.trim());
            if (pc) {
                pcCurrentHP = pc.currentHP;
                pcMaxHP = pc.maxHP;
                pcSp = pc.sp;
                pcMind = pc.mind;
                pcStamina = pc.stamina ?? 0;
                pcStrength = pc.strength ?? 0;
                pcMagicPower = pc.magicPower ?? 0;
                pcNumberOfAttacks = pc.numberOfAttacks ?? 1;
                pcNumberOfDefends = pc.numberOfDefends ?? 1;
                pcType = pc.type ?? null;
                pcSpecies = pc.species ?? null;
                pcName = pc.name ?? null;
                const allPcTresherIds = Array.from(new Set([
                    ...(Array.isArray(pc.tresherIds) ? pc.tresherIds : []),
                    pc.weaponTresherId,
                    pc.primaryTresherId,
                    pc.headArmorTresherId,
                    pc.bodyArmorTresherId,
                    pc.leftArmArmorTresherId,
                    pc.rightArmArmorTresherId,
                    pc.leftLegArmorTresherId,
                    pc.rightLegArmorTresherId,
                ].filter((id) => typeof id === 'number' && id > 0)));
                if (allPcTresherIds.length > 0) {
                    const treshers = await tresherService.fetchTreshersByIds(allPcTresherIds);
                    pcTreshers = treshers.map((t) => ({
                        id: t.id,
                        type: t.type,
                        name: t.name,
                        description: t.description,
                        gold: t.gold,
                        silver: t.silver,
                        copper: t.copper,
                        zinc: t.zinc,
                        item1Id: t.item1Id,
                        item2Id: t.item2Id,
                        item3Id: t.item3Id,
                        item4Id: t.item4Id,
                        spell1Id: t.spell1Id,
                        spell2Id: t.spell2Id,
                        spell3Id: t.spell3Id,
                        spell4Id: t.spell4Id,
                        curse1Id: t.curse1Id,
                        curse2Id: t.curse2Id,
                        potion1Id: t.potion1Id,
                        potion2Id: t.potion2Id,
                        potion3Id: t.potion3Id,
                        imageId: t.imageId,
                        soundId: t.soundId,
                        spReward: t.spReward,
                    }));
                    const allItemIds = Array.from(new Set(treshers.flatMap((t) => [t.item1Id, t.item2Id, t.item3Id, t.item4Id]
                        .filter((id) => typeof id === 'number' && id > 0))));
                    if (allItemIds.length > 0) {
                        const items = await itemService.fetchItemsByIds(allItemIds);
                        pcTresherItems = items.map((it) => ({
                            id: it.id,
                            name: it.name,
                            description: it.description,
                            type: it.type,
                            effectValue: it.effectValue,
                            damage: it.damage ?? 0,
                            range: Math.max(1, parseInt(String(it.range), 10) || 1),
                            armorSlot: it.armorSlot ?? null,
                            effectOn: it.effectOn ?? null,
                        }));
                    }
                    const allPotionIds = Array.from(new Set(treshers.flatMap((t) => [t.potion1Id, t.potion2Id, t.potion3Id]
                        .filter((id) => typeof id === 'number' && id > 0))));
                    if (allPotionIds.length > 0) {
                        const potions = await potionService.fetchPotionsByIds(allPotionIds);
                        pcTresherPotions = potions.map((p) => ({
                            id: p.id,
                            name: p.name,
                            description: p.description,
                            effectTo: p.effectTo,
                            effectAmount: p.effectAmount,
                            lastFor: p.lastFor,
                        }));
                    }
                    const allSpellIds = Array.from(new Set(treshers.flatMap((t) => [t.spell1Id, t.spell2Id, t.spell3Id, t.spell4Id]
                        .filter((id) => typeof id === 'number' && id > 0))));
                    if (allSpellIds.length > 0) {
                        const spells = await spellService.fetchSpellsByIdsForGame(allSpellIds);
                        pcTresherSpells = spells.map((s) => ({
                            id: s.id,
                            name: s.name,
                            description: s.description,
                            range: s.range,
                            effectOn: s.effectOn,
                            effectAmount: s.effectAmount,
                            successTestValue: s.successTestValue,
                            sp: s.sp,
                            lastFor: s.lastFor,
                        }));
                    }
                }
            }
        }
        const [dungonSpReward, dungonStatus] = await Promise.all([
            dungonService.fetchDungonSpReward(game.dungonid),
            dungonService.fetchDungonIsMainGameStatus(game.dungonid),
        ]);
        return res.json({ ...game, pcTreshers, pcTresherItems, pcTresherPotions, pcTresherSpells, pcCurrentHP, pcMaxHP, pcSp, pcMind, pcStamina, pcStrength, pcMagicPower, pcNumberOfAttacks, pcNumberOfDefends, pcType, pcSpecies, pcName, currentPcId, dungonSpReward, isMainGame: dungonStatus?.ismaingame ?? false, resettablePerPc: dungonStatus?.resettable_per_pc ?? false });
    }
    catch (error) {
        console.error('Error fetching game by id:', error);
        return res.status(500).json({ error: 'Failed to fetch game' });
    }
};
exports.getGameById = getGameById;
const saveGame = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const userkey = req.body?.['userkey'];
    const dungenJson = req.body?.['dungenJson'];
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Valid game id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ error: 'Valid userkey is required' });
    }
    if (!dungenJson || typeof dungenJson !== 'object') {
        return res.status(400).json({ error: 'Valid dungenJson is required' });
    }
    try {
        const game = await dungonService.saveGameDungenJson(id, userkey.trim(), dungenJson);
        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }
        return res.json({ result: 1 });
    }
    catch (error) {
        console.error('Error saving game:', error);
        return res.status(500).json({ error: 'Failed to save game' });
    }
};
exports.saveGame = saveGame;
const deleteDungon = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const userkey = req.body?.['userkey'];
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid dungon id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    try {
        const deleted = await dungonService.removeDungonForUser(id, userkey.trim());
        if (!deleted) {
            return res.status(404).json({ result: -1, error: 'Dungeon not found or not yours' });
        }
        return res.json({ result: 1 });
    }
    catch (error) {
        console.error('Error deleting dungon:', error);
        return res.status(500).json({ result: -1, error: 'Failed to delete dungeon' });
    }
};
exports.deleteDungon = deleteDungon;
const deleteGame = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const userkey = req.body?.['userkey'];
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid game id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    try {
        const deleted = await dungonService.removeGameForUser(id, userkey.trim());
        if (!deleted) {
            return res.status(404).json({ result: -1, error: 'Game not found' });
        }
        return res.json({ result: 1 });
    }
    catch (error) {
        console.error('Error deleting game:', error);
        return res.status(500).json({ result: -1, error: 'Failed to delete game' });
    }
};
exports.deleteGame = deleteGame;
const approveDungon = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const { userkey } = req.body;
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid dungon id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    const trimmedKey = userkey.trim();
    const user = await (0, userRepository_1.getUserByKey)(trimmedKey);
    if (!user || (!user.isadmin && !user.ismasteradmin)) {
        return res.status(403).json({ result: -1, error: 'Only admins can approve dungons' });
    }
    try {
        const wasApproved = await dungonService.approvePendingDungon(id, trimmedKey);
        if (!wasApproved) {
            return res.status(404).json({ result: -1, error: 'Pending dungon not found' });
        }
        return res.json({ result: 1, status: 'published' });
    }
    catch (error) {
        console.error('Error approving dungon:', error);
        return res.status(500).json({ result: -1, error: 'Failed to approve dungon' });
    }
};
exports.approveDungon = approveDungon;
const getSampleDungon = async (req, res) => {
    try {
        const dungon = await dungonService.fetchSampleDungon();
        if (!dungon) {
            return res.status(404).json({ error: 'No sample dungon configured' });
        }
        return res.json(dungon);
    }
    catch (error) {
        console.error('Error fetching sample dungon:', error);
        return res.status(500).json({ error: 'Failed to fetch sample dungon' });
    }
};
exports.getSampleDungon = getSampleDungon;
const setSampleDungon = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const { userkey } = req.body;
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ result: -1, error: 'Valid dungon id is required' });
    }
    if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
        return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
    }
    const trimmedKey = userkey.trim();
    const user = await (0, userRepository_1.getUserByKey)(trimmedKey);
    if (!user || (!user.isadmin && !user.ismasteradmin)) {
        return res.status(403).json({ result: -1, error: 'Only admins can set the sample dungon' });
    }
    try {
        const wasSet = await dungonService.setSampleGame(id);
        if (!wasSet) {
            return res.status(404).json({ result: -1, error: 'Published dungon not found' });
        }
        return res.json({ result: 1 });
    }
    catch (error) {
        console.error('Error setting sample dungon:', error);
        return res.status(500).json({ result: -1, error: 'Failed to set sample dungon' });
    }
};
exports.setSampleDungon = setSampleDungon;
const getAdminPublishedDungons = async (req, res) => {
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
        const dungons = await dungonService.fetchAllPublishedDungonsForAdmin();
        return res.json(dungons);
    }
    catch (error) {
        console.error('Error fetching published dungons for admin:', error);
        return res.status(500).json({ error: 'Failed to fetch published dungons' });
    }
};
exports.getAdminPublishedDungons = getAdminPublishedDungons;
const getSampleGameSession = async (req, res) => {
    const pcIdRaw = req.query['pcId'];
    const pcId = typeof pcIdRaw === 'string' ? Number.parseInt(pcIdRaw, 10) : NaN;
    if (!Number.isInteger(pcId) || pcId <= 0) {
        return res.status(400).json({ error: 'Valid pcId query parameter is required' });
    }
    try {
        const [dungon, pc] = await Promise.all([
            dungonService.fetchSampleDungonFull(),
            pcService.fetchSamplePcById(pcId),
        ]);
        if (!dungon) {
            return res.status(404).json({ error: 'No sample dungon configured' });
        }
        if (!pc) {
            return res.status(404).json({ error: 'Sample PC not found' });
        }
        let pcTreshers = [];
        let pcTresherItems = [];
        let pcTresherPotions = [];
        let pcTresherSpells = [];
        const allPcTresherIds = Array.from(new Set([
            ...(Array.isArray(pc.tresherIds) ? pc.tresherIds : []),
            pc.weaponTresherId,
            pc.primaryTresherId,
            pc.headArmorTresherId,
            pc.bodyArmorTresherId,
            pc.leftArmArmorTresherId,
            pc.rightArmArmorTresherId,
            pc.leftLegArmorTresherId,
            pc.rightLegArmorTresherId,
        ].filter((id) => typeof id === 'number' && id > 0)));
        if (allPcTresherIds.length > 0) {
            const treshers = await tresherService.fetchTreshersByIds(allPcTresherIds);
            pcTreshers = treshers.map((t) => ({
                id: t.id,
                type: t.type,
                name: t.name,
                description: t.description,
                gold: t.gold,
                silver: t.silver,
                copper: t.copper,
                zinc: t.zinc,
                item1Id: t.item1Id,
                item2Id: t.item2Id,
                item3Id: t.item3Id,
                item4Id: t.item4Id,
                spell1Id: t.spell1Id,
                spell2Id: t.spell2Id,
                spell3Id: t.spell3Id,
                spell4Id: t.spell4Id,
                curse1Id: t.curse1Id,
                curse2Id: t.curse2Id,
                potion1Id: t.potion1Id,
                potion2Id: t.potion2Id,
                potion3Id: t.potion3Id,
                imageId: t.imageId,
                soundId: t.soundId,
                spReward: t.spReward,
            }));
            const allItemIds = Array.from(new Set(treshers.flatMap((t) => [t.item1Id, t.item2Id, t.item3Id, t.item4Id]
                .filter((id) => typeof id === 'number' && id > 0))));
            if (allItemIds.length > 0) {
                const items = await itemService.fetchItemsByIds(allItemIds);
                pcTresherItems = items.map((it) => ({
                    id: it.id,
                    name: it.name,
                    description: it.description,
                    type: it.type,
                    effectValue: it.effectValue,
                    damage: it.damage ?? 0,
                    range: Math.max(1, parseInt(String(it.range), 10) || 1),
                    armorSlot: it.armorSlot ?? null,
                    effectOn: it.effectOn ?? null,
                }));
            }
            const allPotionIds = Array.from(new Set(treshers.flatMap((t) => [t.potion1Id, t.potion2Id, t.potion3Id]
                .filter((id) => typeof id === 'number' && id > 0))));
            if (allPotionIds.length > 0) {
                const potions = await potionService.fetchPotionsByIds(allPotionIds);
                pcTresherPotions = potions.map((p) => ({
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    effectTo: p.effectTo,
                    effectAmount: p.effectAmount,
                    lastFor: p.lastFor,
                }));
            }
            const allSpellIds = Array.from(new Set(treshers.flatMap((t) => [t.spell1Id, t.spell2Id, t.spell3Id, t.spell4Id]
                .filter((id) => typeof id === 'number' && id > 0))));
            if (allSpellIds.length > 0) {
                const spells = await spellService.fetchSpellsByIdsForGame(allSpellIds);
                pcTresherSpells = spells.map((s) => ({
                    id: s.id,
                    name: s.name,
                    description: s.description,
                    range: s.range,
                    effectOn: s.effectOn,
                    effectAmount: s.effectAmount,
                    successTestValue: s.successTestValue,
                    sp: s.sp,
                    lastFor: s.lastFor,
                }));
            }
        }
        // Extract monster image IDs from dungeon JSON and fetch their paths
        let monsterImages = [];
        try {
            const dungonJsonObj = typeof dungon.dungenJson === 'string'
                ? JSON.parse(dungon.dungenJson)
                : dungon.dungenJson;
            const monsterList = Array.isArray(dungonJsonObj?.monsterList)
                ? dungonJsonObj.monsterList
                : Array.isArray(dungonJsonObj?.monsters)
                    ? dungonJsonObj.monsters
                    : [];
            const monsterImageIds = Array.from(new Set(monsterList
                .map((m) => m?.imageId)
                .filter((id) => typeof id === 'number' && id > 0)));
            if (monsterImageIds.length > 0) {
                const images = await imageService.fetchImagesByIds(monsterImageIds);
                monsterImages = images
                    .filter((img) => typeof img.path === 'string' && img.path.trim())
                    .map((img) => ({ id: img.id, path: img.path }));
            }
        }
        catch {
            // non-fatal — just proceed without images
        }
        return res.json({
            id: 0,
            dungonid: dungon.id,
            name: dungon.name,
            description: dungon.description,
            intro: dungon.intro,
            dungenJson: dungon.dungenJson,
            lastupdated: new Date().toISOString(),
            pcTreshers,
            pcTresherItems,
            pcTresherPotions,
            pcTresherSpells,
            pcCurrentHP: pc.maxHP,
            pcMaxHP: pc.maxHP,
            pcSp: 0,
            pcMind: pc.mind,
            pcStamina: pc.stamina,
            pcStrength: pc.strength,
            pcMagicPower: pc.magicPower,
            pcNumberOfAttacks: 1,
            pcNumberOfDefends: 1,
            pcType: pc.type ?? null,
            pcSpecies: pc.species ?? null,
            pcName: pc.name ?? null,
            currentPcId: null,
            dungonSpReward: dungon.spreward,
            monsterImages,
        });
    }
    catch (error) {
        console.error('Error building sample game session:', error);
        return res.status(500).json({ error: 'Failed to build sample game session' });
    }
};
exports.getSampleGameSession = getSampleGameSession;
