const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { Client } = require('pg');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const QUESTIONS_PATH = path.join(__dirname, 'spell-sync-questions.txt');
const UPDATES_PATH = path.join(__dirname, 'spell-sync-updates.txt');

const API_BASE = 'https://www.dnd5eapi.co/api/2014/spells';

// Map local spell names to DnD API index slugs where needed.
const MANUAL_INDEX_OVERRIDES = {
  'Mend Wounds': 'cure-wounds',
  'Healing Word': 'healing-word',
  'Greater Heal': 'mass-healing-word',
  'Restore Stamina': 'heroism',
  'Clear Mind': 'calm-emotions',
  "Cat's Grace": 'enhance-ability',
  'Arcane Surge': 'arcane-hand',
  'Eagle Eye': 'clairvoyance',
  'Frost Bolt': 'ray-of-frost',
  'Fire Lance': 'scorching-ray',
  'Lightning Arc': 'lightning-bolt',
  'Mind Spike': 'mind-spike',
  'Dark Drain': 'blight',
  'Blind': 'blindness-deafness',
  'Storm Bolt': 'witch-bolt',
  'Weaken': 'ray-of-enfeeblement',
  'Antipathy/Sympathy': 'antipathy-sympathy',
  'Blindness/Deafness': 'blindness-deafness',
  'Enlarge/Reduce': 'enlarge-reduce',
};

