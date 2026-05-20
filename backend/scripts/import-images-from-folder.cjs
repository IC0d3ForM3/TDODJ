#!/usr/bin/env node
/*
  Bulk import images from a local folder into prod S3 + images table.

  Usage:
    node scripts/import-images-from-folder.cjs --dir "C:\\path\\to\\folder" --userkey <uuid> --dry-run
    node scripts/import-images-from-folder.cjs --dir "C:\\path\\to\\folder" --userkey <uuid> --apply
*/

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.prod.env'), override: true });

function getArg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const sourceDir = getArg('--dir');
const userkey = getArg('--userkey');
const isApply = hasFlag('--apply');
const isDryRun = hasFlag('--dry-run') || !isApply;

if (!sourceDir) {
  console.error('Missing --dir');
  process.exit(1);
}

if (!userkey) {
  console.error('Missing --userkey');
  process.exit(1);
}

if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
  console.error(`Directory not found: ${sourceDir}`);
  process.exit(1);
}

const bucket = process.env.S3_USER_CONTENT_BUCKET || 'tdodj-user-content-prod';
const baseUrl = process.env.S3_USER_CONTENT_URL || 'https://tdodj-user-content-prod.s3.amazonaws.com';
const region = process.env.AWS_REGION || 'us-east-1';
const rawDbUrl = process.env.DATABASE_URL_Remote || process.env.DATABASE_URL;

if (!rawDbUrl) {
  console.error('Missing database URL');
  process.exit(1);
}

function normalizeConnectionString(raw) {
  const url = new URL(raw);
  if (url.hostname === 'db.ubbazbmjbdjpybqnindj.supabase.co') {
    url.hostname = 'aws-1-us-east-2.pooler.supabase.com';
    url.port = url.port || '5432';
    if (!url.username || url.username === 'postgres') {
      url.username = 'postgres.ubbazbmjbdjpybqnindj';
    }
  }
  return url.toString();
}

function sanitizeNamePart(input) {
  return input
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    || 'image';
}

function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function buildFileRecords(dir) {
  const allowed = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const usedKeys = new Set();
  const records = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!allowed.has(ext)) continue;

    const fullPath = path.join(dir, entry.name);
    const parsed = path.parse(entry.name);
    const dbName = sanitizeNamePart(parsed.name).replace(/-/g, ' ');
    const baseKey = sanitizeNamePart(parsed.name).toLowerCase();
    let objectName = `${baseKey}${ext}`;
    let suffix = 2;
    while (usedKeys.has(objectName)) {
      objectName = `${baseKey}-${suffix}${ext}`;
      suffix += 1;
    }
    usedKeys.add(objectName);

    records.push({
      originalName: entry.name,
      fullPath,
      dbName,
      objectName,
      mimeType: getMimeType(entry.name),
      size: fs.statSync(fullPath).size,
    });
  }

  return records.sort((a, b) => a.originalName.localeCompare(b.originalName));
}

async function uploadToS3(s3, record) {
  const key = `users/${userkey}/images/${record.objectName}`;
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fs.readFileSync(record.fullPath),
    ContentType: record.mimeType,
    CacheControl: 'public, max-age=31536000',
  }));
  return `${baseUrl}/users/${userkey}/images/${record.objectName}`;
}

(async () => {
  const records = buildFileRecords(sourceDir);
  console.log(`Mode: ${isApply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Directory: ${sourceDir}`);
  console.log(`User key: ${userkey}`);
  console.log(`Files found: ${records.length}`);
  if (records.length === 0) {
    console.log('No image files found.');
    return;
  }

  for (const record of records.slice(0, 10)) {
    console.log(` - ${record.originalName} -> ${record.objectName} (${record.dbName})`);
  }
  if (records.length > 10) {
    console.log(` ... and ${records.length - 10} more`);
  }

  if (isDryRun) {
    console.log('Dry run complete. No changes made.');
    return;
  }

  const pool = new Pool({
    connectionString: normalizeConnectionString(rawDbUrl),
    ssl: { rejectUnauthorized: false },
  });
  const s3 = new S3Client({ region });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let inserted = 0;
    let replaced = 0;
    let duplicateRowsRemoved = 0;
    for (const record of records) {
      const imageUrl = await uploadToS3(s3, record);

      const existing = await client.query(
        `SELECT id
         FROM images
         WHERE userguid = $1 AND path = $2
         ORDER BY id ASC`,
        [userkey, imageUrl]
      );

      if (existing.rowCount > 0) {
        const keepId = existing.rows[0].id;
        await client.query(
          `UPDATE images
           SET ispublic = true,
               isactive = true,
               name = $2,
               assettype = 'Other',
               updatedat = NOW()
           WHERE id = $1`,
          [keepId, record.dbName]
        );

        if (existing.rowCount > 1) {
          const deleteIds = existing.rows.slice(1).map((row) => row.id);
          const removed = await client.query(
            'DELETE FROM images WHERE id = ANY($1::int[])',
            [deleteIds]
          );
          duplicateRowsRemoved += removed.rowCount;
        }

        replaced += 1;
      } else {
        await client.query(
          `INSERT INTO images (userguid, path, ispublic, isactive, name, assettype, updatedat)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [userkey, imageUrl, true, true, record.dbName, 'Other']
        );
        inserted += 1;
      }

      const done = inserted + replaced;
      console.log(`Imported ${done}/${records.length}: ${record.originalName}`);
    }

    await client.query('COMMIT');
    console.log(`Import complete: inserted=${inserted}, replaced=${replaced}, duplicateRowsRemoved=${duplicateRowsRemoved}.`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    console.error('Import failed:', error.message || error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
