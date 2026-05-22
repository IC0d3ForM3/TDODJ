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

const POTION_IMAGE_IDS = [40, 41, 42, 43, 690, 691, 692, 693];

const args = process.argv.slice(2);
const target = args.includes('--target') ? args[args.indexOf('--target') + 1] : 'dev';
const dryRun = args.includes('--dry-run');

if (!['dev', 'prod'].includes(target)) {
  console.error('Usage: node assign-potion-images.cjs [--target dev|prod] [--dry-run]');
  process.exit(1);
}

const envFile = target === 'prod' ? '.prod.env' : '.env';
const env = parseEnv(path.join(__dirname, '..', envFile));
const poolOpts = { connectionString: env['DATABASE_URL'] };
if (target === 'prod') poolOpts.ssl = { rejectUnauthorized: false };
const pool = new Pool(poolOpts);

async function main() {
  console.log(`Target: ${target}${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`Potion image pool: [${POTION_IMAGE_IDS.join(', ')}]`);

  const { rows: potions } = await pool.query(
    `SELECT id, name FROM potions WHERE imageid IS NULL ORDER BY id`
  );

  console.log(`\nPotions without images: ${potions.length}`);

  if (potions.length === 0) {
    console.log('Nothing to update.');
    return;
  }

  if (dryRun) {
    potions.forEach(p => {
      const img = POTION_IMAGE_IDS[Math.floor(Math.random() * POTION_IMAGE_IDS.length)];
      console.log(`  [DRY RUN] id=${p.id} "${p.name}" → imageid=${img}`);
    });
    return;
  }

  // Use PostgreSQL random assignment in a single UPDATE
  const imageArray = `ARRAY[${POTION_IMAGE_IDS.join(',')}]`;
  const result = await pool.query(
    `UPDATE potions
     SET imageid = (${imageArray})[floor(random() * ${POTION_IMAGE_IDS.length} + 1)::int],
         updatedat = NOW()
     WHERE imageid IS NULL
     RETURNING id, name, imageid`
  );

  console.log(`\nUpdated ${result.rows.length} potions:`);
  result.rows.forEach(r => console.log(`  id=${r.id} "${r.name}" → imageid=${r.imageid}`));
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); }).finally(() => pool.end());
