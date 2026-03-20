import { FirstPersonBlock } from './first-person-block';
import { FirstPersonStep } from './first-person-step';

export interface FirstPersonView {
  steps: FirstPersonStep[];
  endBlock: FirstPersonBlock;
}
