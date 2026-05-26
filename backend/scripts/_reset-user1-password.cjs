'use strict';
const bcrypt = require('bcrypt');
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
const prodEnv = loadEnv(path.resolve(__dirname, '../.prod.env'));
const pool = new Pool({ connectionString: prodEnv['DATABASE_URL'], ssl: { rejectUnauthorized: false } });

async function main() {
  const plain = process.argv[2];
  if (!plain) { console.error('Usage: node _reset-user1-password.cjs <newpassword>'); process.exit(1); }
  const hash = await bcrypt.hash(plain, 12);
  const { rowCount } = await pool.query('UPDATE users SET password = $1 WHERE id = 1', [hash]);
  console.log(rowCount === 1 ? 'Password updated for user id=1' : 'User id=1 not found');
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
