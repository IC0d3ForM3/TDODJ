// Checks production DB (backend/.prod.env) for effecttype/effectcolor in spells table
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.prod.env') });
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
  const res = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'spells'
     ORDER BY ordinal_position`
  );
  console.log('PRODUCTION spells table columns:');
  res.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));
  await client.end();
}).catch(e => { console.error(e.message); client.end(); });
