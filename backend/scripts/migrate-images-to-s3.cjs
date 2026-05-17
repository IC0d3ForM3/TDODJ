/**
 * Migrates all public/images/1* files to S3 and updates both local and remote DB.
 *
 * Dev  bucket: tdodj-user-content-dev  → users/93074651-53ce-4b23-8031-2d6bd0d279da/images/
 * Prod bucket: tdodj-user-content-prod → users/bbd61968-4aba-4200-bb4f-53eb8eb91247/images/
 *
 * Usage: node scripts/migrate-images-to-s3.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

// ── Config ────────────────────────────────────────────────────────────────────

const DEV_BUCKET   = 'tdodj-user-content-dev';
const PROD_BUCKET  = 'tdodj-user-content-prod';
const DEV_URL      = 'https://tdodj-user-content-dev.s3.amazonaws.com';
const PROD_URL     = 'https://tdodj-user-content-prod.s3.amazonaws.com';
const DEV_USERKEY  = '93074651-53ce-4b23-8031-2d6bd0d279da';
const PROD_USERKEY = 'bbd61968-4aba-4200-bb4f-53eb8eb91247';
const AWS_REGION   = 'us-east-1';

const IMAGES_DIR = path.resolve(__dirname, '../../public/images');

// Load DB URLs from env files (dotenv-style, manual parse to avoid dotenv dep)
function loadEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    result[key] = val;
  }
  return result;
}

const localEnv = loadEnvFile(path.resolve(__dirname, '../.env'));
const prodEnv  = loadEnvFile(path.resolve(__dirname, '../.prod.env'));

const LOCAL_DB_URL  = localEnv['DATABASE_URL'];
const REMOTE_DB_URL = prodEnv['DATABASE_URL'];

// ── MIME detection ─────────────────────────────────────────────────────────────

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
                '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
  return map[ext] || 'application/octet-stream';
}

// ── S3 helpers ────────────────────────────────────────────────────────────────

// Use default credential chain (reads ~/.aws/credentials automatically)
const s3 = new S3Client({ region: AWS_REGION });

async function objectExists(bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function uploadToS3(bucket, key, buffer, mimeType) {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    CacheControl: 'public, max-age=31536000',
  }));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Collect all local files starting with '1'
  const allFiles = fs.readdirSync(IMAGES_DIR).filter(f => f.startsWith('1'));
  const fileMap = new Map(allFiles.map(f => [f, path.join(IMAGES_DIR, f)]));
  console.log(`Found ${fileMap.size} local images starting with "1"`);

  // 2. Connect to both DBs
  const localDb  = new Pool({ connectionString: LOCAL_DB_URL });
  const remoteDb = new Pool({ connectionString: REMOTE_DB_URL, ssl: { rejectUnauthorized: false } });

  // 3. Query both DBs
  const [localRows, remoteRows] = await Promise.all([
    localDb.query("SELECT id, name, path FROM images WHERE path ~ '^/images/1' ORDER BY id"),
    remoteDb.query("SELECT id, name, path FROM images WHERE path ~ '^/images/1' ORDER BY id"),
  ]);

  console.log(`Local DB: ${localRows.rows.length} records | Remote DB: ${remoteRows.rows.length} records`);

  // 4. Build update batches
  const stats = { uploaded: 0, skippedExists: 0, skippedMissing: 0, dbUpdated: 0 };

  const processRows = async (rows, bucket, baseUrl, userkey, db, label) => {
    console.log(`\n── Processing ${label} (${rows.length} records) ──`);
    for (const row of rows) {
      const filename = path.basename(row.path); // e.g. "1775329529777-22195d90-fuzpurp.jpg"
      const localFilePath = fileMap.get(filename);

      if (!localFilePath) {
        console.log(`  SKIP (no local file) id=${row.id} ${filename}`);
        stats.skippedMissing++;
        continue;
      }

      const s3Key = `users/${userkey}/images/${filename}`;
      const s3Url = `${baseUrl}/${s3Key}`;

      // Upload if not already in bucket
      const exists = await objectExists(bucket, s3Key);
      if (!exists) {
        const buffer = fs.readFileSync(localFilePath);
        const mimeType = getMimeType(filename);
        await uploadToS3(bucket, s3Key, buffer, mimeType);
        console.log(`  UPLOAD id=${row.id} ${filename}`);
        stats.uploaded++;
      } else {
        console.log(`  EXISTS id=${row.id} ${filename}`);
        stats.skippedExists++;
      }

      // Update DB record
      await db.query('UPDATE images SET path = $1 WHERE id = $2', [s3Url, row.id]);
      stats.dbUpdated++;
    }
  };

  await processRows(localRows.rows,  DEV_BUCKET,  DEV_URL,  DEV_USERKEY,  localDb,  'LOCAL  → dev  bucket');
  await processRows(remoteRows.rows, PROD_BUCKET, PROD_URL, PROD_USERKEY, remoteDb, 'REMOTE → prod bucket');

  console.log('\n── Done ──────────────────────────────────────────────────────────');
  console.log(`  Uploaded:       ${stats.uploaded}`);
  console.log(`  Already in S3:  ${stats.skippedExists}`);
  console.log(`  Missing locally:${stats.skippedMissing}`);
  console.log(`  DB rows updated:${stats.dbUpdated}`);

  await localDb.end();
  await remoteDb.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
