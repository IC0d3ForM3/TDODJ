import { OpenBlockOptionKey } from './creator-types';

export interface PendingDoorPlacement {
  dungonId: number;
  row: number;
  column: number;
  squareKey: string;
  isNewSquare: boolean;
  selections: Record<OpenBlockOptionKey, boolean>;
}
