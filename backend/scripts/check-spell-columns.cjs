const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
  const res = await client.query(
    `SELECT column_name, data_type, column_default
     FROM information_schema.columns
     WHERE table_name = 'spells'
     ORDER BY ordinal_position`
  );
  console.log('spells table columns:');
  res.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type}) default=${r.column_default}`));
  await client.end();
}).catch(e => { console.error(e.message); client.end(); });
