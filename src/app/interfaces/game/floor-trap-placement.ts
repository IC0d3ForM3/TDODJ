import { BasePlacement } from './base-placement';
import { Trap } from './trap';

export interface FloorTrapPlacement extends BasePlacement {
  id: number;
  trap: Trap;
  isTriggered: boolean;
  isDisarmed: boolean;
  isDetected: boolean;
}
