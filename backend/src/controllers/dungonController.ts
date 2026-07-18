import { Request, Response } from 'express';
import * as dungonService from '../services/dungonService';
import { generateDungon, GenerateDungonParams } from '../services/dungon-generator';
import * as pcService from '../services/pcService';
import * as tresherService from '../services/tresherService';
import * as itemService from '../services/itemService';
import * as potionService from '../services/potionService';
import * as spellService from '../services/spellService';
import type { SpellRecord } from '../repositories/spellRepository';
import * as curseService from '../services/curseService';
import * as imageService from '../services/imageService';
import * as soundService from '../services/soundService';
import { getUserByKey } from '../repositories/userRepository';
import { getMonstersByIds } from '../repositories/monsterRepository';

type PublishVisibility = 'public' | 'friends' | 'private';

/**
 * For any monster in the dungenJson monsterList that carries a monsterDbId,
 * replace the snapshot data with the current DB record so edits to a monster
 * are reflected the next time the dungeon is saved from the creator.
 */
async function refreshMonsterDataFromDb(dungonJson: unknown): Promise<unknown> {
  const root = asRecord(dungonJson);
  const monsterList = Array.isArray(root['monsterList']) ? (root['monsterList'] as unknown[]) : [];
  if (monsterList.length === 0) return dungonJson;

  const dbIdToLocalId = new Map<number, number>();
  for (const raw of monsterList) {
    const m = asRecord(raw);
    const localId = typeof m['id'] === 'number' ? (m['id'] as number) : null;
    const dbId = typeof m['monsterDbId'] === 'number' ? (m['monsterDbId'] as number) : null;
    if (localId !== null && dbId !== null) {
      dbIdToLocalId.set(dbId, localId);
    }
  }

  if (dbIdToLocalId.size === 0) return dungonJson;

  const freshRecords = await getMonstersByIds(Array.from(dbIdToLocalId.keys()));
  if (freshRecords.length === 0) return dungonJson;

  const freshByDbId = new Map(freshRecords.map((r) => [r.id, r]));

  const updatedMonsterList = monsterList.map((raw) => {
    const m = asRecord(raw);
    const dbId = typeof m['monsterDbId'] === 'number' ? (m['monsterDbId'] as number) : null;
    if (dbId === null) return raw;
    const fresh = freshByDbId.get(dbId);
    if (!fresh) return raw;
    // Keep the local id and monsterDbId; replace everything else with fresh DB data.
    return {
      ...fresh,
      id: m['id'],
      monsterDbId: dbId,
    };
  });

  return { ...root, monsterList: updatedMonsterList, monsters: updatedMonsterList };
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CurseSessionPayload = {
  id: number;
  name: string;
  description: string;
  effectTo: string;
  effectTo2: string | null;
  damage: number;
  damage2: number;
  lastFor: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function collectCurseIdsFromDungeonJson(dungenJson: unknown): Set<number> {
  const ids = new Set<number>();
  const root = asRecord(dungenJson);

  const readArray = (...keys: string[]): unknown[] => {
    for (const key of keys) {
      const value = root[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
    return [];
  };

  const monsterList = readArray('monsterList', 'monsters');
  for (const rawMonster of monsterList) {
    const monster = asRecord(rawMonster);
    const attacks = Array.isArray(monster['attacks']) ? (monster['attacks'] as unknown[]) : [];
    for (const rawAttack of attacks) {
      const attack = asRecord(rawAttack);
      const curseId = attack['curseId'];
      if (typeof curseId === 'number' && Number.isInteger(curseId) && curseId > 0) {
        ids.add(curseId);
      }
    }
  }

  const trapList = readArray('trapList', 'traps');
  for (const rawTrap of trapList) {
    const trap = asRecord(rawTrap);
    const curseId = trap['curseId'];
    if (typeof curseId === 'number' && Number.isInteger(curseId) && curseId > 0) {
      ids.add(curseId);
    }
  }

  return ids;
}

// Monster attacks reference spells by ID regardless of who owns the spell (the dungeon
// creator, or a public spell). These must resolve for every player, not just the current
// session's userkey, so we fetch them by ID directly rather than through the owner-scoped
// `/spells` catalog.
function collectMonsterSpellIdsFromDungeonJson(dungenJson: unknown): Set<number> {
  const ids = new Set<number>();
  const root = asRecord(dungenJson);

  const readArray = (...keys: string[]): unknown[] => {
    for (const key of keys) {
      const value = root[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
    return [];
  };

  const monsterList = readArray('monsterList', 'monsters');
  for (const rawMonster of monsterList) {
    const monster = asRecord(rawMonster);
    const attacks = Array.isArray(monster['attacks']) ? (monster['attacks'] as unknown[]) : [];
    for (const rawAttack of attacks) {
      const attack = asRecord(rawAttack);
      const spellId = attack['spellId'];
      if (typeof spellId === 'number' && Number.isInteger(spellId) && spellId > 0) {
        ids.add(spellId);
      }
    }
  }

  return ids;
}

function mapSpellRecordForSession(s: SpellRecord): Record<string, unknown> {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    soundId: s.soundId,
    range: s.range,
    effectOn: s.effectOn,
    effectOn2: s.effectOn2,
    effectAmount: s.effectAmount,
    effectAmount2: s.effectAmount2,
    effectDiceCount: s.effectDiceCount,
    effectDiceSides: s.effectDiceSides,
    effectAmount2DiceCount: s.effectAmount2DiceCount,
    effectAmount2DiceSides: s.effectAmount2DiceSides,
    successTestValue: s.successTestValue,
    sp: s.sp,
    minLtsp: s.minLtsp,
    learnCostGp: s.learnCostGp,
    lastFor: s.lastFor,
    numberOfTargets: s.numberOfTargets,
    magicCost: s.magicCost,
    effectType: s.effectType,
    effectColor: s.effectColor,
    effectOnPc1: s.effectOnPc1,
    effectOnPc2: s.effectOnPc2,
    range1: s.range1,
    range2: s.range2,
    lastFor1: s.lastFor1,
    lastFor2: s.lastFor2,
  };
}

async function resolveSessionCurses(curseIds: Set<number>): Promise<CurseSessionPayload[]> {
  if (curseIds.size === 0) {
    return [];
  }

  const rows = await curseService.fetchCursesByIds(Array.from(curseIds));
  return rows.map((curse) => ({
    id: curse.id,
    name: curse.name,
    description: curse.description,
    effectTo: curse.effectTo,
    effectTo2: curse.effectTo2,
    damage: curse.damage,
    damage2: curse.damage2,
    lastFor: curse.lastFor,
  }));
}

export const getPublishedDungons = async (req: Request, res: Response) => {
  const userkeyQuery = req.query['userkey'];
  let userkey: string | null = null;

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
  } catch (error) {
    console.error('Error fetching published dungons:', error);
    return res.status(500).json({ error: 'Failed to fetch published dungons' });
  }
};

export const getDungons = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];
  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  try {
    const dungons = await dungonService.fetchDungonsByUserKey(userkey.trim());
    return res.json(dungons);
  } catch (error) {
    console.error('Error fetching dungons:', error);
    return res.status(500).json({ error: 'Failed to fetch dungons' });
  }
};

export const getDungonById = async (req: Request, res: Response) => {
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
  } catch (error) {
    console.error('Error fetching dungon by id:', error);
    return res.status(500).json({ error: 'Failed to fetch dungon' });
  }
};

export const createDungon = async (req: Request, res: Response) => {
  const { userkey, name, description, intro, ismaingame, issample, resettable_per_pc, imageid } = req.body as Partial<{
    userkey: string;
    name: string;
    description: string;
    intro: string;
    ismaingame?: boolean;
    issample?: boolean;
    resettable_per_pc?: boolean;
    imageid?: number | null;
  }>;

  if (
    typeof userkey !== 'string' ||
    typeof name !== 'string' ||
    typeof description !== 'string' ||
    typeof intro !== 'string'
  ) {
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
  const user = await getUserByKey(trimmedUserKey);
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
  } catch (error) {
    console.error('Error creating dungon:', error);
    return res.status(500).json({ result: -1, error: 'Failed to create dungon' });
  }
};

export const updateDungonJson = async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params['id'], 10);
  const { userkey, dungonJson } = req.body as Partial<{
    userkey: string;
    dungonJson: unknown;
  }>;

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
    const refreshedDungonJson = await refreshMonsterDataFromDb(dungonJson);
    const wasUpdated = await dungonService.saveDungonJsonForUser(
      id,
      userkey.trim(),
      refreshedDungonJson
    );

    if (!wasUpdated) {
      return res.status(404).json({ result: -1, error: 'Dungon not found' });
    }

    return res.json({ result: 1 });
  } catch (error) {
    console.error('Error saving dungon json:', error);
    return res.status(500).json({ result: -1, error: 'Failed to save dungon json' });
  }
};

