/**
 * Downloads all monster images from S3, resizes to ≤400px wide, and re-uploads in-place.
 *
 * Usage:
 *   node scripts/resize-monster-images.cjs [--target dev|prod] [--dry-run] [--limit N]
 *
 * Progress is saved to resize-monster-images-progress.json after each success.
 * Re-running skips already-processed images.
 *
 * Requires in backend/.env:
 *   DATABASE_URL=...
 *   AWS_ACCESS_KEY_ID=...
 *   AWS_SECRET_ACCESS_KEY=...  (or EC2 instance role)
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');
const { Pool }                                        = require('pg');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');

// ── Constants ──────────────────────────────────────────────────────────────────

const DEV_BUCKET    = 'tdodj-user-content-dev';
const PROD_BUCKET   = 'tdodj-user-content-prod';
const DEV_BASE_URL  = 'https://tdodj-user-content-dev.s3.amazonaws.com';
const PROD_BASE_URL = 'https://tdodj-user-content-prod.s3.amazonaws.com';
const DEV_USERGUID  = '93074651-53ce-4b23-8031-2d6bd0d279da';
const PROD_USERGUID = 'bbd61968-4aba-4200-bb4f-53eb8eb91247';
const AWS_REGION    = 'us-east-1';
const MAX_WIDTH     = 400;

const PROGRESS_FILE = path.resolve(__dirname, 'resize-monster-images-progress.json');

// ── CLI args ───────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

let targetArg = 'dev';
const targetIdx = args.indexOf('--target');
if (targetIdx !== -1 && args[targetIdx + 1]) {
  targetArg = args[targetIdx + 1];
} else {
  const inline = args.find(a => a.startsWith('--target='));
  if (inline) targetArg = inline.split('=')[1];
}
const TARGET = targetArg === 'prod' ? 'prod' : 'dev';

let LIMIT = Infinity;
const limitIdx = args.indexOf('--limit');
if (limitIdx !== -1 && args[limitIdx + 1]) {
  LIMIT = parseInt(args[limitIdx + 1], 10);
}

// ── Env loading ────────────────────────────────────────────────────────────────

function loadEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    result[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return result;
}

const localEnv = loadEnvFile(path.resolve(__dirname, '../.env'));
const prodEnv  = loadEnvFile(path.resolve(__dirname, '../.prod.env'));

const DB_URL   = TARGET === 'prod' ? prodEnv['DATABASE_URL']  : localEnv['DATABASE_URL'];
const BUCKET   = TARGET === 'prod' ? PROD_BUCKET   : DEV_BUCKET;
const BASE_URL = TARGET === 'prod' ? PROD_BASE_URL : DEV_BASE_URL;
const USERGUID = TARGET === 'prod' ? PROD_USERGUID : DEV_USERGUID;
const USE_SSL  = TARGET === 'prod';

// ── Progress helpers ───────────────────────────────────────────────────────────

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8')); } catch {}
  }
  return { done: [], failed: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf-8');
}

// ── S3 helpers ─────────────────────────────────────────────────────────────────

async function downloadFromS3(s3, s3Key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function uploadToS3(s3, s3Key, buffer) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    Body: buffer,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000',
  }));
}

// ── Resize helper ──────────────────────────────────────────────────────────────

async function resizeIfNeeded(buffer, maxWidth) {
  const meta = await sharp(buffer).metadata();
  if (meta.width <= maxWidth) return { buffer, resized: false, originalWidth: meta.width };
  const resized = await sharp(buffer)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp()
    .toBuffer();
  return { buffer: resized, resized: true, originalWidth: meta.width };
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Monster Image Resizer ===`);
  console.log(`Target: ${TARGET} | Dry run: ${DRY_RUN} | Limit: ${isFinite(LIMIT) ? LIMIT : 'none'}`);
  console.log(`Bucket: ${BUCKET} | Max width: ${MAX_WIDTH}px`);

  if (!DB_URL) {
    console.error(`\nERROR: DATABASE_URL not set for target "${TARGET}"`);
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: DB_URL,
    ...(USE_SSL ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  const s3 = new S3Client({ region: AWS_REGION });

  // Fetch all monster images
  const { rows: monsters } = await pool.query(
    `SELECT m.id, m.name, i.id as imageid, i.path as imagepath
     FROM monsters m
     JOIN images i ON i.id = m.imageid
     WHERE m.imageid IS NOT NULL AND m.imageid > 0
       AND i.name LIKE 'monster-%'
     ORDER BY m.id`
  );
  console.log(`\nMonsters with images: ${monsters.length}`);

  const progress  = loadProgress();
  const doneSet   = new Set(progress.done);
  const remaining = monsters.filter(m => !doneSet.has(m.imageid));
  const toProcess = isFinite(LIMIT) ? remaining.slice(0, LIMIT) : remaining;

  console.log(`Already done: ${progress.done.length} | Remaining: ${remaining.length} | Processing now: ${toProcess.length}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] First 5:');
    for (const m of toProcess.slice(0, 5)) {
      const s3Key = m.imagepath.replace(`${BASE_URL}/`, '');
      console.log(`  id=${m.id} "${m.name}" → ${s3Key}`);
    }
    await pool.end();
    return;
  }

  if (toProcess.length === 0) {
    console.log('\nNothing to do!');
    await pool.end();
    return;
  }

  let succeeded = 0, skipped = 0, failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const monster = toProcess[i];
    const label   = `[${i + 1}/${toProcess.length}]`;
    process.stdout.write(`${label} ${monster.name} (id=${monster.id})... `);

    try {
      const s3Key = monster.imagepath.replace(`${BASE_URL}/`, '');

      // Download
      const original = await downloadFromS3(s3, s3Key);

      // Resize
      const { buffer: resizedBuffer, resized, originalWidth } = await resizeIfNeeded(original, MAX_WIDTH);

      if (!resized) {
        console.log(`skip (already ${originalWidth}px)`);
        progress.done.push(monster.imageid);
        saveProgress(progress);
        skipped++;
        continue;
      }

      // Re-upload in-place
      await uploadToS3(s3, s3Key, resizedBuffer);

      progress.done.push(monster.imageid);
      saveProgress(progress);

      const savedKb = ((original.length - resizedBuffer.length) / 1024).toFixed(1);
      console.log(`✓ ${originalWidth}px → ${MAX_WIDTH}px (saved ${savedKb}kb)`);
      succeeded++;
    } catch (err) {
      const errMsg = err.message ?? String(err);
      console.log(`✗ FAILED: ${errMsg}`);
      const alreadyFailed = progress.failed.some(f => f.id === monster.imageid);
      if (!alreadyFailed) {
        progress.failed.push({ id: monster.imageid, name: monster.name, error: errMsg });
      } else {
        const entry = progress.failed.find(f => f.id === monster.imageid);
        if (entry) entry.error = errMsg;
      }
      saveProgress(progress);
      failed++;
    }
  }

  await pool.end();

  console.log(`\n=== Complete ===`);
  console.log(`Resized: ${succeeded} | Already small: ${skipped} | Failed: ${failed}`);

  if (progress.failed.length > 0) {
    console.log(`\nFailed (${progress.failed.length}):`);
    for (const f of progress.failed) console.log(`  id=${f.id} "${f.name}": ${f.error}`);
  }
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
