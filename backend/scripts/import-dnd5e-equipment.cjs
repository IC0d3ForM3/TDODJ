/**
 * import-dnd5e-equipment.cjs
 * Fetches all equipment from the D&D 5e 2014 API and inserts into the local items table.
 *
 * Mapping summary:
 *  type          — weapon/armor/light/pick/other  (mounts+vehicles SKIPPED)
 *  damage        — average of damage_dice ("1d8"→5, "2d6"→7)
 *  effectvalue   — armor_class.base for armor/shield; 0 for weapons
 *  effecton      — 'AC' for armor; '' for weapons
 *  range         — melee=1, ranged=range.normal÷5 (grid cells), varchar stored
 *  value         — gp direct; sp÷10; cp÷100; ep÷2
 *  weight        — direct
 *  istwohanded   — properties contains "two-handed" or "versatile" (true for versatile)
 *  armorslot     — keyword-matched to Head/Hands/Legs/Arms/Body
 *  weaponeffecttype/color — mapped from damage_type
 *  ispublic      — FALSE
 *  imageid/soundid — NULL
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

/** "1d8" → 5,  "2d6+3" → 10 */
function avgDice(diceStr = '') {
  const m = diceStr.match(/(\d+)d(\d+)(?:[+-](\d+))?/i);
  if (!m) return 0;
  const count = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const bonus = m[3] ? parseInt(m[3], 10) : 0;
  return Math.round(count * ((sides + 1) / 2) + bonus);
}

/** Convert 5e cost to GP integer */
function toGp(cost) {
  if (!cost) return 0;
  const q = cost.quantity ?? 0;
  switch ((cost.unit ?? 'gp').toLowerCase()) {
    case 'gp': return q;
    case 'sp': return Math.max(1, Math.round(q / 10));
    case 'cp': return Math.max(1, Math.round(q / 100));
    case 'ep': return Math.max(1, Math.round(q / 2));
    default: return q;
  }
}

/** Map damage_type → { weaponEffectType, weaponEffectColor } */
function damageTypeToEffect(dmgType = '') {
  switch (dmgType.toLowerCase()) {
    case 'fire':      return { type: 'Fire',     color: '#ff4400' };
    case 'cold':      return { type: 'Ice',      color: '#88ccff' };
    case 'lightning': return { type: 'Electric', color: '#ffff00' };
    case 'poison':    return { type: 'Poison',   color: '#44bb44' };
    case 'acid':      return { type: 'Acid',     color: '#aaff00' };
    case 'necrotic':  return { type: 'Shadow',   color: '#660066' };
    default:          return { type: 'Blood',    color: '#cc0000' };
  }
}

/** Map equipment category + item name → items.type constraint value */
function mapItemType(equip) {
  const cat = equip.equipment_category?.index ?? '';
  const name = (equip.name ?? '').toLowerCase();
  const gearCat = equip.gear_category?.index ?? '';

  if (cat === 'weapon') return 'weapon';
  if (cat === 'armor') return 'armor';

  // Adventuring gear sub-categories
  if (cat === 'adventuring-gear') {
    if (name.includes('torch') || name.includes('lantern') || name.includes('candle')) return 'light';
    if (name.includes('lock pick') || name.includes('thieves')) return 'pick';
    return 'other';
  }

  if (cat === 'tools') {
    if (name.includes('thieves') || name.includes('lock pick')) return 'pick';
    return 'other';
  }

  // Skip mounts and vehicles entirely
  if (cat === 'mounts-and-vehicles') return null;

  return 'other';
}

/** Derive armorslot from item name (null = no specific slot) */
function getArmorSlot(name = '') {
  const n = name.toLowerCase();
  if (n.includes('helmet') || n.includes('helm') || n.includes('hood') || n.includes('cap') || n.includes('hat')) return 'Head';
  if (n.includes('gauntlet') || n.includes('glove')) return 'Hands';
  if (n.includes('boot') || n.includes('greave') || n.includes('sabaton') || n.includes('sandal')) return 'Legs';
  if (n.includes('bracer') || n.includes('arm guard') || n.includes('vambrace')) return 'Arms';
  // Standard body armors
  if (n.includes('armor') || n.includes('mail') || n.includes('plate') || n.includes('leather') ||
      n.includes('hide') || n.includes('padded') || n.includes('splint') || n.includes('breastplate') ||
      n.includes('cuirass') || n.includes('hauberk') || n.includes('tunic')) return 'Body';
  // Shield has no armorslot (offhand)
  if (n.includes('shield')) return null;
  return 'Body'; // Default for unrecognized armor
}

