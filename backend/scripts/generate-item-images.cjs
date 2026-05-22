/**
 * Generates AI images for items that have no imageid, using Stability AI Core.
 * Pipeline per item: generate webp → remove background → resize to ≤400px → upload S3 → update DB.
 *
 * Usage:
 *   node scripts/generate-item-images.cjs [--target dev|prod] [--dry-run] [--limit N]
 *
 * Costs: 3 credits (generate) + 2 credits (remove-bg) = 5 credits per item (~$0.05)
 * Progress is saved to generate-item-images-progress.json after each success.
 * Re-running the script skips already-completed items.
 *
 * Requires in backend/.env:
 *   DATABASE_URL=...
 *   STABILITY_API_KEY=...
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');
const { Pool }             = require('pg');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
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

const STABILITY_GENERATE_URL = 'https://api.stability.ai/v2beta/stable-image/generate/core';
const STABILITY_REMBG_URL    = 'https://api.stability.ai/v2beta/stable-image/edit/remove-background';

const PROGRESS_FILE = path.resolve(__dirname, 'generate-item-images-progress.json');

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

const STABILITY_API_KEY = localEnv['STABILITY_API_KEY'] || prodEnv['STABILITY_API_KEY'];
const DB_URL    = TARGET === 'prod' ? prodEnv['DATABASE_URL']  : localEnv['DATABASE_URL'];
const BUCKET    = TARGET === 'prod' ? PROD_BUCKET   : DEV_BUCKET;
const BASE_URL  = TARGET === 'prod' ? PROD_BASE_URL : DEV_BASE_URL;
const USERGUID  = TARGET === 'prod' ? PROD_USERGUID : DEV_USERGUID;
const USE_SSL   = TARGET === 'prod';

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

// ── Prompt builder ─────────────────────────────────────────────────────────────

const TYPE_LABELS = {
  weapon:      'melee weapon',
  armor:       'piece of armor',
  consumable:  'consumable item',
  potion:      'magical potion',
  key:         'key',
  tool:        'tool',
  magic:       'magical item',
  light:       'light source',
  treasure:    'treasure',
  misc:        'miscellaneous item',
};

function buildPrompt(name, type) {
  const typeLabel = TYPE_LABELS[type] || 'item';
  return (
    `a fantasy RPG ${typeLabel} called "${name}", isolated game inventory object, ` +
    `painted on a plain white background, detailed fantasy illustration, ` +
    `tabletop RPG art style, high detail, no text, no shadows, single item only`
  );
}

function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/, '');
}

// ── Stability AI helpers ───────────────────────────────────────────────────────

async function generateImage(prompt, apiKey) {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('output_format', 'webp');

  const res = await fetch(STABILITY_GENERATE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'image/*',
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Stability generate failed ${res.status}: ${text.slice(0, 200)}`);
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

async function removeBackground(imageBuffer, apiKey) {
  const form = new FormData();
  form.append('image', new Blob([imageBuffer], { type: 'image/webp' }), 'image.webp');
  form.append('output_format', 'webp');

  const res = await fetch(STABILITY_REMBG_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'image/*',
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Stability remove-bg failed ${res.status}: ${text.slice(0, 200)}`);
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

async function resizeToMaxWidth(buffer, maxWidth) {
  const metadata = await sharp(buffer).metadata();
  if (metadata.width <= maxWidth) return buffer;
  return sharp(buffer)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp()
    .toBuffer();
}

// ── S3 helper ──────────────────────────────────────────────────────────────────

async function uploadToS3(s3Client, s3Key, buffer) {
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    Body: buffer,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000',
  }));
}

// ── Delay helper ───────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Item Image Generator ===`);
  console.log(`Target: ${TARGET} | Dry run: ${DRY_RUN} | Limit: ${isFinite(LIMIT) ? LIMIT : 'none'}`);
  console.log(`Bucket: ${BUCKET} | Max width: ${MAX_WIDTH}px`);

  if (!STABILITY_API_KEY) {
    console.error('\nERROR: STABILITY_API_KEY not set in backend/.env');
    process.exit(1);
  }
  if (!DB_URL) {
    console.error(`\nERROR: DATABASE_URL not set for target "${TARGET}"`);
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: DB_URL,
    ...(USE_SSL ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  const s3 = new S3Client({ region: AWS_REGION });

  // Query items without images
  const { rows: items } = await pool.query(
    `SELECT id, name, type
     FROM items
     WHERE (imageid IS NULL OR imageid = 0)
     ORDER BY id`
  );
  console.log(`\nItems without images: ${items.length}`);

  const progress  = loadProgress();
  const doneSet   = new Set(progress.done);
  const remaining = items.filter(i => !doneSet.has(i.id));
  const toProcess = isFinite(LIMIT) ? remaining.slice(0, LIMIT) : remaining;

  console.log(`Already done: ${progress.done.length} | Remaining: ${remaining.length} | Processing now: ${toProcess.length}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] First 10 prompts:');
    for (const item of toProcess.slice(0, 10)) {
      console.log(`  id=${item.id} "${item.name}" (${item.type || 'no type'}) →`);
      console.log(`    "${buildPrompt(item.name, item.type)}"`);
    }
    if (toProcess.length > 10) console.log(`  ... and ${toProcess.length - 10} more`);
    await pool.end();
    return;
  }

  if (toProcess.length === 0) {
    console.log('\nNothing to do!');
    await pool.end();
    return;
  }

  let succeeded = 0;
  let failed    = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const item  = toProcess[i];
    const label = `[${i + 1}/${toProcess.length}]`;
    process.stdout.write(`${label} ${item.name} (id=${item.id}, type=${item.type || '?'})... `);

    try {
      const prompt = buildPrompt(item.name, item.type);

      // 1. Generate
      const rawWebp = await generateImage(prompt, STABILITY_API_KEY);
      await sleep(500);

      // 2. Remove background
      const transparentWebp = await removeBackground(rawWebp, STABILITY_API_KEY);

      // 3. Resize to max 400px wide
      const finalBuffer = await resizeToMaxWidth(transparentWebp, MAX_WIDTH);

      // 4. Upload to S3
      const slug     = toSlug(item.name);
      const filename = `item-${item.id}-${slug}.webp`;
      const s3Key    = `users/${USERGUID}/images/${filename}`;
      await uploadToS3(s3, s3Key, finalBuffer);
      const s3Path   = `${BASE_URL}/${s3Key}`;

      // 5. Insert into images table
      const { rows: imgRows } = await pool.query(
        `INSERT INTO images (name, path, userguid, ispublic, assettype)
         VALUES ($1, $2, $3, true, 'Item-Other')
         RETURNING id`,
        [filename, s3Path, USERGUID]
      );
      const imageId = imgRows[0].id;

      // 6. Update item
      await pool.query(
        'UPDATE items SET imageid = $1 WHERE id = $2',
        [imageId, item.id]
      );

      // 7. Record success
      progress.done.push(item.id);
      saveProgress(progress);

      console.log(`✓ imageId=${imageId}`);
      succeeded++;
    } catch (err) {
      const errMsg = err.message ?? String(err);
      console.log(`✗ FAILED: ${errMsg}`);

      const alreadyFailed = progress.failed.some(f => f.id === item.id);
      if (!alreadyFailed) {
        progress.failed.push({ id: item.id, name: item.name, error: errMsg });
      } else {
        const entry = progress.failed.find(f => f.id === item.id);
        if (entry) entry.error = errMsg;
      }
      saveProgress(progress);
      failed++;
    }

    // Rate limit: 1 second between items
    if (i < toProcess.length - 1) {
      await sleep(1000);
    }
  }

  await pool.end();

  console.log(`\n=== Complete ===`);
  console.log(`Succeeded: ${succeeded} | Failed: ${failed}`);

  if (progress.failed.length > 0) {
    console.log(`\nFailed items (${progress.failed.length} total):`);
    for (const f of progress.failed) {
      console.log(`  id=${f.id} "${f.name}": ${f.error}`);
    }
    console.log(`\nTo retry: re-run the script — failed items will be attempted again.`);
  }
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
