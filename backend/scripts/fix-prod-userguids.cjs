'use strict';
const fs = require('fs'), path = require('path');
const { Pool } = require('pg');

const parseEnv = (f) => {
  const v = {};
  fs.readFileSync(f, 'utf8').split('\n').forEach(l => {
    const s = l.replace(/\r$/, '');
    const m = s.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) v[m[1].trim()] = m[2].trim();
  });
  return v;
};

const devEnv  = parseEnv(path.join(__dirname, '..', '.env'));
const prodEnv = parseEnv(path.join(__dirname, '..', '.prod.env'));

const DEV_USERKEY  = '93074651-53ce-4b23-8031-2d6bd0d279da';
const PROD_USERKEY = 'bbd61968-4aba-4200-bb4f-53eb8eb91247';

const devPool  = new Pool({ connectionString: devEnv['DATABASE_URL'] });
const prodPool = new Pool({ connectionString: prodEnv['DATABASE_URL'], ssl: { rejectUnauthorized: false } });

// Tables that have a userguid column
const TABLES = ['items', 'spells', 'potions', 'curses', 'monsters', 'treshers', 'images', 'sounds', 'pcs', 'dungons', 'games'];

async function main() {
  console.log('=== Prod userguid audit ===');
  for (const t of TABLES) {
    try {
      const r = await prodPool.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE userguid = $1) AS correct,
                COUNT(*) FILTER (WHERE userguid != $1 OR userguid IS NULL) AS wrong
         FROM ${t}`,
        [PROD_USERKEY]
      );
      const { total, correct, wrong } = r.rows[0];
      console.log(`${t}: total=${total} correct=${correct} wrong=${wrong}`);
    } catch (e) {
      console.log(`${t}: ERROR - ${e.message}`);
    }
  }

  console.log('\n=== Fixing all wrong userguids to prod key ===');
  for (const t of TABLES) {
    try {
      const r = await prodPool.query(
        `UPDATE ${t} SET userguid = $1 WHERE userguid IS DISTINCT FROM $1`,
        [PROD_USERKEY]
      );
      if (r.rowCount > 0) console.log(`${t}: fixed ${r.rowCount} rows`);
    } catch (e) {
      console.log(`${t}: SKIP - ${e.message}`);
    }
  }

  console.log('\nDone.');
}

main().catch(console.error).finally(() => { devPool.end(); prodPool.end(); });
