import { Request, Response } from 'express';
import { UpsertItemPayload } from '../repositories/itemRepository';
import * as itemService from '../services/itemService';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ITEM_TYPES = new Set(['weapon', 'armor', 'pick', 'light', 'ring', 'necklace', 'other']);
const ARMOR_SLOTS = new Set(['head', 'body', 'left-arm', 'right-arm', 'left-leg', 'right-leg']);
const EFFECT_ON_OPTIONS = new Set(['HP', 'AC', 'MP', 'Mind', 'Stamina', 'Strength', 'SP']);

interface ItemWriteRequestBody {
  userkey?: unknown;
  item?: unknown;
}

interface ItemWriteInput {
  name?: unknown;
  description?: unknown;
  type?: unknown;
  range?: unknown;
  value?: unknown;
  weight?: unknown;
  curseId?: unknown;
  curseid?: unknown;
  effectValue?: unknown;
  effectvalue?: unknown;
  damage?: unknown;
  armorSlot?: unknown;
  armorslot?: unknown;
  effectOn?: unknown;
  effecton?: unknown;
  imageId?: unknown;
  imageid?: unknown;
  soundId?: unknown;
  soundid?: unknown;
  isPublic?: unknown;
  ispublic?: unknown;
  isTwoHanded?: unknown;
  istwohanded?: unknown;
}

function normalizeText(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value.trim() || fallback;
  return fallback;
}

function normalizeOptionalText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  return '';
}

function normalizeNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function normalizeNullableInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function buildItemPayload(input: ItemWriteInput, isAdmin: boolean): UpsertItemPayload {
  const type = normalizeText(input.type, 'other');
  const rawArmorSlot = normalizeOptionalText(input.armorSlot ?? input.armorslot);
  const rawEffectOn = normalizeOptionalText(input.effectOn ?? input.effecton);

  return {
    name: normalizeText(input.name, 'Unnamed Item'),
    description: normalizeText(input.description, ''),
    type: ITEM_TYPES.has(type) ? type : 'other',
    range: String(normalizeNumber(input.range, 0)),
    value: Math.max(0, normalizeNumber(input.value, 0)),
    weight: Math.max(0, normalizeNumber(input.weight, 0)),
    curseId: normalizeNullableInt(input.curseId ?? input.curseid),
    effectValue: normalizeNumber(input.effectValue ?? input.effectvalue, 0),
    damage: Math.max(0, normalizeNumber(input.damage, 0)),
    armorSlot: ARMOR_SLOTS.has(rawArmorSlot) ? rawArmorSlot : null,
    effectOn: EFFECT_ON_OPTIONS.has(rawEffectOn) ? rawEffectOn : null,
    imageId: normalizeNullableInt(input.imageId ?? input.imageid),
    soundId: normalizeNullableInt(input.soundId ?? input.soundid),
    isPublic: isAdmin ? input.isPublic === true || input.ispublic === true : false,
    isTwoHanded: input.isTwoHanded === true || input.istwohanded === true,
  };
}

export const getItems = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];
  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  try {
    const items = await itemService.fetchItemsByUserGuid(userkey.trim());
    return res.json(items);
  } catch {
    return res.status(500).json({ error: 'Failed to load items' });
  }
};

export const createItem = async (req: Request, res: Response) => {
  const body = req.body as ItemWriteRequestBody;
  const userkey = body.userkey;

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: 0, error: 'Valid userkey is required' });
  }

  const userguid = userkey.trim();
  const input = (body.item ?? {}) as ItemWriteInput;

  try {
    const isAdmin = await itemService.checkUserIsAdminByGuid(userguid);
    const payload = buildItemPayload(input, isAdmin);
    const item = await itemService.createItemForUser(userguid, payload);
    return res.status(201).json({ result: 1, item });
  } catch {
    return res.status(500).json({ result: 0, error: 'Failed to create item' });
  }
};

export const updateItem = async (req: Request, res: Response) => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ result: 0, error: 'Valid item id is required' });
  }

  const body = req.body as ItemWriteRequestBody;
  const userkey = body.userkey;

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: 0, error: 'Valid userkey is required' });
  }

  const userguid = userkey.trim();
  const input = (body.item ?? {}) as ItemWriteInput;

  try {
    const isAdmin = await itemService.checkUserIsAdminByGuid(userguid);
    const payload = buildItemPayload(input, isAdmin);
    const item = await itemService.saveItemForUser(id, userguid, payload);

    if (!item) {
      return res.status(404).json({ result: 0, error: 'Item not found or access denied' });
    }

    return res.json({ result: 1, item });
  } catch {
    return res.status(500).json({ result: 0, error: 'Failed to update item' });
  }
};
