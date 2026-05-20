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
    const { rows } = await pool.query(`
      SELECT 
        (SELECT count(*) FROM curses) AS total_curses,
        (SELECT count(*) FROM spells WHERE name LIKE 'Cures-%') AS cure_spells,
        (SELECT count(*) FROM potions WHERE name LIKE 'Cures-%') AS cure_potions,
        (SELECT count(*) FROM spells WHERE name LIKE 'Cures-%' AND soundid IS NOT NULL) AS cure_spells_with_sound,
        (SELECT count(*) FROM potions WHERE name LIKE 'Cures-%' AND soundid IS NOT NULL) AS cure_potions_with_sound
    `);

    console.log('Production Cure Backfill Status:');
    console.log(JSON.stringify(rows[0], null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
