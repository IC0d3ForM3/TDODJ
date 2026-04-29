import { Injectable, signal } from '@angular/core';
import {
  Cheater,
  DungonExit,
  FloorTrapPlacement,
  Monster,
  MonsterPlacement,
  ObstaclePlacement,
  SquareText,
  StartPoint,
  Tresher,
  TresherPlacement,
} from '../interfaces/game';
import { Square } from '../interfaces/square';

/**
 * Shared dungeon-keyed state used by both the Game and Creator components.
 * All 12 signals are keyed by dungon ID and populated by each component's
 * `loadDungonJsonState` method when a dungeon is loaded.
 */
@Injectable({ providedIn: 'root' })
export class DungeonStateService {
  // ── Map geometry ─────────────────────────────────────────────────────────
  readonly filledSquaresByDungon = signal<Record<number, Record<string, true>>>({});
  readonly squaresByDungon = signal<Record<number, Record<string, Square>>>({});
  readonly squareTextsByDungon = signal<Record<number, SquareText[]>>({});

  // ── Navigation / entry-exit ───────────────────────────────────────────────
  readonly startPointByDungon = signal<Record<number, StartPoint | null>>({});
  readonly exitsByDungon = signal<Record<number, DungonExit[]>>({});

  // ── Entity catalogues + placements ────────────────────────────────────────
  readonly tresherListByDungon = signal<Record<number, Tresher[]>>({});
  readonly tresherPlacementsByDungon = signal<Record<number, TresherPlacement[]>>({});
  readonly monsterListByDungon = signal<Record<number, Monster[]>>({});
  readonly monsterPlacementsByDungon = signal<Record<number, MonsterPlacement[]>>({});

  // ── Hazards / environment ─────────────────────────────────────────────────
  readonly floorTrapPlacementsByDungon = signal<Record<number, FloorTrapPlacement[]>>({});
  readonly obstaclePlacementsByDungon = signal<Record<number, ObstaclePlacement[]>>({});

  // ── PC snapshot ───────────────────────────────────────────────────────────
  readonly cheaterByDungon = signal<Record<number, Cheater>>({});
}
