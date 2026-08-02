import { Injectable, signal } from '@angular/core';
import { MonsterDialogueEntry } from '../interfaces/game';

export type TurnPhase = 'player' | 'monsters' | 'gameover';

export interface ActiveEffect {
  effectOn: string;
  effectAmount: number;
  remainingAE: number;
  sourceName: string;
  behavior?: 'tick' | 'modifier';
}

export interface GameMonsterInstance {
  placementIndex: number;
  monsterId: number;
  row: number;
  column: number;
  roam: boolean;
  currentHp: number;
  currentMagic: number;
  permanentStatModifiers: Record<string, number>;
  isDead: boolean;
  remainingAE: number;
  attacksUsedThisTurn: number;
  hasCastSpellThisTurn: boolean;
  dropTresherIds: number[];
  dropKeyIds: number[];
  dropItemIds: number[];
  dropSpellIds: number[];
  dropPotionIds: number[];
  dropGold: number;
  dropSilver: number;
  dropCopper: number;
  dropZinc: number;
  activeEffects: ActiveEffect[];
  isDormant: boolean;
  guardRow: number | null;
  guardColumn: number | null;
  isStationary: boolean;
  stationaryTriggerRow: number | null;
  stationaryTriggerCol: number | null;
  noAttackUnlessAttacked: boolean;
  hasCalledReinforcements: boolean;
  // Dialogue tree (Q&A) - static per-placement question/response data, plus
  // a runtime flag set once a "preventsAttackUnlessAttacked" question is asked.
  dialogueEntries: MonsterDialogueEntry[];
  dialoguePreventsAttack: boolean;
  // NPC state
  hasGreeted: boolean;
  hasSharedInfo: boolean;
  isSpared: boolean;
  npcIsHostile: boolean;
}

export interface CombatLogEntry {
  text: string;
  type?: 'pc' | 'monster'; // 'pc' for player actions, 'monster' for monster actions
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
  readonly playerMp = signal<number>(0);
  readonly playerDexterity = signal<number>(0);
  readonly playerAwareness = signal<number>(0);
  readonly playerRoundsSinceLastAction = signal<number>(0);
  readonly playerWasHitThisRound = signal<boolean>(false);

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
  readonly spellHitFlash = signal<'blood' | 'arcane' | 'fire' | 'ice' | 'lightning' | 'mind' | 'splah' | null>(null);
  readonly spellHitFlashColor = signal<string | null>(null);
  readonly spellBeamEffects = signal<{ fromRow: number; fromCol: number; toRow: number; toCol: number; isHP: boolean }[]>([]);
  readonly monsterGlowKeys = signal<Set<string>>(new Set());
  readonly spellTargetMode = signal<{ spellId: number; maxTargets: number; targets: { row: number; column: number }[]; targetType?: 'monster' | 'trap' } | null>(null);
  readonly playerDeathCause = signal<string | null>(null);
}
