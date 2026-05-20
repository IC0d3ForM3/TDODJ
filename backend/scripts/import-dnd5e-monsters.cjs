/**
 * import-dnd5e-monsters.cjs
 *
 * Fetches all 334 monsters from https://www.dnd5eapi.co/api/2014/monsters
 * and inserts them into the monsters table owned by the admin user.
 *
 * Run from backend/ folder:
 *   node scripts/import-dnd5e-monsters.cjs
 *
 * Skips monsters whose name already exists for the admin userguid.
 */

require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');

const ADMIN_USERGUID = '93074651-53ce-4b23-8031-2d6bd0d279da';
const API_BASE = 'https://www.dnd5eapi.co/api/2014';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ---------- helpers ----------

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Any 'f' that is NOT the first character of the string is replaced with 'ph'.
 * Uppercase 'F' mid-string becomes 'Ph'. Matches the existing naming convention (Elph, Dwarph, etc.).
 */
function applyPhRule(str) {
  if (!str || str.length === 0) return str;
  return str.charAt(0) + str.slice(1).replace(/[fF]/g, (m) => m === 'F' ? 'Ph' : 'ph');
}

/** Parse "30 ft." → 6 grid cells (1 cell = 5 ft). */
function feetToCells(speedStr) {
  if (!speedStr) return 3;
  const match = String(speedStr).match(/(\d+)/);
  return match ? Math.round(parseInt(match[1], 10) / 5) : 3;
}

/**
 * CR → minimum weapon-plus needed to hit.
 * CR 0–1 = +0, CR 2–4 = +1, CR 5–10 = +2, CR 11–16 = +3, CR 17+ = +4
 */
function crToToHitPlusNeeded(cr) {
  if (cr <= 1) return 0;
  if (cr <= 4) return 1;
  if (cr <= 10) return 2;
  if (cr <= 16) return 3;
  return 4;
}

/**
 * INT score → magic level (ability to cast spells).
 * INT 16+ = 2 (potent caster), INT 12–15 = 1 (minor magic), else 0
 */
function intToMagic(intelligence) {
  if (intelligence >= 16) return 2;
  if (intelligence >= 12) return 1;
  return 0;
}

/**
 * Returns 1 if the monster's damage immunities indicate it is immune to
 * non-magical/non-silvered weapons (requiring a magic weapon to hit).
 */
function parseMagicResistance(damageImmunities) {
  if (!Array.isArray(damageImmunities)) return 0;
  const joined = damageImmunities.join(' ').toLowerCase();
  return joined.includes('nonmagical') ? 1 : 0;
}

/**
 * Compute average (expected) damage from a dice formula string.
 * e.g. "2d6+4" → 2*3.5 + 4 = 11
 */
function avgDamage(formula) {
  if (!formula) return 1;
  const match = String(formula).match(/(\d+)d(\d+)([+-]\d+)?/);
  if (!match) return 1;
  const num = parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  const mod = match[3] ? parseInt(match[3], 10) : 0;
  return Math.max(1, Math.round(num * (sides + 1) / 2 + mod));
}

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/**
 * Parse multiattack count from the multiattack action description.
 * "The goblin makes two attacks." → 2
 * Falls back to counting non-multiattack attack actions.
 */
function parseNumberOfAttacks(actions) {
  const multiattack = actions.find(
    (a) => a.name && a.name.toLowerCase() === 'multiattack'
  );
  if (multiattack && multiattack.desc) {
    const desc = multiattack.desc.toLowerCase();
    // Try to find "makes X attacks" or "can make X attacks"
    const numMatch = desc.match(
      /makes (?:up to )?(\w+) (?:weapon |melee |ranged )?attacks?/
    );
    if (numMatch) {
      const word = numMatch[1];
      if (WORD_NUMBERS[word]) return WORD_NUMBERS[word];
      const n = parseInt(word, 10);
      if (!isNaN(n)) return n;
    }
    // Fallback: count action references in multiattack desc
    const withMatch = desc.match(/with (?:its |the )?(\w+)[,;]? (?:and )?(?:one|a) (\w+)/);
    if (withMatch) return 2;
  }

  // No multiattack — count attack actions (those with attack_bonus or damage dice)
  const attackActions = (actions || []).filter(
    (a) =>
      a.name &&
      a.name.toLowerCase() !== 'multiattack' &&
      (typeof a.attack_bonus === 'number' || (a.damage && a.damage.length > 0))
  );
  return Math.max(1, attackActions.length);
}

/**
 * Build the attacks JSONB array from API actions.
 * Only actions that have attack_bonus or damage dice are included.
 * Multiattack is excluded (it's a meta-action).
 */
function buildAttacks(actions) {
  if (!Array.isArray(actions)) return [];

  return actions
    .filter(
      (a) =>
        a.name &&
        a.name.toLowerCase() !== 'multiattack' &&
        (typeof a.attack_bonus === 'number' || (a.damage && a.damage.length > 0))
    )
    .map((action) => {
      const firstDamage = action.damage && action.damage[0];
      const damageFormula = firstDamage ? firstDamage.damage_dice : '1d4';
      const damageType = firstDamage
        ? (firstDamage.damage_type ? firstDamage.damage_type.name : 'Physical')
        : 'Physical';

      return {
        type: 'Weapon',
        description: `${action.name} (${damageType})`,
        plusToHit: typeof action.attack_bonus === 'number' ? action.attack_bonus : 0,
        damage: avgDamage(damageFormula),
        damageFormula: damageFormula,
        range: 1,
        weaponItemId: null,
        spellId: null,
        curseId: null,
      };
    });
}

