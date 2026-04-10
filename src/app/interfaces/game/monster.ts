export interface MonsterAttack {
  type: string;
  description: string;
  plusToHit: number;
  damage: number;
  weaponItemId: number | null;
  spellId: number | null;
  curseId: number | null;
}

export interface Monster {
  id: number;
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
  callsReinforcements: boolean;
}