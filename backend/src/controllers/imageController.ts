import path from 'node:path';
import { Request, Response } from 'express';
import multer from 'multer';
import { CreateImagePayload, UpdateImagePayload } from '../repositories/imageRepository';
import { isMasterAdminByGuid } from '../repositories/userRepository';
import * as imageService from '../services/imageService';
import * as s3Service from '../services/s3Service';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  assettype?: unknown;
}

const upload = multer({
  storage: multer.memoryStorage(),
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

const VALID_ASSET_TYPES = new Set([
  'Other', 'Curse', 'Item-Weapon', 'Item-Armor', 'Item-Pick', 'Item-Ring', 'Item-Gem',
  'Item-Other', 'Potion', 'Spell', 'Monster', 'Tresher', 'Dungon', 'PC',
]);

export const uploadImageMiddleware = upload.single('image');

export const getImages = async (req: Request, res: Response) => {
  const userkey = req.query['userkey'];
  const scope = req.query['scope'];
  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ error: 'Valid userkey query parameter is required' });
  }

  try {
    const shouldIncludePublic = typeof scope === 'string' && scope.toLowerCase() === 'library';
    if (shouldIncludePublic && await isMasterAdminByGuid(userkey.trim())) {
      return res.json(await imageService.fetchAllImagesWithUsername());
    }
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
    const images = await imageService.fetchImagesByIds(ids);
    return res.json(images);
  } catch (error) {
    console.error('Error fetching public images by ids:', error);
    return res.status(500).json({ error: 'Failed to fetch images' });
  }
};

export const createImage = async (req: Request, res: Response) => {
  const userkeyRaw = req.body?.['userkey'];
  if (typeof userkeyRaw !== 'string' || !UUID_REGEX.test(userkeyRaw.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  if (!req.file) {
    return res.status(400).json({ result: -1, error: 'Image file is required' });
  }

  const userkey = userkeyRaw.trim();

  try {
    const isAdmin = await imageService.checkUserIsAdminByGuid(userkey);
    const isPublicRequested = normalizeBoolean(req.body['isPublic'] ?? req.body['ispublic']);

    const s3Url = await s3Service.uploadUserFile(
      userkey,
      'images',
      req.file.originalname,
      req.file.buffer,
      req.file.mimetype
    );

    const name = normalizeText(
      req.body['name'],
      defaultNameFromFile(req.file.originalname)
    );

    const payload: CreateImagePayload = {
      name,
      path: s3Url,
      isPublic: isPublicRequested && isAdmin,
      isActive: normalizeBoolean(req.body['isActive'] ?? req.body['isactive'], true),
      assettype: normalizeAssetType(req.body['assettype']),
    };

    const created = await imageService.createImageForUser(userkey, payload);
    return res.status(201).json({ result: 1, image: created });
  } catch (error) {
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
    assettype: normalizeAssetType(input.assettype),
  };
};

export const deleteImage = async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params['id'], 10);
  const userkey = req.query['userkey'];

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ result: -1, error: 'Valid image id is required' });
  }

  if (typeof userkey !== 'string' || !UUID_REGEX.test(userkey.trim())) {
    return res.status(400).json({ result: -1, error: 'Valid userkey is required' });
  }

  try {
    const inUse = await imageService.isImageInUse(id);
    if (inUse) {
      return res.status(409).json({ result: -1, error: 'Image is in use and cannot be deleted.' });
    }

    const deleted = await imageService.removeImageForUser(id, userkey.trim());
    if (!deleted) {
      return res.status(404).json({ result: -1, error: 'Image not found or not owned by user.' });
    }

    return res.json({ result: 1 });
  } catch (error) {
    console.error('Error deleting image:', error);
    return res.status(500).json({ result: -1, error: 'Failed to delete image' });
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

const normalizeAssetType = (value: unknown): string => {
  if (typeof value === 'string' && VALID_ASSET_TYPES.has(value.trim())) {
    return value.trim();
  }
  return 'Other';
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
