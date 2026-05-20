/**
 * import-dnd5e-spells.cjs
 * Fetches all spells from the D&D 5e 2014 API and inserts them into the local spells table.
 *
 * magicCost (PM per cast): max(1, level)   → level 0 & 1 = 1 PM, level 2 = 2 PM, etc.
 * costtolearn (lifetime SP threshold):      level <= 1 → 0, level N → (N-1) * 2000
 * sp (current SP to learn):                 max(10, level * 20)
 * imageid / soundid:                        NULL
 * ispublic:                                 FALSE
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const API_BASE = 'https://www.dnd5eapi.co';

// ─── helpers ────────────────────────────────────────────────────────────────

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

/** "60 feet" → 12 cells, "Touch"/"Self" → 0, "Sight" → 30 */
function parseRange(rangeStr = '') {
  const lower = rangeStr.toLowerCase().trim();
  if (!lower || lower === 'touch' || lower === 'self') return 0;
  if (lower === 'sight' || lower === 'unlimited' || lower === 'special') return 30;
  const m = rangeStr.match(/(\d+)\s*feet?/i);
  return m ? Math.round(parseInt(m[1], 10) / 5) : 1;
}

/** Return average roll of first dice expression found, e.g. "3d6+2" → 13 */
function avgDice(diceStr = '') {
  const m = diceStr.match(/(\d+)d(\d+)(?:\s*\+\s*(\d+))?/i);
  if (!m) return 0;
  const count = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const bonus = m[3] ? parseInt(m[3], 10) : 0;
  return Math.round(count * ((sides + 1) / 2) + bonus);
}

/** Map D&D school name → our effecttype string */
function schoolToEffectType(schoolName = '') {
  const map = {
    evocation: 'fire',
    necromancy: 'shadow',
    illusion: 'arcane',
    transmutation: 'arcane',
    enchantment: 'arcane',
    conjuration: 'arcane',
    divination: 'arcane',
    abjuration: 'arcane',
  };
  return map[schoolName.toLowerCase()] ?? 'Other';
}

/** Pick the best effectOn from spell data */
function getEffectOn(spell) {
  if (spell.damage) return 'HP';
  if (spell.heal_at_slot_level) return 'HP';
  const desc = (spell.desc?.[0] ?? '').toLowerCase();
  if (desc.includes('armor class') || desc.includes(' ac ') || desc.includes('defense')) return 'Defense';
  if (desc.includes('charm') || desc.includes('fear') || desc.includes('mind') || desc.includes('psychic')) return 'Mind';
  if (desc.includes('speed') || desc.includes('movement') || desc.includes('action economy')) return 'Action Economy';
  if (desc.includes('stamina') || desc.includes('exhaustion')) return 'Stamina';
  return 'HP';
}

/** Derive effectAmount: negative for damage, positive for healing, 0 for pure-buff */
function getEffectAmount(spell) {
  const level = spell.level ?? 0;
  // healing spell
  if (spell.heal_at_slot_level) {
    const first = Object.values(spell.heal_at_slot_level)[0];
    return avgDice(first);
  }
  // damage spell
  if (spell.damage?.damage_at_slot_level) {
    const first = Object.values(spell.damage.damage_at_slot_level)[0];
    return -avgDice(first);
  }
  if (spell.damage?.damage_at_character_level) {
    const first = Object.values(spell.damage.damage_at_character_level)[0];
    return -avgDice(first);
  }
  // buff/debuff — small placeholder so there's *something* happening
  const effectOn = getEffectOn(spell);
  if (effectOn === 'Defense') return level + 1;       // positive = buff AC
  if (effectOn === 'HP')      return -(level + 2);    // default: minor damage
  return 0;
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  // Resolve admin userguid
  const adminRow = await pool.query(
    `SELECT key FROM users WHERE isadmin = TRUE ORDER BY id LIMIT 1`
  );
  if (!adminRow.rows.length) throw new Error('No admin user found in DB');
  const userguid = adminRow.rows[0].key;
  console.log(`Admin userguid: ${userguid}\n`);

  // Fetch spell index
  const listData = await fetchJson(`${API_BASE}/api/2014/spells`);
  const spellList = listData.results; // [{ index, name, url }]
  console.log(`${spellList.length} spells found in API.\n`);

  let inserted = 0;
  let skipped  = 0;
  let errored  = 0;

  for (let i = 0; i < spellList.length; i++) {
    const { name, url } = spellList[i];
    process.stdout.write(`[${String(i + 1).padStart(3)}/${spellList.length}] ${name.padEnd(40)} `);

    try {
      // Skip if already in DB
      const exists = await pool.query(
        `SELECT id FROM spells WHERE name = $1 AND userguid = $2`,
        [name, userguid]
      );
      if (exists.rows.length) {
        console.log('— already exists, skipped');
        skipped++;
        continue;
      }

      const spell = await fetchJson(`${API_BASE}${url}`);
      const level = spell.level ?? 0;

      // Core derived values
      const magicCost     = Math.max(1, level);                           // PM per cast
      const costToLearn   = level <= 1 ? 0 : (level - 1) * 2000;        // lifetime SP threshold
      const spCost        = Math.max(1, level);                          // SK points to learn
      const value         = Math.max(1, level);                          // GP value
      const range1        = parseRange(spell.range);
      const isSelf        = (spell.range ?? '').toLowerCase() === 'self';
      const effectOn      = getEffectOn(spell);
      const effectAmount  = getEffectAmount(spell);
      const effectType    = schoolToEffectType(spell.school?.name ?? '');
      const effectColor   = 'white';                                      // no better mapping from API
      const successTestValue = Math.max(3, 5 + level * 2);              // DC scales with level
      const lastFor1      = spell.concentration ? Math.max(1, level * 2) : 0;
      const description   = spell.desc?.[0] ?? name;

      await pool.query(`
        INSERT INTO spells (
          userguid, name, description,
          range, range1, range2,
          effecton, effecton2,
          damage, effectamount2,
          value, sp, successtestvalue, magiccost, costtolearn,
          imageid, soundid, ispublic,
          numberoftargets, effecttype, effectcolor,
          effectonpc1, effectonpc2,
          lastfor, lastfor1, lastfor2
        ) VALUES (
          $1,  $2,  $3,
          $4,  $5,  0,
          $6,  '',
          $7,  0,
          $8,  $9,  $10, $11, $12,
          NULL, NULL, FALSE,
          1,   $13, $14,
          $15, FALSE,
          0,   $16, 0
        )
      `, [
        userguid, name, description,
        range1, range1,
        effectOn,
        effectAmount,
        value, spCost, successTestValue, magicCost, costToLearn,
        effectType, effectColor,
        isSelf,
        lastFor1,
      ]);

      console.log(`— inserted  (lvl ${level}, ${effectType}, ${range1}c, effect ${effectAmount > 0 ? '+' : ''}${effectAmount})`);
      inserted++;

      // Be polite to the API — small pause every 20 spells
      if (i % 20 === 19) await new Promise(r => setTimeout(r, 300));

    } catch (err) {
      console.log(`— ERROR: ${err.message}`);
      errored++;
    }
  }

  console.log(`\n─────────────────────────────────`);
  console.log(`Inserted : ${inserted}`);
  console.log(`Skipped  : ${skipped}`);
  console.log(`Errors   : ${errored}`);
  console.log(`─────────────────────────────────`);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
