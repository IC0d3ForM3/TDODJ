import { PathBlockType } from './creator-types';

export interface FirstPersonBlock {
  type: PathBlockType;
  hasKeyhole: boolean;
  isDestructible: boolean;
}
