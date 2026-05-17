import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const s3 = new S3Client({ region: process.env['AWS_REGION'] ?? 'us-east-1' });

const BUCKET = process.env['S3_USER_CONTENT_BUCKET'] ?? '';
const BASE_URL = (process.env['S3_USER_CONTENT_URL'] ?? '').replace(/\/$/, '');

export const uploadUserFile = async (
  userkey: string,
  folder: 'images' | 'sounds',
  originalName: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> => {
  const ext = normalizeFileExtension(originalName);
  const base = sanitizeFileBaseName(originalName);
  const suffix = randomBytes(4).toString('hex');
  const key = `users/${userkey}/${folder}/${Date.now()}-${suffix}-${base}${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: 'public, max-age=31536000',
    })
  );

  return `${BASE_URL}/${key}`;
};

export const deleteUserFile = async (fullUrl: string): Promise<void> => {
  if (!BASE_URL || !fullUrl.startsWith(BASE_URL)) {
    return;
  }

  const key = fullUrl.slice(BASE_URL.length + 1);
  if (!key) {
    return;
  }

  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
};

const normalizeFileExtension = (fileName: string): string => {
  const raw = path.extname(fileName).toLowerCase();
  const safe = raw.replace(/[^.a-z0-9]/g, '');
  return safe || '';
};

const sanitizeFileBaseName = (fileName: string): string => {
  const ext = path.extname(fileName);
  const rawBase = fileName.slice(0, ext ? -ext.length : fileName.length);
  const sanitized = rawBase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || 'file';
};
