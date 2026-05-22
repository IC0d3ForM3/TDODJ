/**
 * Generates AI images for monsters that have no imageid, using Stability AI Core.
 * Pipeline per monster: generate PNG → remove background → upload S3 → update DB.
 *
 * Usage:
 *   node scripts/generate-monster-images.cjs [--target dev|prod] [--dry-run] [--limit N]
 *
 * Costs: 3 credits (generate) + 2 credits (remove-bg) = 5 credits per monster (~$0.05)
 * Progress is saved to generate-monster-images-progress.json after each success.
 * Re-running the script skips already-completed monsters.
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

// ── Constants ──────────────────────────────────────────────────────────────────

const DEV_BUCKET    = 'tdodj-user-content-dev';
const PROD_BUCKET   = 'tdodj-user-content-prod';
const DEV_BASE_URL  = 'https://tdodj-user-content-dev.s3.amazonaws.com';
const PROD_BASE_URL = 'https://tdodj-user-content-prod.s3.amazonaws.com';
const DEV_USERGUID  = '93074651-53ce-4b23-8031-2d6bd0d279da';
const PROD_USERGUID = 'bbd61968-4aba-4200-bb4f-53eb8eb91247';
const AWS_REGION    = 'us-east-1';

const STABILITY_GENERATE_URL = 'https://api.stability.ai/v2beta/stable-image/generate/core';
const STABILITY_REMBG_URL    = 'https://api.stability.ai/v2beta/stable-image/edit/remove-background';

const PROGRESS_FILE = path.resolve(__dirname, 'generate-monster-images-progress.json');

// ── CLI args ───────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// --target dev|prod  or  --target=dev
let targetArg = 'dev';
const targetIdx = args.indexOf('--target');
if (targetIdx !== -1 && args[targetIdx + 1]) {
  targetArg = args[targetIdx + 1];
} else {
  const inline = args.find(a => a.startsWith('--target='));
  if (inline) targetArg = inline.split('=')[1];
}
const TARGET = targetArg === 'prod' ? 'prod' : 'dev';

// --limit N
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

function buildPrompt(name, description) {
  const desc = description ? description.trim() : '';
  const base = desc
    ? `fantasy RPG portrait of a ${name}, ${desc}`
    : `fantasy RPG portrait of a ${name} monster`;
  return `${base}, dark dungeon atmosphere, detailed digital illustration, tabletop game art style, dramatic lighting, no background text`;
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

async function removeBackground(pngBuffer, apiKey) {
  const form = new FormData();
  form.append('image', new Blob([pngBuffer], { type: 'image/webp' }), 'image.webp');
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
  console.log(`\n=== Monster Image Generator ===`);
  console.log(`Target: ${TARGET} | Dry run: ${DRY_RUN} | Limit: ${isFinite(LIMIT) ? LIMIT : 'none'}`);
  console.log(`Bucket: ${BUCKET}`);

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

  // Query monsters without images
  const { rows: monsters } = await pool.query(
    `SELECT id, name, description
     FROM monsters
     WHERE imageid IS NULL OR imageid = 0
     ORDER BY id`
  );
  console.log(`\nMonsters without images: ${monsters.length}`);

  const progress  = loadProgress();
  const doneSet   = new Set(progress.done);
  const remaining = monsters.filter(m => !doneSet.has(m.id));
  const toProcess = isFinite(LIMIT) ? remaining.slice(0, LIMIT) : remaining;

  console.log(`Already done: ${progress.done.length} | Remaining: ${remaining.length} | Processing now: ${toProcess.length}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] First 5 prompts:');
    for (const m of toProcess.slice(0, 5)) {
      console.log(`  id=${m.id} "${m.name}" →`);
      console.log(`    "${buildPrompt(m.name, m.description)}"`);
    }
    if (toProcess.length > 5) console.log(`  ... and ${toProcess.length - 5} more`);
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
    const monster = toProcess[i];
    const label   = `[${i + 1}/${toProcess.length}]`;
    process.stdout.write(`${label} ${monster.name} (id=${monster.id})... `);

    try {
      const prompt = buildPrompt(monster.name, monster.description);

      // 1. Generate raw PNG
      const rawPng = await generateImage(prompt, STABILITY_API_KEY);
      await sleep(500); // brief pause between the two API calls

      // 2. Remove background → transparent PNG
      const transparentPng = await removeBackground(rawPng, STABILITY_API_KEY);

      // 3. Upload to S3
      const slug     = toSlug(monster.name);
      const filename = `monster-${monster.id}-${slug}.webp`;
      const s3Key    = `users/${USERGUID}/images/${filename}`;
      await uploadToS3(s3, s3Key, transparentPng);
      const s3Path   = `${BASE_URL}/${s3Key}`;

      // 4. Insert into images table
      const { rows: imgRows } = await pool.query(
        `INSERT INTO images (name, path, userguid, ispublic)
         VALUES ($1, $2, $3, true)
         RETURNING id`,
        [filename, s3Path, USERGUID]
      );
      const imageId = imgRows[0].id;

      // 5. Update monster
      await pool.query(
        'UPDATE monsters SET imageid = $1 WHERE id = $2',
        [imageId, monster.id]
      );

      // 6. Record success
      progress.done.push(monster.id);
      saveProgress(progress);

      console.log(`✓ imageId=${imageId}`);
      succeeded++;
    } catch (err) {
      const errMsg = err.message ?? String(err);
      console.log(`✗ FAILED: ${errMsg}`);

      // Record failure (don't re-add if already in failed list)
      const alreadyFailed = progress.failed.some(f => f.id === monster.id);
      if (!alreadyFailed) {
        progress.failed.push({ id: monster.id, name: monster.name, error: errMsg });
      } else {
        const entry = progress.failed.find(f => f.id === monster.id);
        if (entry) entry.error = errMsg;
      }
      saveProgress(progress);
      failed++;
    }

    // Rate limit: 1 second between monsters (well under Stability's 150 req/10s)
    if (i < toProcess.length - 1) {
      await sleep(1000);
    }
  }

  await pool.end();

  console.log(`\n=== Complete ===`);
  console.log(`Succeeded: ${succeeded} | Failed: ${failed}`);

  if (progress.failed.length > 0) {
    console.log(`\nFailed monsters (${progress.failed.length} total):`);
    for (const f of progress.failed) {
      console.log(`  id=${f.id} "${f.name}": ${f.error}`);
    }
    console.log(`\nTo retry failed monsters, edit ${PROGRESS_FILE} and remove their IDs from the "done" list (they are NOT in done — just re-run and they'll be attempted again).`);
  }
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
