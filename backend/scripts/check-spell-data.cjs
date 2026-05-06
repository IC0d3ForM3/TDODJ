const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
  const res = await client.query(
    `SELECT id, name, effecttype, effectcolor, soundid, updatedat
     FROM spells
     WHERE effecttype != 'Other' OR effectcolor != '#ffffff' OR soundid IS NOT NULL
     ORDER BY updatedat DESC
     LIMIT 20`
  );
  if (res.rows.length === 0) {
    console.log('No spells with non-default effecttype/effectcolor or a soundid yet.');
  } else {
    console.log('Spells with custom effect fields:');
    res.rows.forEach(r => console.log(`  id=${r.id} name="${r.name}" effecttype="${r.effecttype}" effectcolor="${r.effectcolor}" soundid=${r.soundid} updated=${r.updatedat}`));
  }
  // Also show most recently updated spells
  const recent = await client.query(
    `SELECT id, name, effecttype, effectcolor, soundid, updatedat FROM spells ORDER BY updatedat DESC LIMIT 5`
  );
  console.log('\nMost recently updated spells:');
  recent.rows.forEach(r => console.log(`  id=${r.id} name="${r.name}" effecttype="${r.effecttype}" effectcolor="${r.effectcolor}" soundid=${r.soundid} updated=${r.updatedat}`));
  await client.end();
}).catch(e => { console.error(e.message); client.end(); });
