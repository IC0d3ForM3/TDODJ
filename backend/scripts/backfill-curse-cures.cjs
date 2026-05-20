const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const CURSE_CURE_SPELL_RANGE = 5;

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

function buildCureName(curseName) {
  const trimmed = String(curseName || '').trim();
  return `Cures-${trimmed || 'Unnamed Curse'}`;
}

async function ensureCurseCureEntries(client, curse) {
  const cureName = buildCureName(curse.name);
  const cureDescription = `Removes the effects of ${curse.name || 'a curse'}.`;

  const spellExists = await client.query(
    `SELECT id FROM spells WHERE userguid = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
    [curse.userguid, cureName]
  );

  let createdSpell = false;
  if (spellExists.rowCount === 0) {
    await client.query(
      `INSERT INTO spells
         (userguid, name, description, range, effecton, effecton2, lastfor, damage,
         effectamount2, value, sp, successtestvalue, magiccost, costtolearn,
          imageid, soundid, ispublic, numberoftargets, effecttype, effectcolor,
          effectonpc1, effectonpc2, range1, range2, lastfor1, lastfor2)
       VALUES
         ($1, $2, $3, $4, 'Remove Curse', '', 0, 0,
         0, 0, 0, 0, 1, 0,
          $5, $6, $7, 1, 'Other', '#ffffff',
          FALSE, FALSE, $4, $4, 0, 0)`,
      [
        curse.userguid,
        cureName,
        cureDescription,
        CURSE_CURE_SPELL_RANGE,
        curse.imageid,
        curse.soundid,
        curse.ispublic === true,
      ]
    );
    createdSpell = true;
  }

  const potionExists = await client.query(
    `SELECT id FROM potions WHERE userguid = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
    [curse.userguid, cureName]
  );

  let createdPotion = false;
  if (potionExists.rowCount === 0) {
    await client.query(
      `INSERT INTO potions
         (userguid, name, description, effectto, effectto2, effecttime, effectnumber,
          effectamount2, value, imageid, soundid, ispublic)
       VALUES
         ($1, $2, $3, 'Remove Curse', NULL, 0, 0,
          0, 0, $4, $5, $6)`,
      [
        curse.userguid,
        cureName,
        cureDescription,
        curse.imageid,
        curse.soundid,
        curse.ispublic === true,
      ]
    );
    createdPotion = true;
  }

  return { createdSpell, createdPotion, cureName };
}

async function main() {
  const dbUrl = getProdDbUrl();
  if (!dbUrl) {
    throw new Error('DATABASE_URL not found in .prod.env');
  }

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: curses } = await client.query(
      `SELECT id, userguid::text AS userguid, name, ispublic, imageid, soundid
       FROM curses
       ORDER BY id ASC`
    );

    let spellsCreated = 0;
    let potionsCreated = 0;

    for (const curse of curses) {
      const result = await ensureCurseCureEntries(client, curse);
      if (result.createdSpell) spellsCreated += 1;
      if (result.createdPotion) potionsCreated += 1;
    }

    await client.query('COMMIT');

    console.log(`Curses scanned: ${curses.length}`);
    console.log(`Cure spells created: ${spellsCreated}`);
    console.log(`Cure potions created: ${potionsCreated}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
