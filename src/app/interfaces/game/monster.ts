export interface MonsterAttack {
  description: string;
  damage: number;
  plusToHit: number;
}

export interface Monster {
  id: number;
  imageId: number | null;
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
}