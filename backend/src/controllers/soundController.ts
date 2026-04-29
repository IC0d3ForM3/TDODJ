import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Request, Response } from 'express';
import multer from 'multer';
import { CreateSoundPayload, UpdateSoundPayload } from '../repositories/soundRepository';
import * as soundService from '../services/soundService';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SOUND_STORAGE_DIR = process.env['PUBLIC_DIR']
  ? path.join(process.env['PUBLIC_DIR'], 'sounds')
  : path.resolve(__dirname, '../../../public/sounds');

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
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    fs.mkdirSync(SOUND_STORAGE_DIR, { recursive: true });
    callback(null, SOUND_STORAGE_DIR);
  },
  filename: (_req, file, callback) => {
    const extension = normalizeFileExtension(file.originalname);
    const baseName = sanitizeFileBaseName(file.originalname);
    const randomSuffix = randomBytes(4).toString('hex');
    callback(null, `${Date.now()}-${randomSuffix}-${baseName}${extension}`);
  },
});

const upload = multer({
  storage,
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

export const uploadSoundMiddleware = upload.single('sound');

export const getSounds = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];
  const scope = req.query['scope'];
  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  try {
    const shouldIncludePublic = typeof scope === 'string' && scope.toLowerCase() === 'library';
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
    cleanupUploadedFile(req.file?.path);
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  if (!req.file) {
    return res.status(400).json({ result: -1, error: 'Sound file is required' });
  }

  const userkey = userkeyRaw.trim();
  const normalized = normalizeCreatePayload(req.body, req.file.filename);

  try {
    const isAdmin = await soundService.checkUserIsAdminByGuid(userkey);
    if (normalized.isPublic && !isAdmin) {
      cleanupUploadedFile(req.file.path);
      return res
        .status(403)
        .json({ result: -1, error: 'Only admin users can set a sound as public.' });
    }

    const payload: CreateSoundPayload = {
      ...normalized,
      isPublic: normalized.isPublic && isAdmin,
    };

    const created = await soundService.createSoundForUser(userkey, payload);
    return res.status(201).json({ result: 1, sound: created });
  } catch (error) {
    cleanupUploadedFile(req.file.path);
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

const normalizeCreatePayload = (
  body: Record<string, unknown>,
  uploadedFileName: string
): CreateSoundPayload => {
  const name = normalizeText(body['name'], defaultNameFromFile(uploadedFileName));
  return {
    name,
    path: `/sounds/${uploadedFileName}`,
    isPublic: normalizeBoolean(body['isPublic'] ?? body['ispublic']),
    isActive: normalizeBoolean(body['isActive'] ?? body['isactive'], true),
  };
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
  };
};

const cleanupUploadedFile = (filePath: string | undefined): void => {
  if (!filePath) {
    return;
  }

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn('Failed to cleanup uploaded sound file:', error);
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
