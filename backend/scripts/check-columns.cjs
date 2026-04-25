require('dotenv').config({ path: '.env' });
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect()
  .then(() => c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'monsters' ORDER BY ordinal_position"))
  .then(r => { console.log('monsters columns:', r.rows.map(x => x.column_name).join(', ')); return c.end(); })
  .catch(e => { console.error(e.message); c.end(); });
