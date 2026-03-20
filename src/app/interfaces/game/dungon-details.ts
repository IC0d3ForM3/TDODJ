import { DungonStatus } from './creator-types';

export interface DungonDetails {
  id: number;
  name: string;
  description: string;
  intro: string;
  dungenJson: unknown;
  status: DungonStatus;
  minsplifetime: number;
  maxsplifetime: number;
  spreward: number;
}
