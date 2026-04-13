import { Trap } from './trap';

export interface FloorTrapPlacement {
  id: number;
  row: number;
  column: number;
  trap: Trap;
  isTriggered: boolean;
  isDisarmed: boolean;
  isDetected: boolean;
}
