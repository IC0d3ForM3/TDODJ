import { Request, Response } from 'express';
import {
  UpsertTresherPayload,
} from '../repositories/tresherRepository';
import { isMasterAdminByGuid } from '../repositories/userRepository';
import * as tresherService from '../services/tresherService';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface TresherWriteRequestBody {
  userkey?: unknown;
  tresher?: unknown;
}

interface TresherWriteInput {
  type?: unknown;
  name?: unknown;
  description?: unknown;
  gold?: unknown;
  silver?: unknown;
  copper?: unknown;
  zinc?: unknown;
  item1Id?: unknown;
  item2Id?: unknown;
  item3Id?: unknown;
  item4Id?: unknown;
  spell1Id?: unknown;
  spell2Id?: unknown;
  spell3Id?: unknown;
  spell4Id?: unknown;
  curse1Id?: unknown;
  curse2Id?: unknown;
  isPublic?: unknown;
  ispublic?: unknown;
  isquest?: unknown;
  spReward?: unknown;
  spreward?: unknown;
  imageId?: unknown;
  soundId?: unknown;
  potion1Id?: unknown;
  potion2Id?: unknown;
  potion3Id?: unknown;
}

export const getTreshers = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];
  const scope = req.query['scope'];
  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  try {
    const shouldIncludePublic = typeof scope === 'string' && scope.toLowerCase() === 'library';
    if (shouldIncludePublic && await isMasterAdminByGuid(userkey.trim())) {
      return res.json(await tresherService.fetchAllTreshersWithUsername());
    }
    const treshers = shouldIncludePublic
      ? await tresherService.fetchTresherLibraryByUserGuid(userkey.trim())
      : await tresherService.fetchTreshersByUserGuid(userkey.trim());
    return res.json(treshers);
  } catch (error) {
    console.error('Error fetching treshers:', error);
    return res.status(500).json({ error: 'Failed to fetch treshers' });
  }
};

export const createTresher = async (req: Request, res: Response) => {
  const { userkey, tresher } = req.body as TresherWriteRequestBody;

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  const normalizedPayload = normalizeTresherPayload(tresher);
  if (!normalizedPayload) {
    return res.status(400).json({ result: -1, error: 'Valid tresher payload is required' });
  }

  try {
    const isAdmin = await tresherService.checkUserIsAdminByGuid(userkey.trim());
    if (normalizedPayload.isPublic && !isAdmin) {
      return res
        .status(403)
        .json({ result: -1, error: 'Only admin users can set a tresher as public.' });
    }

    const created = await tresherService.createTresherForUser(userkey.trim(), {
      ...normalizedPayload,
      isPublic: normalizedPayload.isPublic && isAdmin,
    });

    return res.status(201).json({ result: 1, tresher: created });
  } catch (error) {
    console.error('Error creating tresher:', error);
    return res.status(500).json({ result: -1, error: 'Failed to create tresher' });
  }
};

export const updateTresher = async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params['id'], 10);
  const { userkey, tresher } = req.body as TresherWriteRequestBody;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ result: -1, error: 'Valid tresher id is required' });
  }

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  const normalizedPayload = normalizeTresherPayload(tresher);
  if (!normalizedPayload) {
    return res.status(400).json({ result: -1, error: 'Valid tresher payload is required' });
  }

  try {
    const isAdmin = await tresherService.checkUserIsAdminByGuid(userkey.trim());
    if (normalizedPayload.isPublic && !isAdmin) {
      return res
        .status(403)
        .json({ result: -1, error: 'Only admin users can set a tresher as public.' });
    }

    const updated = await tresherService.saveTresherForUser(id, userkey.trim(), {
      ...normalizedPayload,
      isPublic: normalizedPayload.isPublic && isAdmin,
    });

    if (!updated) {
      return res.status(404).json({ result: -1, error: 'Tresher not found' });
    }

    return res.json({ result: 1, tresher: updated });
  } catch (error) {
    console.error('Error updating tresher:', error);
    return res.status(500).json({ result: -1, error: 'Failed to update tresher' });
  }
};

const normalizeTresherPayload = (value: unknown): UpsertTresherPayload | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const input = value as TresherWriteInput;

  return {
    type: normalizeTresherType(input.type),
    name: normalizeText(input.name, 'Unnamed Tresher'),
    description: normalizeText(input.description, ''),
    gold: Math.max(0, normalizeNumber(input.gold, 0)),
    silver: Math.max(0, normalizeNumber(input.silver, 0)),
    copper: Math.max(0, normalizeNumber(input.copper, 0)),
    zinc: Math.max(0, normalizeNumber(input.zinc, 0)),
    item1Id: normalizeNullableNumber(input.item1Id),
    item2Id: normalizeNullableNumber(input.item2Id),
    item3Id: normalizeNullableNumber(input.item3Id),
    item4Id: normalizeNullableNumber(input.item4Id),
    spell1Id: normalizeNullableNumber(input.spell1Id),
    spell2Id: normalizeNullableNumber(input.spell2Id),
    spell3Id: normalizeNullableNumber(input.spell3Id),
    spell4Id: normalizeNullableNumber(input.spell4Id),
    curse1Id: normalizeNullableNumber(input.curse1Id),
    curse2Id: normalizeNullableNumber(input.curse2Id),
    isPublic: normalizeBoolean(input.isPublic ?? input.ispublic),
    isquest: normalizeBoolean(input.isquest),
    spReward: Math.max(0, normalizeNumber(input.spReward ?? input.spreward, 0)),
    imageId: normalizeNullableNumber(input.imageId),
    soundId: normalizeNullableNumber(input.soundId),
    potion1Id: normalizeNullableNumber(input.potion1Id),
    potion2Id: normalizeNullableNumber(input.potion2Id),
    potion3Id: normalizeNullableNumber(input.potion3Id),
  };
};

const normalizeText = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
};

const normalizeNullableText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
};

const normalizeNumber = (value: unknown, fallback: number): number => {
  const asNumber =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
      ? Number.parseInt(value.trim(), 10)
      : Number.NaN;

  if (!Number.isFinite(asNumber)) {
    return fallback;
  }

  return Math.trunc(asNumber);
};

const normalizeNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalized = normalizeNumber(value, Number.NaN);
  return Number.isFinite(normalized) ? normalized : null;
};

const normalizeBoolean = (value: unknown): boolean => value === true;

const VALID_TRESHER_TYPES = ['Weapon', 'Armor', 'Coins', 'Potion', 'OtherTresher'] as const;
type TresherType = (typeof VALID_TRESHER_TYPES)[number];

const normalizeTresherType = (value: unknown): TresherType => {
  if (typeof value === 'string') {
    const match = VALID_TRESHER_TYPES.find((t) => t.toLowerCase() === value.trim().toLowerCase());
    if (match) return match;
  }
  return 'OtherTresher';
};
