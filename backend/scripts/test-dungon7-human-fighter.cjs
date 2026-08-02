const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const connectionString = process.env.DATABASE_URL || '';
if (!connectionString) {
  console.error('[FAIL] DATABASE_URL is missing in backend/.env');
  process.exit(1);
}

const useSSL = connectionString.includes('sslmode=require');
const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function rollDice(count, sides) {
  let total = 0;
  const rolls = [];
  for (let i = 0; i < count; i += 1) {
    const roll = rollDie(sides);
    rolls.push(roll);
    total += roll;
  }
  return { total, rolls };
}

function makeSquare(id, row, column, description = '') {
  return {
    id,
    row,
    column,
    description,
    isTrapped: false,
    toTop: null,
    toRight: null,
    toBottom: null,
    toLeft: null,
  };
}

function keyFor(row, column) {
  return `${row}:${column}`;
}

function buildDungonJson() {
  const startRow = 10;
  const startCol = 10;

  const filledSquares = {};
  const squares = {};
  let nextId = 1;

  console.log('[ACTION] Build corridor: start cell + 5 blocks to the right');
  for (let col = startCol; col <= startCol + 5; col += 1) {
    const key = keyFor(startRow, col);
    filledSquares[key] = true;
    squares[key] = makeSquare(nextId, startRow, col, col === startCol ? 'Start corridor cell' : 'Corridor cell');
    nextId += 1;
  }

  console.log('[ACTION] Build 5x5 room opening from corridor end');
  const roomStartRow = startRow - 2;
  const roomEndRow = startRow + 2;
  const roomStartCol = startCol + 6;
  const roomEndCol = startCol + 10;

  for (let row = roomStartRow; row <= roomEndRow; row += 1) {
    for (let col = roomStartCol; col <= roomEndCol; col += 1) {
      const key = keyFor(row, col);
      filledSquares[key] = true;
      squares[key] = makeSquare(nextId, row, col, 'Room cell');
      nextId += 1;
    }
  }

  const totalSquares = Object.keys(filledSquares).length;
  console.log(`[RESULT] Dungeon geometry prepared with ${totalSquares} traversable cells`);

  return {
    filledSquares,
    squares,
    startpoint: {
      row: startRow,
      col: startCol,
      description: 'Starting point',
      playerSees: 'A narrow passage leading east into a larger chamber.',
    },
    keyList: [],
    tresherList: [],
    tresherPlacements: [],
    monsterList: [],
    monsterPlacements: [],
    doorList: [],
    doorPlacements: [],
    obstaclePlacements: [],
    floorTrapPlacements: [],
    spellPlacements: [],
    potionPlacements: [],
    itemPlacements: [],
    floorItemList: [],
    floorPotionList: [],
    floorSpellList: [],
    floorItemPlacements: [],
    floorPotionPlacements: [],
    floorSpellPlacements: [],
    exits: [],
  };
}

function rollHumanFighterStats() {
  console.log('[ACTION] Roll Human Fighter stats');

  const strengthRoll = rollDice(2, 6);
  const dexterityRoll = rollDice(3, 6);
  const magicRoll = rollDice(2, 6);
  const awarenessRoll = rollDice(2, 4);
  const mindRoll = rollDie(10);
  const hpRoll = rollDice(2, 8);
  const acRoll = rollDie(6);
  const staminaBaseRoll = rollDie(4);
  const staminaBonusRoll = rollDie(6);

  const actionEconomy = 5;
  const rangeOfView = 5;
  const strength = 6 + strengthRoll.total;
  const dexterity = dexterityRoll.total;
  const hiddenMagic = magicRoll.total;
  const awareness = awarenessRoll.total;
  const mind = mindRoll + 5;
  const maxHP = hpRoll.total + Math.floor(strength / 2);
  const currentHP = maxHP;
  const ac = Math.floor(acRoll / 2);
  const magicPower = 0;
  const stamina = staminaBaseRoll + staminaBonusRoll;
  const poisonResest = Math.floor(stamina / 2);

  console.log(`[RESULT] Strength: 6 + 2d6 (${strengthRoll.rolls.join(', ')}) = ${strength}`);
  console.log(`[RESULT] Dexterity: 3d6 (${dexterityRoll.rolls.join(', ')}) = ${dexterity}`);
  console.log(`[RESULT] Hidden Magic: 2d6 (${magicRoll.rolls.join(', ')}) = ${hiddenMagic}`);
  console.log(`[RESULT] Awareness: 2d4 (${awarenessRoll.rolls.join(', ')}) = ${awareness}`);
  console.log(`[RESULT] Mind: d10 (${mindRoll}) + 5 = ${mind}`);
  console.log(`[RESULT] MaxHP: 2d8 (${hpRoll.rolls.join(', ')}) + floor(Strength/2) (${Math.floor(strength / 2)}) = ${maxHP}`);
  console.log(`[RESULT] AC bonus: floor(d6 (${acRoll}) / 2) = ${ac}`);
  console.log(`[RESULT] Stamina: d4 (${staminaBaseRoll}) + d6 (${staminaBonusRoll}) = ${stamina}`);
  console.log(`[RESULT] PoisonResest: floor(Stamina/2) = ${poisonResest}`);

  return {
    species: 'Human',
    type: 'Fighter',
    actionEconomy,
    rangeOfView,
    strength,
    dexterity,
    awareness,
    mind,
    magicPower,
    maxHP,
    currentHP,
    ac,
    stamina,
    poisonResest,
  };
}

