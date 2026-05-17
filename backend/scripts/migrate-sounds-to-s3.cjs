'use strict';
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// ── Load env files ───────────────────────────────────────────────────────────
const parseEnv = (filePath) => {
  const vars = {};
  fs.readFileSync(filePath, 'utf8').split('\n').forEach((line) => {
    const stripped = line.replace(/\r$/, '');
    const m = stripped.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) vars[m[1].trim()] = m[2].trim();
  });
  return vars;
};

const devEnv  = parseEnv(path.join(__dirname, '..', '.env'));
const prodEnv = parseEnv(path.join(__dirname, '..', '.prod.env'));

const DEV_USERKEY  = '93074651-53ce-4b23-8031-2d6bd0d279da';
const PROD_USERKEY = 'bbd61968-4aba-4200-bb4f-53eb8eb91247';

const DEV_BUCKET  = 'tdodj-user-content-dev';
const PROD_BUCKET = 'tdodj-user-content-prod';

const DEV_BASE_URL  = `https://${DEV_BUCKET}.s3.amazonaws.com`;
const PROD_BASE_URL = `https://${PROD_BUCKET}.s3.amazonaws.com`;

const SOUNDS_DIR = path.resolve(__dirname, '..', '..', 'public', 'sounds');

// ── S3 clients ───────────────────────────────────────────────────────────────
const s3Dev = new S3Client({
  region: devEnv['AWS_REGION'] || 'us-east-1',
  credentials: {
    accessKeyId:     devEnv['AWS_ACCESS_KEY_ID'],
    secretAccessKey: devEnv['AWS_SECRET_ACCESS_KEY'],
  },
});

const s3Prod = new S3Client({
  region: prodEnv['AWS_REGION'] || 'us-east-1',
  credentials: {
    accessKeyId:     prodEnv['AWS_ACCESS_KEY_ID'],
    secretAccessKey: prodEnv['AWS_SECRET_ACCESS_KEY'],
  },
});

// ── DB pools ─────────────────────────────────────────────────────────────────
const devPool  = new Pool({ connectionString: devEnv['DATABASE_URL'] });
const prodPool = new Pool({
  connectionString: prodEnv['DATABASE_URL'],
  ssl: { rejectUnauthorized: false },
});

// ── MIME helper ──────────────────────────────────────────────────────────────
const getMime = (fileName) => {
  const ext = path.extname(fileName).toLowerCase();
  const map = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.webm': 'audio/webm',
  };
  return map[ext] || 'audio/mpeg';
};

async function run() {
  // Get all sound files starting with "1"
  const files = fs.readdirSync(SOUNDS_DIR).filter((f) => f.startsWith('1'));
  console.log(`Found ${files.length} sound files starting with "1"`);

  // Upload to both S3 buckets
  const devKeyMap  = {}; // filename -> S3 key
  const prodKeyMap = {};

  for (const fileName of files) {
    const filePath = path.join(SOUNDS_DIR, fileName);
    const buffer   = fs.readFileSync(filePath);
    const mime     = getMime(fileName);

    const devKey  = `users/${DEV_USERKEY}/sounds/${fileName}`;
    const prodKey = `users/${PROD_USERKEY}/sounds/${fileName}`;

    devKeyMap[fileName]  = `${DEV_BASE_URL}/${devKey}`;
    prodKeyMap[fileName] = `${PROD_BASE_URL}/${prodKey}`;

    process.stdout.write(`  Uploading ${fileName} ...`);

    await s3Dev.send(new PutObjectCommand({
      Bucket: DEV_BUCKET, Key: devKey, Body: buffer,
      ContentType: mime, CacheControl: 'public, max-age=31536000',
    }));
    await s3Prod.send(new PutObjectCommand({
      Bucket: PROD_BUCKET, Key: prodKey, Body: buffer,
      ContentType: mime, CacheControl: 'public, max-age=31536000',
    }));

    console.log(' done');
  }

  // ── Update local DB ────────────────────────────────────────────────────────
  console.log('\nUpdating local DB...');
  const { rows: localRows } = await devPool.query('SELECT * FROM sounds ORDER BY id');
  let localUpdated = 0;

  for (const row of localRows) {
    const fileName = row.path.replace(/^\/sounds\//, '');
    if (!fileName.startsWith('1') || !devKeyMap[fileName]) continue;
    await devPool.query('UPDATE sounds SET path=$1 WHERE id=$2', [devKeyMap[fileName], row.id]);
    console.log(`  LOCAL  id=${row.id} ${row.name} -> ${devKeyMap[fileName]}`);
    localUpdated++;
  }
  console.log(`Local DB updated: ${localUpdated} records`);

  // ── Upsert remote DB (all sounds, with prod S3 paths for migrated files) ──
  console.log('\nUpserting remote DB...');
  const { rows: allLocal } = await devPool.query('SELECT * FROM sounds ORDER BY id');
  let remoteUpserted = 0;
  let remoteFailed   = 0;

  for (const row of allLocal) {
    // Already updated in local so row.path is the dev S3 URL for migrated rows
    let prodPath = row.path;
    if (row.path.startsWith(`${DEV_BASE_URL}/users/${DEV_USERKEY}/sounds/`)) {
      const fileName = row.path.split('/').pop();
      if (prodKeyMap[fileName]) prodPath = prodKeyMap[fileName];
    } else if (row.path.startsWith('/sounds/') && row.path.replace('/sounds/', '').startsWith('1')) {
      // Fallback: path not yet updated in local (shouldn't happen)
      const fileName = row.path.replace('/sounds/', '');
      if (prodKeyMap[fileName]) prodPath = prodKeyMap[fileName];
    }

    try {
      await prodPool.query(
        `INSERT INTO sounds (id, userguid, path, ispublic, isactive, name, createdat, updatedat)
         OVERRIDING SYSTEM VALUE
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
           path=EXCLUDED.path, name=EXCLUDED.name,
           ispublic=EXCLUDED.ispublic, isactive=EXCLUDED.isactive,
           updatedat=EXCLUDED.updatedat`,
        [row.id, row.userguid, prodPath, row.ispublic, row.isactive,
         row.name, row.createdat, row.updatedat]
      );
      console.log(`  REMOTE id=${row.id} ${row.name}`);
      remoteUpserted++;
    } catch (e) {
      console.error(`  FAIL   id=${row.id}`, e.message);
      remoteFailed++;
    }
  }
  console.log(`Remote DB upserted: ${remoteUpserted}, failed: ${remoteFailed}`);

  await devPool.end();
  await prodPool.end();
  console.log('\nAll done.');
}

run().catch((e) => { console.error(e); process.exit(1); });
