/**
 * Reset the Master Controller password in Supabase.
 * Usage: node scripts/reset-master-password.cjs <newPassword>
 */
const { Client } = require('pg');
const bcrypt = require('bcrypt');

const newPassword = process.argv[2];
if (!newPassword) {
  console.error('Usage: node scripts/reset-master-password.cjs <newPassword>');
  process.exit(1);
}

const connStr = process.env.DATABASE_URL2;
if (!connStr) {
  console.error('DATABASE_URL2 is not set');
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: connStr });
  await client.connect();
  const hash = await bcrypt.hash(newPassword, 12);
  const r = await client.query(
    'UPDATE users SET password = $1 WHERE username = $2 RETURNING id, username, isactive',
    [hash, 'Master Controller']
  );
  if (r.rowCount === 0) {
    console.log('User not found.');
  } else {
    console.log('Password updated:', JSON.stringify(r.rows[0]));
  }
  await client.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