export const updateDungonMetadata = async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params['id'], 10);
  const { userkey, name, description, intro, minsplifetime, maxsplifetime, resettable_per_pc, imageid } = req.body as Partial<{
    userkey: string;
    name: string;
    description: string;
    intro: string;
    minsplifetime: number;
    maxsplifetime: number;
    resettable_per_pc?: boolean;
    imageid?: number | null;
  }>;

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
    const user = await getUserByKey(userkey.trim());
    const isAdmin = user ? (user.isadmin || user.ismasteradmin) : false;

    const updated = await dungonService.updateDungonMetadata(
      id,
      userkey.trim(),
      {
        ...(typeof name === 'string' && { name }),
        ...(typeof description === 'string' && { description }),
        ...(typeof intro === 'string' && { intro }),
        ...(typeof minsplifetime === 'number' && { minsplifetime }),
        ...(typeof maxsplifetime === 'number' && { maxsplifetime }),
        ...(typeof resettable_per_pc === 'boolean' && isAdmin && { resettable_per_pc }),
        ...('imageid' in req.body && { imageid: typeof imageid === 'number' ? imageid : null }),
      }
    );

    if (!updated) {
      return res.status(404).json({ result: -1, error: 'Dungon not found' });
    }

    return res.json({ result: 1, dungon: updated });
  } catch (error) {
    console.error('Error updating dungon metadata:', error);
    return res.status(500).json({ result: -1, error: 'Failed to update dungon metadata' });
  }
};

export const publishDungon = async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params['id'], 10);
  const { userkey, visibility, friendUserKeys } = req.body as Partial<{
    userkey: string;
    visibility: PublishVisibility;
    friendUserKeys: unknown[];
  }>;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ result: -1, error: 'Valid dungon id is required' });
  }

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  const normalizedVisibility: PublishVisibility =
    visibility === 'friends' || visibility === 'private' ? visibility : 'public';
  const normalizedFriendUserKeys = Array.isArray(friendUserKeys)
    ? Array.from(
        new Set(
          friendUserKeys
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter((item) => UUID_REGEX.test(item))
        )
      )
    : [];

  if (normalizedVisibility === 'friends' && normalizedFriendUserKeys.length === 0) {
    return res.status(400).json({ result: -1, error: 'Select at least one friend for friend visibility.' });
  }

  // Determine if the user is an admin (admins publish public directly; creators go to pending)
  let isAdminUser = false;
  try {
    const user = await getUserByKey(userkey.trim());
    isAdminUser = !!(user?.isadmin || user?.ismasteradmin);
  } catch {
    // Non-fatal — default to non-admin
  }

  try {
    const wasPublished = await dungonService.publishDungonForUserKey(
      id,
      userkey.trim(),
      {
        visibility: normalizedVisibility,
        friendUserKeys: normalizedFriendUserKeys,
        isAdminUser,
      }
    );

    if (!wasPublished) {
      return res.status(404).json({ result: -1, error: 'Dungon not found' });
    }

    // Non-admin requesting public → status becomes 'pending'
    const resultStatus = (normalizedVisibility === 'public' && !isAdminUser) ? 'pending' : 'published';
    return res.json({ result: 1, status: resultStatus, visibility: normalizedVisibility });
  } catch (error) {
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

export const startGameFromPublishedDungon = async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params['id'], 10);
  const { userkey, pcId } = req.body as Partial<{
    userkey: string;
    pcId: number;
  }>;

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
  } catch (error) {
    console.error('Error starting game from published dungon:', error);
    return res.status(500).json({ result: -1, error: 'Failed to start game' });
  }
};

export const getGamesForUser = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];
  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  try {
    const games = await dungonService.fetchGamesForUser(userkey.trim());
    return res.json(games);
  } catch (error) {
    console.error('Error fetching games for user:', error);
    return res.status(500).json({ error: 'Failed to fetch games' });
  }
};

