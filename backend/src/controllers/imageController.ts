import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Request, Response } from 'express';
import multer from 'multer';
import { CreateImagePayload, UpdateImagePayload } from '../repositories/imageRepository';
import * as imageService from '../services/imageService';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const IMAGE_STORAGE_DIR = path.resolve(__dirname, '../../../public/images');

interface ImageWriteRequestBody {
  userkey?: unknown;
  image?: unknown;
}

interface ImageWriteInput {
  path?: unknown;
  name?: unknown;
  isPublic?: unknown;
  ispublic?: unknown;
  isActive?: unknown;
  isactive?: unknown;
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    fs.mkdirSync(IMAGE_STORAGE_DIR, { recursive: true });
    callback(null, IMAGE_STORAGE_DIR);
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
    if (typeof file.mimetype === 'string' && file.mimetype.toLowerCase().startsWith('image/')) {
      callback(null, true);
      return;
    }

    callback(new Error('Only image files are allowed.'));
  },
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

export const uploadImageMiddleware = upload.single('image');

export const getImages = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];
  const scope = req.query['scope'];
  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  try {
    const shouldIncludePublic = typeof scope === 'string' && scope.toLowerCase() === 'library';
    const images = shouldIncludePublic
      ? await imageService.fetchImageLibraryByUserGuid(userkey.trim())
      : await imageService.fetchImagesByUserGuid(userkey.trim());
    return res.json(images);
  } catch (error) {
    console.error('Error fetching images:', error);
    return res.status(500).json({ error: 'Failed to fetch images' });
  }
};

export const getPublicImagesByIds = async (req: Request, res: Response) => {
  const idsRaw = req.query['ids'];
  if (typeof idsRaw !== 'string' || !idsRaw.trim()) {
    return res.status(400).json({ error: 'ids query parameter is required' });
  }

  const ids = idsRaw
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);

  if (ids.length === 0) {
    return res.json([]);
  }

  try {
    const images = await imageService.fetchPublicImagesByIds(ids);
    return res.json(images);
  } catch (error) {
    console.error('Error fetching public images by ids:', error);
    return res.status(500).json({ error: 'Failed to fetch images' });
  }
};

export const createImage = async (req: Request, res: Response) => {
  const userkeyRaw = req.body?.['userkey'];
  if (typeof userkeyRaw !== 'string' || !UUID_REGEX.test(userkeyRaw.trim())) {
    cleanupUploadedFile(req.file?.path);
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  if (!req.file) {
    return res.status(400).json({ result: -1, error: 'Image file is required' });
  }

  const userkey = userkeyRaw.trim();
  const normalized = normalizeCreatePayload(req.body, req.file.filename);

  try {
    const isAdmin = await imageService.checkUserIsAdminByGuid(userkey);
    if (normalized.isPublic && !isAdmin) {
      cleanupUploadedFile(req.file.path);
      return res
        .status(403)
        .json({ result: -1, error: 'Only admin users can set an image as public.' });
    }

    const payload: CreateImagePayload = {
      ...normalized,
      isPublic: normalized.isPublic && isAdmin,
    };

    const created = await imageService.createImageForUser(userkey, payload);
    return res.status(201).json({ result: 1, image: created });
  } catch (error) {
    cleanupUploadedFile(req.file.path);
    console.error('Error creating image:', error);
    return res.status(500).json({ result: -1, error: 'Failed to create image' });
  }
};

export const updateImage = async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params['id'], 10);
  const { userkey, image } = req.body as ImageWriteRequestBody;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ result: -1, error: 'Valid image id is required' });
  }

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  const normalizedPayload = normalizeUpdatePayload(image);
  if (!normalizedPayload) {
    return res.status(400).json({ result: -1, error: 'Valid image payload is required' });
  }

  try {
    const isAdmin = await imageService.checkUserIsAdminByGuid(userkey.trim());
    if (normalizedPayload.isPublic && !isAdmin) {
      return res
        .status(403)
        .json({ result: -1, error: 'Only admin users can set an image as public.' });
    }

    const updated = await imageService.saveImageForUser(id, userkey.trim(), {
      ...normalizedPayload,
      isPublic: normalizedPayload.isPublic && isAdmin,
    });

    if (!updated) {
      return res.status(404).json({ result: -1, error: 'Image not found' });
    }

    return res.json({ result: 1, image: updated });
  } catch (error) {
    console.error('Error updating image:', error);
    return res.status(500).json({ result: -1, error: 'Failed to update image' });
  }
};

const normalizeCreatePayload = (
  body: Record<string, unknown>,
  uploadedFileName: string
): CreateImagePayload => {
  const name = normalizeText(body['name'], defaultNameFromFile(uploadedFileName));
  return {
    name,
    path: `/images/${uploadedFileName}`,
    isPublic: normalizeBoolean(body['isPublic'] ?? body['ispublic']),
    isActive: normalizeBoolean(body['isActive'] ?? body['isactive'], true),
  };
};

const normalizeUpdatePayload = (value: unknown): UpdateImagePayload | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const input = value as ImageWriteInput;
  const normalizedPath = normalizeText(input.path, '');
  if (!normalizedPath) {
    return null;
  }

  return {
    path: normalizedPath,
    name: normalizeText(input.name, 'Unnamed Image'),
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
    console.warn('Failed to cleanup uploaded image file:', error);
  }
};

const defaultNameFromFile = (fileName: string): string => {
  const ext = path.extname(fileName);
  const base = fileName.slice(0, ext ? -ext.length : fileName.length);
  return base.trim() || 'Uploaded Image';
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
  return safeExtension || '.img';
};

const sanitizeFileBaseName = (fileName: string): string => {
  const rawExtension = path.extname(fileName);
  const rawBase = fileName.slice(0, rawExtension ? -rawExtension.length : fileName.length);
  const sanitized = rawBase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || 'image';
};
