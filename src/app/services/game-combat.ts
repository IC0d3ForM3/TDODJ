import { Injectable, signal } from '@angular/core';

export type TurnPhase = 'player' | 'monsters' | 'gameover';

export interface ActiveEffect {
  effectOn: string;
  effectAmount: number;
  remainingAE: number;
  sourceName: string;
}

export interface GameMonsterInstance {
  placementIndex: number;
  monsterId: number;
  row: number;
  column: number;
  roam: boolean;
  currentHp: number;
  isDead: boolean;
  remainingAE: number;
  attacksUsedThisTurn: number;
  dropTresherIds: number[];
  dropKeyIds: number[];
  activeEffects: ActiveEffect[];
  isDormant: boolean;
  guardRow: number | null;
  guardColumn: number | null;
  isStationary: boolean;
  stationaryTriggerRow: number | null;
  stationaryTriggerCol: number | null;
  noAttackUnlessAttacked: boolean;
  hasCalledReinforcements: boolean;
  // NPC state
  hasGreeted: boolean;
  hasSharedInfo: boolean;
  isSpared: boolean;
  npcIsHostile: boolean;
}

export interface CombatLogEntry {
  text: string;
}

@Injectable({ providedIn: 'root' })
export class GameCombatService {
  // Turn management
  readonly turnPhase = signal<TurnPhase>('player');

  // Player action economy
  readonly playerAE = signal(0);
  readonly playerMaxAE = 5;
  readonly playerNOA = signal(1);
  readonly playerAttacksThisTurn = signal(0);
  readonly playerNOD = signal(1);
  readonly playerDefendsThisTurn = signal(0);
  readonly playerDefendStacks = signal(0);
  readonly playerBoostAttackACPenalty = signal(0);
  readonly playerSearchesThisTurn = signal(0);

  // Player identity
  readonly playerType = signal<string | null>(null);
  readonly playerSpecies = signal<string | null>(null);
  readonly playerName = signal<string | null>(null);

  // Player stats
  readonly playerHp = signal(20);
  readonly playerMaxHp = signal(20);
  readonly playerBaseAC = signal<number>(10);
  readonly playerSp = signal<number>(0);
  readonly playerMind = signal<number>(0);
  readonly playerStamina = signal<number>(0);
  readonly playerStrength = signal<number>(0);
  readonly playerMagicPower = signal<number>(0);

  // Monster state
  readonly monsterInstances = signal<GameMonsterInstance[]>([]);

  // Combat log
  readonly combatLog = signal<CombatLogEntry[]>([]);

  // Spell targeting
  readonly selectedSpellId = signal<number | null>(null);
  readonly selectedCombatTarget = signal<{ row: number; column: number } | null>(null);
  readonly outOfRangeTarget = signal<{ row: number; column: number } | null>(null);
  readonly comboTracker = signal<{ placementIndex: number; count: number } | null>(null);

  // Active effects
  readonly playerActiveEffects = signal<ActiveEffect[]>([]);

  // Visual effects
  readonly bloodSplatter = signal<{ x: number; y: number; r: number }[]>([]);
  readonly playerHitFlash = signal(false);
  readonly playerYellowHitFlash = signal(false);
  readonly spellBeamEffects = signal<{ fromRow: number; fromCol: number; toRow: number; toCol: number; isHP: boolean }[]>([]);
  readonly monsterGlowKeys = signal<Set<string>>(new Set());
  readonly spellTargetMode = signal<{ spellId: number; maxTargets: number; targets: { row: number; column: number }[] } | null>(null);
  readonly playerDeathCause = signal<string | null>(null);
}
