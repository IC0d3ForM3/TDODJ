"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUserFile = exports.uploadUserFile = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const s3 = new client_s3_1.S3Client({ region: process.env['AWS_REGION'] ?? 'us-east-1' });
const BUCKET = process.env['S3_USER_CONTENT_BUCKET'] ?? '';
const BASE_URL = (process.env['S3_USER_CONTENT_URL'] ?? '').replace(/\/$/, '');
const uploadUserFile = async (userkey, folder, originalName, buffer, mimeType) => {
    const ext = normalizeFileExtension(originalName);
    const base = sanitizeFileBaseName(originalName);
    const suffix = (0, node_crypto_1.randomBytes)(4).toString('hex');
    const key = `users/${userkey}/${folder}/${Date.now()}-${suffix}-${base}${ext}`;
    await s3.send(new client_s3_1.PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        CacheControl: 'public, max-age=31536000',
    }));
    return `${BASE_URL}/${key}`;
};
exports.uploadUserFile = uploadUserFile;
const deleteUserFile = async (fullUrl) => {
    if (!BASE_URL || !fullUrl.startsWith(BASE_URL)) {
        return;
    }
    const key = fullUrl.slice(BASE_URL.length + 1);
    if (!key) {
        return;
    }
    await s3.send(new client_s3_1.DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
};
exports.deleteUserFile = deleteUserFile;
const normalizeFileExtension = (fileName) => {
    const raw = node_path_1.default.extname(fileName).toLowerCase();
    const safe = raw.replace(/[^.a-z0-9]/g, '');
    return safe || '';
};
const sanitizeFileBaseName = (fileName) => {
    const ext = node_path_1.default.extname(fileName);
    const rawBase = fileName.slice(0, ext ? -ext.length : fileName.length);
    const sanitized = rawBase
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return sanitized || 'file';
};
