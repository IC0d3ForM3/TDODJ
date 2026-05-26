import {
  PcRecord,
  UpsertPcPayload,
  SamplePcRecord,
  AdminPcRecord,
  UpgradeStatName,
  getPcByIdForUser,
  getPcByIdPublic,
  getPcsByUserGuid,
  getAllPcsWithUsername,
  insertPcForUser,
  updatePcForUser,
  deletePcForUser,
  addSpToPc,
  addTresherIdToPcInDb,
  upgradeNoa as upgradeNoaInDb,
  upgradeNod as upgradeNodInDb,
  upgradeStat as upgradeStatInDb,
  getSamplePcsFromDb,
  setSamplePcInDb,
  setIsMainGamePcInDb,
  getAllPcsForAdmin,
} from '../repositories/pcRepository';
import { tavernTurnInQuestItems as tavernTurnInQuestItemsInDb, insertTresherForUser } from '../repositories/tresherRepository';
import { getTreshersByUserGuid } from '../repositories/tresherRepository';
import { getPublicItemsByNames } from '../repositories/itemRepository';
import { getPublicSpellsByNames } from '../repositories/spellRepository';
import { getPublicPotionsByNames } from '../repositories/potionRepository';

export const fetchPcsByUserGuid = async (userguid: string): Promise<PcRecord[]> => {
  return await getPcsByUserGuid(userguid);
};

export const fetchAllPcsWithUsername = async (): Promise<PcRecord[]> => {
  return await getAllPcsWithUsername();
};

export const fetchPcByIdForUser = async (
  id: number,
  userguid: string
): Promise<PcRecord | null> => {
  return await getPcByIdForUser(id, userguid);
};

export const awardSpToPc = async (
  id: number,
  userguid: string,
  amount: number
): Promise<{ sp: number; spLifetime: number } | null> => {
  return await addSpToPc(id, userguid, amount);
};

export const upgradeNoa = async (
  id: number,
  userguid: string,
  spCost: number,
  goldCost: number,
  tresherId: number | null
): Promise<{ sp: number; numberOfAttacks: number; newGold: number | null } | null> => {
  return await upgradeNoaInDb(id, userguid, spCost, goldCost, tresherId);
};

export const upgradeNod = async (
  id: number,
  userguid: string,
  spCost: number,
  goldCost: number,
  tresherId: number | null
): Promise<{ sp: number; numberOfDefends: number; newGold: number | null } | null> => {
  return await upgradeNodInDb(id, userguid, spCost, goldCost, tresherId);
};

export const createPcForUser = async (
  userguid: string,
  payload: UpsertPcPayload
): Promise<PcRecord> => {
  const pc = await insertPcForUser(userguid, payload);
  try {
    await assignStarterGear(pc.id, userguid, payload.type);
  } catch (err) {
    // Starter gear is best-effort — don't fail the whole PC creation
    console.error('Failed to assign starter gear to new PC:', err);
  }
  return pc;
};

/** Gear table keyed by normalised PC type (lowercase). */
const STARTER_GEAR: Record<string, {
  items: string[];
  spells: string[];
  potions: string[];
  label: string;
}> = {
  fighter: { label: 'Fighter Starting Kit', items: ['Short Sword', 'Shield'], spells: [],              potions: [] },
  mage:    { label: 'Mage Starting Kit',    items: ['Magic Wand'],            spells: ['Lightning Arc'], potions: [] },
  thieph:  { label: 'Thief Starting Kit',   items: ['Dagger', 'Lock picks'],  spells: [],              potions: [] },
  healer:  { label: 'Healer Starting Kit',  items: ['Quarter Staff'],         spells: [],              potions: ['Minor Healing Potion'] },
};

async function assignStarterGear(pcId: number, userguid: string, pcType: string): Promise<void> {
  const key = (pcType ?? '').toLowerCase();
  const gear = STARTER_GEAR[key];
  if (!gear) return;

  const [itemRows, spellRows, potionRows] = await Promise.all([
    getPublicItemsByNames(gear.items),
    getPublicSpellsByNames(gear.spells),
    getPublicPotionsByNames(gear.potions),
  ]);

  // Build a name→id map for each category
  const itemId = (name: string) => itemRows.find((r) => r.name === name)?.id ?? null;
  const spellId = (name: string) => spellRows.find((r) => r.name === name)?.id ?? null;
  const potionId = (name: string) => potionRows.find((r) => r.name === name)?.id ?? null;

  // Skip if none of the expected IDs resolved (migration not yet run)
  const hasContent =
    gear.items.some((n) => itemId(n) !== null) ||
    gear.spells.some((n) => spellId(n) !== null) ||
    gear.potions.some((n) => potionId(n) !== null);
  if (!hasContent) return;

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

  const existingTreshers = await getTreshersByUserGuid(userguid);
  const existingStarterTresher = existingTreshers.find((t) =>
    (t.name ?? '').trim().toLowerCase() === starterPayload.name.trim().toLowerCase() &&
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
    t.isPublic === starterPayload.isPublic
  );

  const starterTresher = existingStarterTresher ?? await insertTresherForUser(userguid, starterPayload);
  const pc = await getPcByIdForUser(pcId, userguid);
  if (!pc || pc.tresherIds.includes(starterTresher.id)) {
    return;
  }

  await addTresherIdToPcInDb(pcId, starterTresher.id);
}

export const upgradeStat = async (
  id: number,
  userguid: string,
  stat: UpgradeStatName
): Promise<{ sp: number; newValue: number } | null> => {
  return await upgradeStatInDb(id, userguid, stat);
};

export const savePcForUser = async (
  id: number,
  userguid: string,
  payload: UpsertPcPayload
): Promise<PcRecord | null> => {
  return await updatePcForUser(id, userguid, payload);
};

export const removePcForUser = async (
  id: number,
  userguid: string
): Promise<boolean> => {
  return await deletePcForUser(id, userguid);
};

export const fetchSamplePcs = async (): Promise<SamplePcRecord[]> => {
  return await getSamplePcsFromDb();
};

export const setSamplePc = async (id: number, issample: boolean): Promise<boolean> => {
  return await setSamplePcInDb(id, issample);
};

export const setMainGamePc = async (id: number, ismaingame: boolean): Promise<boolean> => {
  return await setIsMainGamePcInDb(id, ismaingame);
};

export const fetchAllPcsForAdmin = async (): Promise<AdminPcRecord[]> => {
  return await getAllPcsForAdmin();
};

export const fetchSamplePcById = async (id: number): Promise<PcRecord | null> => {
  return await getPcByIdPublic(id);
};

export const tavernTurnIn = async (
  pcId: number,
  userguid: string,
  tresherIds: number[]
): Promise<{ spAwarded: number; newSp: number } | null> => {
  return await tavernTurnInQuestItemsInDb(pcId, userguid, tresherIds);
};
