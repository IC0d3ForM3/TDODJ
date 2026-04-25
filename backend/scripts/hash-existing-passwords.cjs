/**
 * One-time migration script: hash all plaintext passwords in the users table.
 * Run ONCE after deploying the bcrypt changes to userRepository.ts:
 *   node scripts/hash-existing-passwords.cjs
 *
 * Safe to re-run: already-hashed passwords start with '$2b$' and are skipped.
 */

const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');
const bcrypt = require('bcrypt');

const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it to backend/.env');
  process.exit(1);
}

const SALT_ROUNDS = 12;

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows } = await client.query('SELECT id, username, password FROM users');
  console.log(`Found ${rows.length} user(s).`);

  let skipped = 0;
  let updated = 0;

  for (const user of rows) {
    if (user.password && user.password.startsWith('$2b$')) {
      console.log(`  [SKIP] ${user.username} — already hashed`);
      skipped++;
      continue;
    }

    const hash = await bcrypt.hash(user.password, SALT_ROUNDS);
    await client.query('UPDATE users SET password = $1 WHERE id = $2', [hash, user.id]);
    console.log(`  [OK]   ${user.username} — hashed`);
    updated++;
  }

  await client.end();
  console.log(`\nDone. ${updated} hashed, ${skipped} skipped.`);
}

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
