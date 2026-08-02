/**
 * Quick diagnostic: tests login + PC fetch against the production database.
 * Usage: node scripts/diagnose-prod-pcs.cjs <username>
 */
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

function toPoolerUrl(url) {
  try {
    const u = new URL(url);
    u.hostname = 'aws-1-us-east-2.pooler.supabase.com';
    u.username = 'postgres.ubbazbmjbdjpybqnindj';
    u.searchParams.set('sslmode', 'require');
    return u.toString();
  } catch (_) { return url; }
}

const connStr = toPoolerUrl(process.env.DATABASE_URL_Remote);
const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

async function run() {
  await client.connect();

  // 1. Check subscriptions and subscribed_users tables exist
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('subscriptions','subscribed_users','pcs','users')
    ORDER BY table_name
  `);
  console.log('Tables found:', tables.rows.map(r => r.table_name));

  // 2. Test the new login query (without password check)
  try {
    const loginTest = await client.query(`
      SELECT u.username, u.key, u.isadmin, u.ismasteradmin, u.iscreator,
        EXISTS(
          SELECT 1 FROM subscribed_users su WHERE su.user_id = u.id AND su.is_paid = true
        ) AS issubscribed
      FROM users u
      WHERE u.isactive = true
      LIMIT 3
    `);
    console.log('Login query OK — sample rows:', loginTest.rows.map(r => ({ username: r.username, issubscribed: r.issubscribed })));
  } catch (e) {
    console.error('Login query FAILED:', e.message);
  }

  // 3. Check pcs table — count and column list
  try {
    const pcCount = await client.query('SELECT COUNT(*) FROM pcs');
    console.log('PC count on prod:', pcCount.rows[0].count);

    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pcs' ORDER BY ordinal_position
    `);
    console.log('pcs columns:', cols.rows.map(r => r.column_name).join(', '));
  } catch (e) {
    console.error('PC check FAILED:', e.message);
  }

  await client.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
