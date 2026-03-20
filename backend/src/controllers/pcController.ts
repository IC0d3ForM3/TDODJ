import { Request, Response } from 'express';
import { UpsertPcPayload } from '../repositories/pcRepository';
import * as imageService from '../services/imageService';
import * as pcService from '../services/pcService';
import * as tresherService from '../services/tresherService';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_SPECIES = ['Human', 'Elph', 'DwarPh', 'Shorties'] as const;
const VALID_TYPES = ['Figher', 'Mage', 'thieph', 'Healer'] as const;

type PcSpecies = (typeof VALID_SPECIES)[number];
type PcType = (typeof VALID_TYPES)[number];

interface PcWriteRequestBody {
  userkey?: unknown;
  pc?: unknown;
}

interface PcWriteInput {
  name?: unknown;
  species?: unknown;
  type?: unknown;
  imageId?: unknown;
  imageid?: unknown;
  maxHP?: unknown;
  maxhp?: unknown;
  currentHP?: unknown;
  currenthp?: unknown;
  ac?: unknown;
  movementEconomy?: unknown;
  movmentEconomy?: unknown;
  movementEconay?: unknown;
  poisonResest?: unknown;
  poisonresest?: unknown;
  magicPower?: unknown;
  magicpower?: unknown;
  mp?: unknown;
  level?: unknown;
  strenth?: unknown;
  strength?: unknown;
  rangeOfView?: unknown;
  rangeofview?: unknown;
  tresherIds?: unknown;
  tresherids?: unknown;
  trusherIds?: unknown;
  trusherids?: unknown;
  primaryTresherId?: unknown;
  primarytresherid?: unknown;
  primaryTrusherId?: unknown;
  primarytrusherid?: unknown;
  weaponTresherId?: unknown;
  weapontresherid?: unknown;
  weaponTrusherId?: unknown;
  weapontrusherid?: unknown;
  headArmorTresherId?: unknown;
  headarmortresherid?: unknown;
  bodyArmorTresherId?: unknown;
  bodyarmortresherid?: unknown;
  leftArmArmorTresherId?: unknown;
  leftarmarmortresherid?: unknown;
  rightArmArmorTresherId?: unknown;
  rightarmarmortresherid?: unknown;
  leftLegArmorTresherId?: unknown;
  leftlegarmortresherid?: unknown;
  rightLegArmorTresherId?: unknown;
  rightlegarmortresherid?: unknown;
}

export const getPcs = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];
  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  try {
    const pcs = await pcService.fetchPcsByUserGuid(userkey.trim());
    return res.json(pcs);
  } catch (error) {
    console.error('Error fetching pcs:', error);
    return res.status(500).json({ error: 'Failed to fetch pcs' });
  }
};

export const createPc = async (req: Request, res: Response) => {
  const { userkey, pc } = req.body as PcWriteRequestBody;

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  const normalizedPayload = normalizePcPayload(pc);
  if (!normalizedPayload) {
    return res.status(400).json({ result: -1, error: 'Valid pc payload is required' });
  }

  try {
    const validationError = await validatePcReferencesForUser(normalizedPayload, userkey.trim());
    if (validationError) {
      return res.status(400).json({ result: -1, error: validationError });
    }

    const created = await pcService.createPcForUser(userkey.trim(), normalizedPayload);
    return res.status(201).json({ result: 1, pc: created });
  } catch (error) {
    console.error('Error creating pc:', error);
    return res.status(500).json({ result: -1, error: 'Failed to create pc' });
  }
};

export const updatePc = async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params['id'], 10);
  const { userkey, pc } = req.body as PcWriteRequestBody;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ result: -1, error: 'Valid pc id is required' });
  }

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  const normalizedPayload = normalizePcPayload(pc);
  if (!normalizedPayload) {
    return res.status(400).json({ result: -1, error: 'Valid pc payload is required' });
  }

  try {
    const validationError = await validatePcReferencesForUser(normalizedPayload, userkey.trim());
    if (validationError) {
      return res.status(400).json({ result: -1, error: validationError });
    }

    const updated = await pcService.savePcForUser(id, userkey.trim(), normalizedPayload);
    if (!updated) {
      return res.status(404).json({ result: -1, error: 'PC not found' });
    }

    return res.json({ result: 1, pc: updated });
  } catch (error) {
    console.error('Error updating pc:', error);
    return res.status(500).json({ result: -1, error: 'Failed to update pc' });
  }
};

