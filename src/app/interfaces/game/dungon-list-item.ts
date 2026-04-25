import { DungonStatus } from './creator-types';

export interface DungonListItem {
  id: number;
  name: string;
  status: DungonStatus;
  ismaingame: boolean;
  issample: boolean;
  imagePath?: string | null;
}
