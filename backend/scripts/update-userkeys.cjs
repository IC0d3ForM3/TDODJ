'use strict';
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const parseEnv = (filePath) => {
  const vars = {};
  fs.readFileSync(filePath, 'utf8').split('\n').forEach((line) => {
    const stripped = line.replace(/\r$/, '');
    const m = stripped.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) vars[m[1].trim()] = m[2].trim();
  });
  return vars;
};

const devEnv  = parseEnv(path.join(__dirname, '..', '.env'));
const prodEnv = parseEnv(path.join(__dirname, '..', '.prod.env'));

const DEV_USERKEY  = '93074651-53ce-4b23-8031-2d6bd0d279da';
const PROD_USERKEY = 'bbd61968-4aba-4200-bb4f-53eb8eb91247';

const devPool = new Pool({ connectionString: devEnv['DATABASE_URL'] });
const prodPool = new Pool({
  connectionString: prodEnv['DATABASE_URL'],
  ssl: { rejectUnauthorized: false },
});

async function main() {
  // ── Fix sounds in prod: correct userguid + set ispublic = true ──────────
  console.log('=== Fixing prod sounds (userguid + ispublic) ===');
  const sndUpdate = await prodPool.query(
    'UPDATE sounds SET userguid = $1, ispublic = true WHERE userguid IS DISTINCT FROM $1 OR ispublic IS DISTINCT FROM true',
    [PROD_USERKEY]
  );
  console.log(`Sounds updated: ${sndUpdate.rowCount} rows`);

  // ── Get images from local DB to upsert into prod ─────────────────────────
  console.log('\n=== Fetching images from local DB ===');
  const localImgs = await devPool.query('SELECT id, path, ispublic, isactive, name, createdat, updatedat FROM images ORDER BY id');
  console.log(`Found ${localImgs.rows.length} images locally`);

  if (localImgs.rows.length > 0) {
    console.log('\n=== Upserting images into prod DB ===');
    let imgOk = 0, imgFail = 0;
    for (const img of localImgs.rows) {
      // Replace dev S3 URL with prod S3 URL
      const prodPath = (img.path || '').replace(
        'https://tdodj-user-content-dev.s3.amazonaws.com',
        'https://tdodj-user-content-prod.s3.amazonaws.com'
      ).replace(
        `/users/${DEV_USERKEY}/`,
        `/users/${PROD_USERKEY}/`
      );

      try {
        await prodPool.query(
          `INSERT INTO images (id, userguid, path, ispublic, isactive, name, createdat, updatedat)
           OVERRIDING SYSTEM VALUE
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             userguid = EXCLUDED.userguid,
             path = EXCLUDED.path,
             ispublic = EXCLUDED.ispublic,
             isactive = EXCLUDED.isactive,
             name = EXCLUDED.name,
             updatedat = EXCLUDED.updatedat`,
          [img.id, PROD_USERKEY, prodPath, true, img.isactive, img.name, img.createdat, img.updatedat]
        );
        console.log(`  OK id=${img.id} ${img.name}`);
        imgOk++;
      } catch (e) {
        console.log(`  FAIL id=${img.id} ${e.message}`);
        imgFail++;
      }
    }
    console.log(`\nImages upserted: ${imgOk}, failed: ${imgFail}`);
  }

  // ── Verify ────────────────────────────────────────────────────────────────
  console.log('\n=== PROD DB after update ===');
  const imgs2 = await prodPool.query('SELECT id, name, userguid, ispublic FROM images ORDER BY id');
  console.log(`Images (${imgs2.rows.length}):`);
  imgs2.rows.forEach(r => console.log(`  id=${r.id} ispublic=${r.ispublic} userguid=${r.userguid} name=${r.name}`));

  const snds2 = await prodPool.query('SELECT id, name, userguid, ispublic FROM sounds ORDER BY id');
  console.log(`Sounds (${snds2.rows.length}):`);
  snds2.rows.forEach(r => console.log(`  id=${r.id} ispublic=${r.ispublic} userguid=${r.userguid} name=${r.name}`));

  console.log('\nDone.');
}

main().catch(console.error).finally(() => { devPool.end(); prodPool.end(); });
