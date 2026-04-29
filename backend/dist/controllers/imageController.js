"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateImage = exports.createImage = exports.getPublicImagesByIds = exports.getImages = exports.uploadImageMiddleware = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const multer_1 = __importDefault(require("multer"));
const imageService = __importStar(require("../services/imageService"));
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_STORAGE_DIR = process.env['PUBLIC_DIR']
    ? node_path_1.default.join(process.env['PUBLIC_DIR'], 'images')
    : node_path_1.default.resolve(__dirname, '../../../public/images');
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, callback) => {
        node_fs_1.default.mkdirSync(IMAGE_STORAGE_DIR, { recursive: true });
        callback(null, IMAGE_STORAGE_DIR);
    },
    filename: (_req, file, callback) => {
        const extension = normalizeFileExtension(file.originalname);
        const baseName = sanitizeFileBaseName(file.originalname);
        const randomSuffix = (0, node_crypto_1.randomBytes)(4).toString('hex');
        callback(null, `${Date.now()}-${randomSuffix}-${baseName}${extension}`);
    },
});
const upload = (0, multer_1.default)({
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
exports.uploadImageMiddleware = upload.single('image');
const getImages = async (req, res) => {
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
    }
    catch (error) {
        console.error('Error fetching images:', error);
        return res.status(500).json({ error: 'Failed to fetch images' });
    }
};
exports.getImages = getImages;
const getPublicImagesByIds = async (req, res) => {
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
    }
    catch (error) {
        console.error('Error fetching public images by ids:', error);
        return res.status(500).json({ error: 'Failed to fetch images' });
    }
};
exports.getPublicImagesByIds = getPublicImagesByIds;
const createImage = async (req, res) => {
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
        const payload = {
            ...normalized,
            isPublic: normalized.isPublic && isAdmin,
        };
        const created = await imageService.createImageForUser(userkey, payload);
        return res.status(201).json({ result: 1, image: created });
    }
    catch (error) {
        cleanupUploadedFile(req.file.path);
        console.error('Error creating image:', error);
        return res.status(500).json({ result: -1, error: 'Failed to create image' });
    }
};
exports.createImage = createImage;
const updateImage = async (req, res) => {
    const id = Number.parseInt(req.params['id'], 10);
    const { userkey, image } = req.body;
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
    }
    catch (error) {
        console.error('Error updating image:', error);
        return res.status(500).json({ result: -1, error: 'Failed to update image' });
    }
};
exports.updateImage = updateImage;
const normalizeCreatePayload = (body, uploadedFileName) => {
    const name = normalizeText(body['name'], defaultNameFromFile(uploadedFileName));
    return {
        name,
        path: `/images/${uploadedFileName}`,
        isPublic: normalizeBoolean(body['isPublic'] ?? body['ispublic']),
        isActive: normalizeBoolean(body['isActive'] ?? body['isactive'], true),
    };
};
const normalizeUpdatePayload = (value) => {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const input = value;
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
const cleanupUploadedFile = (filePath) => {
    if (!filePath) {
        return;
    }
    try {
        if (node_fs_1.default.existsSync(filePath)) {
            node_fs_1.default.unlinkSync(filePath);
        }
    }
    catch (error) {
        console.warn('Failed to cleanup uploaded image file:', error);
    }
};
const defaultNameFromFile = (fileName) => {
    const ext = node_path_1.default.extname(fileName);
    const base = fileName.slice(0, ext ? -ext.length : fileName.length);
    return base.trim() || 'Uploaded Image';
};
const normalizeText = (value, fallback) => {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    return trimmed || fallback;
};
const normalizeBoolean = (value, fallback = false) => {
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
const normalizeFileExtension = (fileName) => {
    const rawExtension = node_path_1.default.extname(fileName).toLowerCase();
    const safeExtension = rawExtension.replace(/[^.a-z0-9]/g, '');
    return safeExtension || '.img';
};
const sanitizeFileBaseName = (fileName) => {
    const rawExtension = node_path_1.default.extname(fileName);
    const rawBase = fileName.slice(0, rawExtension ? -rawExtension.length : fileName.length);
    const sanitized = rawBase
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return sanitized || 'image';
};
