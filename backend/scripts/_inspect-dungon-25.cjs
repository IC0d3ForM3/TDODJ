const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL || '' });

(async () => {
  try {
    const rowResult = await pool.query('SELECT id, name, "dungenJson" FROM dungons WHERE id = 25');
    if (!rowResult.rows.length) {
      console.log('NO_DUNGON_25');
      return;
    }
    const row = rowResult.rows[0];
    const json = row.dungenJson || {};
    console.log('NAME=', row.name);
    console.log('STARTPOINT=', JSON.stringify(json.startpoint || json.startPoint || null));
    console.log('EXITS=', JSON.stringify(json.exits || []));
    const sqKeys = json.filledSquares ? Object.keys(json.filledSquares) : [];
    console.log('FILLED_COUNT=', sqKeys.length);
    if (sqKeys.length > 0) {
      console.log('FILLED_FIRST10=', JSON.stringify(sqKeys.slice(0, 10)));
      console.log('FILLED_LAST10=', JSON.stringify(sqKeys.slice(-10)));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
