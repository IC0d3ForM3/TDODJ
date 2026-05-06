import { BasePlacement } from './base-placement';

export interface MonsterPlacement extends BasePlacement {
  monsterId: number;
  roam: boolean;
  isDead?: boolean;
  currentHp?: number;
  currentMagic?: number;
  permanentStatModifiers?: Record<string, number>;
  tresherIds?: number[];
  keyIds?: number[];
  itemIds?: number[];
  spellIds?: number[];
  potionIds?: number[];
  gold?: number;
  silver?: number;
  copper?: number;
  zinc?: number;
  weaponItemId?: number | null;
  isDormant?: boolean;
  guardRow?: number | null;
  guardColumn?: number | null;
  isStationary?: boolean;
  stationaryTriggerRow?: number | null;
  stationaryTriggerCol?: number | null;
  noAttackUnlessAttacked?: boolean;
}