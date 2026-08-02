/**
 * Phase 6 (Monster type combat modifiers): best-guess default combat
 * modifiers keyed purely off the existing `Monster.type` string. No new
 * data model / creator UI / migration is needed - every monster already
 * has a `type` field, this just gives it mechanical weight.
 */
export interface MonsterTypeCombatModifiers {
  /** Added to the monster's own to-hit roll when attacking the player. */
  toHitBonus: number;
  /** Added to the monster's effective AC. */
  acBonus: number;
  /** HP regenerated at the start of each of the monster's turns (capped at max HP). */
  regenPerRound: number;
  /** If true, spell effects targeting the monster's Mind stat are negated. */
  mindDamageImmune: boolean;
  /** If true, damage from attacks with no magic bonus is halved. */
  resistsNonMagicWeapons: boolean;
}

const DEFAULT_MODIFIERS: MonsterTypeCombatModifiers = {
  toHitBonus: 0,
  acBonus: 0,
  regenPerRound: 0,
  mindDamageImmune: false,
  resistsNonMagicWeapons: false,
};

const MONSTER_TYPE_COMBAT_MODIFIERS: Record<string, MonsterTypeCombatModifiers> = {
  Aberration: { ...DEFAULT_MODIFIERS, toHitBonus: 1 },
  Beast: { ...DEFAULT_MODIFIERS },
  Celestial: { ...DEFAULT_MODIFIERS, toHitBonus: 1, acBonus: 2, regenPerRound: 1, mindDamageImmune: true },
  Construct: { ...DEFAULT_MODIFIERS, acBonus: 2, mindDamageImmune: true, resistsNonMagicWeapons: true },
  Dragon: { ...DEFAULT_MODIFIERS, toHitBonus: 2, acBonus: 2, regenPerRound: 1 },
  Elemental: { ...DEFAULT_MODIFIERS, toHitBonus: 1, acBonus: 1, regenPerRound: 1, mindDamageImmune: true, resistsNonMagicWeapons: true },
  Fey: { ...DEFAULT_MODIFIERS, acBonus: 1 },
  Fiend: { ...DEFAULT_MODIFIERS, toHitBonus: 1, acBonus: 1, regenPerRound: 1, mindDamageImmune: true },
  Giant: { ...DEFAULT_MODIFIERS, toHitBonus: 1 },
  Humanoid: { ...DEFAULT_MODIFIERS },
  Monstrosity: { ...DEFAULT_MODIFIERS, toHitBonus: 1 },
  Ooze: { ...DEFAULT_MODIFIERS, acBonus: -1, regenPerRound: 1, mindDamageImmune: true },
  Plant: { ...DEFAULT_MODIFIERS, regenPerRound: 1, mindDamageImmune: true },
  Specter: { ...DEFAULT_MODIFIERS, toHitBonus: 1, acBonus: 2, mindDamageImmune: true, resistsNonMagicWeapons: true },
  'Swarm of Tiny beasts': { ...DEFAULT_MODIFIERS, acBonus: 2 },
  Undead: { ...DEFAULT_MODIFIERS, acBonus: 1, mindDamageImmune: true },
  Other: { ...DEFAULT_MODIFIERS },
};

export function getMonsterTypeCombatModifiers(type: string | null | undefined): MonsterTypeCombatModifiers {
  if (!type) return DEFAULT_MODIFIERS;
  return MONSTER_TYPE_COMBAT_MODIFIERS[type] ?? DEFAULT_MODIFIERS;
}
