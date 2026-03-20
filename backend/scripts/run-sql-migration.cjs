const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const migrationArg = process.argv[2] || 'sql/001_create_dungons_table.sql';
const migrationPath = path.resolve(backendRoot, migrationArg);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it to backend/.env or set it in your shell.');
  process.exit(1);
}

if (!fs.existsSync(migrationPath)) {
  console.error(`Migration file not found: ${migrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`Migration applied successfully: ${migrationArg}`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // Ignore rollback failures and report original error below.
    }

    console.error('Migration failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
