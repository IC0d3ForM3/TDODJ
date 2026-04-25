import { Request, Response } from 'express';
import { UpsertSpellPayload } from '../repositories/spellRepository';
import * as spellService from '../services/spellService';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EFFECT_TO_OPTIONS = new Set([
  'HP', 'Defense', 'Stamina', 'Mind', 'Magic', 'Sight', 'Action Economy',
]);

interface SpellWriteRequestBody {
  userkey?: unknown;
  spell?: unknown;
}

interface SpellWriteInput {
  name?: unknown;
  description?: unknown;
  range?: unknown;
  effectOn?: unknown;
  effecton?: unknown;
  effectOn2?: unknown;
  effecton2?: unknown;
  lastFor?: unknown;
  lastfor?: unknown;
  effectAmount?: unknown;
  effectAmount2?: unknown;
  value?: unknown;
  sp?: unknown;
  successTestValue?: unknown;
  successtestvalue?: unknown;
  magicCost?: unknown;
  magiccost?: unknown;
  costToLearn?: unknown;
  costtolearn?: unknown;
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

function buildSpellPayload(input: SpellWriteInput, isAdmin: boolean): UpsertSpellPayload {
  const effectOn = normalizeText(input.effectOn ?? input.effecton, '');
  const effectOn2 = normalizeText(input.effectOn2 ?? input.effecton2, '');

  return {
    name: normalizeText(input.name, 'Unnamed Spell'),
    description: normalizeText(input.description, ''),
    range: Math.max(0, normalizeNumber(input.range, 0)),
    effectOn: EFFECT_TO_OPTIONS.has(effectOn) ? effectOn : '',
    effectOn2: EFFECT_TO_OPTIONS.has(effectOn2) ? effectOn2 : '',
    lastFor: Math.max(0, normalizeNumber(input.lastFor ?? input.lastfor, 0)),
    effectAmount: normalizeNumber(input.effectAmount, 0),
    effectAmount2: normalizeNumber(input.effectAmount2, 0),
    value: Math.max(0, normalizeNumber(input.value, 0)),
    sp: Math.max(0, normalizeNumber(input.sp, 0)),
    successTestValue: Math.max(0, normalizeNumber(input.successTestValue ?? input.successtestvalue, 0)),
    magicCost: Math.max(1, normalizeNumber(input.magicCost ?? input.magiccost, 1)),
    costToLearn: Math.max(0, normalizeNumber(input.costToLearn ?? input.costtolearn, 0)),
    imageId: normalizeNullableInt(input.imageId ?? input.imageid),
    soundId: normalizeNullableInt(input.soundId ?? input.soundid),
    isPublic: isAdmin ? input.isPublic === true || input.ispublic === true : false,
  };
}

export const getSpells = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];
  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  try {
    const spells = await spellService.fetchSpellsByUserGuid(userkey.trim());
    return res.json(spells);
  } catch {
    return res.status(500).json({ error: 'Failed to load spells' });
  }
};

export const createSpell = async (req: Request, res: Response) => {
  const body = req.body as SpellWriteRequestBody;
  const userkey = body.userkey;

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: 0, error: 'Valid userkey is required' });
  }

  const userguid = userkey.trim();
  const input = (body.spell ?? {}) as SpellWriteInput;

  try {
    const isAdmin = await spellService.checkUserIsAdminByGuid(userguid);
    const payload = buildSpellPayload(input, isAdmin);
    const spell = await spellService.createSpellForUser(userguid, payload);
    return res.status(201).json({ result: 1, spell });
  } catch {
    return res.status(500).json({ result: 0, error: 'Failed to create spell' });
  }
};

export const updateSpell = async (req: Request, res: Response) => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ result: 0, error: 'Valid spell id is required' });
  }

  const body = req.body as SpellWriteRequestBody;
  const userkey = body.userkey;

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: 0, error: 'Valid userkey is required' });
  }

  const userguid = userkey.trim();
  const input = (body.spell ?? {}) as SpellWriteInput;

  try {
    const isAdmin = await spellService.checkUserIsAdminByGuid(userguid);
    const payload = buildSpellPayload(input, isAdmin);
    const spell = await spellService.saveSpellForUser(id, userguid, payload);

    if (!spell) {
      return res.status(404).json({ result: 0, error: 'Spell not found or access denied' });
    }

    return res.json({ result: 1, spell });
  } catch {
    return res.status(500).json({ result: 0, error: 'Failed to update spell' });
  }
};
