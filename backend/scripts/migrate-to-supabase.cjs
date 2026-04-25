/**
 * migrate-to-supabase.cjs
 *
 * Runs all SQL migration files in numerical order against DATABASE_URL2 (Supabase).
 * Safe to re-run — every migration uses IF NOT EXISTS / IF EXISTS guards.
 *
 * Usage:
 *   node backend/scripts/migrate-to-supabase.cjs
 *
 * To run a single file:
 *   node backend/scripts/migrate-to-supabase.cjs sql/000_create_users_table.sql
 */

'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const connStr = process.env.DATABASE_URL2;
if (!connStr) {
  console.error('DATABASE_URL2 is not set in backend/.env');
  process.exit(1);
}

// ── Single-file mode ──────────────────────────────────────────────────────────
const singleFile = process.argv[2];
if (singleFile) {
  const filePath = path.resolve(backendRoot, singleFile);
  runFile(filePath).catch((err) => { console.error(err.message); process.exit(1); });
  return;
}

// ── All-files mode ────────────────────────────────────────────────────────────
const sqlDir = path.join(backendRoot, 'sql');
const files = fs
  .readdirSync(sqlDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()          // lexicographic order matches the NNN_ prefix naming
  .map((f) => path.join(sqlDir, f));

(async () => {
  let passed = 0;
  let failed = 0;

  for (const filePath of files) {
    const label = path.basename(filePath);
    try {
      await runFile(filePath);
      console.log(`  ✓  ${label}`);
      passed++;
    } catch (err) {
      console.error(`  ✗  ${label} — ${err.message}`);
      failed++;
      // Continue so you can see all failures at once
    }
  }

  console.log(`\nDone: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
})();

// ── Helper ────────────────────────────────────────────────────────────────────
async function runFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const client = new Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}
