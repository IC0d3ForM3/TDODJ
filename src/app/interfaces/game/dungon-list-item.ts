import { DungonStatus } from './creator-types';

export interface DungonListItem {
  id: number;
  name: string;
  status: DungonStatus;
}
