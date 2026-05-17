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

async function main() {
  // Check prod items
  const prodItems = await prodPool.query('SELECT id, name, userguid, ispublic FROM items ORDER BY id');
  console.log(`Prod items: ${prodItems.rows.length}`);
  prodItems.rows.forEach(r => console.log(`  id=${r.id} userguid=${r.userguid} ispublic=${r.ispublic} name=${r.name}`));

  // Check local items
  const devItems = await devPool.query('SELECT id, name, userguid, ispublic FROM items ORDER BY id');
  console.log(`\nLocal items: ${devItems.rows.length}`);

  if (prodItems.rows.length === 0 && devItems.rows.length > 0) {
    console.log('\nProd has no items — will upsert all from local.');
    const allDev = await devPool.query('SELECT * FROM items ORDER BY id');
    let ok = 0, fail = 0;
    for (const item of allDev.rows) {
      try {
        await prodPool.query(
          `INSERT INTO items (id, userguid, name, description, type, range, value, weight, curseid, effectvalue, damage, armorslot, effecton, effecttopc, effecttopcvalue, weaponeffecttype, weaponeffectcolor, imageid, soundid, ispublic, istwohanded, createdat, updatedat)
           OVERRIDING SYSTEM VALUE
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
           ON CONFLICT (id) DO UPDATE SET
             userguid=EXCLUDED.userguid, name=EXCLUDED.name, description=EXCLUDED.description,
             type=EXCLUDED.type, range=EXCLUDED.range, value=EXCLUDED.value, weight=EXCLUDED.weight,
             curseid=EXCLUDED.curseid, effectvalue=EXCLUDED.effectvalue, damage=EXCLUDED.damage,
             armorslot=EXCLUDED.armorslot, effecton=EXCLUDED.effecton, effecttopc=EXCLUDED.effecttopc,
             effecttopcvalue=EXCLUDED.effecttopcvalue, weaponeffecttype=EXCLUDED.weaponeffecttype,
             weaponeffectcolor=EXCLUDED.weaponeffectcolor, imageid=EXCLUDED.imageid, soundid=EXCLUDED.soundid,
             ispublic=EXCLUDED.ispublic, istwohanded=EXCLUDED.istwohanded, updatedat=EXCLUDED.updatedat`,
          [item.id, PROD_USERKEY, item.name, item.description, item.type, item.range, item.value,
           item.weight, item.curseid, item.effectvalue, item.damage, item.armorslot, item.effecton,
           item.effecttopc, item.effecttopcvalue, item.weaponeffecttype, item.weaponeffectcolor,
           item.imageid, item.soundid, true, item.istwohanded, item.createdat, item.updatedat]
        );
        ok++;
      } catch (e) {
        console.log(`  FAIL id=${item.id} ${item.name}: ${e.message}`);
        fail++;
      }
    }
    console.log(`\nUpserted: ${ok}, failed: ${fail}`);
  } else if (prodItems.rows.length > 0) {
    // Fix userguid + ispublic on existing prod rows
    const upd = await prodPool.query(
      'UPDATE items SET userguid=$1, ispublic=true WHERE userguid IS DISTINCT FROM $1 OR ispublic IS DISTINCT FROM true',
      [PROD_USERKEY]
    );
    console.log(`\nUpdated userguid/ispublic on ${upd.rowCount} prod rows.`);
  }

  // Verify
  const verify = await prodPool.query('SELECT id, name, userguid, ispublic FROM items WHERE id=26');
  console.log('\nItem 26:', verify.rows[0] ?? 'NOT FOUND');
}

main().catch(console.error).finally(() => { devPool.end(); prodPool.end(); });