async function run() {
  const client = await pool.connect();
  try {
    console.log('[ACTION] Start transaction');
    await client.query('BEGIN');

    console.log('[ACTION] Find a valid user key for FK ownership');
    const userResult = await client.query('SELECT key FROM users ORDER BY key ASC LIMIT 1');
    if (!userResult.rows.length) {
      throw new Error('No users found. Create at least one user before running this test.');
    }
    const userKey = userResult.rows[0].key;
    console.log(`[RESULT] Using user key: ${userKey}`);

    console.log('[ACTION] Verify weapon tresher ID 1 exists');
    let weaponCheck = await client.query('SELECT id, name, type FROM treshers WHERE id = 1');
    if (!weaponCheck.rows.length) {
      console.log('[ACTION] Weapon id 1 missing; creating a minimal Weapon tresher row with id 1');
      await client.query(
        `INSERT INTO treshers (id, userguid, name, description, type, ispublic, isquest, spreward)
         OVERRIDING SYSTEM VALUE
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [1, userKey, 'Test Weapon ID 1', 'Auto-seeded by test-dungon7-human-fighter.cjs', 'Weapon', true, false, 0]
      );
      weaponCheck = await client.query('SELECT id, name, type FROM treshers WHERE id = 1');
    }
    console.log(`[RESULT] Weapon ready: id=1 name="${weaponCheck.rows[0].name}" type="${weaponCheck.rows[0].type}"`);

    const dungonJson = buildDungonJson();

    console.log('[ACTION] Remove existing dungon id 7 if present (cascade-safe)');
    const deleteDungon = await client.query('DELETE FROM dungons WHERE id = 7');
    console.log(`[RESULT] Removed ${deleteDungon.rowCount} existing dungon row(s) with id 7`);

    console.log('[ACTION] Insert dungon id 7 with requested layout');
    await client.query(
      `INSERT INTO dungons (id, userguid, key, userkey, name, description, intro, status, "dungenJson")
       OVERRIDING SYSTEM VALUE
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        7,
        userKey,
        userKey,
        userKey,
        'Test Dungon 7 Corridor Into 5x5 Room',
        'Start cell, 5-cell east corridor, opening into a 5x5 room.',
        'Automated test seed for movement/layout validation.',
        'pending',
        JSON.stringify(dungonJson),
      ]
    );
    console.log('[RESULT] Inserted dungon id 7');

    const rolled = rollHumanFighterStats();

    console.log('[ACTION] Insert Human Fighter PC with random rolled stats and weapon id 1');
    const pcInsert = await client.query(
      `INSERT INTO pcs (
        userguid, name, species, type,
        maxhp, currenthp, ac,
        actioneconomy, mind, stamina, strength, mp,
        numberofattacks, numberofdefends, rangeofview,
        poisonresest, level,
        weapontresherid, primarytresherid, tresherids,
        dexterity, awareness,
        issample, ismaingame
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15,
        $16, $17,
        $18, $19, $20::jsonb,
        $21, $22,
        $23, $24
      )
      RETURNING id, name, species, type, maxhp, currenthp, ac, actioneconomy, strength, stamina, mind, mp, rangeofview, weapontresherid, dexterity, awareness`,
      [
        userKey,
        `Test Human Fighter ${new Date().toISOString()}`,
        rolled.species,
        rolled.type,
        rolled.maxHP,
        rolled.currentHP,
        rolled.ac,
        rolled.actionEconomy,
        rolled.mind,
        rolled.stamina,
        rolled.strength,
        rolled.magicPower,
        1,
        1,
        rolled.rangeOfView,
        rolled.poisonResest,
        1,
        1,
        1,
        JSON.stringify([1]),
        rolled.dexterity,
        rolled.awareness,
        false,
        false,
      ]
    );

    const pcRow = pcInsert.rows[0];
    console.log(`[RESULT] Inserted PC id=${pcRow.id} name="${pcRow.name}"`);
    console.log(`[RESULT] PC Summary => species=${pcRow.species}, type=${pcRow.type}, HP=${pcRow.currenthp}/${pcRow.maxhp}, AC=${pcRow.ac}, AE=${pcRow.actioneconomy}, STR=${pcRow.strength}, STA=${pcRow.stamina}, MIND=${pcRow.mind}, MP=${pcRow.mp}, DEX=${pcRow.dexterity}, AW=${pcRow.awareness}, ROV=${pcRow.rangeofview}, weapon=${pcRow.weapontresherid}`);

    console.log('[ACTION] Verify dungon id 7 geometry persisted');
    const verifyDungon = await client.query('SELECT id, name, "dungenJson" FROM dungons WHERE id = 7');
    const stored = verifyDungon.rows[0];
    const storedJson = stored.dungenJson || {};
    const countSquares = storedJson.filledSquares ? Object.keys(storedJson.filledSquares).length : 0;
    const startpoint = storedJson.startpoint || null;
    console.log(`[RESULT] Dungon ${stored.id} "${stored.name}" has ${countSquares} filled squares`);
    console.log(`[RESULT] Startpoint => ${JSON.stringify(startpoint)}`);

    console.log('[ACTION] Commit transaction');
    await client.query('COMMIT');
    console.log('[DONE] Test seed complete.');
  } catch (error) {
    console.error(`[FAIL] ${error.message}`);
    try {
      await client.query('ROLLBACK');
      console.log('[ACTION] Rolled back transaction');
    } catch (rollbackError) {
      console.error(`[FAIL] Rollback error: ${rollbackError.message}`);
    }
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
