import { Trap } from './trap';

export interface DoorPromptResult {
  state: 'open' | 'closed';
  hp: number;
  isLocked: boolean;
  isHidden: boolean;
  toFind: number;
  name: string;
  description: string;
  toPick: number | null;
  trap: Trap | null;
  spReward: number | null;
}
