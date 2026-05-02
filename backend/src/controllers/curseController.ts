import { Request, Response } from 'express';
import { UpsertCursePayload } from '../repositories/curseRepository';
import * as curseService from '../services/curseService';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EFFECT_TO_OPTIONS = new Set([
  'HP', 'Defense', 'Stamina', 'Mind', 'Magic', 'Sight', 'ROS', 'AE', 'Action Economy', '# of Attacks', '# of attacks #OA',
]);

interface CurseWriteRequestBody {
  userkey?: unknown;
  curse?: unknown;
}

interface CurseWriteInput {
  name?: unknown;
  description?: unknown;
  effectTo?: unknown;
  effectto?: unknown;
  effectTo2?: unknown;
  effectto2?: unknown;
  damage?: unknown;
  damage2?: unknown;
  lastFor?: unknown;
  lastfor?: unknown;
  imageId?: unknown;
  imageid?: unknown;
  soundId?: unknown;
  soundid?: unknown;
  isPublic?: unknown;
  ispublic?: unknown;
}

function normalizeText(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value.trim() || fallback;
  return fallback;
}

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
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

function buildCursePayload(input: CurseWriteInput, isAdmin: boolean): UpsertCursePayload {
  const effectTo = normalizeText(input.effectTo ?? input.effectto, 'HP');
  const effectTo2 = normalizeNullableText(input.effectTo2 ?? input.effectto2);

  return {
    name: normalizeText(input.name, 'Unnamed Curse'),
    description: normalizeText(input.description, ''),
    effectTo: EFFECT_TO_OPTIONS.has(effectTo) ? effectTo : 'HP',
    effectTo2: effectTo2 && EFFECT_TO_OPTIONS.has(effectTo2) ? effectTo2 : null,
    damage: Math.max(0, normalizeNumber(input.damage, 0)),
    damage2: Math.max(0, normalizeNumber(input.damage2, 0)),
    lastFor: Math.max(0, normalizeNumber(input.lastFor ?? input.lastfor, 0)),
    imageId: normalizeNullableInt(input.imageId ?? input.imageid),
    soundId: normalizeNullableInt(input.soundId ?? input.soundid),
    isPublic: isAdmin ? input.isPublic === true || input.ispublic === true : false,
  };
}

export const getCurses = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];
  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  try {
    const curses = await curseService.fetchCursesByUserGuid(userkey.trim());
    return res.json(curses);
  } catch {
    return res.status(500).json({ error: 'Failed to load curses' });
  }
};

export const createCurse = async (req: Request, res: Response) => {
  const body = req.body as CurseWriteRequestBody;
  const userkey = body.userkey;

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: 0, error: 'Valid userkey is required' });
  }

  const userguid = userkey.trim();
  const input = (body.curse ?? {}) as CurseWriteInput;

  try {
    const isAdmin = await curseService.checkUserIsAdminByGuid(userguid);
    const payload = buildCursePayload(input, isAdmin);
    const curse = await curseService.createCurseForUser(userguid, payload);
    return res.status(201).json({ result: 1, curse });
  } catch {
    return res.status(500).json({ result: 0, error: 'Failed to create curse' });
  }
};

export const updateCurse = async (req: Request, res: Response) => {
  const id = parseInt(req.params['id'] ?? '', 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ result: 0, error: 'Valid curse id is required' });
  }

  const body = req.body as CurseWriteRequestBody;
  const userkey = body.userkey;

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: 0, error: 'Valid userkey is required' });
  }

  const userguid = userkey.trim();
  const input = (body.curse ?? {}) as CurseWriteInput;

  try {
    const isAdmin = await curseService.checkUserIsAdminByGuid(userguid);
    const payload = buildCursePayload(input, isAdmin);
    const curse = await curseService.saveCurseForUser(id, userguid, payload);

    if (!curse) {
      return res.status(404).json({ result: 0, error: 'Curse not found or access denied' });
    }

    return res.json({ result: 1, curse });
  } catch {
    return res.status(500).json({ result: 0, error: 'Failed to update curse' });
  }
};
