const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL });

client.connect().then(async () => {
  const r = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_name IN ('subscriptions','subscribed_users') ORDER BY table_name"
  );
  console.log('Tables found:', r.rows.map(x => x.table_name));

  const s = await client.query('SELECT * FROM subscriptions ORDER BY id');
  console.log('subscriptions rows:', s.rows);

  await client.end();
}).catch(e => {
  console.error(e.message);
  process.exit(1);
});
