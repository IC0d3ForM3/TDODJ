export interface MonsterAttack {
  type: string;
  description: string;
  plusToHit: number;
  damage: number;
  damageFormula?: string;
  range: number;
  weaponItemId: number | null;
  spellId: number | null;
  curseId: number | null;
}

export interface Monster {
  id: number;
  monsterDbId?: number;
  imageId: number | null;
  soundId: number | null;
  tresherIds: number[];
  keyIds: number[];
  name: string;
  type: string;
  description: string;
  hp: number;
  movementEconomy: number;
  ac: number;
  runAt: number;
  numberOfAttacks: number;
  attacks: MonsterAttack[];
  spReward: number;
  magic: number;
  magicResistance: number;
  castPlus?: number;
  callsReinforcements: boolean;
  reinforcementCount: number;
  reinforcementMonsterName: string | null;
  toHitPlusNeeded: number;
  npcGreeting: string | null;
  npcInfo1: string | null;
  npcInfo2: string | null;
  npcInfo3: string | null;
  npcOnlyAttackWhenAttacked: boolean;
  npcGivesInfoAfterDamaged: boolean;
  npcAttacksAfterInfo: boolean;
  npcCanTrade: boolean;
  awareness: number;
}