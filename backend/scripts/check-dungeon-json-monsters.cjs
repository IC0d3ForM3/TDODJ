const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../.prod.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

pool.query('SELECT id, "dungenJson" FROM dungons WHERE id = 16')
  .then(r => {
    if (!r.rows.length) { console.log('No dungeon found with id=16'); return; }
    const dungeon = r.rows[0];
    const raw = dungeon.dungenJson;
    const json = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const monsters = json.monsterList || json.monsters || [];
    console.log('Monster count:', monsters.length);
    monsters.forEach(m => {
      console.log(`  id=${m.id} name=${m.name} imageId=${m.imageId} soundId=${m.soundId} (soundId type: ${typeof m.soundId})`);
    });
    const placements = json.monsterPlacements || json.monsterPlacementList || [];
    console.log('Placement count:', placements.length);
    placements.slice(0, 3).forEach(p => {
      console.log(`  monsterId=${p.monsterId} row=${p.row} column=${p.column}`);
    });
  })
  .catch(e => console.error('Error:', e.message))
  .finally(() => pool.end());
