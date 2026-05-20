import { Request, Response } from 'express';
import { UpsertPotionPayload } from '../repositories/potionRepository';
import { isMasterAdminByGuid } from '../repositories/userRepository';
import * as potionService from '../services/potionService';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EFFECT_TO_OPTIONS = new Set([
  'HP', 'Defense', 'Stamina', 'Mind', 'Magic', 'Sight', 'ROS', 'AE', 'Action Economy', '# of Attacks', '# of attacks #OA', 'Remove Curse',
]);

interface PotionWriteRequestBody {
  userkey?: unknown;
  potion?: unknown;
}

interface PotionWriteInput {
  name?: unknown;
  description?: unknown;
  effectTo?: unknown;
  effectto?: unknown;
  effectTo2?: unknown;
  effectto2?: unknown;
  lastFor?: unknown;
  lastfor?: unknown;
  effectAmount?: unknown;
  effectamount?: unknown;
  effectAmount2?: unknown;
  effectamount2?: unknown;
  value?: unknown;
  imageId?: unknown;
  imageid?: unknown;
  soundId?: unknown;
  soundid?: unknown;
  isPublic?: unknown;
  ispublic?: unknown;
}

function normalizeNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function normalizeText(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value.trim() || fallback;
  return fallback;
}

function normalizeNullableInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function buildPotionPayload(input: PotionWriteInput, isAdmin: boolean): UpsertPotionPayload {
  const effectTo = normalizeText(input.effectTo ?? input.effectto, 'HP');
  const effectTo2Raw = typeof (input.effectTo2 ?? input.effectto2) === 'string'
    ? String(input.effectTo2 ?? input.effectto2).trim()
    : null;
  const effectTo2 = effectTo2Raw && EFFECT_TO_OPTIONS.has(effectTo2Raw) ? effectTo2Raw : null;

  return {
    name: normalizeText(input.name, 'Unnamed Potion'),
    description: normalizeText(input.description, ''),
    effectTo: EFFECT_TO_OPTIONS.has(effectTo) ? effectTo : 'HP',
    effectTo2,
    lastFor: Math.max(0, normalizeNumber(input.lastFor ?? input.lastfor, 0)),
    effectAmount: normalizeNumber(input.effectAmount ?? input.effectamount, 0),
    effectAmount2: normalizeNumber(input.effectAmount2 ?? input.effectamount2, 0),
    value: Math.max(0, normalizeNumber(input.value, 0)),
    imageId: normalizeNullableInt(input.imageId ?? input.imageid),
    soundId: normalizeNullableInt(input.soundId ?? input.soundid),
    isPublic: isAdmin ? input.isPublic === true || input.ispublic === true : false,
  };
}

export const getPotions = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];
  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  try {
    if (await isMasterAdminByGuid(userkey.trim())) {
      return res.json(await potionService.fetchAllPotionsWithUsername());
    }
    const potions = await potionService.fetchPotionsByUserGuid(userkey.trim());
    return res.json(potions);
  } catch {
    return res.status(500).json({ error: 'Failed to load potions' });
  }
};

export const createPotion = async (req: Request, res: Response) => {
  const body = req.body as PotionWriteRequestBody;
  const userkey = body.userkey;

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: 0, error: 'Valid userkey is required' });
  }

  const userguid = userkey.trim();
  const input = (body.potion ?? {}) as PotionWriteInput;

  try {
    const isAdmin = await potionService.checkUserIsAdminByGuid(userguid);
    const payload = buildPotionPayload(input, isAdmin);
    const potion = await potionService.createPotionForUser(userguid, payload);
    return res.status(201).json({ result: 1, potion });
  } catch {
    return res.status(500).json({ result: 0, error: 'Failed to create potion' });
  }
};

export const updatePotion = async (req: Request, res: Response) => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ result: 0, error: 'Valid potion id is required' });
  }

  const body = req.body as PotionWriteRequestBody;
  const userkey = body.userkey;

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: 0, error: 'Valid userkey is required' });
  }

  const userguid = userkey.trim();
  const input = (body.potion ?? {}) as PotionWriteInput;

  try {
    const isAdmin = await potionService.checkUserIsAdminByGuid(userguid);
    const payload = buildPotionPayload(input, isAdmin);
    const potion = await potionService.savePotionForUser(id, userguid, payload);

    if (!potion) {
      return res.status(404).json({ result: 0, error: 'Potion not found or access denied' });
    }

    return res.json({ result: 1, potion });
  } catch {
    return res.status(500).json({ result: 0, error: 'Failed to update potion' });
  }
};
