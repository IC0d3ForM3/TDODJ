const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
  const res = await client.query(
    `SELECT id, name, userguid, effecttype, effectcolor, soundid, updatedat
     FROM spells
     ORDER BY updatedat DESC
     LIMIT 10`
  );
  console.log('Most recently updated spells (with userguid):');
  res.rows.forEach(r => console.log(`  id=${r.id} name="${r.name}" userguid=${r.userguid} effecttype="${r.effecttype}" effectcolor="${r.effectcolor}" soundid=${r.soundid}`));

  // Check if any spell update failed due to userguid mismatch by looking at all distinct userguids
  const users = await client.query(`SELECT DISTINCT userguid FROM spells`);
  console.log('\nDistinct userguids in spells table:');
  users.rows.forEach(r => console.log(`  ${r.userguid}`));
  
  await client.end();
}).catch(e => { console.error(e.message); client.end(); });
