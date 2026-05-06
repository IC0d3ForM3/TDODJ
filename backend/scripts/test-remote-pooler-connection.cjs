const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const raw = process.env.DATABASE_URL_Remote || process.env.DATABASE_URLRemote;
if (!raw) {
  console.error('Missing DATABASE_URL_Remote in backend/.env');
  process.exit(1);
}

const parsed = new URL(raw);
const username = 'postgres.ubbazbmjbdjpybqnindj';
const host = 'aws-1-us-east-2.pooler.supabase.com';

async function testPort(port) {
  const url = new URL(raw);
  url.username = username;
  url.hostname = host;
  url.port = String(port);

  const client = new Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
  });

  console.log(`TRY ${port} user=${url.username} host=${url.hostname}`);

  try {
    await client.connect();
    const result = await client.query('select current_database() as db, current_user as usr');
    console.log(`CONNECTED ${port}`, result.rows[0]);
    return true;
  } catch (error) {
    console.log(`FAILED ${port}`, error.message || error);
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  const ok5432 = await testPort(5432);
  const ok6543 = await testPort(6543);
  if (!ok5432 && !ok6543) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Connection test failed:', error.message || error);
  process.exit(1);
});
