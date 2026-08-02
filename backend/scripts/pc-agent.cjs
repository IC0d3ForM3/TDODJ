const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const pg = require('pg');

const { Pool } = pg;

// Database pool connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function rollDice(count, sides) {
  let total = 0;
  const rolls = [];
  for (let i = 0; i < count; i += 1) {
    const value = rollDie(sides);
    total += value;
    rolls.push(value);
  }
  return { total, rolls };
}

function parseArgValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (!found) {
    return null;
  }
  return found.slice(prefix.length);
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseIdList(value) {
  if (!value || !String(value).trim()) {
    return [];
  }
  return String(value)
    .split(',')
    .map((token) => Number.parseInt(token.trim(), 10))
    .filter((id) => Number.isFinite(id));
}

function normalizeSpecies(value) {
  const lower = String(value || '').trim().toLowerCase();
  if (lower === 'elph') return 'Elph';
  if (lower === 'dwarph') return 'DwarPh';
  if (lower === 'shorties') return 'Shorties';
  return 'Human';
}

function normalizeClass(value) {
  const lower = String(value || '').trim().toLowerCase();
  if (lower === 'thieph') return 'Thieph';
  if (lower === 'mage') return 'Mage';
  if (lower === 'healer') return 'Healer';
  if (lower === 'ranger') return 'Ranger';
  return 'Fighter';
}

function rollPc(speciesRaw, classRaw) {
  const species = normalizeSpecies(speciesRaw);
  const pcClass = normalizeClass(classRaw);

  let actionEconomy;
  let strength;
  let dexterity;
  let hiddenMagic;
  let awareness;
  let mind;
  let rangeOfView;

  if (species === 'Human') {
    rangeOfView = 5;
    actionEconomy = 5;
    strength = 6 + rollDice(2, 6).total;
    dexterity = rollDice(3, 6).total;
    hiddenMagic = rollDice(2, 6).total;
    awareness = rollDice(2, 4).total;
    mind = rollDie(10) + 5;
  } else if (species === 'Elph') {
    rangeOfView = 7;
    actionEconomy = 5;
    strength = 4 + rollDice(2, 6).total;
    dexterity = rollDice(3, 6).total + 2;
    hiddenMagic = 6 + rollDice(2, 6).total;
    awareness = rollDice(3, 4).total + 3;
    mind = rollDie(12) + 6;
  } else if (species === 'DwarPh') {
    rangeOfView = 7;
    actionEconomy = 4;
    strength = 8 + rollDice(2, 6).total;
    dexterity = Math.max(0, rollDice(2, 6).total - 2);
    hiddenMagic = rollDie(12);
    awareness = rollDice(3, 4).total;
    mind = rollDie(8) + 4;
  } else {
    rangeOfView = 6;
    actionEconomy = 4;
    strength = rollDice(2, 6).total;
    dexterity = 6 + rollDice(2, 6).total;
    hiddenMagic = rollDice(2, 6).total + 2;
    awareness = rollDice(2, 4).total + 4;
    mind = rollDie(10) + 5;
  }

  let maxHP;
  let ac;
  let magicPower;

  if (pcClass === 'Fighter') {
    maxHP = rollDice(2, 8).total + Math.floor(strength / 2);
    ac = Math.floor(rollDie(6) / 2);
    magicPower = 0;
  } else if (pcClass === 'Thieph') {
    maxHP = rollDie(12) + 2;
    ac = rollDice(2, 6).total + Math.floor(dexterity / 2);
    magicPower = rollDie(4) + hiddenMagic;
  } else if (pcClass === 'Mage') {
    maxHP = rollDice(2, 4).total + 2;
    ac = 0;
    magicPower = rollDice(2, 8).total + hiddenMagic + mind;
  } else if (pcClass === 'Healer') {
    maxHP = rollDice(3, 4).total + 3;
    ac = Math.floor(rollDice(2, 4).total / 2);
    magicPower = rollDie(8) + hiddenMagic + mind;
  } else {
    maxHP = rollDice(2, 6).total + Math.floor(strength / 2);
    ac = Math.floor(rollDie(6) / 2) + Math.floor(dexterity / 4);
    magicPower = hiddenMagic;
  }

  const staminaBase = species === 'Human' ? rollDie(4)
    : species === 'Elph' ? rollDie(3)
    : species === 'DwarPh' ? rollDie(6)
    : rollDie(3);
  const staminaBonus = pcClass === 'Fighter' ? rollDie(6)
    : pcClass === 'Thieph' ? rollDie(2)
    : pcClass === 'Mage' ? rollDie(3)
    : rollDie(4);
  const stamina = staminaBase + staminaBonus;
  let poisonResest = Math.floor(stamina / 2);
  if (species === 'Elph' || species === 'DwarPh') {
    poisonResest += rollDie(4);
  }

  return {
    species,
    pcClass,
    actionEconomy,
    strength,
    dexterity,
    hiddenMagic,
    awareness,
    mind,
    rangeOfView,
    maxHP,
    currentHP: maxHP,
    ac,
    magicPower,
    stamina,
    poisonResest,
  };
}

