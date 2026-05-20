/**
 * import-dnd5e-magic-items.cjs
 * Fetches all 362 magic items from the D&D 5e 2014 API and routes them:
 *
 *  equipment_category = 'potion'   → potions table  (HP potions)
 *  equipment_category = 'scroll'   → potions table  (type='scroll', effectto='Magic')
 *  everything else                 → items table
 *
 * Parent entries with variants (e.g. "Spell Scroll" umbrella, "Potion of Healing" umbrella)
 * are skipped — their variant children appear as individual list entries.
 *
 * Items mapping:
 *  type     — weapon/armor/ring/necklace/other (wand/staff/rod/wondrous all → other)
 *  damage   — parse "+N" from desc for magic weapons; rarity fallback
 *  effectvalue/effecton — parse "+N bonus to AC" from desc
 *  value    — rarity → GP: Common=100, Uncommon=500, Rare=5000, VeryRare=50000, Legendary=100000
 *  weaponeffecttype/color — all magic weapons = Arcane / #8800cc (purple)
 *  armorslot — keyword-matched from name (Boots→Legs, Gauntlets→Hands, Helm→Head, etc.)
 *
 * Scrolls mapping (into potions):
 *  type='scroll', effectto='Magic'
 *  effectnumber = spell level (0–9, parsed from name)
 *  effecttime   = 0 (instant)
 *  value        = level-based GP
 *
 * Potions mapping (into potions):
 *  type='health' for HP potions, else 'buff'
 *  effectto parsed from desc keywords
 *  effectnumber = average of dice expression found in first 3 desc paragraphs
 *  effecttime   = 0 (instant) unless desc says "rounds" → parse number
 *  value        = rarity GP
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

/** "2d4 + 2" → 7,  "10d4 + 20" → 45 */
function avgDice(diceStr = '') {
  const m = diceStr.match(/(\d+)d(\d+)(?:\s*[+-]\s*(\d+))?/i);
  if (!m) return 0;
  const count = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const bonus = m[3] ? parseInt(m[3], 10) : 0;
  return Math.round(count * ((sides + 1) / 2) + bonus);
}

const RARITY_GP = {
  common:     100,
  uncommon:   500,
  rare:       5000,
  'very rare': 50000,
  legendary:  100000,
  artifact:   250000,
  varies:     50,
};

function rarityGp(rarityName = '') {
  return RARITY_GP[rarityName.toLowerCase()] ?? 100;
}

/** Magic bonus from rarity, used if we can't parse from desc */
function rarityMagicBonus(rarityName = '') {
  switch (rarityName.toLowerCase()) {
    case 'uncommon':  return 1;
    case 'rare':      return 2;
    case 'very rare': return 3;
    case 'legendary': return 5;
    default:          return 1;
  }
}

/** Parse "+N" bonus from desc strings (first N found, or 0) */
function parsePlusBonus(desc = '') {
  const m = desc.match(/\+(\d+)\s+bonus\s+to\s+(?:attack\s+and\s+damage|damage|attack)/i);
  return m ? parseInt(m[1], 10) : 0;
}

/** Parse "+N bonus to AC" / "+N to AC and saving throws" */
function parseAcBonus(desc = '') {
  const m = desc.match(/\+(\d+)\s+bonus\s+to\s+(?:AC|armor\s+class)/i)
         || desc.match(/\+(\d+)\s+(?:to|bonus\s+to)\s+AC\b/i);
  return m ? parseInt(m[1], 10) : 0;
}

/** Map equipment_category → items.type */
function mapItemType(catIndex = '') {
  switch (catIndex) {
    case 'weapon':        return 'weapon';
    case 'armor':         return 'armor';
    case 'ring':          return 'ring';
    case 'necklace':      return 'necklace';
    case 'wand':
    case 'staff':
    case 'rod':
    case 'wondrous-items': return 'other';
    default:              return 'other';
  }
}

/** Keyword → armorslot for armor/wondrous items */
function getArmorSlot(name = '') {
  const n = name.toLowerCase();
  if (n.includes('helm') || n.includes('helmet') || n.includes('headband') ||
      n.includes('cap of') || n.includes('hat of') || n.includes('circlet') ||
      n.includes('crown') || n.includes('tiara') || n.includes('hood'))       return 'Head';
  if (n.includes('gauntlet') || n.includes('glove') || n.includes('bracelet'))return 'Hands';
  if (n.includes('boot') || n.includes('sandal') || n.includes('slipper') ||
      n.includes('greave'))                                                     return 'Legs';
  if (n.includes('bracer') || n.includes('vambrace') || n.includes('arm '))   return 'Arms';
  if (n.includes('armor') || n.includes('mail') || n.includes('plate') ||
      n.includes('breastplate') || n.includes('robe') || n.includes('cloak') ||
      n.includes('mantle') || n.includes('vestment'))                          return 'Body';
  return null;
}

