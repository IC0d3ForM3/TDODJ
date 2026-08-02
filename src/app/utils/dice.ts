/**
 * Shared dice-rolling utilities for the Dark Dungeons of Danny Joe stat
 * rework (species/class stat generation, traps, scrolls, etc.).
 */

/** Rolls a single die with the given number of sides (1..sides). */
export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/** Rolls `count` dice with `sides` sides each and returns their sum. */
export function rollDice(count: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += rollDie(sides);
  }
  return total;
}

/**
 * Rolls a dice notation string such as "2d6", "2d6+3", "1d12-2", or
 * "1d6÷2" (divides the dice roll itself by 2, rounded down, per the
 * Fighter/Healer/Ranger AC Bonus formulas). Accepts "÷" or "/" for division.
 * Also accepts a plain integer string (e.g. "5") for backward compatibility
 * with data saved before a field was converted to dice notation (trap
 * damage), returning that flat number unchanged.
 * Returns 0 if the notation cannot be parsed.
 */
export function rollNotation(notation: string): number {
  const trimmed = notation.trim();
  const plainInt = /^\d+$/.exec(trimmed);
  if (plainInt) {
    return Number.parseInt(trimmed, 10);
  }

  const match = /^(\d+)d(\d+)(?:([+\-÷/])(\d+))?$/i.exec(trimmed);
  if (!match) {
    return 0;
  }

  const count = Number.parseInt(match[1], 10);
  const sides = Number.parseInt(match[2], 10);
  const roll = rollDice(count, sides);
  const operator = match[3];
  const operand = match[4] ? Number.parseInt(match[4], 10) : 0;

  if (!operator) {
    return roll;
  }
  if (operator === '+') {
    return roll + operand;
  }
  if (operator === '-') {
    return roll - operand;
  }
  // Division ('÷' or '/'): divide the dice roll, rounded down.
  return operand > 0 ? Math.floor(roll / operand) : roll;
}

/**
 * Returns the maximum possible value of a dice notation string (or a plain
 * integer, unchanged) without rolling — used where a deterministic "worst
 * case" number is needed (e.g. jump-check DC vs a hidden trap's damage)
 * instead of actually rolling the dice.
 * Returns 0 if the notation cannot be parsed.
 */
export function maxNotation(notation: string): number {
  const trimmed = notation.trim();
  const plainInt = /^\d+$/.exec(trimmed);
  if (plainInt) {
    return Number.parseInt(trimmed, 10);
  }

  const match = /^(\d+)d(\d+)(?:([+\-÷/])(\d+))?$/i.exec(trimmed);
  if (!match) {
    return 0;
  }

  const count = Number.parseInt(match[1], 10);
  const sides = Number.parseInt(match[2], 10);
  const maxRoll = count * sides;
  const operator = match[3];
  const operand = match[4] ? Number.parseInt(match[4], 10) : 0;

  if (!operator) {
    return maxRoll;
  }
  if (operator === '+') {
    return maxRoll + operand;
  }
  if (operator === '-') {
    return maxRoll - operand;
  }
  return operand > 0 ? Math.floor(maxRoll / operand) : maxRoll;
}