export const getGameById = async (req: Request, res: Response) => {
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

    let pcTreshers: object[] = [];
    let pcTresherItems: object[] = [];
    let pcTresherPotions: object[] = [];
    let pcTresherSpells: object[] = [];
    let pcTresherCurses: CurseSessionPayload[] = [];
    const sessionCurseIds = new Set<number>();
    let pcCurrentHP: number | null = null;
    let pcMaxHP: number | null = null;
    let pcSp: number | null = null;
    let pcSpLifetime: number | null = null;
    let pcAgility: number = 3;
    let pcMind: number = 0;
    let pcStamina: number = 0;
    let pcAc: number = 10;
    let pcStrength: number = 0;
    let pcMagicPower: number = 0;
    let pcNumberOfAttacks: number = 1;
    let pcNumberOfDefends: number = 1;
    let pcType: string | null = null;
    let pcSpecies: string | null = null;
    let pcName: string | null = null;
    let pcImagePath: string | null = null;
    const currentPcId: number | null = game.pcid ?? null;
    if (game.pcid !== null && game.pcid > 0) {
      const pc = await pcService.fetchPcByIdForUser(game.pcid, userkey.trim());
      if (pc) {
        pcCurrentHP = pc.currentHP;
        pcMaxHP = pc.maxHP;
        pcSp = pc.sp;
        pcSpLifetime = pc.spLifetime ?? null;
        pcAgility = pc.agility ?? 3;
        pcMind = pc.mind;
        pcStamina = pc.stamina ?? 0;
        pcAc = pc.ac ?? 10;
        pcStrength = pc.strength ?? 0;
        pcMagicPower = pc.magicPower ?? 0;
        pcNumberOfAttacks = pc.numberOfAttacks ?? 1;
        pcNumberOfDefends = pc.numberOfDefends ?? 1;
        pcType = pc.type ?? null;
        pcSpecies = pc.species ?? null;
        pcName = pc.name ?? null;
        if (typeof pc.imageId === 'number' && pc.imageId > 0) {
          const canAccessPcImage = await imageService.checkImageAccessibleByIdForUser(pc.imageId, userkey.trim());
          if (canAccessPcImage) {
            const pcImages = await imageService.fetchImagesByIds([pc.imageId]);
            const pcImage = pcImages.find((img) => img.id === pc.imageId && typeof img.path === 'string' && img.path.trim().length > 0);
            pcImagePath = pcImage?.path ?? null;
          }
        }

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
        ].filter((id): id is number => typeof id === 'number' && id > 0)));

        if (allPcTresherIds.length > 0) {
          const treshers = await tresherService.fetchTreshersByIds(allPcTresherIds);
          for (const t of treshers) {
            if (typeof t.curse1Id === 'number' && t.curse1Id > 0) sessionCurseIds.add(t.curse1Id);
            if (typeof t.curse2Id === 'number' && t.curse2Id > 0) sessionCurseIds.add(t.curse2Id);
          }
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

          const allItemIds = Array.from(new Set(
            treshers.flatMap((t) => [t.item1Id, t.item2Id, t.item3Id, t.item4Id]
              .filter((id): id is number => typeof id === 'number' && id > 0))
          ));
          if (allItemIds.length > 0) {
            const items = await itemService.fetchItemsByIds(allItemIds);
            pcTresherItems = items.map((it) => ({
              id: it.id,
              name: it.name,
              description: it.description,
              type: it.type,
              soundId: it.soundId ?? null,
              effectValue: it.effectValue,
              damage: it.damage ?? 0,
              range: Math.max(1, parseInt(String(it.range), 10) || 1),
              armorSlot: it.armorSlot ?? null,
              effectOn: it.effectOn ?? null,
              effectToPc: it.effectToPc ?? null,
              effectToPcValue: it.effectToPcValue ?? 0,
              uses: it.uses ?? null,
            }));
          }

          const allPotionIds = Array.from(new Set(
            treshers.flatMap((t) => [t.potion1Id, t.potion2Id, t.potion3Id]
              .filter((id): id is number => typeof id === 'number' && id > 0))
          ));
          if (allPotionIds.length > 0) {
            const potions = await potionService.fetchPotionsByIds(allPotionIds);
            pcTresherPotions = potions.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              effectTo: p.effectTo,
              effectTo2: p.effectTo2,
              effectAmount: p.effectAmount,
              effectAmount2: p.effectAmount2,
              effectAmountMin: p.effectAmountMin,
              effectAmountDiceCount: p.effectAmountDiceCount,
              effectAmountDiceSides: p.effectAmountDiceSides,
              effectAmount2Min: p.effectAmount2Min,
              effectAmount2DiceCount: p.effectAmount2DiceCount,
              effectAmount2DiceSides: p.effectAmount2DiceSides,
              lastFor: p.lastFor,
            }));
          }

          const allSpellIds = Array.from(new Set(
            treshers.flatMap((t) => [t.spell1Id, t.spell2Id, t.spell3Id, t.spell4Id]
              .filter((id): id is number => typeof id === 'number' && id > 0))
          ));
          if (allSpellIds.length > 0) {
            const spells = await spellService.fetchSpellsByIdsForGame(allSpellIds);
            pcTresherSpells = spells.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              soundId: s.soundId,
              range: s.range,
              effectOn: s.effectOn,
              effectOn2: s.effectOn2,
              effectAmount: s.effectAmount,
              effectAmount2: s.effectAmount2,
              effectDiceCount: s.effectDiceCount,
              effectDiceSides: s.effectDiceSides,
              effectAmount2DiceCount: s.effectAmount2DiceCount,
              effectAmount2DiceSides: s.effectAmount2DiceSides,
              successTestValue: s.successTestValue,
              sp: s.sp,
              minLtsp: s.minLtsp,
              learnCostGp: s.learnCostGp,
              lastFor: s.lastFor,
              numberOfTargets: s.numberOfTargets,
              magicCost: s.magicCost,
              effectType: s.effectType,
              effectColor: s.effectColor,
              effectOnPc1: s.effectOnPc1,
              effectOnPc2: s.effectOnPc2,
              range1: s.range1,
              range2: s.range2,
              lastFor1: s.lastFor1,
              lastFor2: s.lastFor2,
            }));
          }
        }
      }
    }

    const [dungonSpReward, dungonStatus, dungonCoverImageId] = await Promise.all([
      dungonService.fetchDungonSpReward(game.dungonid),
      dungonService.fetchDungonIsMainGameStatus(game.dungonid),
      dungonService.fetchDungonImageId(game.dungonid),
    ]);

    // Also include items from dungeon treshers so players can equip them after pickup
    try {
      const dungonJsonObj = typeof game.dungenJson === 'string'
        ? JSON.parse(game.dungenJson as string)
        : game.dungenJson;
      for (const curseId of collectCurseIdsFromDungeonJson(dungonJsonObj)) {
        sessionCurseIds.add(curseId);
      }
      const existingSpellIds = new Set(pcTresherSpells.map((s) => (s as { id: number }).id));
      const monsterSpellIds = Array.from(collectMonsterSpellIdsFromDungeonJson(dungonJsonObj))
        .filter((spellId) => !existingSpellIds.has(spellId));
      if (monsterSpellIds.length > 0) {
        const monsterSpells = await spellService.fetchSpellsByIdsForGame(monsterSpellIds);
        pcTresherSpells = [...pcTresherSpells, ...monsterSpells.map(mapSpellRecordForSession)];
      }
      const rawTresherList: unknown[] = Array.isArray((dungonJsonObj as Record<string, unknown>)?.['tresherList'])
        ? (dungonJsonObj as Record<string, unknown[]>)['tresherList']
        : Array.isArray((dungonJsonObj as Record<string, unknown>)?.['trasherList'])
          ? (dungonJsonObj as Record<string, unknown[]>)['trasherList']
          : Array.isArray((dungonJsonObj as Record<string, unknown>)?.['tresher'])
            ? (dungonJsonObj as Record<string, unknown[]>)['tresher']
            : [];
      const existingItemIds = new Set(pcTresherItems.map((it) => (it as { id: number }).id));
      const dungonItemIds = Array.from(new Set(
        rawTresherList.flatMap((t) => {
          const obj = t as Record<string, unknown>;
          return [obj['item1Id'], obj['item2Id'], obj['item3Id'], obj['item4Id']];
        }).filter((id): id is number => typeof id === 'number' && id > 0 && !existingItemIds.has(id))
      ));
      if (dungonItemIds.length > 0) {
        const dungonItems = await itemService.fetchItemsByIds(dungonItemIds);
        pcTresherItems = [
          ...pcTresherItems,
          ...dungonItems.map((it) => ({
            id: it.id,
            name: it.name,
            description: it.description,
            type: it.type,
            soundId: it.soundId ?? null,
            effectValue: it.effectValue,
            damage: it.damage ?? 0,
            range: Math.max(1, parseInt(String(it.range), 10) || 1),
            armorSlot: it.armorSlot ?? null,
            effectOn: it.effectOn ?? null,
            effectToPc: it.effectToPc ?? null,
            effectToPcValue: it.effectToPcValue ?? 0,
          })),
        ];
      }
    } catch {
      // non-fatal — proceed without dungeon tresher items
    }

    // Bundle dungeon asset paths (monster images, obstacle images, loot images, sound paths, cover image)
    let monsterImages: { id: number; path: string }[] = [];
    let obstacleImages: { id: number; path: string }[] = [];
    let lootImages: { id: number; path: string }[] = [];
    let soundPaths: { id: number; path: string; clientPath?: string }[] = [];
    let dungonCoverImagePath: string | null = null;
    try {
      const dungonJsonObj = typeof game.dungenJson === 'string'
        ? JSON.parse(game.dungenJson as string)
        : game.dungenJson;

      const monsterList: unknown[] = Array.isArray((dungonJsonObj as Record<string, unknown>)?.monsterList)
        ? (dungonJsonObj as Record<string, unknown[]>).monsterList
        : Array.isArray((dungonJsonObj as Record<string, unknown>)?.monsters)
          ? (dungonJsonObj as Record<string, unknown[]>).monsters
          : [];

      const obstaclePlacements: unknown[] = Array.isArray((dungonJsonObj as Record<string, unknown>)?.obstaclePlacements)
        ? (dungonJsonObj as Record<string, unknown[]>).obstaclePlacements
        : [];

      const tresherList: unknown[] = Array.isArray((dungonJsonObj as Record<string, unknown>)?.tresherList)
        ? (dungonJsonObj as Record<string, unknown[]>).tresherList
        : Array.isArray((dungonJsonObj as Record<string, unknown>)?.trasherList)
          ? (dungonJsonObj as Record<string, unknown[]>).trasherList
          : Array.isArray((dungonJsonObj as Record<string, unknown>)?.tresher)
            ? (dungonJsonObj as Record<string, unknown[]>).tresher
            : [];

      const monsterImageIds: number[] = Array.from(new Set(
        monsterList.map((m) => (m as Record<string, unknown>)?.imageId)
          .filter((id): id is number => typeof id === 'number' && id > 0)
      ));
      const obstacleImageIds: number[] = Array.from(new Set([
        ...obstaclePlacements.map((o) => (o as Record<string, unknown>)?.imageId)
          .filter((id): id is number => typeof id === 'number' && id > 0),
        ...obstaclePlacements.map((o) => (o as Record<string, unknown>)?.textImageId)
          .filter((id): id is number => typeof id === 'number' && id > 0),
      ]));
      const lootImageIds: number[] = Array.from(new Set(
        tresherList.map((t) => (t as Record<string, unknown>)?.imageId)
          .filter((id): id is number => typeof id === 'number' && id > 0)
      ));
      const soundIds: number[] = Array.from(new Set([
        ...pcTresherSpells.map((s) => (s as Record<string, unknown>)?.soundId)
          .filter((id): id is number => typeof id === 'number' && id > 0),
        ...pcTresherItems.map((it) => (it as Record<string, unknown>)?.soundId)
          .filter((id): id is number => typeof id === 'number' && id > 0),
        ...monsterList.map((m) => (m as Record<string, unknown>)?.soundId)
          .filter((id): id is number => typeof id === 'number' && id > 0),
      ]));

      const allImageIds = Array.from(new Set([...monsterImageIds, ...obstacleImageIds, ...lootImageIds]));
      if (allImageIds.length > 0) {
        const images = await imageService.fetchImagesByIds(allImageIds);
        const pathMap = new Map(images
          .filter((img) => typeof img.path === 'string' && img.path.trim())
          .map((img) => [img.id, img.path]));
        monsterImages = monsterImageIds.filter((id) => pathMap.has(id)).map((id) => ({ id, path: pathMap.get(id)! }));
        obstacleImages = obstacleImageIds.filter((id) => pathMap.has(id)).map((id) => ({ id, path: pathMap.get(id)! }));
        lootImages = lootImageIds.filter((id) => pathMap.has(id)).map((id) => ({ id, path: pathMap.get(id)! }));
      }

      if (soundIds.length > 0) {
        const sounds = await soundService.fetchSoundsByIds(soundIds);
        soundPaths = sounds
          .filter((s) => typeof s.path === 'string' && s.path.trim())
          .map((s) => ({ id: s.id, path: s.path }));
      }

      if (typeof dungonCoverImageId === 'number' && dungonCoverImageId > 0) {
        const coverImages = await imageService.fetchImagesByIds([dungonCoverImageId]);
        const coverImg = coverImages.find((img) => typeof img.path === 'string' && img.path.trim());
        dungonCoverImagePath = coverImg?.path ?? null;
      }
    } catch {
      // non-fatal — proceed without pre-bundled assets
    }

    try {
      pcTresherCurses = await resolveSessionCurses(sessionCurseIds);
    } catch {
      pcTresherCurses = [];
    }

    return res.json({ ...game, pcTreshers, pcTresherItems, pcTresherPotions, pcTresherSpells, pcTresherCurses, pcCurrentHP, pcMaxHP, pcSp, pcSpLifetime, pcAgility, pcMind, pcStamina, pcAc, pcStrength, pcMagicPower, pcNumberOfAttacks, pcNumberOfDefends, pcType, pcSpecies, pcName, pcImagePath, currentPcId, dungonSpReward, isMainGame: dungonStatus?.ismaingame ?? false, resettablePerPc: dungonStatus?.resettable_per_pc ?? false, monsterImages, obstacleImages, lootImages, soundPaths, dungonCoverImagePath });
  } catch (error) {
    console.error('Error fetching game by id:', error);
    return res.status(500).json({ error: 'Failed to fetch game' });
  }
};

