const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:K%40ns%40sG0ds@localhost:5432/postgres' });
pool.query("SELECT id, name, \"dungenJson\" FROM dungons WHERE id = 9")
  .then(r => {
    const j = r.rows[0].dungenJson;
    const squares = j.squares || {};
    const fs = j.filledSquares || {};
    console.log('ID:', r.rows[0].id, 'Name:', r.rows[0].name);
    console.log('filledSquares count:', Object.keys(fs).length, Object.keys(fs));
    console.log('squares count:', Object.keys(squares).length);
    console.log('itemPlacements:', JSON.stringify(j.itemPlacements));
    console.log('potionPlacements:', JSON.stringify(j.potionPlacements));
    console.log('floorItemList:', JSON.stringify(j.floorItemList));
    console.log('ALL keys:', Object.keys(j));
    // Print all squares
    for (const k of Object.keys(squares)) {
      const sq = squares[k];
      console.log(`Square ${k}: toTop=${JSON.stringify(sq.toTop)}, toRight=${JSON.stringify(sq.toRight)}, toBottom=${JSON.stringify(sq.toBottom)}, toLeft=${JSON.stringify(sq.toLeft)}`);
    }
    pool.end();
  })
  .catch(e => { console.error(e.message); pool.end(); });
