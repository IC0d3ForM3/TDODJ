import { Request, Response } from 'express';
import * as dungonService from '../services/dungonService';
import * as pcService from '../services/pcService';
import * as tresherService from '../services/tresherService';
import * as itemService from '../services/itemService';
import * as potionService from '../services/potionService';
import * as spellService from '../services/spellService';
import * as imageService from '../services/imageService';
import { getUserByKey } from '../repositories/userRepository';

type PublishVisibility = 'public' | 'friends' | 'private';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const wasUpdated = await dungonService.saveDungonJsonForUser(
      id,
      userkey.trim(),
      dungonJson
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
    let pcCurrentHP: number | null = null;
    let pcMaxHP: number | null = null;
    let pcSp: number | null = null;
    let pcMind: number = 0;
    let pcStamina: number = 0;
    let pcStrength: number = 0;
    let pcMagicPower: number = 0;
    let pcNumberOfAttacks: number = 1;
    let pcNumberOfDefends: number = 1;
    let pcType: string | null = null;
    let pcSpecies: string | null = null;
    let pcName: string | null = null;
    const currentPcId: number | null = game.pcid ?? null;
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
        ].filter((id): id is number => typeof id === 'number' && id > 0)));

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
              effectValue: it.effectValue,
              damage: it.damage ?? 0,
              range: Math.max(1, parseInt(String(it.range), 10) || 1),
              armorSlot: it.armorSlot ?? null,
              effectOn: it.effectOn ?? null,
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
              effectAmount: p.effectAmount,
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

    let pcTreshers: object[] = [];
    let pcTresherItems: object[] = [];
    let pcTresherPotions: object[] = [];
    let pcTresherSpells: object[] = [];

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
          effectValue: it.effectValue,
          damage: it.damage ?? 0,
          range: Math.max(1, parseInt(String(it.range), 10) || 1),
          armorSlot: it.armorSlot ?? null,
          effectOn: it.effectOn ?? null,
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
          effectAmount: p.effectAmount,
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
    let monsterImages: { id: number; path: string }[] = [];
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
      if (monsterImageIds.length > 0) {
        const images = await imageService.fetchImagesByIds(monsterImageIds);
        monsterImages = images
          .filter((img) => typeof img.path === 'string' && img.path.trim())
          .map((img) => ({ id: img.id, path: img.path }));
      }
    } catch {
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
  } catch (error) {
    console.error('Error building sample game session:', error);
    return res.status(500).json({ error: 'Failed to build sample game session' });
  }
};
