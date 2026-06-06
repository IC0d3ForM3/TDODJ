import { Request, Response } from 'express';
import { UpsertItemPayload } from '../repositories/itemRepository';
import { isMasterAdminByGuid } from '../repositories/userRepository';
import * as itemService from '../services/itemService';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ITEM_TYPES = new Set(['weapon', 'armor', 'pick', 'light', 'ring', 'necklace', 'neckless', 'gem', 'other']);
const ARMOR_SLOTS = new Set(['none', 'hand', 'shield', 'head', 'body', 'left-arm', 'right-arm', 'left-leg', 'right-leg']);
const EFFECT_ON_OPTIONS = new Set(['HP', 'AC', 'MP', 'Mind', 'Stamina', 'Strength', 'SP', 'AE', 'NOA', 'ROS', 'Door Trap', 'To Pick', 'Placed Trap']);
const EFFECT_TO_PC_OPTIONS = new Set(['HP', 'AC', 'Magic', 'Mind', 'Stamina', 'Strength', 'AE', 'NOA', 'ROS']);
const COLOR_HEX_REGEX = /^#[0-9a-f]{6}$/i;

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
  effectToPc?: unknown;
  effecttopc?: unknown;
  effectToPcValue?: unknown;
  effecttopcvalue?: unknown;
  note?: unknown;
  minMindToRead?: unknown;
  minmindtoread?: unknown;
  weaponEffectType?: unknown;
  weaponeffecttype?: unknown;
  weaponEffectColor?: unknown;
  weaponeffectcolor?: unknown;
  imageId?: unknown;
  imageid?: unknown;
  soundId?: unknown;
  soundid?: unknown;
  isPublic?: unknown;
  ispublic?: unknown;
  isTwoHanded?: unknown;
  istwohanded?: unknown;
  uses?: unknown;
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

function normalizeOptionalNullableText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeWeaponEffectType(value: unknown): string {
  const raw = normalizeOptionalText(value).toLowerCase();
  if (raw === 'fire') return 'Fire';
  if (raw === 'cold') return 'Cold';
  if (raw === 'lightning' || raw === 'lighing') return 'Lightning';
  if (raw === 'blood') return 'Blood';
  return 'Blood';
}

function normalizeWeaponEffectColor(value: unknown): string {
  const raw = normalizeOptionalText(value);
  if (COLOR_HEX_REGEX.test(raw)) {
    return raw;
  }
  return '#cc0000';
}

function normalizeEffectToPc(value: unknown): string | null {
  const raw = normalizeOptionalText(value);
  if (!raw) return null;
  if (raw.toLowerCase() === 'mp') return 'Magic';
  if (raw.toLowerCase() === 'magic') return 'Magic';
  if (raw.toLowerCase() === 'mind') return 'Mind';
  if (raw.toLowerCase() === 'staman') return 'Stamina';
  if (raw.toLowerCase() === 'stamina') return 'Stamina';
  if (raw.toLowerCase() === 'strench') return 'Strength';
  if (raw.toLowerCase() === 'strength') return 'Strength';
  if (raw.toLowerCase() === 'ae' || raw.toLowerCase() === 'action economy') return 'AE';
  if (raw.toLowerCase() === 'noa' || raw.toLowerCase() === '# of attacks' || raw.toLowerCase() === '#oa' || raw.toLowerCase() === 'number of attacks') return 'NOA';
  if (raw.toLowerCase() === 'hp') return 'HP';
  if (raw.toLowerCase() === 'ac') return 'AC';
  if (raw.toLowerCase() === 'ros' || raw.toLowerCase() === 'sight' || raw.toLowerCase() === 'range of sight') return 'ROS';
  return EFFECT_TO_PC_OPTIONS.has(raw) ? raw : null;
}

function buildItemPayload(input: ItemWriteInput, isAdmin: boolean): UpsertItemPayload {
  const type = normalizeText(input.type, 'other');
  const rawArmorSlot = normalizeOptionalText(input.armorSlot ?? input.armorslot);
  const rawEffectOn = normalizeOptionalText(input.effectOn ?? input.effecton);
  const effectToPc = normalizeEffectToPc(input.effectToPc ?? input.effecttopc);
  const effectToPcValue = normalizeNumber(input.effectToPcValue ?? input.effecttopcvalue, 0);
  const note = normalizeOptionalNullableText(input.note);
  const minMindToRead = Math.max(0, normalizeNumber(input.minMindToRead ?? input.minmindtoread, 0));
  const weaponEffectType = normalizeWeaponEffectType(input.weaponEffectType ?? input.weaponeffecttype);
  const weaponEffectColor = normalizeWeaponEffectColor(input.weaponEffectColor ?? input.weaponeffectcolor);
  const normalizedType = ITEM_TYPES.has(type) ? type : 'other';
  const canonicalType = normalizedType === 'neckless' ? 'necklace' : normalizedType;
  const allowsPcEffect = canonicalType === 'weapon' || canonicalType === 'armor' || canonicalType === 'ring' || canonicalType === 'necklace' || canonicalType === 'other';

  return {
    name: normalizeText(input.name, 'Unnamed Item'),
    description: normalizeText(input.description, ''),
    type: canonicalType,
    range: String(normalizeNumber(input.range, 0)),
    value: Math.max(0, normalizeNumber(input.value, 0)),
    weight: Math.max(0, normalizeNumber(input.weight, 0)),
    curseId: normalizeNullableInt(input.curseId ?? input.curseid),
    effectValue: normalizeNumber(input.effectValue ?? input.effectvalue, 0),
    damage: Math.max(0, normalizeNumber(input.damage, 0)),
    armorSlot: ARMOR_SLOTS.has(rawArmorSlot) ? rawArmorSlot : null,
    effectOn: EFFECT_ON_OPTIONS.has(rawEffectOn) ? rawEffectOn : null,
    effectToPc: allowsPcEffect ? effectToPc : null,
    effectToPcValue: allowsPcEffect ? effectToPcValue : 0,
    note,
    minMindToRead: note ? minMindToRead : 0,
    weaponEffectType: canonicalType === 'weapon' ? weaponEffectType : 'Blood',
    weaponEffectColor: canonicalType === 'weapon' ? weaponEffectColor : '#cc0000',
    imageId: normalizeNullableInt(input.imageId ?? input.imageid),
    soundId: normalizeNullableInt(input.soundId ?? input.soundid),
    isPublic: isAdmin ? input.isPublic === true || input.ispublic === true : false,
    isTwoHanded: input.isTwoHanded === true || input.istwohanded === true,
    uses: normalizeNullableInt(input.uses),
  };
}

export const getItems = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];
  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  const scope = req.query['scope'];

  try {
    if (await isMasterAdminByGuid(userkey.trim())) {
      return res.json(await itemService.fetchAllItemsWithUsername());
    }
    if (scope === 'library') {
      return res.json(await itemService.fetchItemsLibraryByUserGuid(userkey.trim()));
    }
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

export const deleteItem = async (req: Request, res: Response) => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ result: 0, error: 'Valid item id is required' });
  }

  const userkey = req.query['userkey'];
  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: 0, error: 'Valid userkey is required' });
  }

  try {
    const deleted = await itemService.removeItemForUser(id, userkey.trim());
    if (!deleted) {
      return res.status(404).json({ result: 0, error: 'Item not found or access denied' });
    }
    return res.json({ result: 1 });
  } catch {
    return res.status(500).json({ result: 0, error: 'Failed to delete item' });
  }
};
