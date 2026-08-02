/**
 * Clears all player-created dungeons, player characters, active games,
 * and tavern stash rows from the REMOTE (production) database.
 * Contact requests and users are NOT touched.
 * Sample dungeons (issample = true) are preserved.
 *
 * Usage: node scripts/clear-dungons-and-pcs-remote.cjs
 */
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

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

const client = new Client({
  connectionString: toPoolerUrl(connStr),
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    await client.connect();
    await client.query('BEGIN');

    // Delete in FK-safe order
    const r1 = await client.query('DELETE FROM games');
    console.log(`Deleted ${r1.rowCount} games`);

    const r2 = await client.query('DELETE FROM tavern_stash');
    console.log(`Deleted ${r2.rowCount} tavern_stash rows`);

    const r3 = await client.query('DELETE FROM pcs');
    console.log(`Deleted ${r3.rowCount} PCs`);

    // Keep sample dungeons — delete only user-created ones
    const r4 = await client.query('DELETE FROM dungons WHERE issample = false OR issample IS NULL');
    console.log(`Deleted ${r4.rowCount} dungeons (sample dungeons preserved)`);

    await client.query('COMMIT');
    console.log('Done. All dungeons (non-sample), PCs, and games cleared from production.');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('Cleanup failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
