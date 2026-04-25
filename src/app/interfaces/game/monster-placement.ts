export interface MonsterPlacement {
  monsterId: number;
  row: number;
  column: number;
  roam: boolean;
  isDead?: boolean;
  currentHp?: number;
  tresherIds?: number[];
  keyIds?: number[];
  itemIds?: number[];
  isDormant?: boolean;
  guardRow?: number | null;
  guardColumn?: number | null;
  isStationary?: boolean;
  stationaryTriggerRow?: number | null;
  stationaryTriggerCol?: number | null;
  noAttackUnlessAttacked?: boolean;
}