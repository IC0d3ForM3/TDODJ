export interface MonsterPlacement {
  monsterId: number;
  row: number;
  column: number;
  roam: boolean;
  isDead?: boolean;
  currentHp?: number;
  tresherIds?: number[];
  keyIds?: number[];
  isDormant?: boolean;
  guardRow?: number | null;
  guardColumn?: number | null;
}