const normalizePcPayload = (value: unknown): UpsertPcPayload | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const input = value as PcWriteInput;
  const species = normalizeSpecies(input.species);
  const type = normalizePcType(input.type);
  if (!species || !type) {
    return null;
  }

  const maxHP = Math.max(1, normalizeNumber(input.maxHP ?? input.maxhp, 10));
  const currentHP = Math.max(
    0,
    Math.min(maxHP, normalizeNumber(input.currentHP ?? input.currenthp, maxHP))
  );

  const tresherIds = normalizeIdList(
    input.tresherIds ?? input.tresherids ?? input.trusherIds ?? input.trusherids
  );

  const rangeOfView = rangeOfViewBySpecies(species);

  return {
    name: normalizeText(input.name, 'Unnamed PC'),
    species,
    type,
    imageId: normalizeNullableNumber(input.imageId ?? input.imageid),
    maxHP,
    currentHP,
    ac: Math.max(0, normalizeNumber(input.ac, 10)),
    movementEconomy: Math.max(
      0,
      normalizeNumber(
        input.movementEconomy ?? input.movmentEconomy ?? input.movementEconay,
        0
      )
    ),
    poisonResest: normalizeNumber(input.poisonResest ?? input.poisonresest, 0),
    magicPower: normalizeNumber(input.magicPower ?? input.magicpower ?? input.mp, 0),
    level: Math.max(1, normalizeNumber(input.level, 1)),
    strength: normalizeNumber(input.strength ?? input.strenth, 0),
    rangeOfView,
    primaryTresherId: normalizeNullableNumber(
      input.primaryTresherId ??
        input.primarytresherid ??
        input.primaryTrusherId ??
        input.primarytrusherid
    ),
    weaponTresherId: normalizeNullableNumber(
      input.weaponTresherId ??
        input.weapontresherid ??
        input.weaponTrusherId ??
        input.weapontrusherid
    ),
    tresherIds,
    headArmorTresherId: normalizeNullableNumber(
      input.headArmorTresherId ?? input.headarmortresherid
    ),
    bodyArmorTresherId: normalizeNullableNumber(
      input.bodyArmorTresherId ?? input.bodyarmortresherid
    ),
    leftArmArmorTresherId: normalizeNullableNumber(
      input.leftArmArmorTresherId ?? input.leftarmarmortresherid
    ),
    rightArmArmorTresherId: normalizeNullableNumber(
      input.rightArmArmorTresherId ?? input.rightarmarmortresherid
    ),
    leftLegArmorTresherId: normalizeNullableNumber(
      input.leftLegArmorTresherId ?? input.leftlegarmortresherid
    ),
    rightLegArmorTresherId: normalizeNullableNumber(
      input.rightLegArmorTresherId ?? input.rightlegarmortresherid
    ),
  };
};

const validatePcReferencesForUser = async (
  payload: UpsertPcPayload,
  userguid: string
): Promise<string | null> => {
  if (payload.imageId !== null) {
    const canUseImage = await imageService.checkImageAccessibleByIdForUser(payload.imageId, userguid);
    if (!canUseImage) {
      return 'Selected image is not available for this user.';
    }
  }

  const uniqueTresherIds = Array.from(new Set(payload.tresherIds));
  for (const tresherId of uniqueTresherIds) {
    const canUseTresher = await tresherService.checkTresherAccessibleByIdForUser(tresherId, userguid);
    if (!canUseTresher) {
      return `Selected tresher ${tresherId} is not available for this user.`;
    }
  }

  const inventoryIds = new Set<number>(uniqueTresherIds);
  const equippedTresherRefs: Array<[string, number | null]> = [
    ['primaryTresherId', payload.primaryTresherId],
    ['weaponTresherId', payload.weaponTresherId],
    ['headArmorTresherId', payload.headArmorTresherId],
    ['bodyArmorTresherId', payload.bodyArmorTresherId],
    ['leftArmArmorTresherId', payload.leftArmArmorTresherId],
    ['rightArmArmorTresherId', payload.rightArmArmorTresherId],
    ['leftLegArmorTresherId', payload.leftLegArmorTresherId],
    ['rightLegArmorTresherId', payload.rightLegArmorTresherId],
  ];

  for (const [field, value] of equippedTresherRefs) {
    if (value !== null && !inventoryIds.has(value)) {
      return `${field} must reference a tresher selected in Treshers.`;
    }
  }

  return null;
};

const normalizeSpecies = (value: unknown): PcSpecies | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const lower = value.trim().toLowerCase();
  if (lower === 'human') {
    return 'Human';
  }

  if (lower === 'elph') {
    return 'Elph';
  }

  if (lower === 'dwarph' || lower === 'dwarph') {
    return 'DwarPh';
  }

  if (lower === 'shorties') {
    return 'Shorties';
  }

  return null;
};

const normalizePcType = (value: unknown): PcType | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const lower = value.trim().toLowerCase();
  if (lower === 'figher') {
    return 'Figher';
  }

  if (lower === 'mage') {
    return 'Mage';
  }

  if (lower === 'thieph') {
    return 'thieph';
  }

  if (lower === 'healer') {
    return 'Healer';
  }

  return null;
};

const rangeOfViewBySpecies = (species: PcSpecies): number => {
  if (species === 'Elph') {
    return 6;
  }

  if (species === 'DwarPh') {
    return 7;
  }

  return 5;
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
