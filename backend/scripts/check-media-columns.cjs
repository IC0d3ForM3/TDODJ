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
    const { rows } = await pool.query(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('images', 'sounds')
         AND column_name = 'assettype'
       ORDER BY table_name`
    );

    if (rows.length === 0) {
      console.log('assettype missing on both images and sounds');
      return;
    }

    for (const row of rows) {
      console.log(`${row.table_name}.assettype present`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
