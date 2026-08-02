const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function toPoolerUrl(url) {
  try {
    const u = new URL(url);
    u.hostname = 'aws-1-us-east-2.pooler.supabase.com';
    u.username = 'postgres.ubbazbmjbdjpybqnindj';
    u.searchParams.set('sslmode', 'require');
    return u.toString();
  } catch (_) { return url; }
}

const client = new Client({ connectionString: toPoolerUrl(process.env.DATABASE_URL_Remote), ssl: { rejectUnauthorized: false } });

async function cols(table) {
  const r = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [table]);
  return r.rows.map(x => x.column_name);
}

async function run() {
  await client.connect();
  const pcs = await cols('pcs');
  console.log('pcs:', pcs.join(', '));
  const monsters = await cols('monsters');
  console.log('monsters:', monsters.join(', '));
  const items = await cols('items');
  console.log('items:', items.join(', '));
  await client.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
