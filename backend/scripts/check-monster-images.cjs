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

const prodEnv = parseEnv(path.join(__dirname, '..', '.prod.env'));
const pool = new Pool({ connectionString: prodEnv['DATABASE_URL'], ssl: { rejectUnauthorized: false } });

async function main() {
  // Check monster image IDs and whether matching image rows exist
  const r = await pool.query(`
    SELECT m.id AS monster_id, m.name AS monster_name, m.imageid,
           i.id AS img_id, i.path AS img_path, i.ispublic
    FROM monsters m
    LEFT JOIN images i ON i.id = m.imageid
    ORDER BY m.id
  `);
  console.log('=== Monster → Image mapping ===');
  r.rows.forEach(row => console.log(JSON.stringify(row)));

  // Also check what the dungeon JSON monsterList looks like (first sample dungeon)
  const d = await pool.query(`SELECT id, name, "dungenJson" AS dungenjson FROM dungons WHERE issample = true LIMIT 1`);
  if (d.rows.length === 0) {
    console.log('\nNo sample dungeon found');
    return;
  }
  const dungon = d.rows[0];
  console.log(`\nSample dungeon: id=${dungon.id} name=${dungon.name}`);
  try {
    console.log('Raw dungonjson type:', typeof dungon.dungenjson);
    console.log('Raw dungonjson (first 200 chars):', String(dungon.dungenjson ?? '').slice(0, 200));
    const json = typeof dungon.dungenjson === 'string' ? JSON.parse(dungon.dungenjson) : dungon.dungenjson;
    const monsters = json?.monsterList ?? json?.monsters ?? [];
    console.log('Top-level keys:', Object.keys(json ?? {}).join(', '));
    console.log(`Monster list length: ${monsters.length}`);
    monsters.forEach(m => console.log(`  Monster id=${m.id} name=${m.name} imageId=${m.imageId}`));
  } catch (e) {
    console.log('Failed to parse dungeon JSON:', e.message);
  }
}

main().catch(console.error).finally(() => pool.end());