export const saveGame = async (req: Request, res: Response) => {
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
  } catch (error) {
    console.error('Error saving game:', error);
    return res.status(500).json({ error: 'Failed to save game' });
  }
};

export const deleteDungon = async (req: Request, res: Response) => {
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
  } catch (error) {
    console.error('Error deleting dungon:', error);
    return res.status(500).json({ result: -1, error: 'Failed to delete dungeon' });
  }
};

export const deleteGame = async (req: Request, res: Response) => {
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
  } catch (error) {
    console.error('Error deleting game:', error);
    return res.status(500).json({ result: -1, error: 'Failed to delete game' });
  }
};

export const approveDungon = async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params['id'], 10);
  const { userkey } = req.body as Partial<{ userkey: string }>;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ result: -1, error: 'Valid dungon id is required' });
  }

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  const trimmedKey = userkey.trim();
  const user = await getUserByKey(trimmedKey);
  if (!user || (!user.isadmin && !user.ismasteradmin)) {
    return res.status(403).json({ result: -1, error: 'Only admins can approve dungons' });
  }

  try {
    const wasApproved = await dungonService.approvePendingDungon(id, trimmedKey);
    if (!wasApproved) {
      return res.status(404).json({ result: -1, error: 'Pending dungon not found' });
    }

    return res.json({ result: 1, status: 'published' });
  } catch (error) {
    console.error('Error approving dungon:', error);
    return res.status(500).json({ result: -1, error: 'Failed to approve dungon' });
  }
};

