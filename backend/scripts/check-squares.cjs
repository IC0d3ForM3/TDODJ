const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:K%40ns%40sG0ds@localhost:5432/postgres' });
pool.query("SELECT id, name, \"dungenJson\" FROM dungons WHERE name ILIKE $1 LIMIT 1", ['%test 1%'])
  .then(r => {
    const j = r.rows[0].dungenJson;
    const squares = j.squares || {};
    const keys = Object.keys(squares);
    console.log('Total squares:', keys.length);
    // Print first 5 squares to see structure
    for (const k of keys.slice(0, 5)) {
      console.log(`Square ${k}:`, JSON.stringify(squares[k]));
    }
    // Also print the filledSquares structure
    const fs = j.filledSquares || {};
    const fsKeys = Object.keys(fs);
    console.log('Total filledSquares:', fsKeys.length);
    // Check if values are true/bool or objects
    if (fsKeys.length > 0) {
      console.log('filledSquares first value type:', typeof fs[fsKeys[0]], fs[fsKeys[0]]);
    }
    pool.end();
  })
  .catch(e => { console.error(e.message); pool.end(); });
