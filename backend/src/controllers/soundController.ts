import path from 'node:path';
import { Request, Response } from 'express';
import multer from 'multer';
import { CreateSoundPayload, UpdateSoundPayload } from '../repositories/soundRepository';
import { isMasterAdminByGuid } from '../repositories/userRepository';
import * as soundService from '../services/soundService';
import * as s3Service from '../services/s3Service';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/ogg',
  'audio/vorbis',
  'audio/webm',
  'audio/aac',
  'audio/flac',
  'audio/x-wav',
  'audio/x-flac',
]);

interface SoundWriteRequestBody {
  userkey?: unknown;
  sound?: unknown;
}

interface SoundWriteInput {
  path?: unknown;
  name?: unknown;
  isPublic?: unknown;
  ispublic?: unknown;
  isActive?: unknown;
  isactive?: unknown;
  assettype?: unknown;
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, callback) => {
    const mime = typeof file.mimetype === 'string' ? file.mimetype.toLowerCase() : '';
    if (ALLOWED_AUDIO_MIMES.has(mime) || mime.startsWith('audio/')) {
      callback(null, true);
      return;
    }

    callback(new Error('Only audio files are allowed.'));
  },
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

const VALID_ASSET_TYPES = new Set([
  'Other', 'Curse', 'Item-Weapon', 'Item-Armor', 'Item-Pick', 'Item-Ring', 'Item-Gem',
  'Item-Other', 'Potion', 'Spell', 'Monster', 'Tresher', 'Dungon', 'PC',
]);

export const uploadSoundMiddleware = upload.single('sound');

export const getSounds = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];
  const scope = req.query['scope'];
  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  try {
    const shouldIncludePublic = typeof scope === 'string' && scope.toLowerCase() === 'library';
    if (shouldIncludePublic && await isMasterAdminByGuid(userkey.trim())) {
      return res.json(await soundService.fetchAllSoundsWithUsername());
    }
    const sounds = shouldIncludePublic
      ? await soundService.fetchSoundLibraryByUserGuid(userkey.trim())
      : await soundService.fetchSoundsByUserGuid(userkey.trim());
    return res.json(sounds);
  } catch (error) {
    console.error('Error fetching sounds:', error);
    return res.status(500).json({ error: 'Failed to fetch sounds' });
  }
};

export const createSound = async (req: Request, res: Response) => {
  const userkeyRaw = req.body?.['userkey'];
  if (typeof userkeyRaw !== 'string' || !UUID_REGEX.test(userkeyRaw.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  if (!req.file) {
    return res.status(400).json({ result: -1, error: 'Sound file is required' });
  }

  const userkey = userkeyRaw.trim();

  try {
    const isAdmin = await soundService.checkUserIsAdminByGuid(userkey);
    const isPublicRequested = normalizeBoolean(req.body['isPublic'] ?? req.body['ispublic']);

    const s3Url = await s3Service.uploadUserFile(
      userkey,
      'sounds',
      req.file.originalname,
      req.file.buffer,
      req.file.mimetype
    );

    const name = normalizeText(
      req.body['name'],
      defaultNameFromFile(req.file.originalname)
    );

    const payload: CreateSoundPayload = {
      name,
      path: s3Url,
      isPublic: isPublicRequested && isAdmin,
      isActive: normalizeBoolean(req.body['isActive'] ?? req.body['isactive'], true),
      assettype: normalizeAssetType(req.body['assettype']),
    };

    const created = await soundService.createSoundForUser(userkey, payload);
    return res.status(201).json({ result: 1, sound: created });
  } catch (error) {
    console.error('Error creating sound:', error);
    return res.status(500).json({ result: -1, error: 'Failed to create sound' });
  }
};

export const updateSound = async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params['id'], 10);
  const { userkey, sound } = req.body as SoundWriteRequestBody;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ result: -1, error: 'Valid sound id is required' });
  }

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  const normalizedPayload = normalizeUpdatePayload(sound);
  if (!normalizedPayload) {
    return res.status(400).json({ result: -1, error: 'Valid sound payload is required' });
  }

  try {
    const isAdmin = await soundService.checkUserIsAdminByGuid(userkey.trim());
    if (normalizedPayload.isPublic && !isAdmin) {
      return res
        .status(403)
        .json({ result: -1, error: 'Only admin users can set a sound as public.' });
    }

    const updated = await soundService.saveSoundForUser(id, userkey.trim(), {
      ...normalizedPayload,
      isPublic: normalizedPayload.isPublic && isAdmin,
    });

    if (!updated) {
      return res.status(404).json({ result: -1, error: 'Sound not found' });
    }

    return res.json({ result: 1, sound: updated });
  } catch (error) {
    console.error('Error updating sound:', error);
    return res.status(500).json({ result: -1, error: 'Failed to update sound' });
  }
};

const normalizeUpdatePayload = (value: unknown): UpdateSoundPayload | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const input = value as SoundWriteInput;
  const normalizedPath = normalizeText(input.path, '');
  if (!normalizedPath) {
    return null;
  }

  return {
    path: normalizedPath,
    name: normalizeText(input.name, 'Unnamed Sound'),
    isPublic: normalizeBoolean(input.isPublic ?? input.ispublic),
    isActive: normalizeBoolean(input.isActive ?? input.isactive, true),
    assettype: normalizeAssetType(input.assettype),
  };
};

export const deleteSound = async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params['id'], 10);
  const userkey = req.query['userkey'];

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ result: -1, error: 'Valid sound id is required' });
  }

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  try {
    const inUse = await soundService.isSoundInUse(id);
    if (inUse) {
      return res.status(409).json({ result: -1, error: 'Sound is in use and cannot be deleted.' });
    }

    const deleted = await soundService.removeSoundForUser(id, userkey.trim());
    if (!deleted) {
      return res.status(404).json({ result: -1, error: 'Sound not found or not owned by user.' });
    }

    return res.json({ result: 1 });
  } catch (error) {
    console.error('Error deleting sound:', error);
    return res.status(500).json({ result: -1, error: 'Failed to delete sound' });
  }
};

const defaultNameFromFile = (fileName: string): string => {
  const ext = path.extname(fileName);
  const base = fileName.slice(0, ext ? -ext.length : fileName.length);
  return base.trim() || 'Uploaded Sound';
};

const normalizeText = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
};

const normalizeBoolean = (value: unknown, fallback: boolean = false): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true') {
      return true;
    }

    if (lower === 'false') {
      return false;
    }
  }

  return fallback;
};

const normalizeAssetType = (value: unknown): string => {
  if (typeof value === 'string' && VALID_ASSET_TYPES.has(value.trim())) {
    return value.trim();
  }
  return 'Other';
};

const normalizeFileExtension = (fileName: string): string => {
  const rawExtension = path.extname(fileName).toLowerCase();
  const safeExtension = rawExtension.replace(/[^.a-z0-9]/g, '');
  return safeExtension || '.audio';
};

const sanitizeFileBaseName = (fileName: string): string => {
  const rawExtension = path.extname(fileName);
  const rawBase = fileName.slice(0, rawExtension ? -rawExtension.length : fileName.length);
  const sanitized = rawBase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || 'sound';
};
