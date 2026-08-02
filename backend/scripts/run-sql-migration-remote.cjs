/**
 * Runs a SQL migration file against the REMOTE (production) database.
 * Uses DATABASE_URL_Remote from backend/.env
 *
 * Usage:  node scripts/run-sql-migration-remote.cjs sql/091_create_subscriptions_table.sql
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const migrationArg = process.argv[2];
if (!migrationArg) {
  console.error('Usage: node scripts/run-sql-migration-remote.cjs <sql-file>');
  process.exit(1);
}

const migrationPath = path.resolve(backendRoot, migrationArg);
if (!fs.existsSync(migrationPath)) {
  console.error(`Migration file not found: ${migrationPath}`);
  process.exit(1);
}

const connStr = process.env.DATABASE_URL_Remote;
if (!connStr) {
  console.error('DATABASE_URL_Remote is not set in backend/.env');
  process.exit(1);
}

// The direct Supabase host is not publicly reachable — rewrite to the session pooler.
function toPoolerUrl(url) {
  try {
    const u = new URL(url);
    u.hostname = 'aws-1-us-east-2.pooler.supabase.com';
    u.username = 'postgres.ubbazbmjbdjpybqnindj';
    u.searchParams.set('sslmode', 'require');
    return u.toString();
  } catch (_) {
    return url;
  }
}

const poolerConnStr = toPoolerUrl(connStr);
const sql = fs.readFileSync(migrationPath, 'utf8');
const client = new Client({
  connectionString: poolerConnStr,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`[REMOTE] Migration applied successfully: ${migrationArg}`);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[REMOTE] Migration failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
