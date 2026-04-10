import { FacingDirection } from './creator-types';
import { Key } from '../key';
import { Tresher } from './tresher';

export interface CheaterInventory {
  keys: Key[];
  treshers: Tresher[];
}

export interface Cheater {
  name: string;
  rangeOfSight: number;
  facingDir: FacingDirection;
  inventory: CheaterInventory;
}
