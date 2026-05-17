/**
 * Copies all image records from local DB into remote Supabase DB,
 * translating dev S3 paths → prod S3 paths.
 *
 * Run from: backend/
 *   node scripts/sync-images-to-remote-db.cjs
 */
'use strict';

const path = require('path');
const fs   = require('fs');
const { Pool } = require('pg');

// ── Env parsing (no dotenv dependency) ──────────────────────────────────────
function loadEnv(filePath) {
  const abs = path.resolve(__dirname, '..', filePath);
  const env = {};
  if (!fs.existsSync(abs)) { console.error('Missing:', abs); process.exit(1); }
  fs.readFileSync(abs, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  return env;
}

const devEnv  = loadEnv('.env');
const prodEnv = loadEnv('.prod.env');

const LOCAL_DB_URL  = devEnv['DATABASE_URL'];
const REMOTE_DB_URL = prodEnv['DATABASE_URL'];

if (!LOCAL_DB_URL)  { console.error('LOCAL_DB_URL not found in .env');      process.exit(1); }
if (!REMOTE_DB_URL) { console.error('REMOTE_DB_URL not found in .prod.env'); process.exit(1); }

// ── S3 URL translation ───────────────────────────────────────────────────────
const DEV_BASE  = 'https://tdodj-user-content-dev.s3.amazonaws.com/users/93074651-53ce-4b23-8031-2d6bd0d279da/images/';
const PROD_BASE = 'https://tdodj-user-content-prod.s3.amazonaws.com/users/bbd61968-4aba-4200-bb4f-53eb8eb91247/images/';

function toProdPath(devPath) {
  if (devPath.startsWith(DEV_BASE)) {
    return PROD_BASE + devPath.slice(DEV_BASE.length);
  }
  // Already a prod URL or a legacy /images/ path — keep as-is
  return devPath;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const localDb  = new Pool({ connectionString: LOCAL_DB_URL });
  const remoteDb = new Pool({ connectionString: REMOTE_DB_URL, ssl: { rejectUnauthorized: false } });

  const { rows } = await localDb.query('SELECT * FROM images ORDER BY id');
  console.log(`Local records: ${rows.length}`);

  let inserted = 0, updated = 0, failed = 0;

  for (const row of rows) {
    const prodPath = toProdPath(row.path);
    try {
      const result = await remoteDb.query(
        `INSERT INTO images (id, userguid, path, ispublic, isactive, name, createdat, updatedat)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
           path      = EXCLUDED.path,
           name      = EXCLUDED.name,
           ispublic  = EXCLUDED.ispublic,
           isactive  = EXCLUDED.isactive,
           updatedat = EXCLUDED.updatedat
         RETURNING (xmax = 0) AS was_inserted`,
        [row.id, row.userguid, prodPath, row.ispublic, row.isactive, row.name, row.createdat, row.updatedat]
      );
      const wasInserted = result.rows[0]?.was_inserted;
      console.log(`  ${wasInserted ? 'INSERT' : 'UPDATE'} id=${row.id} ${row.name} → ${prodPath.slice(0, 80)}`);
      wasInserted ? inserted++ : updated++;
    } catch (e) {
      console.error(`  FAIL id=${row.id} ${row.name}: ${e.message}`);
      failed++;
    }
  }

  console.log('\n── Done ──────────────────────────────────────────────────────────');
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Failed:   ${failed}`);

  await localDb.end();
  await remoteDb.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
