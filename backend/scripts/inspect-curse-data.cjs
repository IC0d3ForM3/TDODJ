const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

function getProdDbUrl() {
  const prodEnvPath = path.resolve(__dirname, '..', '.prod.env');
  const lines = fs.readFileSync(prodEnvPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('DATABASE_URL=')) {
      return line.slice('DATABASE_URL='.length).trim();
    }
  }
  return null;
}

async function main() {
  const dbUrl = getProdDbUrl();
  if (!dbUrl) {
    throw new Error('DATABASE_URL not found in .prod.env');
  }

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    console.log('=== CURSES (original records) ===');
    const cursesResult = await pool.query('SELECT id, name, soundid FROM curses ORDER BY id');
    console.log(JSON.stringify(cursesResult.rows, null, 2));

    console.log('\n=== CURE SPELLS (generated records) ===');
    const spellsResult = await pool.query(`
      SELECT id, name, soundid FROM spells 
      WHERE name LIKE 'Cures-%' 
      ORDER BY id
    `);
    console.log(JSON.stringify(spellsResult.rows, null, 2));

    console.log('\n=== CURE POTIONS (generated records) ===');
    const potionsResult = await pool.query(`
      SELECT id, name, soundid FROM potions 
      WHERE name LIKE 'Cures-%' 
      ORDER BY id
    `);
    console.log(JSON.stringify(potionsResult.rows, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
