/**
 * Copies all images that live in the dev S3 bucket to the prod S3 bucket,
 * rewriting the userguid in the S3 key, and then updates image paths + userguid
 * in the prod DB.
 *
 * Run AFTER restoring dev DB to prod (so all image records are already in prod DB
 * but still pointing to dev S3 URLs).
 *
 * Usage:
 *   node scripts/sync-images-dev-to-prod.cjs [--dry-run] [--limit N]
 *
 * Progress saved to sync-images-dev-to-prod-progress.json after each success.
 * Re-running skips already-synced images.
 *
 * Requires in .env / .prod.env:
 *   DATABASE_URL, AWS credentials (same IAM user needs access to both buckets)
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');
const { Pool }                                         = require('pg');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

// ── Constants ──────────────────────────────────────────────────────────────────

const DEV_BUCKET    = 'tdodj-user-content-dev';
const PROD_BUCKET   = 'tdodj-user-content-prod';
const DEV_BASE_URL  = 'https://tdodj-user-content-dev.s3.amazonaws.com';
const PROD_BASE_URL = 'https://tdodj-user-content-prod.s3.amazonaws.com';
const DEV_USERGUID  = '93074651-53ce-4b23-8031-2d6bd0d279da';
const PROD_USERGUID = 'bbd61968-4aba-4200-bb4f-53eb8eb91247';
const AWS_REGION    = 'us-east-1';

const PROGRESS_FILE = path.resolve(__dirname, 'sync-images-dev-to-prod-progress.json');

// ── CLI args ───────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

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

const PROD_DB_URL = prodEnv['DATABASE_URL'];

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

async function downloadFromS3(s3, bucket, s3Key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: s3Key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function uploadToS3(s3, bucket, s3Key, buffer, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000',
  }));
}

function getContentType(filename) {
  if (filename.endsWith('.webp')) return 'image/webp';
  if (filename.endsWith('.png'))  return 'image/png';
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Dev → Prod Image Sync ===`);
  console.log(`Dry run: ${DRY_RUN} | Limit: ${isFinite(LIMIT) ? LIMIT : 'none'}`);
  console.log(`Dev bucket: ${DEV_BUCKET}  →  Prod bucket: ${PROD_BUCKET}`);

  if (!PROD_DB_URL) {
    console.error('\nERROR: No DATABASE_URL in backend/.prod.env');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: PROD_DB_URL, ssl: { rejectUnauthorized: false } });
  const s3   = new S3Client({ region: AWS_REGION });

  // Find all images in prod DB that still point to dev bucket
  const { rows: images } = await pool.query(
    `SELECT id, name, path, userguid, assettype
     FROM images
     WHERE path LIKE $1
     ORDER BY id`,
    [`${DEV_BASE_URL}%`]
  );
  console.log(`\nImages in prod DB still pointing to dev S3: ${images.length}`);

  const progress  = loadProgress();
  const doneSet   = new Set(progress.done);
  const remaining = images.filter(i => !doneSet.has(i.id));
  const toProcess = isFinite(LIMIT) ? remaining.slice(0, LIMIT) : remaining;

  console.log(`Already done: ${progress.done.length} | Remaining: ${remaining.length} | Processing now: ${toProcess.length}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] First 5:');
    for (const img of toProcess.slice(0, 5)) {
      const devKey  = img.path.replace(`${DEV_BASE_URL}/`, '');
      const prodUrl = `${PROD_BASE_URL}/${devKey}`;
      console.log(`  id=${img.id} "${img.name}"`);
      console.log(`    dev:  ${img.path}`);
      console.log(`    prod: ${prodUrl}`);
    }
    if (toProcess.length > 5) console.log(`  ...and ${toProcess.length - 5} more`);
    await pool.end();
    return;
  }

  if (toProcess.length === 0) {
    console.log('\nNothing to do!');
    await pool.end();
    return;
  }

  let succeeded = 0, failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const img   = toProcess[i];
    const label = `[${i + 1}/${toProcess.length}]`;
    process.stdout.write(`${label} ${img.name} (id=${img.id})... `);

    try {
      // Derive S3 keys — keep same key, just swap bucket
      const devKey  = img.path.replace(`${DEV_BASE_URL}/`, '');
      const prodUrl = `${PROD_BASE_URL}/${devKey}`;

      // Download from dev S3
      const buffer = await downloadFromS3(s3, DEV_BUCKET, devKey);

      // Upload to prod S3 (same key, different bucket)
      await uploadToS3(s3, PROD_BUCKET, devKey, buffer, getContentType(img.name));

      // Update prod DB: path only (userguid stays the same — it's a valid user after restore)
      await pool.query(
        `UPDATE images SET path = $1 WHERE id = $2`,
        [prodUrl, img.id]
      );

      progress.done.push(img.id);
      saveProgress(progress);

      const kb = (buffer.length / 1024).toFixed(0);
      console.log(`✓ (${kb}kb)`);
      succeeded++;
    } catch (err) {
      const errMsg = err.message ?? String(err);
      console.log(`✗ FAILED: ${errMsg}`);
      const alreadyFailed = progress.failed.some(f => f.id === img.id);
      if (!alreadyFailed) {
        progress.failed.push({ id: img.id, name: img.name, error: errMsg });
      } else {
        const entry = progress.failed.find(f => f.id === img.id);
        if (entry) entry.error = errMsg;
      }
      saveProgress(progress);
      failed++;
    }
  }

  await pool.end();

  console.log(`\n=== Complete ===`);
  console.log(`Copied: ${succeeded} | Failed: ${failed}`);

  if (progress.failed.length > 0) {
    console.log(`\nFailed (${progress.failed.length}):`);
    for (const f of progress.failed) console.log(`  id=${f.id} "${f.name}": ${f.error}`);
    console.log('\nRe-run this script to retry failed items.');
  }
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
