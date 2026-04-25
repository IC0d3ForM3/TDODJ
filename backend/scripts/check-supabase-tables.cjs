const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const c = new Client({ connectionString: process.env.DATABASE_URLRemote, ssl: { rejectUnauthorized: false } });
c.connect()
  .then(() => c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"))
  .then(r => {
    console.log('Supabase tables (' + r.rows.length + '):');
    r.rows.forEach(row => console.log('  -', row.tablename));
    c.end();
  })
  .catch(e => { console.error(e.message); c.end(); });
