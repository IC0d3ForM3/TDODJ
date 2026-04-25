const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:K%40ns%40sG0ds@localhost:5432/postgres' });
pool.query("SELECT id, name FROM dungons ORDER BY id DESC LIMIT 20")
  .then(r => {
    console.log('All dungeons:');
    for (const row of r.rows) {
      console.log(`  ID ${row.id}: "${row.name}"`);
    }
    pool.end();
  })
  .catch(e => { console.error(e.message); pool.end(); });