/** Build a description if the API doesn't provide one */
function buildDescription(equip) {
  const desc = equip.desc;
  if (desc && desc.length > 0) return desc[0];

  const cat = equip.equipment_category?.name ?? 'Item';
  const parts = [];

  if (equip.weapon_category) parts.push(`${equip.weapon_category} ${equip.weapon_range ?? 'weapon'}.`);
  else if (equip.armor_category) parts.push(`${equip.armor_category} armor.`);
  else parts.push(`${cat}.`);

  if (equip.damage?.damage_dice) {
    const dmgType = equip.damage.damage_type?.name ?? '';
    parts.push(`Deals ${equip.damage.damage_dice} ${dmgType} damage.`);
  }
  if (equip.two_handed_damage?.damage_dice) {
    parts.push(`Two-handed: ${equip.two_handed_damage.damage_dice}.`);
  }
  if (equip.armor_class?.base) parts.push(`AC ${equip.armor_class.base}.`);
  if (equip.stealth_disadvantage) parts.push('Imposes disadvantage on Stealth checks.');
  if (equip.str_minimum) parts.push(`Requires ${equip.str_minimum} Strength.`);

  return parts.join(' ') || equip.name;
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

  // Fetch equipment index
  const listData = await fetchJson(`${API_BASE}/api/2014/equipment`);
  const equipList = listData.results;
  console.log(`${equipList.length} equipment entries found in API.\n`);

  let inserted = 0;
  let skipped  = 0;
  let errored  = 0;

  for (let i = 0; i < equipList.length; i++) {
    const { name, url } = equipList[i];
    process.stdout.write(`[${String(i + 1).padStart(3)}/${equipList.length}] ${name.padEnd(40)} `);

    try {
      const equip = await fetchJson(`${API_BASE}${url}`);

      // Determine type — null means skip
      const itemType = mapItemType(equip);
      if (itemType === null) {
        console.log('— SKIPPED (mount/vehicle)');
        skipped++;
        continue;
      }

      // Skip if already in DB
      const exists = await pool.query(
        `SELECT id FROM items WHERE name = $1 AND userguid = $2`,
        [name, userguid]
      );
      if (exists.rows.length) {
        console.log('— already exists, skipped');
        skipped++;
        continue;
      }

      // ── weapon fields ──
      const dmgDice = equip.damage?.damage_dice ?? '';
      const dmgType = equip.damage?.damage_type?.name ?? '';
      const damage  = avgDice(dmgDice);
      const { type: wepEffType, color: wepEffColor } = damageTypeToEffect(dmgType);

      const props = (equip.properties ?? []).map(p => p.index);
      const isTwoHanded = props.includes('two-handed') || props.includes('versatile');

      // Range: melee=1, ranged=cells
      let rangeVal = '1';
      if (equip.weapon_range === 'Ranged' && equip.range?.normal) {
        rangeVal = String(Math.round(equip.range.normal / 5));
      }

      // ── armor fields ──
      const acBase     = equip.armor_class?.base ?? 0;
      const effectVal  = itemType === 'armor' ? acBase : 0;
      const effectOn   = itemType === 'armor' ? 'AC' : '';
      const armorSlot  = itemType === 'armor' ? getArmorSlot(name) : null;

      // ── shared ──
      const value       = toGp(equip.cost);
      const weight      = Math.ceil(equip.weight ?? 0);  // API can return 0.25/0.5 — always round up to nearest int
      const description = buildDescription(equip);

      await pool.query(`
        INSERT INTO items
          (userguid, name, description, type, range, value, weight,
           effectvalue, damage, armorslot, effecton,
           effecttopc, effecttopcvalue,
           weaponeffecttype, weaponeffectcolor,
           imageid, soundid, ispublic, istwohanded)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11,
           NULL, 0,
           $12, $13,
           NULL, NULL, FALSE, $14)
      `, [
        userguid, name, description, itemType, rangeVal, value, weight,
        effectVal, damage, armorSlot, effectOn,
        wepEffType, wepEffColor,
        isTwoHanded,
      ]);

      console.log(`— inserted  (${itemType}, dmg ${damage}, AC${acBase}, ${value}gp, range ${rangeVal})`);
      inserted++;

      // Polite pause every 20 items
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
