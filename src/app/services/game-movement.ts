import { Injectable, signal } from '@angular/core';
import { ExitTransitionType, GridPreviewContext } from '../interfaces/game';

type DisplayFacingDirection = 'up' | 'right' | 'down' | 'left' | 'upRight' | 'downRight' | 'downLeft' | 'upLeft';

@Injectable({ providedIn: 'root' })
export class GameMovementService {
  // Player position & dungeon context (centerRow/centerColumn live inside GridPreviewContext)
  readonly gridPreviewContext = signal<GridPreviewContext | null>(null);

  // Visual (display) facing — may show a diagonal while the canonical facing stays cardinal
  readonly visualFacingByDungon = signal<Record<number, DisplayFacingDirection>>({});

  // Exit / win-transition state
  readonly winStairsImageIndex = signal<1 | 2 | 3 | null>(null);
  readonly pendingExitTransitionType = signal<ExitTransitionType | null>(null);
}
