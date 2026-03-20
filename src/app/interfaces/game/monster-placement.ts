export interface MonsterPlacement {
  monsterId: number;
  row: number;
  column: number;
  roam: boolean;
  isDead?: boolean;
  currentHp?: number;
}