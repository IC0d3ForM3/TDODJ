const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:K%40ns%40sG0ds@localhost:5432/postgres' });
pool.query("SELECT id, name, \"dungenJson\" FROM dungons WHERE name ILIKE $1 LIMIT 1", ['%test 1%'])
  .then(r => {
    if (!r.rows[0]) { console.log('NOT FOUND'); pool.end(); return; }
    const row = r.rows[0];
    const j = row.dungenJson;
    console.log('ID:', row.id, 'Name:', row.name);
    console.log('itemPlacements:', JSON.stringify(j.itemPlacements));
    console.log('potionPlacements:', JSON.stringify(j.potionPlacements));
    console.log('floorItemList:', JSON.stringify(j.floorItemList));
    console.log('filledSquares keys:', Object.keys(j.filledSquares || {}));
    console.log('ALL top-level keys:', Object.keys(j));
    pool.end();
  })
  .catch(e => { console.error(e.message); pool.end(); });
