"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tavernTurnIn = exports.fetchSamplePcById = exports.fetchAllPcsForAdmin = exports.setMainGamePc = exports.setSamplePc = exports.fetchSamplePcs = exports.removePcForUser = exports.savePcForUser = exports.upgradeStat = exports.createPcForUser = exports.upgradeNod = exports.upgradeNoa = exports.completeDungonRewardOnce = exports.awardSpToPc = exports.fetchPcByIdForUser = exports.fetchAllPcsWithUsername = exports.fetchPcsByUserGuid = void 0;
const pcRepository_1 = require("../repositories/pcRepository");
const tresherRepository_1 = require("../repositories/tresherRepository");
const tresherRepository_2 = require("../repositories/tresherRepository");
const itemRepository_1 = require("../repositories/itemRepository");
const spellRepository_1 = require("../repositories/spellRepository");
const potionRepository_1 = require("../repositories/potionRepository");
const fetchPcsByUserGuid = async (userguid) => {
    return await (0, pcRepository_1.getPcsByUserGuid)(userguid);
};
exports.fetchPcsByUserGuid = fetchPcsByUserGuid;
const fetchAllPcsWithUsername = async () => {
    return await (0, pcRepository_1.getAllPcsWithUsername)();
};
exports.fetchAllPcsWithUsername = fetchAllPcsWithUsername;
const fetchPcByIdForUser = async (id, userguid) => {
    return await (0, pcRepository_1.getPcByIdForUser)(id, userguid);
};
exports.fetchPcByIdForUser = fetchPcByIdForUser;
const awardSpToPc = async (id, userguid, amount) => {
    return await (0, pcRepository_1.addSpToPc)(id, userguid, amount);
};
exports.awardSpToPc = awardSpToPc;
const completeDungonRewardOnce = async (id, userguid, dungonId, spReward) => {
    return await (0, pcRepository_1.completeDungonRewardOnce)(id, userguid, dungonId, spReward);
};
exports.completeDungonRewardOnce = completeDungonRewardOnce;
const upgradeNoa = async (id, userguid, spCost, goldCost, tresherId) => {
    return await (0, pcRepository_1.upgradeNoa)(id, userguid, spCost, goldCost, tresherId);
};
exports.upgradeNoa = upgradeNoa;
const upgradeNod = async (id, userguid, spCost, goldCost, tresherId) => {
    return await (0, pcRepository_1.upgradeNod)(id, userguid, spCost, goldCost, tresherId);
};
exports.upgradeNod = upgradeNod;
const createPcForUser = async (userguid, payload) => {
    const pc = await (0, pcRepository_1.insertPcForUser)(userguid, payload);
    try {
        await assignStarterGear(pc.id, userguid, payload.type);
    }
    catch (err) {
        // Starter gear is best-effort — don't fail the whole PC creation
        console.error('Failed to assign starter gear to new PC:', err);
    }
    return pc;
};
exports.createPcForUser = createPcForUser;
/** Gear table keyed by normalised PC type (lowercase). */
const STARTER_GEAR = {
    fighter: { label: 'Fighter Starting Kit', items: ['Short Sword', 'Shield'], spells: [], potions: [] },
    mage: { label: 'Mage Starting Kit', items: ['Magic Wand'], spells: ['Lightning Arc'], potions: [] },
    thieph: { label: 'Thief Starting Kit', items: ['Dagger', 'Lock picks'], spells: [], potions: [] },
    healer: { label: 'Healer Starting Kit', items: ['Quarter Staff'], spells: [], potions: ['Minor Healing Potion'] },
};
async function assignStarterGear(pcId, userguid, pcType) {
    const key = (pcType ?? '').toLowerCase();
    const gear = STARTER_GEAR[key];
    if (!gear)
        return;
    const [itemRows, spellRows, potionRows] = await Promise.all([
        (0, itemRepository_1.getPublicItemsByNames)(gear.items),
        (0, spellRepository_1.getPublicSpellsByNames)(gear.spells),
        (0, potionRepository_1.getPublicPotionsByNames)(gear.potions),
    ]);
    // Build a name→id map for each category
    const itemId = (name) => itemRows.find((r) => r.name === name)?.id ?? null;
    const spellId = (name) => spellRows.find((r) => r.name === name)?.id ?? null;
    const potionId = (name) => potionRows.find((r) => r.name === name)?.id ?? null;
    // Skip if none of the expected IDs resolved (migration not yet run)
    const hasContent = gear.items.some((n) => itemId(n) !== null) ||
        gear.spells.some((n) => spellId(n) !== null) ||
        gear.potions.some((n) => potionId(n) !== null);
    if (!hasContent)
        return;
    const starterPayload = {
        type: 'OtherTresher',
        name: gear.label,
        description: 'Your starting equipment.',
        gold: 0,
        silver: 0,
        copper: 0,
        zinc: 0,
        item1Id: gear.items[0] ? itemId(gear.items[0]) : null,
        item2Id: gear.items[1] ? itemId(gear.items[1]) : null,
        item3Id: gear.items[2] ? itemId(gear.items[2]) : null,
        item4Id: gear.items[3] ? itemId(gear.items[3]) : null,
        spell1Id: gear.spells[0] ? spellId(gear.spells[0]) : null,
        spell2Id: gear.spells[1] ? spellId(gear.spells[1]) : null,
        spell3Id: gear.spells[2] ? spellId(gear.spells[2]) : null,
        spell4Id: gear.spells[3] ? spellId(gear.spells[3]) : null,
        curse1Id: null,
        curse2Id: null,
        potion1Id: gear.potions[0] ? potionId(gear.potions[0]) : null,
        potion2Id: gear.potions[1] ? potionId(gear.potions[1]) : null,
        potion3Id: gear.potions[2] ? potionId(gear.potions[2]) : null,
        isPublic: false,
        isquest: false,
        spReward: 0,
        imageId: null,
        soundId: null,
    };
    const existingTreshers = await (0, tresherRepository_2.getTreshersByUserGuid)(userguid);
    const existingStarterTresher = existingTreshers.find((t) => (t.name ?? '').trim().toLowerCase() === starterPayload.name.trim().toLowerCase() &&
        (t.type ?? '') === starterPayload.type &&
        (t.description ?? '') === starterPayload.description &&
        t.item1Id === starterPayload.item1Id &&
        t.item2Id === starterPayload.item2Id &&
        t.item3Id === starterPayload.item3Id &&
        t.item4Id === starterPayload.item4Id &&
        t.spell1Id === starterPayload.spell1Id &&
        t.spell2Id === starterPayload.spell2Id &&
        t.spell3Id === starterPayload.spell3Id &&
        t.spell4Id === starterPayload.spell4Id &&
        t.potion1Id === starterPayload.potion1Id &&
        t.potion2Id === starterPayload.potion2Id &&
        t.potion3Id === starterPayload.potion3Id &&
        t.curse1Id === starterPayload.curse1Id &&
        t.curse2Id === starterPayload.curse2Id &&
        t.gold === starterPayload.gold &&
        t.silver === starterPayload.silver &&
        t.copper === starterPayload.copper &&
        t.zinc === starterPayload.zinc &&
        t.spReward === starterPayload.spReward &&
        t.isquest === starterPayload.isquest &&
        t.isPublic === starterPayload.isPublic);
    const starterTresher = existingStarterTresher ?? await (0, tresherRepository_1.insertTresherForUser)(userguid, starterPayload);
    const pc = await (0, pcRepository_1.getPcByIdForUser)(pcId, userguid);
    if (!pc || pc.tresherIds.includes(starterTresher.id)) {
        return;
    }
    await (0, pcRepository_1.addTresherIdToPcInDb)(pcId, starterTresher.id);
}
const upgradeStat = async (id, userguid, stat) => {
    return await (0, pcRepository_1.upgradeStat)(id, userguid, stat);
};
exports.upgradeStat = upgradeStat;
const savePcForUser = async (id, userguid, payload) => {
    return await (0, pcRepository_1.updatePcForUser)(id, userguid, payload);
};
exports.savePcForUser = savePcForUser;
const removePcForUser = async (id, userguid) => {
    return await (0, pcRepository_1.deletePcForUser)(id, userguid);
};
exports.removePcForUser = removePcForUser;
const fetchSamplePcs = async () => {
    return await (0, pcRepository_1.getSamplePcsFromDb)();
};
exports.fetchSamplePcs = fetchSamplePcs;
const setSamplePc = async (id, issample) => {
    return await (0, pcRepository_1.setSamplePcInDb)(id, issample);
};
exports.setSamplePc = setSamplePc;
const setMainGamePc = async (id, ismaingame) => {
    return await (0, pcRepository_1.setIsMainGamePcInDb)(id, ismaingame);
};
exports.setMainGamePc = setMainGamePc;
const fetchAllPcsForAdmin = async () => {
    return await (0, pcRepository_1.getAllPcsForAdmin)();
};
exports.fetchAllPcsForAdmin = fetchAllPcsForAdmin;
const fetchSamplePcById = async (id) => {
    return await (0, pcRepository_1.getPcByIdPublic)(id);
};
exports.fetchSamplePcById = fetchSamplePcById;
const tavernTurnIn = async (pcId, userguid, tresherIds) => {
    return await (0, tresherRepository_1.tavernTurnInQuestItems)(pcId, userguid, tresherIds);
};
exports.tavernTurnIn = tavernTurnIn;
