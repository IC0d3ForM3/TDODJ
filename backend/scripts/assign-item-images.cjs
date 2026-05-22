'use strict';
const fs = require('fs'), path = require('path');
const { Pool } = require('pg');

// ---------------------------------------------------------------------------
// Keyword → image-ID mapping
// Priority: first matching rule wins (top = highest priority)
// ---------------------------------------------------------------------------
const KEYWORD_RULES = [
  // Swords / blades
  { keywords: ['rapier', 'scimitar', 'saber', 'cutlass', 'falchion'],              ids: [34] },
  { keywords: ['short sword'],                                                       ids: [17] },
  { keywords: ['long sword', 'longsword', 'bastard sword'],                         ids: [21] },
  { keywords: ['great sword', 'greatsword', 'claymore', 'two-handed sword'],        ids: [28] },
  { keywords: ['enchanted sword', 'flame tongue', 'frost brand', 'vorpal'],         ids: [31] },
  { keywords: ['sword', 'blade', 'saber', 'sabre'],                                 ids: [17, 21, 28, 31, 34] },

  // Daggers / knives
  { keywords: ['silver dagger'],                                                     ids: [33] },
  { keywords: ['dagger', 'knife', 'dirk', 'stiletto', 'throwing knife', 'shank'],  ids: [20, 25, 33] },

  // Staves / wands / rods
  { keywords: ['magic wand', 'wand of'],                                             ids: [32] },
  { keywords: ['quarter staff', 'quarterstaff', 'bo staff'],                         ids: [30] },
  { keywords: ['staff', 'stave', 'wand', 'rod', 'scepter', 'orb'],                  ids: [19, 30, 32] },

  // Bows / ranged
  { keywords: ['crossbow', 'hand crossbow', 'heavy crossbow', 'light crossbow'],     ids: [22] },
  { keywords: ['long bow', 'longbow'],                                                ids: [23] },
  { keywords: ['short bow', 'shortbow'],                                              ids: [24] },
  { keywords: ['blowgun', 'dart', 'javelin', 'net', 'sling'],                        ids: [24] },
  { keywords: ['bow', 'arrow', 'quiver', 'bolt'],                                    ids: [22, 23, 24] },

  // Axes
  { keywords: ['battle axe', 'battleaxe', 'great axe', 'greataxe', 'handaxe',
               'hand axe', 'war axe', 'waraxe', 'throwing axe'],                    ids: [29] },
  { keywords: ['halberd', 'glaive', 'polearm', 'pike', 'partisan'],                 ids: [26] },
  { keywords: ['axe', 'hatchet'],                                                    ids: [26, 29] },

  // Hammers / maces / clubs
  { keywords: ['war hammer', 'warhammer', 'maul', 'great club', 'greatclub'],       ids: [27] },
  { keywords: ['mace', 'flail', 'morningstar', 'morning star', 'spiked'],           ids: [35] },
  { keywords: ['hammer', 'club', 'bludgeon'],                                        ids: [27, 35] },

  // Spears / lances
  { keywords: ['spear', 'lance', 'trident', 'ranseur'],                              ids: [26] },

  // Shields / armor
  { keywords: ['shield'],                                                             ids: [18] },
  { keywords: ['helmet', ' helm', 'headband', 'circlet', 'crown', 'cap'],           ids: [69] },
  { keywords: ['breastplate', 'chainmail', 'chain mail', 'plate armor', 'plate mail',
               'scale mail', 'ring mail', 'splint', 'half plate', 'full plate',
               'leather armor', 'studded leather', 'hide armor'],                   ids: [37] },
  { keywords: ['armor', 'armour', 'mail'],                                           ids: [18, 37, 69] },

  // Lock picks
  { keywords: ['lock pick', 'lockpick', 'thieves', 'thieves tools', "burglar's"],   ids: [36] },
  { keywords: ['pick'],                                                               ids: [36] },

  // Scrolls / books
  { keywords: ['spell scroll', 'scroll of', 'arcane scroll'],                        ids: [45, 46] },
  { keywords: ['scroll', 'tome', 'manual', 'grimoire', 'spellbook', 'book',
               'codex', 'treatise'],                                                  ids: [45, 46] },

  // Potions / vials
  { keywords: ['iron tincture', 'tincture'],                                         ids: [44] },
  { keywords: ['potion', 'elixir', 'philter', 'draught', 'brew', 'vial', 'flask',
               'antitoxin', 'alchemist'],                                            ids: [40, 41, 42, 43] },

  // Gems / stones / crystals
  { keywords: ['blue gem', 'blue stone', 'magic stone'],                             ids: [49] },
  { keywords: ['gem', 'ruby', 'sapphire', 'emerald', 'diamond', 'ophal', 'topaz',
               'amethyst', 'crystal', 'jewel', 'stone', 'pearl', 'amber'],         ids: [49, 72] },

  // Chest / box / container
  { keywords: ['chest', 'locked box', 'coffer', 'strongbox', 'lockbox'],            ids: [74] },
];