function slugifyName(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function durationToTurns(duration) {
  if (!duration) return 0;
  const text = String(duration).toLowerCase().trim();

  if (text === 'instantaneous') return 0;
  if (text === 'until dispelled') return 9999;

  const m = text.match(/(\d+)\s*(round|rounds|minute|minutes|hour|hours|day|days)/);
  if (!m) return 0;

  const count = Number(m[1]);
  const unit = m[2];
  if (unit.startsWith('round')) return count;
  if (unit.startsWith('minute')) return count * 10;
  if (unit.startsWith('hour')) return count * 600;
  if (unit.startsWith('day')) return count * 14400;
  return 0;
}

function parseRangeToTiles(rangeText) {
  if (!rangeText) return 0;
  const r = String(rangeText).toLowerCase().trim();
  if (r.includes('self')) return 0;
  if (r.includes('touch')) return 1;

  const feet = r.match(/(\d+)\s*feet?/);
  if (feet) return Math.max(1, Math.floor(Number(feet[1]) / 10));

  const mile = r.match(/(\d+)\s*mile/);
  if (mile) return Number(mile[1]) * 528;

  return 1;
}

function extractDamageDice(payload) {
  const slot = payload?.damage?.damage_at_slot_level || null;
  if (slot && typeof slot === 'object') {
    const levels = Object.keys(slot).map(Number).sort((a, b) => a - b);
    if (levels.length > 0) {
      const first = String(slot[String(levels[0])] || '');
      const m = first.match(/(\d+)d(\d+)/i);
      if (m) {
        return { diceCount: Number(m[1]), diceSides: Number(m[2]), sourceLevel: levels[0], raw: first };
      }
    }
  }

  const charLevel = payload?.damage?.damage_at_character_level || null;
  if (charLevel && typeof charLevel === 'object') {
    const levels = Object.keys(charLevel).map(Number).sort((a, b) => a - b);
    if (levels.length > 0) {
      const first = String(charLevel[String(levels[0])] || '');
      const m = first.match(/(\d+)d(\d+)/i);
      if (m) {
        return { diceCount: Number(m[1]), diceSides: Number(m[2]), sourceLevel: levels[0], raw: first };
      }
    }
  }

  return { diceCount: 0, diceSides: 0, sourceLevel: null, raw: null };
}

function extractHealingDice(payload) {
  const heal = payload?.heal_at_slot_level || null;
  if (heal && typeof heal === 'object') {
    const levels = Object.keys(heal).map(Number).sort((a, b) => a - b);
    if (levels.length > 0) {
      const first = String(heal[String(levels[0])] || '');
      const m = first.match(/(\d+)d(\d+)/i);
      if (m) {
        return { diceCount: Number(m[1]), diceSides: Number(m[2]), sourceLevel: levels[0], raw: first };
      }
    }
  }
  return { diceCount: 0, diceSides: 0, sourceLevel: null, raw: null };
}

function estimateTargetCount(payload) {
  const aoe = payload?.area_of_effect;
  if (aoe?.type && typeof aoe.size === 'number' && aoe.size > 0) {
    if (aoe.type.toLowerCase().includes('sphere') || aoe.type.toLowerCase().includes('cube')) return 3;
    if (aoe.type.toLowerCase().includes('cone') || aoe.type.toLowerCase().includes('line')) return 2;
  }

  const desc = Array.isArray(payload?.desc) ? payload.desc.join(' ').toLowerCase() : '';
  if (desc.includes('up to three') || desc.includes('up to 3')) return 3;
  if (desc.includes('up to two') || desc.includes('up to 2')) return 2;
  if (desc.includes('creatures of your choice')) return 3;

  return 1;
}

function computeCostsByLevel(level) {
  const lvl = Number(level || 0);

  // User rule: 1=0, 2=1000 ... interpreted as LTSP baseline by spell level.
  const minLtsp = lvl <= 1 ? 0 : lvl * 1000;

  // User rule: cost 2 MC to cast.
  const magicCost = 2;

  // User rule: SP cost to learn = 0 at level 1, else 2*level+10.
  const spCostToLearn = lvl <= 1 ? 0 : (2 * lvl + 10);

  // User rule: GP to learn = level 0 => 5, else 10*level.
  const gpLearn = lvl === 0 ? 5 : 10 * lvl;

  // User rule: value scale.
  let value;
  if (lvl === 0) value = 10;
  else if (lvl === 1) value = 50;
  else if (lvl === 2) value = 100;
  else value = lvl * 100 - 100;

  return { minLtsp, magicCost, spCostToLearn, gpLearn, value };
}

function appendLines(filePath, lines) {
  fs.appendFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

async function fetchSpellPayload(index) {
  const url = `${API_BASE}/${index}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.json();
}

async function main() {
  fs.writeFileSync(QUESTIONS_PATH, 'Running questions for DnD sync\n\n', 'utf8');
  fs.writeFileSync(UPDATES_PATH, 'Spell sync updates\n\n', 'utf8');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const defaults = await Promise.all([
    client.query(`SELECT id FROM images WHERE name ILIKE 'Magic Scroll' LIMIT 1`),
    client.query(`SELECT id FROM sounds WHERE name ILIKE 'Magic_Shimmer' LIMIT 1`),
  ]);
  const defaultImageId = defaults[0].rows[0]?.id ?? null;
  const defaultSoundId = defaults[1].rows[0]?.id ?? null;

  const spellRows = await client.query(`
    SELECT id, name, description, range, range1, range2, effecton, effecton2,
           effectonpc1, effectonpc2, lastfor1, lastfor2, damage, effectamount2,
           effectdicecount, effectdicesides, effectamount2dicecount, effectamount2dicesides,
           sp, minltsp, learncostgp, magiccost, costtolearn, value, numberoftargets, imageid, soundid
    FROM spells
    ORDER BY id
  `);

  let updated = 0;
  let notFound = 0;
  let withQuestions = 0;

  for (const spell of spellRows.rows) {
    const idx = MANUAL_INDEX_OVERRIDES[spell.name] || slugifyName(spell.name);
    const payload = await fetchSpellPayload(idx);

    if (!payload) {
      notFound++;
      appendLines(QUESTIONS_PATH, [
        `- [Spell ${spell.id}] Could not find DnD spell for "${spell.name}" (tried index: ${idx}).`,
      ]);
      continue;
    }

    const dndLevel = Number(payload.level || 0);
    const range1 = parseRangeToTiles(payload.range);
    const selfTarget = String(payload.range || '').toLowerCase().includes('self');
    const durationTurns = durationToTurns(payload.duration);
    const targets = estimateTargetCount(payload);
    const dice = extractDamageDice(payload);
    const healDice = extractHealingDice(payload);
    const costs = computeCostsByLevel(dndLevel);

    const effect1DiceCount = dice.diceCount > 0 ? dice.diceCount : healDice.diceCount;
    const effect1DiceSides = dice.diceSides > 0 ? dice.diceSides : healDice.diceSides;

    // Effect 2 scaling: use delta between first two slot levels when available.
    let effect2DiceCount = spell.effectamount2dicecount || 0;
    let effect2DiceSides = spell.effectamount2dicesides || 0;
    const slotLevels = payload?.damage?.damage_at_slot_level && typeof payload.damage.damage_at_slot_level === 'object'
      ? Object.keys(payload.damage.damage_at_slot_level).map(Number).sort((a, b) => a - b)
      : [];
    if (slotLevels.length >= 2) {
      const firstRaw = String(payload.damage.damage_at_slot_level[String(slotLevels[0])] || '');
      const secondRaw = String(payload.damage.damage_at_slot_level[String(slotLevels[1])] || '');
      const m1 = firstRaw.match(/(\d+)d(\d+)/i);
      const m2 = secondRaw.match(/(\d+)d(\d+)/i);
      if (m1 && m2) {
        const c1 = Number(m1[1]);
        const s1 = Number(m1[2]);
        const c2 = Number(m2[1]);
        const s2 = Number(m2[2]);
        if (s1 === s2 && c2 > c1) {
          effect2DiceCount = c2 - c1;
          effect2DiceSides = s2;
        }
      }
    }

    const next = {
      range: range1,
      range1,
      range2: spell.range2 || range1,
      effectOnPc1: selfTarget ? true : (spell.effectonpc1 ?? false),
      effectOnPc2: spell.effectonpc2 ?? false,
      lastFor1: durationTurns,
      lastFor2: spell.lastfor2 || 0,
      effectDiceCount: effect1DiceCount,
      effectDiceSides: effect1DiceSides,
      effectAmount2DiceCount: effect2DiceCount,
      effectAmount2DiceSides: effect2DiceSides,
      numberOfTargets: targets || 1,
      magicCost: costs.magicCost,
      costToLearn: costs.spCostToLearn,
      value: costs.value,
      sp: costs.spCostToLearn,
      minLtsp: costs.minLtsp,
      learnCostGp: costs.gpLearn,
      imageId: spell.imageid ?? defaultImageId,
      soundId: spell.soundid ?? defaultSoundId,
      effectOn2: spell.effecton2 || '',
    };

    // If we detect additional dice progression data, flag for effect2 clarification.
    const hasExtraDamageProgression = !!payload?.damage?.damage_at_slot_level && Object.keys(payload.damage.damage_at_slot_level).length > 1;
    const questions = [];

    if (hasExtraDamageProgression && !spell.effectamount2dicecount && !spell.effectamount2dicesides) {
      questions.push('Damage scales by slot level. Should scaling stay in Effect 1 only, or map to Effect 2 as base+bonus?');
    }

    if (payload?.higher_level && Array.isArray(payload.higher_level) && payload.higher_level.length > 0) {
      questions.push('Spell has higher_level text. Confirm how to map this into Effect 2 fields.');
    }

    if (questions.length > 0) {
      withQuestions++;
      appendLines(QUESTIONS_PATH, [
        `- [Spell ${spell.id}] ${spell.name}`,
        ...questions.map((q) => `  - ${q}`),
      ]);
    }

    await client.query(
      `UPDATE spells
       SET range = $1,
           range1 = $2,
           range2 = $3,
           effectonpc1 = $4,
           effectonpc2 = $5,
           lastfor1 = $6,
           lastfor2 = $7,
           effectdicecount = $8,
           effectdicesides = $9,
           effectamount2dicecount = $10,
           effectamount2dicesides = $11,
           numberoftargets = $12,
           magiccost = $13,
           costtolearn = $14,
           value = $15,
             sp = $16,
             minltsp = $17,
             learncostgp = $18,
             imageid = $19,
             soundid = $20,
             effecton2 = $21,
           updatedat = NOW()
           WHERE id = $22`,
      [
        next.range,
        next.range1,
        next.range2,
        next.effectOnPc1,
        next.effectOnPc2,
        next.lastFor1,
        next.lastFor2,
        next.effectDiceCount,
        next.effectDiceSides,
        next.effectAmount2DiceCount,
        next.effectAmount2DiceSides,
        next.numberOfTargets,
        next.magicCost,
        next.costToLearn,
        next.value,
        next.sp,
        next.minLtsp,
        next.learnCostGp,
        next.imageId,
        next.soundId,
        next.effectOn2,
        spell.id,
      ]
    );

    updated++;
    appendLines(UPDATES_PATH, [
      `[${new Date().toISOString()}] Spell ${spell.id} ${spell.name}`,
      `  dndIndex: ${idx}`,
      `  range1: ${spell.range1 ?? spell.range} -> ${next.range1}`,
      `  effectOnPc1: ${spell.effectonpc1} -> ${next.effectOnPc1}`,
      `  lastFor1: ${spell.lastfor1} -> ${next.lastFor1}`,
      `  effectDice: ${spell.effectdicecount}d${spell.effectdicesides} -> ${next.effectDiceCount}d${next.effectDiceSides}`,
      `  targets: ${spell.numberoftargets} -> ${next.numberOfTargets}`,
      `  magicCost: ${spell.magiccost} -> ${next.magicCost}`,
      `  sp(learn SP): ${spell.sp} -> ${next.sp}`,
      `  minLtsp: ${spell.minltsp} -> ${next.minLtsp}`,
      `  learnCostGp: ${spell.learncostgp} -> ${next.learnCostGp}`,
      `  costToLearn(SP): ${spell.costtolearn} -> ${next.costToLearn}`,
      `  value: ${spell.value} -> ${next.value}`,
      `  imageId: ${spell.imageid} -> ${next.imageId}`,
      `  soundId: ${spell.soundid} -> ${next.soundId}`,
      '',
    ]);
  }

  appendLines(QUESTIONS_PATH, [
    '',
    `Summary: updated=${updated}, missingDnDMatch=${notFound}, spellsWithQuestions=${withQuestions}`,
  ]);
  appendLines(UPDATES_PATH, [
    '',
    `Summary: updated=${updated}, missingDnDMatch=${notFound}, spellsWithQuestions=${withQuestions}`,
  ]);

  await client.end();
  console.log(`Done. Updated ${updated} spells. Missing matches: ${notFound}. Questions flagged: ${withQuestions}.`);
  console.log(`Questions: ${QUESTIONS_PATH}`);
  console.log(`Updates: ${UPDATES_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