const WEAPON_LIBRARY = {};
const SPELL_LIBRARY = {};

async function loadWeaponLibrary() {
  try {
    const res = await pool.query(
      `SELECT id, name, COALESCE(damage, 6) AS "damageDie", 0 AS "toHitBonus",
              GREATEST(1, COALESCE(NULLIF(range, '')::int, 0)) AS range
       FROM items WHERE ispublic = true ORDER BY id`
    );
    res.rows.forEach((row) => {
      WEAPON_LIBRARY[row.id] = row;
    });
    console.log(`[RESULT] Loaded ${res.rows.length} items (weapons) from database`);
  } catch (error) {
    console.error(`[WARN] Failed to load weapons: ${error.message}`);
  }
}

async function loadSpellLibrary() {
  try {
    const res = await pool.query(
      `SELECT id, name,
              COALESCE(range1, range, 0) AS range,
              COALESCE(magiccost, 1) AS "magicCost",
              COALESCE(effectdicesides, GREATEST(0, damage), 6) AS "damageDie"
       FROM spells WHERE ispublic = true ORDER BY id`
    );
    res.rows.forEach((row) => {
      SPELL_LIBRARY[row.id] = row;
    });
    console.log(`[RESULT] Loaded ${res.rows.length} spells from database`);
  } catch (error) {
    console.error(`[WARN] Failed to load spells: ${error.message}`);
  }
}

function resolveWeapon(weaponId) {
  if (WEAPON_LIBRARY[weaponId]) {
    return WEAPON_LIBRARY[weaponId];
  }
  return { name: `Weapon ID ${weaponId}`, damageDie: 6, toHitBonus: 0, range: 1 };
}

function resolveSpells(spellIds) {
  return spellIds.map((id) => ({
    id,
    ...(SPELL_LIBRARY[id] || { name: `Spell ID ${id}`, range: 5, magicCost: 2, damageDie: 6 }),
  }));
}

function chooseAction(state) {
  const { distance, ae, pc, spells } = state;

  if (distance > 1 && ae > 0) {
    return { type: 'move' };
  }

  const inRangeSpell = spells.find((spell) => spell.range >= distance && spell.magicCost <= state.currentMp);
  if (pc.pcClass !== 'Fighter' && inRangeSpell && ae > 0) {
    return { type: 'cast', spell: inRangeSpell };
  }

  if (pc.pcClass === 'Fighter' && ae >= 2) {
    return { type: 'boost' };
  }

  if (inRangeSpell && ae > 0) {
    return { type: 'cast', spell: inRangeSpell };
  }

  if (ae > 0) {
    return { type: 'attack' };
  }

  return { type: 'end' };
}

