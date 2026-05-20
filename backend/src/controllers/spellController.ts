import { Request, Response } from 'express';
import { UpsertSpellPayload } from '../repositories/spellRepository';
import { isMasterAdminByGuid } from '../repositories/userRepository';
import * as spellService from '../services/spellService';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EFFECT_TO_OPTIONS = new Set([
  'HP', 'Defense', 'Stamina', 'Mind', 'Magic', 'Sight', 'ROS', 'AE', 'Action Economy', '# of Attacks', '# of attacks #OA', 'Remove Curse',
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
  numberOfTargets?: unknown;
  numberoftargets?: unknown;
  effectType?: unknown;
  effecttype?: unknown;
  effectColor?: unknown;
  effectcolor?: unknown;
  effectOnPc1?: unknown;
  effectonpc1?: unknown;
  effectOnPc2?: unknown;
  effectonpc2?: unknown;
  range1?: unknown;
  range2?: unknown;
  lastFor1?: unknown;
  lastfor1?: unknown;
  lastFor2?: unknown;
  lastfor2?: unknown;
}

const EFFECT_TYPE_OPTIONS = new Set(['Fire', 'Ice', 'Lightning', 'Other']);

const EFFECT_TYPE_DEFAULT_COLORS: Record<string, string> = {
  Fire: '#ee3300',
  Ice: '#88ddff',
  Lightning: '#4466ff',
  Other: '#ffffff',
};

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{3,8}$/;

function normalizeEffectType(value: unknown): string {
  if (typeof value === 'string' && EFFECT_TYPE_OPTIONS.has(value)) return value;
  return 'Other';
}

function normalizeEffectColor(value: unknown, effectType: string): string {
  if (typeof value === 'string' && HEX_COLOR_REGEX.test(value)) return value.toLowerCase();
  return EFFECT_TYPE_DEFAULT_COLORS[effectType] ?? '#ffffff';
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
  const range1 = Math.max(0, normalizeNumber(input.range1 ?? input.range, 0));
  const range2 = Math.max(0, normalizeNumber(input.range2 ?? input.range, 0));
  const lastFor1 = Math.max(0, normalizeNumber(input.lastFor1 ?? input.lastfor1 ?? input.lastFor ?? input.lastfor, 0));
  const lastFor2 = Math.max(0, normalizeNumber(input.lastFor2 ?? input.lastfor2 ?? input.lastFor ?? input.lastfor, 0));
  const effectOnPc1 = (input.effectOnPc1 === true || input.effectonpc1 === true) || range1 === 0;
  const effectOnPc2 = (input.effectOnPc2 === true || input.effectonpc2 === true) || range2 === 0;

  return {
    name: normalizeText(input.name, 'Unnamed Spell'),
    description: normalizeText(input.description, ''),
    range: effectOnPc1 ? 0 : range1,
    effectOn: EFFECT_TO_OPTIONS.has(effectOn) ? effectOn : '',
    effectOn2: EFFECT_TO_OPTIONS.has(effectOn2) ? effectOn2 : '',
    lastFor: lastFor1,
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
    numberOfTargets: Math.max(1, normalizeNumber(input.numberOfTargets ?? input.numberoftargets, 1)),
    effectType: normalizeEffectType(input.effectType ?? input.effecttype),
    effectColor: normalizeEffectColor(
      input.effectColor ?? input.effectcolor,
      normalizeEffectType(input.effectType ?? input.effecttype)
    ),
    effectOnPc1,
    effectOnPc2,
    range1,
    range2,
    lastFor1,
    lastFor2,
  };
}

export const getSpells = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];
  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  try {
    if (await isMasterAdminByGuid(userkey.trim())) {
      return res.json(await spellService.fetchAllSpellsWithUsername());
    }
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
