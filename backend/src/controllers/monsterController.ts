import { Request, Response } from 'express';
import {
  MonsterAttackRecord,
  UpsertMonsterPayload,
} from '../repositories/monsterRepository';
import { isMasterAdminByGuid } from '../repositories/userRepository';
import * as monsterService from '../services/monsterService';
import * as imageService from '../services/imageService';
import * as tresherService from '../services/tresherService';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface MonsterWriteRequestBody {
  userkey?: unknown;
  monster?: unknown;
}

interface MonsterWriteInput {
  imageId?: unknown;
  imageid?: unknown;
  soundId?: unknown;
  tresherIds?: unknown;
  tresherids?: unknown;
  trusherIds?: unknown;
  trusherids?: unknown;
  keyIds?: unknown;
  keyids?: unknown;
  name?: unknown;
  type?: unknown;
  description?: unknown;
  discription?: unknown;
  hp?: unknown;
  movementEconomy?: unknown;
  movmentEconomy?: unknown;
  ac?: unknown;
  runAt?: unknown;
  runat?: unknown;
  numberOfAttacks?: unknown;
  nuberOfAttacks?: unknown;
  attacks?: unknown;
  isPublic?: unknown;
  ispublic?: unknown;
  spReward?: unknown;
  magic?: unknown;
  magicResistance?: unknown;
  castPlus?: unknown;
  callsReinforcements?: unknown;
  reinforcementCount?: unknown;
  reinforcementMonsterName?: unknown;
  toHitPlusNeeded?: unknown;
  npcGreeting?: unknown;
  npcInfo1?: unknown;
  npcInfo2?: unknown;
  npcInfo3?: unknown;
  npcOnlyAttackWhenAttacked?: unknown;
  npcGivesInfoAfterDamaged?: unknown;
  npcAttacksAfterInfo?: unknown;
  npcCanTrade?: unknown;
  awareness?: unknown;
}

interface MonsterAttackWriteInput {
  type?: unknown;
  description?: unknown;
  discription?: unknown;
  damageFormula?: unknown;
  damage?: unknown;
  plusToHit?: unknown;
  plushToHit?: unknown;
  weaponItemId?: unknown;
  spellId?: unknown;
  curseId?: unknown;
}

export const getMonsters = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];
  const scope = req.query['scope'];
  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  try {
    const shouldIncludePublic = typeof scope === 'string' && scope.toLowerCase() === 'library';
    if (shouldIncludePublic && await isMasterAdminByGuid(userkey.trim())) {
      return res.json(await monsterService.fetchAllMonstersWithUsername());
    }
    const monsters = shouldIncludePublic
      ? await monsterService.fetchMonsterLibraryByUserGuid(userkey.trim())
      : await monsterService.fetchMonstersByUserGuid(userkey.trim());
    return res.json(monsters);
  } catch (error) {
    console.error('Error fetching monsters:', error);
    return res.status(500).json({ error: 'Failed to fetch monsters' });
  }
};

export const createMonster = async (req: Request, res: Response) => {
  const { userkey, monster } = req.body as MonsterWriteRequestBody;

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  const normalizedPayload = normalizeMonsterPayload(monster);
  if (!normalizedPayload) {
    return res.status(400).json({ result: -1, error: 'Valid monster payload is required' });
  }

  try {
    const isAdmin = await monsterService.checkUserIsAdminByGuid(userkey.trim());
    if (normalizedPayload.isPublic && !isAdmin) {
      return res
        .status(403)
        .json({ result: -1, error: 'Only admin users can set a monster as public.' });
    }

    if (normalizedPayload.imageId !== null) {
      const canUseImage = await imageService.checkImageAccessibleByIdForUser(
        normalizedPayload.imageId,
        userkey.trim()
      );

      if (!canUseImage) {
        return res.status(400).json({
          result: -1,
          error: 'Selected image is not available for this user.',
        });
      }
    }

    const invalidTresherId = await findFirstInvalidTresherIdForUser(
      normalizedPayload.tresherIds,
      userkey.trim()
    );
    if (invalidTresherId !== null) {
      return res.status(400).json({
        result: -1,
        error: `Selected tresher ${invalidTresherId} is not available for this user.`,
      });
    }

    const created = await monsterService.createMonsterForUser(userkey.trim(), {
      ...normalizedPayload,
      isPublic: normalizedPayload.isPublic && isAdmin,
    });

    return res.status(201).json({ result: 1, monster: created });
  } catch (error) {
    console.error('Error creating monster:', error);
    return res.status(500).json({ result: -1, error: 'Failed to create monster' });
  }
};

export const updateMonster = async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params['id'], 10);
  const { userkey, monster } = req.body as MonsterWriteRequestBody;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ result: -1, error: 'Valid monster id is required' });
  }

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  const normalizedPayload = normalizeMonsterPayload(monster);
  if (!normalizedPayload) {
    return res.status(400).json({ result: -1, error: 'Valid monster payload is required' });
  }

  try {
    const isAdmin = await monsterService.checkUserIsAdminByGuid(userkey.trim());
    if (normalizedPayload.isPublic && !isAdmin) {
      return res
        .status(403)
        .json({ result: -1, error: 'Only admin users can set a monster as public.' });
    }

    if (normalizedPayload.imageId !== null) {
      const canUseImage = await imageService.checkImageAccessibleByIdForUser(
        normalizedPayload.imageId,
        userkey.trim()
      );

      if (!canUseImage) {
        return res.status(400).json({
          result: -1,
          error: 'Selected image is not available for this user.',
        });
      }
    }

    const invalidTresherId = await findFirstInvalidTresherIdForUser(
      normalizedPayload.tresherIds,
      userkey.trim()
    );
    if (invalidTresherId !== null) {
      return res.status(400).json({
        result: -1,
        error: `Selected tresher ${invalidTresherId} is not available for this user.`,
      });
    }

    const updated = await monsterService.saveMonsterForUser(id, userkey.trim(), {
      ...normalizedPayload,
      isPublic: normalizedPayload.isPublic && isAdmin,
    });

    if (!updated) {
      return res.status(404).json({ result: -1, error: 'Monster not found' });
    }

    return res.json({ result: 1, monster: updated });
  } catch (error) {
    console.error('Error updating monster:', error);
    return res.status(500).json({ result: -1, error: 'Failed to update monster' });
  }
};

