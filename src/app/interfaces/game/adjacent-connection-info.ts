import { Door } from '../door';
import { Wall } from '../wall';
import { PathBlockType } from './creator-types';

export interface AdjacentConnectionInfo {
  type: PathBlockType;
  door: Door | null;
  wall?: Wall | null;
}
