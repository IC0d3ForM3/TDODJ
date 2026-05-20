#!/usr/bin/env node
const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.prod.env'), override: true });

const userkey = process.argv[2];
if (!userkey) {
  console.error('Usage: node scripts/dedupe-images-for-user.cjs <userkey>');
  process.exit(1);
}

function normalizeConnectionString(raw) {
  const url = new URL(raw);
  if (url.hostname === 'db.ubbazbmjbdjpybqnindj.supabase.co') {
    url.hostname = 'aws-1-us-east-2.pooler.supabase.com';
    url.port = url.port || '5432';
    if (!url.username || url.username === 'postgres') {
      url.username = 'postgres.ubbazbmjbdjpybqnindj';
    }
  }
  return url.toString();
}

(async () => {
  const pool = new Pool({
    connectionString: normalizeConnectionString(process.env.DATABASE_URL_Remote || process.env.DATABASE_URL),
    ssl: { rejectUnauthorized: false },
  });

  try {
    const before = await pool.query('SELECT COUNT(*)::int AS count FROM images WHERE userguid = $1', [userkey]);
    const dupes = await pool.query(
      `SELECT path, COUNT(*)::int AS count, ARRAY_AGG(id ORDER BY id) AS ids
       FROM images
       WHERE userguid = $1
       GROUP BY path
       HAVING COUNT(*) > 1
       ORDER BY path`,
      [userkey]
    );

    console.log(`Before count: ${before.rows[0].count}`);
    console.log(`Duplicate paths: ${dupes.rows.length}`);

    if (dupes.rows.length === 0) {
      console.log('No duplicates found.');
      return;
    }

    const idsToDelete = [];
    for (const row of dupes.rows) {
      const ids = row.ids.map(Number);
      const keepId = ids[0];
      const deleteIds = ids.slice(1);
      console.log(`Keep ${keepId}, delete ${deleteIds.join(', ')} for ${row.path}`);
      idsToDelete.push(...deleteIds);
    }

    const result = await pool.query('DELETE FROM images WHERE id = ANY($1::int[])', [idsToDelete]);
    const after = await pool.query('SELECT COUNT(*)::int AS count FROM images WHERE userguid = $1', [userkey]);
    console.log(`Deleted rows: ${result.rowCount}`);
    console.log(`After count: ${after.rows[0].count}`);
  } finally {
    await pool.end();
  }
})();
