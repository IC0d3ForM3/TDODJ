#!/usr/bin/env node
const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.prod.env'), override: true });

const userkey = process.argv[2];
if (!userkey) {
  console.error('Usage: node scripts/count-images-for-user.cjs <userkey>');
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
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM images WHERE userguid = $1',
      [userkey]
    );
    console.log(JSON.stringify(rows[0]));
  } finally {
    await pool.end();
  }
})();