// ---------- fetch helpers ----------

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchMonsterList() {
  // API limit max to get all in one shot
  const data = await fetchJson(`${API_BASE}/monsters?limit=500`);
  return data.results; // array of { index, name, url }
}

async function fetchMonsterDetail(index) {
  return fetchJson(`${API_BASE}/monsters/${index}`);
}

// ---------- DB helpers ----------

async function getExistingNames(client) {
  const { rows } = await client.query(
    'SELECT LOWER(name) AS name FROM monsters WHERE userguid = $1',
    [ADMIN_USERGUID]
  );
  return new Set(rows.map((r) => r.name));
}

async function insertMonster(client, m) {
  const sql = `
    INSERT INTO monsters (
      userguid, name, type, description, hp, movmenteconomy, ac, runat,
      numberofattacks, attacks, spreward, magic, magicresistance,
      tohitplusneeded, callsreinforcements, awareness, ispublic,
      imageid, soundid, tresherids, keyids,
      npc_greeting, npc_info_1, npc_info_2, npc_info_3,
      npc_only_attack_when_attacked, npc_gives_info_after_damaged,
      npc_attacks_after_info, npc_can_trade
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10::jsonb, $11, $12, $13,
      $14, $15, $16, $17,
      NULL, NULL, '[]'::jsonb, '[]'::jsonb,
      NULL, NULL, NULL, NULL,
      FALSE, FALSE, FALSE, FALSE
    )
  `;

  const acValue =
    Array.isArray(m.armor_class) && m.armor_class.length > 0
      ? m.armor_class[0].value
      : 10;

  const walkSpeed = m.speed && m.speed.walk ? m.speed.walk : '30 ft.';
  const movementEconomy = feetToCells(walkSpeed);

  const runat = Math.floor((m.hit_points || 1) * 0.25);
  const awareness = m.senses ? (m.senses.passive_perception || 10) : 10;
  const magic = intToMagic(m.intelligence || 10);
  const magicResistance = parseMagicResistance(m.damage_immunities);
  const tohitplusneeded = crToToHitPlusNeeded(m.challenge_rating || 0);
  const numberOfAttacks = parseNumberOfAttacks(m.actions || []);
  const attacks = buildAttacks(m.actions || []);

  const typeStr = capitalize(m.type || 'Beast');
  const subStr = m.subtype ? ` (${m.subtype})` : '';
  const rawDescription =
    `${capitalize(m.size || '')} ${typeStr}${subStr}. ` +
    `Alignment: ${m.alignment || 'unaligned'}. ` +
    `CR: ${m.challenge_rating}. XP: ${m.xp}.`;

  const monsterName = applyPhRule(m.name);
  const description = applyPhRule(rawDescription);

  await client.query(sql, [
    ADMIN_USERGUID,           // $1
    monsterName,              // $2
    typeStr,                  // $3
    description,              // $4
    m.hit_points || 1,        // $5
    movementEconomy,          // $6
    acValue,                  // $7
    runat,                    // $8
    numberOfAttacks,          // $9
    JSON.stringify(attacks),  // $10
    m.xp || 0,                // $11  spreward
    magic,                    // $12
    magicResistance,          // $13
    tohitplusneeded,          // $14
    false,                    // $15  callsreinforcements
    awareness,                // $16
    false,                    // $17  ispublic
  ]);
}

// ---------- main ----------

async function main() {
  const client = await pool.connect();
  try {
    console.log('Fetching monster list from D&D 5e API...');
    const list = await fetchMonsterList();
    console.log(`Found ${list.length} monsters in API.`);

    const existingNames = await getExistingNames(client);
    console.log(`${existingNames.size} monsters already exist for admin user — will skip duplicates.`);

    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (existingNames.has(entry.name.toLowerCase())) {
        skipped++;
        if (skipped <= 5) console.log(`  SKIP (exists): ${entry.name}`);
        continue;
      }

      try {
        const detail = await fetchMonsterDetail(entry.index);
        await insertMonster(client, detail);
        inserted++;
        if (inserted % 25 === 0) {
          console.log(`  [${i + 1}/${list.length}] Inserted ${inserted} so far...`);
        }
      } catch (err) {
        errors++;
        console.error(`  ERROR: ${entry.name} — ${err.message}`);
      }

      // small delay to be polite to the API
      await new Promise((r) => setTimeout(r, 50));
    }

    // Final count
    const { rows } = await client.query('SELECT COUNT(*) AS cnt FROM monsters');
    console.log('\n=== Done ===');
    console.log(`Inserted : ${inserted}`);
    console.log(`Skipped  : ${skipped}`);
    console.log(`Errors   : ${errors}`);
    console.log(`Total monsters in DB: ${rows[0].cnt}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
