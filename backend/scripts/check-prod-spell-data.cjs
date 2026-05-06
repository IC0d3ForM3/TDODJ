const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.prod.env') });
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
  const res = await client.query(
    `SELECT id, name, effecttype, effectcolor, soundid, updatedat
     FROM spells
     ORDER BY updatedat DESC
     LIMIT 10`
  );
  console.log('PRODUCTION DB - most recently updated spells:');
  res.rows.forEach(r => console.log(`  id=${r.id} name="${r.name}" effecttype="${r.effecttype}" effectcolor="${r.effectcolor}" soundid=${r.soundid} updated=${r.updatedat}`));
  await client.end();
}).catch(e => { console.error(e.message); client.end(); });
