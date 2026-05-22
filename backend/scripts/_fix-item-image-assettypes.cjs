'use strict';
const { Pool } = require('pg');
const fs = require('fs'), path = require('path');
function loadEnv(f) {
  const r = {};
  if (!fs.existsSync(f)) return r;
  for (const l of fs.readFileSync(f, 'utf-8').split('\n')) {
    const t = l.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    r[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return r;
}
const target = process.argv.includes('--target=prod') || process.argv.slice(2).includes('prod') ? 'prod' : 'dev';
const localEnv = loadEnv(path.resolve(__dirname, '../.env'));
const prodEnv  = loadEnv(path.resolve(__dirname, '../.prod.env'));
const DB_URL = target === 'prod' ? prodEnv['DATABASE_URL'] : localEnv['DATABASE_URL'];
const USE_SSL = target === 'prod';
const pool = new Pool({ connectionString: DB_URL, ...(USE_SSL ? { ssl: { rejectUnauthorized: false } } : {}) });

async function main() {
  console.log(`Fixing item image assettypes on ${target}...`);
  const { rowCount } = await pool.query(
    `UPDATE images SET assettype = 'Item-Other' WHERE name LIKE 'item-%' AND (assettype IS NULL OR assettype = 'Other')`
  );
  console.log(`Updated ${rowCount} image records to assettype='Item-Other'`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
