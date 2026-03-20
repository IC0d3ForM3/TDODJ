import { Door } from '../door';
import { PathBlockType } from './creator-types';

export interface AdjacentConnectionInfo {
  type: PathBlockType;
  door: Door | null;
}