// Fallback pools per item type when no keyword matched
const TYPE_FALLBACKS = {
  weapon: [17, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35],
  armor:  [18, 37, 69],
  pick:   [36],
  gem:    [49, 72],
  ring:   [49, 72],
  necklace: [49, 72],
  neckless: [49, 72],
};

// ---------------------------------------------------------------------------
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function matchItem(name, type) {
  const lower = name.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return pickRandom(rule.ids);
    }
  }
  // No keyword match — try type fallback
  const fallback = TYPE_FALLBACKS[type];
  if (fallback) return pickRandom(fallback);
  return null; // no match
}

// ---------------------------------------------------------------------------
const parseEnv = (f) => {
  const v = {};
  fs.readFileSync(f, 'utf8').split('\n').forEach(l => {
    const s = l.replace(/\r$/, '');
    const m = s.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) v[m[1].trim()] = m[2].trim();
  });
  return v;
};

const args = process.argv.slice(2);
const target  = args.includes('--target')  ? args[args.indexOf('--target') + 1]  : 'dev';
const dryRun  = args.includes('--dry-run');
const force   = args.includes('--force');   // also update items that already have an image

if (!['dev', 'prod'].includes(target)) {
  console.error('Usage: node assign-item-images.cjs [--target dev|prod] [--dry-run] [--force]');
  process.exit(1);
}

const envFile = target === 'prod' ? '.prod.env' : '.env';
const env = parseEnv(path.join(__dirname, '..', envFile));
const poolOpts = { connectionString: env['DATABASE_URL'] };
if (target === 'prod') poolOpts.ssl = { rejectUnauthorized: false };
const pool = new Pool(poolOpts);

async function main() {
  console.log(`Target: ${target}${dryRun ? ' (DRY RUN)' : ''}${force ? ' (FORCE — including items with images)' : ''}`);

  const where = force ? '' : 'WHERE imageid IS NULL';
  const { rows: items } = await pool.query(
    `SELECT id, name, type FROM items ${where} ORDER BY id`
  );

  console.log(`\nItems to process: ${items.length}`);

  const matched   = [];
  const unmatched = [];

  for (const item of items) {
    const imageId = matchItem(item.name, item.type);
    if (imageId !== null) {
      matched.push({ ...item, imageId });
    } else {
      unmatched.push(item);
    }
  }

  console.log(`  Matched:   ${matched.length}`);
  console.log(`  Unmatched: ${unmatched.length}`);

  if (unmatched.length > 0) {
    console.log('\nUnmatched items (no image assigned):');
    unmatched.forEach(i => console.log(`  id=${i.id} [${i.type}] "${i.name}"`));
  }

  if (matched.length === 0) {
    console.log('\nNothing to update.');
    return;
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Would assign:');
    matched.forEach(i => console.log(`  id=${i.id} [${i.type}] "${i.name}" → imageid=${i.imageId}`));
    return;
  }

  console.log('\nUpdating...');
  let updated = 0;
  for (const item of matched) {
    await pool.query(
      'UPDATE items SET imageid = $1, updatedat = NOW() WHERE id = $2',
      [item.imageId, item.id]
    );
    updated++;
    if (updated % 50 === 0) console.log(`  ${updated}/${matched.length}...`);
  }

  console.log(`\nDone. Updated ${updated} items.`);
}

main().catch(err => { console.error(err); process.exit(1); }).finally(() => pool.end());