export const getSampleDungon = async (req: Request, res: Response) => {
  try {
    const dungon = await dungonService.fetchSampleDungon();
    if (!dungon) {
      return res.status(404).json({ error: 'No sample dungon configured' });
    }
    return res.json(dungon);
  } catch (error) {
    console.error('Error fetching sample dungon:', error);
    return res.status(500).json({ error: 'Failed to fetch sample dungon' });
  }
};

export const getSampleDungons = async (_req: Request, res: Response) => {
  try {
    const dungons = await dungonService.fetchSampleDungons();
    return res.json(dungons);
  } catch (error) {
    console.error('Error fetching sample dungons:', error);
    return res.status(500).json({ error: 'Failed to fetch sample dungons' });
  }
};

export const setSampleDungon = async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params['id'], 10);
  const { userkey } = req.body as Partial<{ userkey: string }>;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ result: -1, error: 'Valid dungon id is required' });
  }

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  const trimmedKey = userkey.trim();
  const user = await getUserByKey(trimmedKey);
  if (!user || (!user.isadmin && !user.ismasteradmin)) {
    return res.status(403).json({ result: -1, error: 'Only admins can set the sample dungon' });
  }

  try {
    const wasSet = await dungonService.setSampleGame(id);
    if (!wasSet) {
      return res.status(404).json({ result: -1, error: 'Published dungon not found' });
    }
    return res.json({ result: 1 });
  } catch (error) {
    console.error('Error setting sample dungon:', error);
    return res.status(500).json({ result: -1, error: 'Failed to set sample dungon' });
  }
};

export const getAdminPublishedDungons = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  const trimmedKey = userkey.trim();
  const user = await getUserByKey(trimmedKey);
  if (!user || (!user.isadmin && !user.ismasteradmin)) {
    return res.status(403).json({ error: 'Only admins can access this endpoint' });
  }

  try {
    const dungons = await dungonService.fetchAllPublishedDungonsForAdmin();
    return res.json(dungons);
  } catch (error) {
    console.error('Error fetching published dungons for admin:', error);
    return res.status(500).json({ error: 'Failed to fetch published dungons' });
  }
};

