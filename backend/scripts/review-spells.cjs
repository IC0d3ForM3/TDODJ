/**
 * review-spells.cjs
 * Interactive CLI: loop through all spells, show name + description,
 * suggest values, and prompt for each property. Enter = keep default.
 *
 * Run from backend/: node .\scripts\review-spells.cjs
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));
const updateLogPath = path.join(__dirname, 'review-spells-updates.txt');

// ─── Constants ───────────────────────────────────────────────────────────────

const EFFECT_ON_OPTIONS = [
  'HP', 'Defense', 'Stamina', 'Mind', 'Magic',
  'Sight', 'ROS', 'AE', 'Action Economy', '# of Attacks', 'Remove Curse',
];
const EFFECT_TYPES = ['Fire', 'Ice', 'Lightning', 'Other'];
const TYPE_COLORS  = { Fire: '#ee3300', Ice: '#88ddff', Lightning: '#4466ff', Other: '#ffffff' };

// ANSI helpers (work in Windows Terminal / modern PowerShell)
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  cyan:   '\x1b[36m',
  yellow: '\x1b[33m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  blue:   '\x1b[34m',
  grey:   '\x1b[90m',
};
const h1 = (s) => `${C.bold}${C.cyan}${s}${C.reset}`;
const h2 = (s) => `${C.bold}${s}${C.reset}`;
const dim = (s) => `${C.grey}${s}${C.reset}`;
const ok  = (s) => `${C.green}${s}${C.reset}`;
const warn= (s) => `${C.yellow}${s}${C.reset}`;
const changed = (k, a, b) => `  ${C.yellow}${k}${C.reset}: ${C.dim}${a ?? 'null'}${C.reset} → ${C.green}${b}${C.reset}`;

function appendUpdateLog(lines) {
  fs.appendFileSync(updateLogPath, `${lines.join('\n')}\n\n`, 'utf8');
}

// ─── Suggestion engine ───────────────────────────────────────────────────────

function suggestForSpell(spell) {
  const text = `${spell.name} ${spell.description}`.toLowerCase();

  let effectType = spell.effecttype || 'Other';
  if (/fire|flame|burn|blaze|ember|scorch|inferno|magma|ignite|pyre/.test(text))       effectType = 'Fire';
  else if (/ice|frost|cold|freeze|blizzard|chill|frozen|glacial|arctic|snow|crystal/.test(text)) effectType = 'Ice';
  else if (/lightning|thunder|bolt|electric|spark|storm|shock|zap|arc/.test(text))     effectType = 'Lightning';

  const effectColor = TYPE_COLORS[effectType];

  let range1 = spell.range1 || spell.range || 0;
  if (range1 === 0) {
    if (/touch|melee|adjacent|self/.test(text))       range1 = 1;
    else if (/long|far|distant|across|across/.test(text)) range1 = 8;
    else                                               range1 = 3;
  }

  let numberOfTargets = spell.numberoftargets || 1;
  if (numberOfTargets === 1 && /all enemies|everyone|area|aoe|multiple targets|group of/.test(text))
    numberOfTargets = 3;

  let magicCost = spell.magiccost || 1;
  if (/powerful|great|devastating|supreme|ultimate|massive|mighty|ancient/.test(text)) magicCost = Math.max(magicCost, 4);
  else if (/minor|small|weak|simple|basic|novice|apprentice|cantrip/.test(text))       magicCost = Math.min(magicCost, 2);

  let lastFor1 = spell.lastfor1 || spell.lastfor || 0;
  if (lastFor1 === 0 && /lasting|persist|duration|for \d+ turn|for \d+ round|lingers/.test(text)) lastFor1 = 3;

  let effectOn = spell.effecton || 'HP';
  // Only suggest if currently blank/default
  if (!spell.effecton || spell.effecton === 'HP') {
    if (/mana|magic point|arcane energy/.test(text))        effectOn = 'Magic';
    else if (/stamina|endur|fatigue|exhaust/.test(text))    effectOn = 'Stamina';
    else if (/mind|mental|psyche|sanity|will/.test(text))   effectOn = 'Mind';
    else if (/defense|shield|protect|armor/.test(text))     effectOn = 'Defense';
    else if (/sight|blind|invisible|vision|eye/.test(text)) effectOn = 'Sight';
    else if (/action|initiative|speed|haste|slow/.test(text)) effectOn = 'Action Economy';
    else if (/remove curse|uncurse|cleanse curse/.test(text)) effectOn = 'Remove Curse';
    // else keep HP
  }

  return { effectType, effectColor, range1, numberOfTargets, magicCost, lastFor1, effectOn };
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function mediaNameForId(table, id) {
  if (!id) return null;
  try {
    const { rows } = await pool.query(`SELECT name FROM ${table} WHERE id = $1`, [id]);
    return rows[0]?.name ?? null;
  } catch { return null; }
}

async function mediaIdForName(table, name) {
  try {
    const { rows } = await pool.query(`SELECT id FROM ${table} WHERE name ILIKE $1 LIMIT 1`, [name]);
    return rows[0]?.id ?? null;
  } catch { return null; }
}

// ─── Prompt helpers ──────────────────────────────────────────────────────────

/** Ask for a free-text/number field. Enter = keep default. */
async function promptField(label, current, hint) {
  const hintStr = hint ? dim(` [hint: ${hint}]`) : '';
  const ans = await ask(`  ${h2(label)}${hintStr} ${dim(`[${current}]`)}: `);
  const trimmed = ans.trim();
  if (trimmed === '') return current;
  return isNaN(trimmed) ? trimmed : Number(trimmed);
}

