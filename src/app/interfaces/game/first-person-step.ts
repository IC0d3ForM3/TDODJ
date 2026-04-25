import { FirstPersonBlock } from './first-person-block';
import { ExitTransitionType } from './dungon-exit';

export interface FirstPersonStep {
  row: number;
  column: number;
  leftBlock: FirstPersonBlock;
  rightBlock: FirstPersonBlock;
  leftOpeningBackBlock: FirstPersonBlock | null;
  rightOpeningBackBlock: FirstPersonBlock | null;
  forwardDoor: FirstPersonBlock | null;
  visibleMonsterSlots: Array<{
    squareKey: string;
    lateralOffset: number;
    isPeek?: boolean;
  }>;
  hasKey: boolean;
  exitTransitionType?: ExitTransitionType | null;
}