export const getSampleGameSession = async (req: Request, res: Response) => {
  const pcIdRaw = req.query['pcId'];
  const pcId = typeof pcIdRaw === 'string' ? Number.parseInt(pcIdRaw, 10) : NaN;
  const dungonIdRaw = req.query['dungonId'];
  const dungonId = typeof dungonIdRaw === 'string' ? Number.parseInt(dungonIdRaw, 10) : NaN;
  const requestedDungonId = Number.isInteger(dungonId) && dungonId > 0 ? dungonId : undefined;

  if (!Number.isInteger(pcId) || pcId <= 0) {
    return res.status(400).json({ error: 'Valid pcId query parameter is required' });
  }

  try {
    const [dungon, pc] = await Promise.all([
      dungonService.fetchSampleDungonFull(requestedDungonId),
      pcService.fetchSamplePcById(pcId),
    ]);

    if (!dungon) {
      return res.status(404).json({ error: 'No sample dungon configured' });
    }

    if (!pc) {
      return res.status(404).json({ error: 'Sample PC not found' });
    }

    let pcTreshers: object[] = [];
    let pcTresherItems: object[] = [];
    let pcTresherPotions: object[] = [];
    let pcTresherSpells: object[] = [];
    let pcTresherCurses: CurseSessionPayload[] = [];
    const sessionCurseIds = new Set<number>();
    let pcImagePath: string | null = null;
    let lootImages: { id: number; path: string }[] = [];
    let soundPaths: { id: number; path: string }[] = [];

    try {
      if (typeof pc.imageId === 'number' && pc.imageId > 0) {
        const pcImages = await imageService.fetchImagesByIds([pc.imageId]);
        const pcImage = pcImages.find((img) => img.id === pc.imageId && typeof img.path === 'string' && img.path.trim().length > 0);
        pcImagePath = pcImage?.path ?? null;
      }

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
      ].filter((id): id is number => typeof id === 'number' && id > 0)));

      if (allPcTresherIds.length > 0) {
        const treshers = await tresherService.fetchTreshersByIds(allPcTresherIds);
        for (const t of treshers) {
          if (typeof t.curse1Id === 'number' && t.curse1Id > 0) sessionCurseIds.add(t.curse1Id);
          if (typeof t.curse2Id === 'number' && t.curse2Id > 0) sessionCurseIds.add(t.curse2Id);
        }
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

        const allItemIds = Array.from(new Set(
          treshers.flatMap((t) => [t.item1Id, t.item2Id, t.item3Id, t.item4Id]
            .filter((id): id is number => typeof id === 'number' && id > 0))
        ));
        if (allItemIds.length > 0) {
          const items = await itemService.fetchItemsByIds(allItemIds);
          pcTresherItems = items.map((it) => ({
            id: it.id,
            name: it.name,
            description: it.description,
            type: it.type,
            imageId: it.imageId,
            soundId: it.soundId ?? null,
            effectValue: it.effectValue,
            damage: it.damage ?? 0,
            range: Math.max(1, parseInt(String(it.range), 10) || 1),
            armorSlot: it.armorSlot ?? null,
            effectOn: it.effectOn ?? null,
            effectToPc: it.effectToPc ?? null,
            effectToPcValue: it.effectToPcValue ?? 0,
            uses: it.uses ?? null,
          }));
        }

        const allPotionIds = Array.from(new Set(
          treshers.flatMap((t) => [t.potion1Id, t.potion2Id, t.potion3Id]
            .filter((id): id is number => typeof id === 'number' && id > 0))
        ));
        if (allPotionIds.length > 0) {
          const potions = await potionService.fetchPotionsByIds(allPotionIds);
          pcTresherPotions = potions.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            effectTo: p.effectTo,
            effectTo2: p.effectTo2,
            effectAmount: p.effectAmount,
            effectAmount2: p.effectAmount2,
            effectAmountMin: p.effectAmountMin,
            effectAmountDiceCount: p.effectAmountDiceCount,
            effectAmountDiceSides: p.effectAmountDiceSides,
            effectAmount2Min: p.effectAmount2Min,
            effectAmount2DiceCount: p.effectAmount2DiceCount,
            effectAmount2DiceSides: p.effectAmount2DiceSides,
            lastFor: p.lastFor,
          }));
        }

        const allSpellIds = Array.from(new Set(
          treshers.flatMap((t) => [t.spell1Id, t.spell2Id, t.spell3Id, t.spell4Id]
            .filter((id): id is number => typeof id === 'number' && id > 0))
        ));
        if (allSpellIds.length > 0) {
          const spells = await spellService.fetchSpellsByIdsForGame(allSpellIds);
          pcTresherSpells = spells.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            soundId: s.soundId,
            range: s.range,
            effectOn: s.effectOn,
            effectOn2: s.effectOn2,
            effectAmount: s.effectAmount,
            effectAmount2: s.effectAmount2,
            effectDiceCount: s.effectDiceCount,
            effectDiceSides: s.effectDiceSides,
            effectAmount2DiceCount: s.effectAmount2DiceCount,
            effectAmount2DiceSides: s.effectAmount2DiceSides,
            successTestValue: s.successTestValue,
            sp: s.sp,
            minLtsp: s.minLtsp,
            learnCostGp: s.learnCostGp,
            lastFor: s.lastFor,
            numberOfTargets: s.numberOfTargets,
            magicCost: s.magicCost,
            effectType: s.effectType,
            effectColor: s.effectColor,
            effectOnPc1: s.effectOnPc1,
            effectOnPc2: s.effectOnPc2,
            range1: s.range1,
            range2: s.range2,
            lastFor1: s.lastFor1,
            lastFor2: s.lastFor2,
          }));
        }
      }
    } catch (error) {
      console.error('Error resolving sample PC assets:', error);
      pcImagePath = null;
      pcTreshers = [];
      pcTresherItems = [];
      pcTresherPotions = [];
      pcTresherSpells = [];
    }

    // Resolve dungeon cover image path
    let dungonCoverImagePath: string | null = null;
    try {
      if (typeof dungon.imageid === 'number' && dungon.imageid > 0) {
        const coverImages = await imageService.fetchImagesByIds([dungon.imageid]);
        const coverImg = coverImages.find((img) => typeof img.path === 'string' && img.path.trim());
        dungonCoverImagePath = coverImg?.path ?? null;
      }
    } catch {
      // non-fatal
    }

    // Extract monster image IDs from dungeon JSON and fetch their paths
    let monsterImages: { id: number; path: string }[] = [];
    let obstacleImages: { id: number; path: string }[] = [];
    try {
      const dungonJsonObj = typeof dungon.dungenJson === 'string'
        ? JSON.parse(dungon.dungenJson)
        : dungon.dungenJson;
      const monsterList = Array.isArray(dungonJsonObj?.monsterList)
        ? dungonJsonObj.monsterList
        : Array.isArray(dungonJsonObj?.monsters)
          ? dungonJsonObj.monsters
          : [];
      const monsterImageIds: number[] = Array.from(new Set(
        monsterList
          .map((m: unknown) => (m as Record<string, unknown>)?.imageId)
          .filter((id: unknown): id is number => typeof id === 'number' && id > 0)
      ));

      const obstaclePlacements: unknown[] = Array.isArray(dungonJsonObj?.obstaclePlacements)
        ? dungonJsonObj.obstaclePlacements
        : [];
      const obstacleImageIds: number[] = Array.from(new Set([
        ...obstaclePlacements
          .map((o: unknown) => (o as Record<string, unknown>)?.imageId)
          .filter((id: unknown): id is number => typeof id === 'number' && id > 0),
        ...obstaclePlacements
          .map((o: unknown) => (o as Record<string, unknown>)?.textImageId)
          .filter((id: unknown): id is number => typeof id === 'number' && id > 0),
      ]));

      const allImageIds = Array.from(new Set([...monsterImageIds, ...obstacleImageIds]));
      if (allImageIds.length > 0) {
        const images = await imageService.fetchImagesByIds(allImageIds);
        const pathMap = new Map(images
          .filter((img) => typeof img.path === 'string' && img.path.trim())
          .map((img) => [img.id, img.path]));
        monsterImages = monsterImageIds
          .filter((id) => pathMap.has(id))
          .map((id) => ({ id, path: pathMap.get(id)! }));
        obstacleImages = obstacleImageIds
          .filter((id) => pathMap.has(id))
          .map((id) => ({ id, path: pathMap.get(id)! }));
      }
    } catch {
      // non-fatal — just proceed without images
    }

    // Also include items from dungeon treshers so players can equip them after pickup
    try {
      const dungonJsonObj = typeof dungon.dungenJson === 'string'
        ? JSON.parse(dungon.dungenJson as string)
        : dungon.dungenJson;
      for (const curseId of collectCurseIdsFromDungeonJson(dungonJsonObj)) {
        sessionCurseIds.add(curseId);
      }
      const existingSpellIds = new Set(pcTresherSpells.map((s) => (s as { id: number }).id));
      const monsterSpellIds = Array.from(collectMonsterSpellIdsFromDungeonJson(dungonJsonObj))
        .filter((spellId) => !existingSpellIds.has(spellId));
      if (monsterSpellIds.length > 0) {
        const monsterSpells = await spellService.fetchSpellsByIdsForGame(monsterSpellIds);
        pcTresherSpells = [...pcTresherSpells, ...monsterSpells.map(mapSpellRecordForSession)];
      }
      const rawTresherList: unknown[] = Array.isArray((dungonJsonObj as Record<string, unknown>)?.['tresherList'])
        ? (dungonJsonObj as Record<string, unknown[]>)['tresherList']
        : Array.isArray((dungonJsonObj as Record<string, unknown>)?.['trasherList'])
          ? (dungonJsonObj as Record<string, unknown[]>)['trasherList']
          : Array.isArray((dungonJsonObj as Record<string, unknown>)?.['tresher'])
            ? (dungonJsonObj as Record<string, unknown[]>)['tresher']
            : [];
      const existingItemIds = new Set(pcTresherItems.map((it) => (it as { id: number }).id));
      const dungonItemIds = Array.from(new Set(
        rawTresherList.flatMap((t) => {
          const obj = t as Record<string, unknown>;
          return [obj['item1Id'], obj['item2Id'], obj['item3Id'], obj['item4Id']];
        }).filter((id): id is number => typeof id === 'number' && id > 0 && !existingItemIds.has(id))
      ));
      if (dungonItemIds.length > 0) {
        const dungonItems = await itemService.fetchItemsByIds(dungonItemIds);
        pcTresherItems = [
          ...pcTresherItems,
          ...dungonItems.map((it) => ({
            id: it.id,
            name: it.name,
            description: it.description,
            type: it.type,
            imageId: it.imageId,
            soundId: it.soundId ?? null,
            effectValue: it.effectValue,
            damage: it.damage ?? 0,
            range: Math.max(1, parseInt(String(it.range), 10) || 1),
            armorSlot: it.armorSlot ?? null,
            effectOn: it.effectOn ?? null,
            effectToPc: it.effectToPc ?? null,
            effectToPcValue: it.effectToPcValue ?? 0,
          })),
        ];
      }
    } catch {
      // non-fatal — proceed without dungeon tresher items
    }

    // Build a best-effort list of sample asset paths (images/sounds), including private IDs,
    // so sample mode can render/play assigned assets without user auth.
    try {
      const dungonJsonObj = typeof dungon.dungenJson === 'string'
        ? JSON.parse(dungon.dungenJson)
        : dungon.dungenJson;
      const asRecord = (value: unknown): Record<string, unknown> =>
        typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
      const collectNumericIds = (values: unknown[]): number[] =>
        values
          .map((value) => (typeof value === 'number' ? value : null))
          .filter((value): value is number => value !== null && Number.isInteger(value) && value > 0);

      const rawTresherList = Array.isArray(asRecord(dungonJsonObj)['tresherList'])
        ? (asRecord(dungonJsonObj)['tresherList'] as unknown[])
        : Array.isArray(asRecord(dungonJsonObj)['trasherList'])
          ? (asRecord(dungonJsonObj)['trasherList'] as unknown[])
          : Array.isArray(asRecord(dungonJsonObj)['tresher'])
            ? (asRecord(dungonJsonObj)['tresher'] as unknown[])
            : [];
      const rawItemList = Array.isArray(asRecord(dungonJsonObj)['itemList'])
        ? (asRecord(dungonJsonObj)['itemList'] as unknown[])
        : Array.isArray(asRecord(dungonJsonObj)['items'])
          ? (asRecord(dungonJsonObj)['items'] as unknown[])
          : [];
      const rawSpellList = Array.isArray(asRecord(dungonJsonObj)['spellList'])
        ? (asRecord(dungonJsonObj)['spellList'] as unknown[])
        : Array.isArray(asRecord(dungonJsonObj)['spells'])
          ? (asRecord(dungonJsonObj)['spells'] as unknown[])
          : [];

      const lootImageIds = new Set<number>();
      for (const t of pcTreshers) {
        const id = asRecord(t)['imageId'];
        if (typeof id === 'number' && id > 0) lootImageIds.add(id);
      }
      for (const it of pcTresherItems) {
        const id = asRecord(it)['imageId'];
        if (typeof id === 'number' && id > 0) lootImageIds.add(id);
      }
      for (const raw of rawTresherList) {
        const row = asRecord(raw);
        const ids = collectNumericIds([row['imageId'], row['imageid']]);
        for (const id of ids) lootImageIds.add(id);
      }
      for (const raw of rawItemList) {
        const row = asRecord(raw);
        const ids = collectNumericIds([row['imageId'], row['imageid']]);
        for (const id of ids) lootImageIds.add(id);
      }

      if (lootImageIds.size > 0) {
        const images = await imageService.fetchImagesByIds(Array.from(lootImageIds));
        lootImages = images
          .filter((img) => typeof img.path === 'string' && img.path.trim().length > 0)
          .map((img) => ({ id: img.id, path: img.path }));
      }

      const spellSoundIds = new Set<number>();
      for (const spell of pcTresherSpells) {
        const soundId = asRecord(spell)['soundId'];
        if (typeof soundId === 'number' && soundId > 0) {
          spellSoundIds.add(soundId);
        }
      }
      for (const item of pcTresherItems) {
        const soundId = asRecord(item)['soundId'];
        if (typeof soundId === 'number' && soundId > 0) {
          spellSoundIds.add(soundId);
        }
      }
      for (const raw of rawSpellList) {
        const row = asRecord(raw);
        const ids = collectNumericIds([row['soundId'], row['soundid']]);
        for (const id of ids) spellSoundIds.add(id);
      }

      if (spellSoundIds.size > 0) {
        const sounds = await soundService.fetchSoundsByIds(Array.from(spellSoundIds));
        const pathById = new Map<number, string>();
        soundPaths = sounds
          .filter((sound) => typeof sound.path === 'string' && sound.path.trim().length > 0)
          .map((sound) => {
            const path = sound.path.trim();
            pathById.set(sound.id, path);
            return { id: sound.id, path };
          });

        pcTresherSpells = pcTresherSpells.map((spell) => {
          const row = asRecord(spell);
          const soundId = row['soundId'];
          if (typeof soundId !== 'number' || !pathById.has(soundId)) {
            return spell;
          }
          return { ...row, soundPath: pathById.get(soundId) ?? null };
        });
      }
    } catch {
      // non-fatal — proceed without pre-resolved sample assets
    }

    try {
      pcTresherCurses = await resolveSessionCurses(sessionCurseIds);
    } catch {
      pcTresherCurses = [];
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
      pcTresherCurses,
      pcCurrentHP: pc.maxHP,
      pcMaxHP: pc.maxHP,
      pcSp: 0,
      pcSpLifetime: 0,
      pcAgility: pc.agility ?? 3,
      pcMind: pc.mind,
      pcStamina: pc.stamina,
      pcAc: pc.ac ?? 10,
      pcStrength: pc.strength,
      pcMagicPower: pc.magicPower,
      pcNumberOfAttacks: 1,
      pcNumberOfDefends: 1,
      pcType: pc.type ?? null,
      pcSpecies: pc.species ?? null,
      pcName: pc.name ?? null,
      pcImagePath,
      currentPcId: null,
      dungonSpReward: dungon.spreward,
      monsterImages,
      obstacleImages,
      lootImages,
      soundPaths,
      dungonCoverImagePath,
    });
  } catch (error) {
    console.error('Error building sample game session:', error);
    return res.status(500).json({ error: 'Failed to build sample game session' });
  }
};

