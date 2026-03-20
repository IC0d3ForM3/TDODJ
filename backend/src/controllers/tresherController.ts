import { Request, Response } from 'express';
import {
  ArmorTypeValue,
  CoinTypeValue,
  PotionEffectTargetValue,
  TresherTypeValue,
  UpsertTresherPayload,
} from '../repositories/tresherRepository';
import * as tresherService from '../services/tresherService';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_TRESHER_TYPES: readonly TresherTypeValue[] = [
  'Weapon',
  'Armor',
  'Coins',
  'Potion',
  'OtherTresher',
] as const;

const VALID_ARMOR_TYPES: readonly ArmorTypeValue[] = [
  'head',
  'hand',
  'body',
  'arms',
  'legs',
] as const;

const VALID_COIN_TYPES: readonly CoinTypeValue[] = ['Gold', 'Silver', 'Copper', 'Tin'] as const;
const VALID_POTION_EFFECT_TARGETS: readonly PotionEffectTargetValue[] = ['Health', 'AC', 'AE'] as const;

interface TresherWriteRequestBody {
  userkey?: unknown;
  tresher?: unknown;
}

interface TresherWriteInput {
  type?: unknown;
  name?: unknown;
  description?: unknown;
  worth?: unknown;
  curseID?: unknown;
  curseId?: unknown;
  trapID?: unknown;
  trapId?: unknown;
  HP?: unknown;
  hp?: unknown;
  damage?: unknown;
  hands?: unknown;
  range?: unknown;
  ammoType?: unknown;
  speedReduction?: unknown;
  armorType?: unknown;
  coinType?: unknown;
  effectNumber?: unknown;
  effectTarget?: unknown;
  effectDuration?: unknown;
  isPublic?: unknown;
  ispublic?: unknown;
}

export const getTreshers = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];
  const scope = req.query['scope'];
  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  try {
    const shouldIncludePublic = typeof scope === 'string' && scope.toLowerCase() === 'library';
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
  const type = normalizeTresherType(input.type);
  if (!type) {
    return null;
  }

  const payload: UpsertTresherPayload = {
    type,
    name: normalizeText(input.name, 'Unnamed Tresher'),
    description: normalizeText(input.description, ''),
    worth: Math.max(0, normalizeNumber(input.worth, 0)),
    curseID: normalizeNullableNumber(input.curseID ?? input.curseId),
    trapID: normalizeNullableNumber(input.trapID ?? input.trapId),
    HP: null,
    damage: null,
    hands: null,
    range: null,
    ammoType: null,
    speedReduction: null,
    armorType: null,
    coinType: null,
    effectNumber: null,
    effectTarget: null,
    effectDuration: null,
    isPublic: normalizeBoolean(input.isPublic ?? input.ispublic),
  };

  if (type === 'Weapon') {
    payload.HP = normalizeNumber(input.HP ?? input.hp, 10);
    payload.damage = normalizeNumber(input.damage, 0);
    payload.hands = Math.max(1, normalizeNumber(input.hands, 1));
    payload.range = Math.max(0, normalizeNumber(input.range, 0));
    payload.ammoType = normalizeNullableText(input.ammoType);
    return payload;
  }

  if (type === 'Armor') {
    payload.HP = normalizeNumber(input.HP ?? input.hp, 10);
    payload.hands = Math.max(0, normalizeNumber(input.hands, 0));
    payload.speedReduction = normalizeNumber(input.speedReduction, 0);
    payload.armorType = normalizeArmorType(input.armorType);
    return payload;
  }

  if (type === 'Coins') {
    payload.coinType = normalizeCoinType(input.coinType);
    return payload;
  }

  if (type === 'Potion') {
    payload.effectNumber = normalizeNumber(input.effectNumber, 0);
    payload.effectTarget = normalizePotionEffectTarget(input.effectTarget);
    const target = payload.effectTarget;
    if (target === 'AC' || target === 'AE') {
      payload.effectDuration = Math.max(0, normalizeNumber(input.effectDuration, 1));
    }
    return payload;
  }

  payload.HP = normalizeNumber(input.HP ?? input.hp, 10);
  return payload;
};

const normalizeTresherType = (value: unknown): TresherTypeValue | null => {
  if (typeof value !== 'string') {
    return null;
  }

  return VALID_TRESHER_TYPES.includes(value as TresherTypeValue)
    ? (value as TresherTypeValue)
    : null;
};

const normalizeArmorType = (value: unknown): ArmorTypeValue | null => {
  if (typeof value !== 'string') {
    return null;
  }

  return VALID_ARMOR_TYPES.includes(value as ArmorTypeValue)
    ? (value as ArmorTypeValue)
    : null;
};

const normalizeCoinType = (value: unknown): CoinTypeValue | null => {
  if (typeof value !== 'string') {
    return null;
  }

  return VALID_COIN_TYPES.includes(value as CoinTypeValue)
    ? (value as CoinTypeValue)
    : null;
};

const normalizePotionEffectTarget = (value: unknown): PotionEffectTargetValue | null => {
  if (typeof value !== 'string') {
    return null;
  }

  return VALID_POTION_EFFECT_TARGETS.includes(value as PotionEffectTargetValue)
    ? (value as PotionEffectTargetValue)
    : null;
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
