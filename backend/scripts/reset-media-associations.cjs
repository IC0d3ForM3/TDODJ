#!/usr/bin/env node
/*
  Reset all image/sound associations and delete rows from images/sounds.
  Usage:
    node scripts/reset-media-associations.cjs --dry-run
    node scripts/reset-media-associations.cjs --apply
*/

const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.prod.env') });

const rawConnectionString = process.env.DATABASE_URL_Remote || process.env.DATABASE_URL;
if (!rawConnectionString) {
  console.error('Missing DATABASE_URL_Remote or DATABASE_URL in backend/.env');
  process.exit(1);
}

function normalizeConnectionString(raw) {
  const url = new URL(raw);

  // If direct Supabase host is provided, rewrite to pooler endpoint used by this repo.
  if (url.hostname === 'db.ubbazbmjbdjpybqnindj.supabase.co') {
    url.hostname = 'aws-1-us-east-2.pooler.supabase.com';
    url.port = url.port || '5432';
    if (!url.username || url.username === 'postgres') {
      url.username = 'postgres.ubbazbmjbdjpybqnindj';
    }
  }

  return url.toString();
}

const connectionString = normalizeConnectionString(rawConnectionString);

const isApply = process.argv.includes('--apply');
const isDryRun = process.argv.includes('--dry-run') || !isApply;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

async function getReferenceColumns(client) {
  const sql = `
    SELECT table_name, column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        column_name ILIKE '%imageid%'
        OR column_name ILIKE '%soundid%'
        OR column_name ILIKE 'image_id'
        OR column_name ILIKE 'sound_id'
      )
      AND table_name NOT IN ('images', 'sounds')
    ORDER BY table_name, column_name
  `;
  const { rows } = await client.query(sql);
  return rows;
}

async function getCounts(client) {
  const { rows } = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM images) AS images_count,
      (SELECT COUNT(*)::int FROM sounds) AS sounds_count
  `);
  return rows[0];
}

(async () => {
  const client = await pool.connect();
  try {
    const refs = await getReferenceColumns(client);
    const before = await getCounts(client);

    console.log('Mode:', isApply ? 'APPLY' : 'DRY RUN');
    console.log('Found media reference columns:', refs.length);
    for (const r of refs) {
      console.log(` - ${r.table_name}.${r.column_name} (nullable=${r.is_nullable})`);
    }
    console.log(`Before: images=${before.images_count}, sounds=${before.sounds_count}`);

    if (isDryRun) {
      console.log('Dry run complete. No changes made.');
      return;
    }

    await client.query('BEGIN');

    for (const r of refs) {
      if (String(r.is_nullable).toUpperCase() !== 'YES') {
        console.log(`Skipping non-nullable column: ${r.table_name}.${r.column_name}`);
        continue;
      }
      const updateSql = `UPDATE ${quoteIdent(r.table_name)} SET ${quoteIdent(r.column_name)} = NULL WHERE ${quoteIdent(r.column_name)} IS NOT NULL`;
      const res = await client.query(updateSql);
      console.log(`Updated ${r.table_name}.${r.column_name}: ${res.rowCount} rows`);
    }

    const delSounds = await client.query('DELETE FROM sounds');
    const delImages = await client.query('DELETE FROM images');
    console.log(`Deleted sounds rows: ${delSounds.rowCount}`);
    console.log(`Deleted images rows: ${delImages.rowCount}`);

    await client.query('COMMIT');

    const after = await getCounts(client);
    console.log(`After: images=${after.images_count}, sounds=${after.sounds_count}`);
    console.log('Reset complete.');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback errors
    }
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