export const generateDungonContent = async (req: Request, res: Response) => {
  const dungonId = Number.parseInt(req.params['id'], 10);
  if (!Number.isInteger(dungonId) || dungonId <= 0) {
    return res.status(400).json({ error: 'Valid dungon id is required' });
  }

  const { userkey, story, inhabitants, treasureStyle, obstacleStyle, level, name, anchorRow, anchorColumn, monsterRequests, itemRequests } = req.body as Partial<{
    userkey: string;
    story: string;
    inhabitants: string;
    treasureStyle: string;
    obstacleStyle: string;
    level: number;
    name: string;
    anchorRow: number;
    anchorColumn: number;
    monsterRequests: Array<{ monsterDbId: number; count: number }>;
    itemRequests: Array<{ itemDbId: number; count: number }>;
  }>;

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey is required' });
  }
  if (typeof story !== 'string' || story.trim().length < 1) {
    return res.status(400).json({ error: 'story is required' });
  }
  if (typeof inhabitants !== 'string' || inhabitants.trim().length < 1) {
    return res.status(400).json({ error: 'inhabitants is required' });
  }
  if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2)) {
    return res.status(400).json({ error: 'name must be at least 2 characters when provided' });
  }
  const levelNum = typeof level === 'number' ? level : Number.parseInt(String(level), 10);
  if (!Number.isFinite(levelNum) || levelNum < 0) {
    return res.status(400).json({ error: 'level must be a non-negative number' });
  }

  const normalizedMonsterRequests = Array.isArray(monsterRequests)
    ? monsterRequests
      .map((request) => ({
        monsterDbId: Number(request?.monsterDbId),
        count: Number(request?.count),
      }))
      .filter((request) => Number.isInteger(request.monsterDbId) && request.monsterDbId > 0 && Number.isInteger(request.count) && request.count > 0)
    : [];

  const normalizedItemRequests = Array.isArray(itemRequests)
    ? itemRequests
      .map((request) => ({
        itemDbId: Number(request?.itemDbId),
        count: Number(request?.count),
      }))
      .filter((request) => Number.isInteger(request.itemDbId) && request.itemDbId > 0 && Number.isInteger(request.count) && request.count > 0)
    : [];

  if (normalizedMonsterRequests.length === 0 && normalizedItemRequests.length === 0) {
    return res.status(400).json({ error: 'Add at least one monster or item request' });
  }

  const hasAnchorRow = anchorRow !== undefined && anchorRow !== null;
  const hasAnchorColumn = anchorColumn !== undefined && anchorColumn !== null;
  if (hasAnchorRow !== hasAnchorColumn) {
    return res.status(400).json({ error: 'anchorRow and anchorColumn must be provided together' });
  }

  const parsedAnchorRow = hasAnchorRow ? Number(anchorRow) : null;
  const parsedAnchorColumn = hasAnchorColumn ? Number(anchorColumn) : null;
  if (
    parsedAnchorRow !== null &&
    (!Number.isInteger(parsedAnchorRow) || parsedAnchorRow < 0 || !Number.isInteger(parsedAnchorColumn) || (parsedAnchorColumn ?? -1) < 0)
  ) {
    return res.status(400).json({ error: 'anchorRow and anchorColumn must be non-negative integers' });
  }

  // Verify ownership
  const dungon = await dungonService.fetchDungonByIdForUser(dungonId, userkey.trim()).catch(() => null);
  if (!dungon) {
    return res.status(404).json({ error: 'Dungon not found or you do not own it' });
  }

  const params: GenerateDungonParams = {
    name: (typeof name === 'string' && name.trim().length > 0 ? name.trim() : dungon.name) ?? 'Unnamed Dungeon',
    story: story.trim(),
    level: levelNum,
    inhabitants: inhabitants.trim(),
    treasureStyle: typeof treasureStyle === 'string' ? treasureStyle.trim() : '',
    obstacleStyle: typeof obstacleStyle === 'string' ? obstacleStyle.trim() : '',
    monsterRequests: normalizedMonsterRequests,
    itemRequests: normalizedItemRequests,
    anchorRow: parsedAnchorRow ?? undefined,
    anchorColumn: parsedAnchorColumn ?? undefined,
  };

  try {
    const dungonJson = await generateDungon(params, dungon.dungenJson);
    return res.json({ dungonJson });
  } catch (error) {
    console.error('Error generating dungon:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate dungon';
    return res.status(500).json({ error: message });
  }
};
