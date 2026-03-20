import { Request, Response } from 'express';
import * as dungonService from '../services/dungonService';
import * as pcService from '../services/pcService';
import * as tresherService from '../services/tresherService';

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
  const { userkey, name, description, intro, ismaingame } = req.body as Partial<{
    userkey: string;
    name: string;
    description: string;
    intro: string;
    ismaingame?: boolean;
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

  // Only allow admins to create MainGame
  if (ismaingame === true) {
    // TODO: Replace with real admin check
    const isAdmin = req.headers['x-admin'] === 'true';
    if (!isAdmin) {
      return res.status(403).json({ result: -1, error: 'Only admins can create MainGame' });
    }
    // Check if a MainGame already exists
    const existingMainGame = await dungonService.fetchMainGame();
    if (existingMainGame) {
      return res.status(409).json({ result: -1, error: 'MainGame already exists' });
    }
  }

  const trimmedUserKey = userkey.trim();
  const trimmedName = name.trim();

  if (!UUID_REGEX.test(trimmedUserKey)) {
    return res.status(400).json({ result: -1, error: 'Invalid userkey format' });
  }

  if (!trimmedName) {
    return res.status(400).json({ result: -1, error: 'Name is required' });
  }

  try {
    const dungon = await dungonService.createDungon({
      userkey: trimmedUserKey,
      name: trimmedName,
      description: description.trim(),
      intro: intro.trim(),
      ismaingame: !!ismaingame,
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
  const { userkey, name, description, intro, minsplifetime, maxsplifetime } = req.body as Partial<{
    userkey: string;
    name: string;
    description: string;
    intro: string;
    minsplifetime: number;
    maxsplifetime: number;
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
    const updated = await dungonService.updateDungonMetadata(
      id,
      userkey.trim(),
      {
        ...(typeof name === 'string' && { name }),
        ...(typeof description === 'string' && { description }),
        ...(typeof intro === 'string' && { intro }),
        ...(typeof minsplifetime === 'number' && { minsplifetime }),
        ...(typeof maxsplifetime === 'number' && { maxsplifetime }),
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

  try {
    const wasPublished = await dungonService.publishDungonForUserKey(
      id,
      userkey.trim(),
      {
        visibility: normalizedVisibility,
        friendUserKeys: normalizedFriendUserKeys,
      }
    );

    if (!wasPublished) {
      return res.status(404).json({ result: -1, error: 'Dungon not found' });
    }

    return res.json({ result: 1, status: 'published', visibility: normalizedVisibility });
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

  try {
    const game = await dungonService.startGameForUserFromPublishedDungon(id, userkey.trim(), pcId);

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
    let pcCurrentHP: number | null = null;
    let pcMaxHP: number | null = null;
    if (game.pcid !== null && game.pcid > 0) {
      const pc = await pcService.fetchPcByIdForUser(game.pcid, userkey.trim());
      if (pc) {
        pcCurrentHP = pc.currentHP;
        pcMaxHP = pc.maxHP;

        if (Array.isArray(pc.tresherIds) && pc.tresherIds.length > 0) {
          const treshers = await tresherService.fetchTreshersByIds(pc.tresherIds);
          pcTreshers = treshers.map((t) => ({
            id: t.id,
            type: t.type,
            name: t.name,
            description: t.description,
            worth: t.worth,
            curseID: t.curseID,
            trapID: t.trapID,
            HP: t.HP,
            damage: t.damage,
            hands: t.hands,
            range: t.range,
            ammoType: t.ammoType,
            speedReduction: t.speedReduction,
            armorType: t.armorType,
            coinType: t.coinType,
            effectNumber: t.effectNumber,
            effectTarget: t.effectTarget,
            effectDuration: t.effectDuration,
          }));
        }
      }
    }

    return res.json({ ...game, pcTreshers, pcCurrentHP, pcMaxHP });
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