const normalizeMonsterPayload = (value: unknown): UpsertMonsterPayload | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const input = value as MonsterWriteInput;
  const attacks = normalizeMonsterAttacks(input.attacks);
  const numberOfAttacksInput = normalizeNumber(
    input.numberOfAttacks ?? input.nuberOfAttacks,
    attacks.length
  );
  const numberOfAttacks = Math.max(0, Math.max(numberOfAttacksInput, attacks.length));

  const callsReinforcements = normalizeBoolean(input.callsReinforcements);
  const reinforcementCount = callsReinforcements
    ? Math.max(1, normalizeNumber(input.reinforcementCount, 1))
    : 0;

  return {
    imageId: normalizeNullableNumber(input.imageId ?? input.imageid),
    soundId: normalizeNullableNumber(input.soundId),
    tresherIds: normalizeIdList(
      input.tresherIds ?? input.tresherids ?? input.trusherIds ?? input.trusherids
    ),
    keyIds: normalizeIdList(input.keyIds ?? input.keyids),
    name: normalizeText(input.name, 'Unnamed Monster'),
    type: normalizeText(input.type, 'Unknown'),
    description: normalizeText(input.description ?? input.discription, ''),
    hp: Math.max(0, normalizeNumber(input.hp, 1)),
    movementEconomy: Math.max(
      0,
      normalizeNumber(input.movementEconomy ?? input.movmentEconomy, 0)
    ),
    ac: Math.max(0, normalizeNumber(input.ac, 10)),
    runAt: Math.max(0, normalizeNumber(input.runAt ?? input.runat, 0)),
    numberOfAttacks,
    attacks,
    isPublic: normalizeBoolean(input.isPublic ?? input.ispublic),
    spReward: Math.max(0, normalizeNumber(input.spReward, 0)),
    magic: Math.max(0, normalizeNumber(input.magic, 0)),
    magicResistance: Math.max(0, normalizeNumber(input.magicResistance, 0)),
    castPlus: Math.max(0, normalizeNumber(input.castPlus, 0)),
    callsReinforcements,
    reinforcementCount,
    reinforcementMonsterName: callsReinforcements
      ? normalizeNullableText(input.reinforcementMonsterName)
      : null,
    toHitPlusNeeded: Math.max(0, normalizeNumber(input.toHitPlusNeeded, 0)),
    npcGreeting: normalizeNullableText(input.npcGreeting),
    npcInfo1: normalizeNullableText(input.npcInfo1),
    npcInfo2: normalizeNullableText(input.npcInfo2),
    npcInfo3: normalizeNullableText(input.npcInfo3),
    npcOnlyAttackWhenAttacked: normalizeBoolean(input.npcOnlyAttackWhenAttacked),
    npcGivesInfoAfterDamaged: normalizeBoolean(input.npcGivesInfoAfterDamaged),
    npcAttacksAfterInfo: normalizeBoolean(input.npcAttacksAfterInfo),
    npcCanTrade: normalizeBoolean(input.npcCanTrade),
    awareness: Math.max(1, normalizeNumber(input.awareness, 5)),
  };
};

const normalizeMonsterAttacks = (value: unknown): MonsterAttackRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: MonsterAttackRecord[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const source = item as MonsterAttackWriteInput;
    normalized.push({
      type: normalizeText(source.type, 'Weapon'),
      description: normalizeText(source.description ?? source.discription, ''),
      damageFormula: normalizeDamageFormula(source.damageFormula),
      damage: Math.max(0, normalizeNumber(source.damage, 0)),
      plusToHit: normalizeNumber(source.plusToHit ?? source.plushToHit, 0),
      weaponItemId: normalizeNullableNumber(source.weaponItemId),
      spellId: normalizeNullableNumber(source.spellId),
      curseId: normalizeNullableNumber(source.curseId),
    });
  }

  return normalized;
};

const normalizeText = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
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

const normalizeIdList = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((entry) => normalizeNullableNumber(entry))
    .filter((entry): entry is number => entry !== null && entry > 0);

  return Array.from(new Set(normalized));
};

const findFirstInvalidTresherIdForUser = async (
  tresherIds: number[],
  userguid: string
): Promise<number | null> => {
  for (const tresherId of tresherIds) {
    const isAccessible = await tresherService.checkTresherAccessibleByIdForUser(
      tresherId,
      userguid
    );

    if (!isAccessible) {
      return tresherId;
    }
  }

  return null;
};

const normalizeBoolean = (value: unknown): boolean => value === true;

const normalizeNullableText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const DICE_NOTATION_RE = /^\d+d\d+(?:[+\-÷/]\d+)?$/i;

const normalizeDamageFormula = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return DICE_NOTATION_RE.test(trimmed) ? trimmed : null;
};