function runCombatSimulation(pc, weaponId, itemIds, spellIds, monsterSetup) {
  const weapon = resolveWeapon(weaponId);
  const spells = resolveSpells(spellIds);

  console.log('[ACTION] Build simulated encounter state');
  console.log(`[RESULT] PC class=${pc.pcClass}, species=${pc.species}, weaponId=${weaponId}, items=[${itemIds.join(', ')}], spells=[${spellIds.join(', ')}]`);
  console.log(`[RESULT] Weapon profile => ${weapon.name}, d${weapon.damageDie}, toHit+${weapon.toHitBonus}, range=${weapon.range}`);

  let monsterHp = monsterSetup.hp;
  let pcHp = pc.currentHP;
  let distance = monsterSetup.distance;
  let currentMp = pc.magicPower;
  let step = 1;
  let round = 1;

  while (monsterHp > 0 && pcHp > 0 && round <= monsterSetup.maxRounds) {
    let ae = pc.actionEconomy;
    console.log(`[ROUND ${round}] Start => PC HP=${pcHp}, monster HP=${monsterHp}, distance=${distance}, MP=${currentMp}`);

    while (monsterHp > 0 && pcHp > 0 && ae > 0) {
      const decision = chooseAction({ distance, ae, pc, spells, currentMp });

      if (decision.type === 'move') {
        console.log(`[ACTION ${step}] Move toward monster (distance ${distance} -> ${distance - 1})`);
        distance -= 1;
        ae -= 1;
        console.log(`[RESULT ${step}] AE left=${ae}, monster HP=${monsterHp}`);
      } else if (decision.type === 'boost') {
        console.log(`[ACTION ${step}] Boost attack (Fighter) with ${weapon.name}`);
        const hitRoll = rollDie(12) + Math.floor(pc.stamina / 2) + weapon.toHitBonus + 2;
        const hitTarget = monsterSetup.ac;
        ae -= 2;
        if (hitRoll >= hitTarget) {
          const damage = rollDie(weapon.damageDie) + Math.floor(pc.strength / 2) + 2;
          monsterHp = Math.max(0, monsterHp - damage);
          console.log(`[RESULT ${step}] HIT boost roll=${hitRoll} vs AC=${hitTarget}; damage=${damage}; monster HP=${monsterHp}`);
        } else {
          console.log(`[RESULT ${step}] MISS boost roll=${hitRoll} vs AC=${hitTarget}; monster HP=${monsterHp}`);
        }
        console.log(`[RESULT ${step}] AE left=${ae}`);
      } else if (decision.type === 'cast') {
        const spell = decision.spell;
        console.log(`[ACTION ${step}] Cast ${spell.name} (id=${spell.id}) in range ${distance}`);
        const castRoll = rollDie(12) + Math.floor(pc.mind / 2);
        const castTarget = monsterSetup.ac;
        ae -= 1;
        currentMp -= spell.magicCost;
        if (castRoll >= castTarget) {
          const damage = rollDie(spell.damageDie) + Math.floor(pc.mind / 2);
          monsterHp = Math.max(0, monsterHp - damage);
          console.log(`[RESULT ${step}] SPELL HIT roll=${castRoll} vs AC=${castTarget}; damage=${damage}; monster HP=${monsterHp}; MP left=${currentMp}`);
        } else {
          console.log(`[RESULT ${step}] SPELL MISS roll=${castRoll} vs AC=${castTarget}; monster HP=${monsterHp}; MP left=${currentMp}`);
        }
        console.log(`[RESULT ${step}] AE left=${ae}`);
      } else if (decision.type === 'attack') {
        console.log(`[ACTION ${step}] Normal attack with ${weapon.name}`);
        const hitRoll = rollDie(12) + Math.floor(pc.stamina / 2) + weapon.toHitBonus;
        const hitTarget = monsterSetup.ac;
        ae -= 1;
        if (hitRoll >= hitTarget) {
          const damage = rollDie(weapon.damageDie) + Math.floor(pc.strength / 2);
          monsterHp = Math.max(0, monsterHp - damage);
          console.log(`[RESULT ${step}] HIT roll=${hitRoll} vs AC=${hitTarget}; damage=${damage}; monster HP=${monsterHp}`);
        } else {
          console.log(`[RESULT ${step}] MISS roll=${hitRoll} vs AC=${hitTarget}; monster HP=${monsterHp}`);
        }
        console.log(`[RESULT ${step}] AE left=${ae}`);
      } else {
        console.log(`[ACTION ${step}] End turn`);
        break;
      }

      if (monsterHp <= 0) {
        break;
      }

      step += 1;
    }

    if (monsterHp <= 0) {
      console.log(`[DONE] Monster defeated in ${step} action(s). PC HP=${pcHp}`);
      return;
    }

    if (distance > 1) {
      console.log(`[MONSTER ${round}] Monster closes in (distance ${distance} -> ${distance - 1})`);
      distance -= 1;
      round += 1;
      continue;
    }

    const monsterHitRoll = rollDie(12) + monsterSetup.toHitBonus;
    const pcArmor = Math.max(0, pc.ac);
    if (monsterHitRoll >= pcArmor) {
      const monsterDamage = rollDie(monsterSetup.damageDie) + monsterSetup.damageBonus;
      pcHp = Math.max(0, pcHp - monsterDamage);
      console.log(`[MONSTER ${round}] HIT roll=${monsterHitRoll} vs PC AC=${pcArmor}; damage=${monsterDamage}; PC HP=${pcHp}`);
    } else {
      console.log(`[MONSTER ${round}] MISS roll=${monsterHitRoll} vs PC AC=${pcArmor}; PC HP=${pcHp}`);
    }

    if (pcHp <= 0) {
      console.log(`[DONE] PC was defeated in round ${round}. Monster HP=${monsterHp}`);
      return;
    }

    round += 1;
  }

  if (round > monsterSetup.maxRounds) {
    console.log(`[DONE] Battle stopped at round ${monsterSetup.maxRounds} (safety cap). PC HP=${pcHp}, monster HP=${monsterHp}, distance=${distance}`);
    return;
  }

  if (monsterHp <= 0) {
    console.log(`[DONE] Monster defeated. PC HP=${pcHp}`);
    return;
  }

  if (pcHp <= 0) {
    console.log(`[DONE] PC was defeated. Monster HP=${monsterHp}`);
  }
}