/** Scroll level from name e.g. "Spell Scroll (3rd)" → 3, "Spell Scroll (Cantrip)" → 0 */
function scrollLevel(name = '') {
  if (/cantrip/i.test(name)) return 0;
  const m = name.match(/\((\d+)(?:st|nd|rd|th)?\)/i);
  return m ? parseInt(m[1], 10) : 0;
}

const SCROLL_VALUE = [50, 75, 150, 300, 500, 1000, 2000, 5000, 10000, 50000];

/** Parse effectto for a potion from its desc */
function potionEffectTo(descFull = '') {
  const d = descFull.toLowerCase();
  if (d.includes('hit point') || d.includes('regain') || d.includes('heal')) return 'HP';
  if (d.includes('armor class') || d.includes(' ac '))                        return 'AC';
  if (d.includes('stamina') || d.includes('exhaustion'))                      return 'Stamina';
  if (d.includes('mind') || d.includes('intelligence') || d.includes('wis')) return 'Mind';
  if (d.includes('speed') || d.includes('movement') || d.includes('bonus action')) return 'Action Economy';
  if (d.includes('sight') || d.includes('darkvision') || d.includes('invisible')) return 'Sight';
  return 'HP';
}

/** Parse effectnumber (HP amount) from potion desc */
function potionEffectNumber(descFull = '') {
  // Look for dice like "2d4 + 2" in the description
  const avg = avgDice(descFull);
  if (avg > 0) return avg;
  // Flat number "regain 10 hit points"
  const m = descFull.match(/regain\s+(\d+)\s+hit/i);
  return m ? parseInt(m[1], 10) : 4;
}

