import { BasePendingPlacement } from './base-pending-placement';
import { OpenBlockOptionKey } from './creator-types';

export interface PendingDoorPlacement extends BasePendingPlacement {
  squareKey: string;
  isNewSquare: boolean;
  selections: Record<OpenBlockOptionKey, boolean>;
}
