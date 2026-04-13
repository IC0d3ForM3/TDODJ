import { Request, Response } from 'express';
import { UpsertPcPayload } from '../repositories/pcRepository';
import { getUserByKey } from '../repositories/userRepository';
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
  actionEconomy?: unknown;
  actioneconomy?: unknown;
  poisonResest?: unknown;
  poisonresest?: unknown;
  magicPower?: unknown;
  magicpower?: unknown;
  mp?: unknown;
  mind?: unknown;
  stamina?: unknown;
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
  ring1ItemId?: unknown;
  ring1itemid?: unknown;
  ring2ItemId?: unknown;
  ring2itemid?: unknown;
  ring3ItemId?: unknown;
  ring3itemid?: unknown;
  ring4ItemId?: unknown;
  ring4itemid?: unknown;
  ring5ItemId?: unknown;
  ring5itemid?: unknown;
  necklaceItemId?: unknown;
  necklaceitemid?: unknown;
  hand1ItemId?: unknown;
  hand1itemid?: unknown;
  hand2ItemId?: unknown;
  hand2itemid?: unknown;
  numberOfAttacks?: unknown;
  numberofattacks?: unknown;
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

export const awardSpToPc = async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params['id'], 10);
  const { userkey, amount } = req.body as Partial<{ userkey: string; amount: number }>;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ result: -1, error: 'Valid pc id is required' });
  }

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ result: -1, error: 'Valid positive amount is required' });
  }

  try {
    const newSp = await pcService.awardSpToPc(id, userkey.trim(), amount);
    if (newSp === null) {
      return res.status(404).json({ result: -1, error: 'PC not found' });
    }

    return res.json({ result: 1, sp: newSp });
  } catch (error) {
    console.error('Error awarding SP to pc:', error);
    return res.status(500).json({ result: -1, error: 'Failed to award SP' });
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
    actionEconomy: Math.max(
      0,
      normalizeNumber(
        input.actionEconomy ?? input.actioneconomy ?? input.movementEconomy ?? input.movmentEconomy ?? input.movementEconay,
        0
      )
    ),
    poisonResest: normalizeNumber(input.poisonResest ?? input.poisonresest, 0),
    magicPower: normalizeNumber(input.magicPower ?? input.magicpower ?? input.mp, 0),
    mind: Math.max(0, normalizeNumber(input.mind, 0)),
    stamina: Math.max(0, normalizeNumber(input.stamina, 0)),
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
    ring1ItemId: normalizeNullableNumber(input.ring1ItemId ?? input.ring1itemid),
    ring2ItemId: normalizeNullableNumber(input.ring2ItemId ?? input.ring2itemid),
    ring3ItemId: normalizeNullableNumber(input.ring3ItemId ?? input.ring3itemid),
    ring4ItemId: normalizeNullableNumber(input.ring4ItemId ?? input.ring4itemid),
    ring5ItemId: normalizeNullableNumber(input.ring5ItemId ?? input.ring5itemid),
    necklaceItemId: normalizeNullableNumber(input.necklaceItemId ?? input.necklaceitemid),
    hand1ItemId: normalizeNullableNumber(input.hand1ItemId ?? input.hand1itemid),
    hand2ItemId: normalizeNullableNumber(input.hand2ItemId ?? input.hand2itemid),
    numberOfAttacks: Math.max(1, normalizeNumber(input.numberOfAttacks ?? input.numberofattacks, 1)),
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

export const getSamplePcs = async (_req: Request, res: Response) => {
  try {
    const pcs = await pcService.fetchSamplePcs();
    return res.json(pcs);
  } catch (error) {
    console.error('Error fetching sample pcs:', error);
    return res.status(500).json({ error: 'Failed to fetch sample pcs' });
  }
};

export const setSamplePc = async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params['id'], 10);
  const { userkey, issample } = req.body as Partial<{ userkey: string; issample: boolean }>;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ result: -1, error: 'Valid pc id is required' });
  }

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  if (typeof issample !== 'boolean') {
    return res.status(400).json({ result: -1, error: 'issample must be a boolean' });
  }

  const trimmedKey = userkey.trim();
  const user = await getUserByKey(trimmedKey);
  if (!user || (!user.isadmin && !user.ismasteradmin)) {
    return res.status(403).json({ result: -1, error: 'Only admins can set sample pcs' });
  }

  try {
    const wasSet = await pcService.setSamplePc(id, issample);
    if (!wasSet) {
      return res.status(404).json({ result: -1, error: 'PC not found' });
    }
    return res.json({ result: 1 });
  } catch (error) {
    console.error('Error setting sample pc:', error);
    return res.status(500).json({ result: -1, error: 'Failed to set sample pc' });
  }
};

export const getAdminPcs = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  const trimmedKey = userkey.trim();
  const user = await getUserByKey(trimmedKey);
  if (!user || (!user.isadmin && !user.ismasteradmin)) {
    return res.status(403).json({ error: 'Only admins can access this endpoint' });
  }

  try {
    const pcs = await pcService.fetchAllPcsForAdmin();
    return res.json(pcs);
  } catch (error) {
    console.error('Error fetching pcs for admin:', error);
    return res.status(500).json({ error: 'Failed to fetch pcs' });
  }
};

export const upgradeNoa = async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params['id'], 10);
  const { userkey } = req.body as Partial<{ userkey: string }>;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ result: -1, error: 'Valid pc id is required' });
  }

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  const SP_COST = 5;

  try {
    const result = await pcService.upgradeNoa(id, userkey.trim(), SP_COST);
    if (!result) {
      return res.status(400).json({ result: -1, error: 'Not enough SP or PC not found' });
    }

    return res.json({ result: 1, sp: result.sp, numberOfAttacks: result.numberOfAttacks });
  } catch (error) {
    console.error('Error upgrading NOA:', error);
    return res.status(500).json({ result: -1, error: 'Failed to upgrade NOA' });
  }
};