/** Parse rounds duration from desc, 0 if instant */
function potionEffectTime(descFull = '') {
  const m = descFull.match(/for\s+(\d+)\s+(?:round|hour|minute)/i);
  if (!m) return 0;
  const duration = parseInt(m[1], 10);
  // Convert minutes→rounds (1 min = 10 rounds), hours→rounds (1 hour = 600 rounds, cap at 20)
  if (/hour/i.test(descFull)) return Math.min(20, duration * 600);
  if (/minute/i.test(descFull)) return duration * 10;
  return duration; // rounds
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  const adminRow = await pool.query(
    `SELECT key FROM users WHERE isadmin = TRUE ORDER BY id LIMIT 1`
  );
  if (!adminRow.rows.length) throw new Error('No admin user found in DB');
  const userguid = adminRow.rows[0].key;
  console.log(`Admin userguid: ${userguid}\n`);

  const listData = await fetchJson(`${API_BASE}/api/2014/magic-items?limit=1000`);
  const magicList = listData.results;
  console.log(`${magicList.length} magic item entries found in API.\n`);

  let insertedItems    = 0;
  let insertedPotions  = 0;
  let insertedScrolls  = 0;
  let skipped          = 0;
  let errored          = 0;

  for (let i = 0; i < magicList.length; i++) {
    const { name, url } = magicList[i];
    process.stdout.write(`[${String(i + 1).padStart(3)}/${magicList.length}] ${name.padEnd(42)} `);

    try {
      const item = await fetchJson(`${API_BASE}${url}`);
      const catIndex = item.equipment_category?.index ?? 'other';
      const rarity   = item.rarity?.name ?? 'Common';

      // Skip parent entries that are just wrappers for variants
      if (item.variants && item.variants.length > 0 && !item.variant) {
        console.log('— SKIP (parent with variants)');
        skipped++;
        continue;
      }

      const descFull = (item.desc ?? []).join(' ');
      const value    = rarityGp(rarity);

      // ── SCROLLS → potions table ──────────────────────────────────────────
      if (catIndex === 'scroll') {
        const exists = await pool.query(
          `SELECT id FROM potions WHERE name = $1 AND userguid = $2`,
          [name, userguid]
        );
        if (exists.rows.length) {
          console.log('— already exists (potion), skipped');
          skipped++;
          continue;
        }

        const level      = scrollLevel(name);
        const scrollVal  = SCROLL_VALUE[level] ?? 50;
        const description = descFull.slice(0, 400) || `A magical scroll of spell level ${level}. Cast once then destroyed.`;

        await pool.query(`
          INSERT INTO potions
            (userguid, name, description, type, effectto, effectto2,
             effecttime, effectnumber, effectamount2, value, imageid, soundid, ispublic)
          VALUES ($1,$2,$3,'scroll','Magic',NULL, 0,$4,0,$5, NULL,NULL,FALSE)
        `, [userguid, name, description, level, scrollVal]);

        console.log(`— → potions/scroll  (level ${level}, ${scrollVal}gp)`);
        insertedScrolls++;
        if (i % 20 === 19) await new Promise(r => setTimeout(r, 300));
        continue;
      }

      // ── POTIONS → potions table ──────────────────────────────────────────
      if (catIndex === 'potion') {
        const exists = await pool.query(
          `SELECT id FROM potions WHERE name = $1 AND userguid = $2`,
          [name, userguid]
        );
        if (exists.rows.length) {
          console.log('— already exists (potion), skipped');
          skipped++;
          continue;
        }

        const effectTo     = potionEffectTo(descFull);
        const effectNumber = potionEffectNumber(descFull);
        const effectTime   = potionEffectTime(descFull);
        const potType      = effectTo === 'HP' ? 'health' : 'buff';
        const description  = (item.desc?.[1] ?? item.desc?.[0] ?? name).slice(0, 400);

        await pool.query(`
          INSERT INTO potions
            (userguid, name, description, type, effectto, effectto2,
             effecttime, effectnumber, effectamount2, value, imageid, soundid, ispublic)
          VALUES ($1,$2,$3,$4,$5,NULL, $6,$7,0,$8, NULL,NULL,FALSE)
        `, [userguid, name, description, potType, effectTo, effectTime, effectNumber, value]);

        console.log(`— → potions/potion  (${effectTo} +${effectNumber}, ${effectTime}r, ${value}gp)`);
        insertedPotions++;
        if (i % 20 === 19) await new Promise(r => setTimeout(r, 300));
        continue;
      }

      // ── EVERYTHING ELSE → items table ────────────────────────────────────
      const exists = await pool.query(
        `SELECT id FROM items WHERE name = $1 AND userguid = $2`,
        [name, userguid]
      );
      if (exists.rows.length) {
        console.log('— already exists (item), skipped');
        skipped++;
        continue;
      }

      const itemType   = mapItemType(catIndex);
      const isWeapon   = itemType === 'weapon';
      const isArmor    = itemType === 'armor';

      // Weapon: parse bonus or use rarity fallback
      const weaponBonus = isWeapon
        ? (parsePlusBonus(descFull) || rarityMagicBonus(rarity))
        : 0;

      // AC bonus for rings, cloaks, bracers, armor
      const acBonus    = parseAcBonus(descFull);
      const effectValue = (acBonus > 0) ? acBonus : (isArmor ? rarityMagicBonus(rarity) : 0);
      const effectOn    = (acBonus > 0 || isArmor) ? 'AC' : '';

      // Armor slot
      const armorSlot  = (isArmor || catIndex === 'wondrous-items' || catIndex === 'ring')
        ? getArmorSlot(name)
        : null;

      // Two-handed: parse from desc
      const isTwoHanded = /two-handed|two handed/i.test(descFull);

      // Range: wands/staves are ranged
      const rangeVal = (catIndex === 'wand' || catIndex === 'staff' || catIndex === 'rod') ? '6' : '1';

      // Effect type: all magic items use arcane purple
      const wepEffType  = 'Arcane';
      const wepEffColor = '#8800cc';

      const description = (item.desc?.[1] ?? item.desc?.[0] ?? name).slice(0, 500);

      await pool.query(`
        INSERT INTO items
          (userguid, name, description, type, range, value, weight,
           effectvalue, damage, armorslot, effecton,
           effecttopc, effecttopcvalue,
           weaponeffecttype, weaponeffectcolor,
           imageid, soundid, ispublic, istwohanded)
        VALUES
          ($1,$2,$3,$4,$5,$6,1,
           $7,$8,$9,$10,
           NULL,0,
           $11,$12,
           NULL,NULL,FALSE,$13)
      `, [
        userguid, name, description, itemType, rangeVal, value,
        effectValue, weaponBonus, armorSlot, effectOn,
        wepEffType, wepEffColor,
        isTwoHanded,
      ]);

      console.log(`— → items  (${itemType}, dmg${weaponBonus}, AC+${effectValue}, ${value}gp)`);
      insertedItems++;

      if (i % 20 === 19) await new Promise(r => setTimeout(r, 300));

    } catch (err) {
      console.log(`— ERROR: ${err.message}`);
      errored++;
    }
  }

  console.log(`\n─────────────────────────────────────────────`);
  console.log(`Items inserted    : ${insertedItems}`);
  console.log(`Potions inserted  : ${insertedPotions}`);
  console.log(`Scrolls inserted  : ${insertedScrolls}`);
  console.log(`Skipped           : ${skipped}`);
  console.log(`Errors            : ${errored}`);
  console.log(`─────────────────────────────────────────────`);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