/** Ask for a boolean (y/n). Enter = keep default. */
async function promptBool(label, current) {
  const def = current ? 'y' : 'n';
  const ans = await ask(`  ${h2(label)} (y/n) ${dim(`[${def}]`)}: `);
  const trimmed = ans.trim().toLowerCase();
  if (trimmed === '') return current;
  return trimmed === 'y' || trimmed === 'true' || trimmed === '1';
}

/** Ask for a value from a numbered list. Enter = keep default. */
async function promptOption(label, current, options, allowEmpty = false) {
  const allOpts = allowEmpty ? ['(none)', ...options] : options;
  const optStr = allOpts.map((o, i) => `${dim(i + '=')}${o}`).join('  ');
  console.log(`  ${optStr}`);
  const ans = await ask(`  ${h2(label)} ${dim(`[${current || '(none)'}]`)}: `);
  const trimmed = ans.trim();
  if (trimmed === '') return current;
  // Accept number index
  if (!isNaN(trimmed)) {
    const idx = Number(trimmed);
    const chosen = allOpts[idx];
    if (chosen !== undefined) return chosen === '(none)' ? '' : chosen;
  }
  // Accept text
  return trimmed;
}

/** Ask for a media field by name, resolve to ID. */
async function promptMedia(label, currentId, table, defaultName, defaultId) {
  const currentName = await mediaNameForId(table, currentId);
  const display = currentName ?? (currentId ? `ID ${currentId}` : dim(`(none) → default: ${defaultName}`));
  const ans = await ask(`  ${h2(label)} ${dim(`[${display}]`)}: `);
  const trimmed = ans.trim();
  if (trimmed === '') return currentId ?? defaultId;
  if (!isNaN(trimmed)) return Number(trimmed);
  const found = await mediaIdForName(table, trimmed);
  if (found) { console.log(dim(`    → ID ${found}`)); return found; }
  console.log(warn(`    → "${trimmed}" not found, keeping current`));
  return currentId ?? defaultId;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(h1('\n╔══════════════════════════════════════╗'));
  console.log(h1('║   Spell Reviewer — Interactive Edit  ║'));
  console.log(h1('╚══════════════════════════════════════╝\n'));

  const defaultImageId = await mediaIdForName('images', 'Magic Scroll');
  const defaultSoundId = await mediaIdForName('sounds', 'Magic_Shimmer');
  console.log(`Default image "Magic Scroll"  → ${defaultImageId ? ok(`ID ${defaultImageId}`) : warn('not found')}`);
  console.log(`Default sound "Magic_Shimmer" → ${defaultSoundId ? ok(`ID ${defaultSoundId}`) : warn('not found')}\n`);

  const { rows: spells } = await pool.query(`
    SELECT s.*, u.username
    FROM spells s
    LEFT JOIN users u ON s.userguid = u.key
    ORDER BY s.id
  `);

  console.log(`Found ${h2(spells.length)} spells.\n`);
  console.log(dim('Commands: Enter = accept default | s = skip spell | q = quit\n'));

  let saved = 0;
  let skipped = 0;

  for (let i = 0; i < spells.length; i++) {
    const spell = spells[i];
    const sg = suggestForSpell(spell);

    console.log(`\n${h1('═'.repeat(62))}`);
    console.log(h1(`[${i + 1}/${spells.length}]  ID ${spell.id} — ${spell.name}`) + dim(`  (${spell.username || 'unknown user'})`));
    console.log(dim('─'.repeat(62)));
    console.log(`${h2('Description:')} ${spell.description || dim('(none)')}`);
    console.log(dim('─'.repeat(62)));
    console.log(dim(`Suggestions → effectType: ${sg.effectType}  effectOn: ${sg.effectOn}  range: ${sg.range1}  targets: ${sg.numberOfTargets}  magic cost: ${sg.magicCost}  lastFor: ${sg.lastFor1}`));

    const nav = await ask(`\n${dim('(s)kip  (q)uit  or press Enter to edit')}: `);
    if (nav.trim().toLowerCase() === 'q') { console.log('\nQuitting.'); break; }
    if (nav.trim().toLowerCase() === 's') { skipped++; continue; }

    // Build working copy (use DB value; fall back to suggestions where empty/default)
    const v = {
      effecttype:           spell.effecttype || sg.effectType,
      effectcolor:          spell.effectcolor || sg.effectColor,
      effecton:             spell.effecton || sg.effectOn,
      effecton2:            spell.effecton2 || '',
      effectonpc1:          spell.effectonpc1 ?? false,
      effectonpc2:          spell.effectonpc2 ?? false,
      damage:               spell.damage ?? 0,
      effectamount2:        spell.effectamount2 ?? 0,
      effectdicecount:      spell.effectdicecount ?? 1,
      effectdicesides:      spell.effectdicesides ?? 0,
      effectamount2dicecount:  spell.effectamount2dicecount ?? 0,
      effectamount2dicesides:  spell.effectamount2dicesides ?? 0,
      range1:               spell.range1 || spell.range || sg.range1,
      range2:               spell.range2 || 0,
      lastfor1:             spell.lastfor1 || spell.lastfor || sg.lastFor1,
      lastfor2:             spell.lastfor2 || 0,
      numberoftargets:      spell.numberoftargets || sg.numberOfTargets,
      magiccost:            spell.magiccost || sg.magicCost,
      successtestvalue:     spell.successtestvalue ?? 0,
      costtolearn:          spell.costtolearn ?? 0,
      value:                spell.value ?? 0,
      sp:                   spell.sp ?? 0,
      imageid:              spell.imageid ?? null,
      soundid:              spell.soundid ?? null,
      ispublic:             spell.ispublic ?? false,
    };

    // ── Effect type & visual ────────────────────────────────────────────────
    console.log(`\n  ${h2('── Effect Type & Visual ─────────────────────────')}`);
    v.effecttype  = await promptOption('Effect Type', v.effecttype, EFFECT_TYPES);
    // Auto-update color when type changed
    if (v.effecttype !== (spell.effecttype || 'Other')) {
      v.effectcolor = TYPE_COLORS[v.effecttype] || '#ffffff';
    }
    v.effectcolor = await promptField('Effect Color (hex)', v.effectcolor);

    // ── What it affects ────────────────────────────────────────────────────
    console.log(`\n  ${h2('── What It Affects ──────────────────────────────')}`);
    v.effecton    = await promptOption('Effect On 1', v.effecton, EFFECT_ON_OPTIONS);
    v.effectonpc1 = await promptBool('Effect On PC 1', v.effectonpc1);
    v.effecton2   = await promptOption('Effect On 2', v.effecton2, EFFECT_ON_OPTIONS, true);
    v.effectonpc2 = await promptBool('Effect On PC 2', v.effectonpc2);

    // ── Dice – Effect 1 ───────────────────────────────────────────────────
    console.log(`\n  ${h2('── Dice — Effect 1 ──────────────────────────────')}`);
    v.effectdicecount  = await promptField('Effect 1 Dice Count (X in XdY)', v.effectdicecount, `e.g. 2 for 2d6`);
    v.effectdicesides  = await promptField('Effect 1 Dice Sides (Y in XdY)', v.effectdicesides, `e.g. 6 for 2d6`);

    // ── Dice – Effect 2 ───────────────────────────────────────────────────
    console.log(`\n  ${h2('── Dice — Effect 2 ──────────────────────────────')}`);
    v.effectamount2dicecount  = await promptField('Effect 2 Dice Count (X in XdY)', v.effectamount2dicecount);
    v.effectamount2dicesides  = await promptField('Effect 2 Dice Sides (Y in XdY)', v.effectamount2dicesides);

    // ── Range & Duration ──────────────────────────────────────────────────
    console.log(`\n  ${h2('── Range & Duration ─────────────────────────────')}`);
    v.range1          = await promptField('Range 1 (tiles)', v.range1);
    v.range2          = await promptField('Range 2 (tiles)', v.range2);
    v.lastfor1        = await promptField('Last For 1 (turns, 0=instant)', v.lastfor1);
    v.lastfor2        = await promptField('Last For 2 (turns)', v.lastfor2);
    v.numberoftargets = await promptField('Number of Targets', v.numberoftargets);

    // ── Cost & Value ──────────────────────────────────────────────────────
    console.log(`\n  ${h2('── Cost & Value ─────────────────────────────────')}`);
    v.magiccost        = await promptField('Magic Cost', v.magiccost);
    v.successtestvalue = await promptField('Success Test Value (0=auto-pass)', v.successtestvalue);
    v.costtolearn      = await promptField('Cost to Learn (gold)', v.costtolearn);
    v.value            = await promptField('Value (gold)', v.value);
    v.sp               = await promptField('SP', v.sp);

    // ── Media ─────────────────────────────────────────────────────────────
    console.log(`\n  ${h2('── Media ────────────────────────────────────────')}`);
    v.imageid = await promptMedia('Image name', v.imageid, 'images', 'Magic Scroll', defaultImageId);
    v.soundid = await promptMedia('Sound name', v.soundid, 'sounds', 'Magic_Shimmer', defaultSoundId);

    // ── Visibility ────────────────────────────────────────────────────────
    console.log(`\n  ${h2('── Visibility ───────────────────────────────────')}`);
    v.ispublic = await promptBool('Is Public', v.ispublic);

    // ── Summary of changes ────────────────────────────────────────────────
    console.log(`\n  ${h2('── Changes ──────────────────────────────────────')}`);
    const diffs = Object.entries(v).filter(([k, val]) => String(spell[k] ?? '') !== String(val ?? ''));
    if (diffs.length === 0) {
      console.log(dim('  (no changes)'));
    } else {
      diffs.forEach(([k, val]) => console.log(changed(k, spell[k], val)));
    }

    const saveAns = await ask(`\n  ${ok('Save?')} (y/n) ${dim('[y]')}: `);
    if (saveAns.trim().toLowerCase() !== 'n') {
      await pool.query(`
        UPDATE spells SET
          effecttype            = $1,
          effectcolor           = $2,
          effecton              = $3,
          effecton2             = $4,
          effectonpc1           = $5,
          effectonpc2           = $6,
          damage                = $7,
          effectamount2         = $8,
          effectdicecount       = $9,
          effectdicesides       = $10,
          effectamount2dicecount = $11,
          effectamount2dicesides = $12,
          range1                = $13,
          range2                = $14,
          lastfor1              = $15,
          lastfor2              = $16,
          numberoftargets       = $17,
          magiccost             = $18,
          successtestvalue      = $19,
          costtolearn           = $20,
          value                 = $21,
          sp                    = $22,
          imageid               = $23,
          soundid               = $24,
          ispublic              = $25,
          updatedat             = NOW()
        WHERE id = $26
      `, [
        v.effecttype, v.effectcolor,
        v.effecton, v.effecton2 || '',
        v.effectonpc1, v.effectonpc2,
        v.damage, v.effectamount2,
        v.effectdicecount, v.effectdicesides,
        v.effectamount2dicecount, v.effectamount2dicesides,
        v.range1, v.range2,
        v.lastfor1, v.lastfor2,
        v.numberoftargets, v.magiccost,
        v.successtestvalue, v.costtolearn,
        v.value, v.sp,
        v.imageid, v.soundid,
        v.ispublic,
        spell.id,
      ]);
      saved++;
      const timestamp = new Date().toISOString();
      const logLines = [
        `[${timestamp}] Spell ID ${spell.id} — ${spell.name}`,
        ...diffs.map(([k, val]) => `- ${k}: ${spell[k] ?? 'null'} -> ${val}`),
      ];
      appendUpdateLog(logLines);
      console.log(ok(`  ✓ Saved.`));
    } else {
      skipped++;
      console.log(dim(`  Skipped.`));
    }
  }

  console.log(`\n${h1('═'.repeat(62))}`);
  console.log(`Done! ${ok(`${saved} saved`)}  ${dim(`${skipped} skipped`)}`);
  rl.close();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  pool.end();
  process.exit(1);
});