async function askIfMissing(rl, question, value, fallback = '') {
  if (value !== null && value !== undefined) {
    // Arg was explicitly provided (even if empty string) — skip the prompt
    return String(value).trim() || fallback;
  }
  const answer = await rl.question(question);
  return answer && answer.trim() ? answer.trim() : fallback;
}

async function main() {
  const rl = readline.createInterface({ input, output });
  try {
    console.log('[ACTION] Start PC Agent');

    await loadWeaponLibrary();
    await loadSpellLibrary();

    let continueRunning = true;

    while (continueRunning) {
      const speciesAnswer = await askIfMissing(rl, 'Species (Human/Elph/DwarPh/Shorties): ', parseArgValue('species'), 'Human');
      const classAnswer = await askIfMissing(rl, 'Class (Fighter/Thieph/Mage/Healer/Ranger): ', parseArgValue('pcClass'), 'Fighter');

      const pc = rollPc(speciesAnswer, classAnswer);
      console.log('[RESULT] PC rolled');
      console.log(JSON.stringify(pc, null, 2));

      const weaponIdRaw = await askIfMissing(rl, 'Weapon ID to use for attacks (example 1): ', parseArgValue('weaponId'), '1');
      const weaponId = parseInteger(weaponIdRaw, 1);

      const itemsRaw = await askIfMissing(rl, 'Item IDs to carry (comma separated, blank for none): ', parseArgValue('itemIds'), '');
      const itemIds = parseIdList(itemsRaw);

      const spellsRaw = await askIfMissing(rl, 'Spell IDs to equip (comma separated, blank for none): ', parseArgValue('spellIds'), '');
      const spellIds = parseIdList(spellsRaw);

      const monsterHpRaw = await askIfMissing(rl, 'Monster HP (default 20): ', parseArgValue('monsterHp'), '20');
      const monsterAcRaw = await askIfMissing(rl, 'Monster AC target (default 10): ', parseArgValue('monsterAc'), '10');
      const monsterDistanceRaw = await askIfMissing(rl, 'Monster starting distance in squares (default 7): ', parseArgValue('monsterDistance'), '7');

      const monsterSetup = {
        hp: parseInteger(monsterHpRaw, 20),
        ac: parseInteger(monsterAcRaw, 10),
        distance: Math.max(1, parseInteger(monsterDistanceRaw, 7)),
        toHitBonus: 2,
        damageDie: 6,
        damageBonus: 2,
        maxRounds: 200,
      };

      console.log('[ACTION] Run auto-battle behavior until one side dies');
      runCombatSimulation(pc, weaponId, itemIds, spellIds, monsterSetup);

      // Ask if user wants to continue
      const continueAnswer = await askIfMissing(rl, '\nRun another simulation? (yes/no): ', null, 'no');
      if (!continueAnswer.toLowerCase().startsWith('y')) {
        continueRunning = false;
      }

      if (continueRunning) {
        console.log('');
      }
    }

    console.log('[DONE] PC Agent closed');
  } catch (error) {
    if (error.code === 'ERR_USE_AFTER_CLOSE') {
      // User cancelled (Ctrl+C or EOF)
      console.log('\n[USER] Simulation cancelled');
    } else {
      throw error;
    }
  } finally {
    rl.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exit(1);
});
