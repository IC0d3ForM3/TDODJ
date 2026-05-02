import { Injectable, signal } from '@angular/core';
import {
  FloorTrapPlacement,
  ItemPlacement,
  MonsterPlacement,
  ObstaclePlacement,
  PendingDoorPlacement,
  PendingExitPlacement,
  PendingItemPlacement,
  PendingMonsterPlacement,
  PendingSpellPlacement,
  PendingStartPointPlacement,
  PendingTresherPlacement,
  PortalPlacement,
  PotionPlacement,
  SpellPlacement,
  SquareSide,
} from '../interfaces/game';

@Injectable({ providedIn: 'root' })
export class CreatorPlacementService {

  // ── Placement mode flags ─────────────────────────────────────────────────
  readonly isMoveMode = signal(false);
  readonly isStartPointMode = signal(false);
  readonly isExitMode = signal(false);
  readonly isPlaceTresherMode = signal(false);
  readonly isPlaceMonsterMode = signal(false);
  readonly isAddTextMode = signal(false);
  readonly isPlaceFloorTrapMode = signal(false);
  readonly isPlaceObstacleMode = signal(false);
  readonly isPlaceItemMode = signal(false);
  readonly isPlacePotionMode = signal(false);
  readonly isPlaceSpellMode = signal(false);
  readonly isImportPlacementMode = signal(false);
  readonly isSelectingGuardSquare = signal(false);
  readonly isSelectingStationaryTriggerSquare = signal(false);
  readonly isWhiteSpacePreviewPickMode = signal(false);

  // ── Selection state ──────────────────────────────────────────────────────
  readonly selectedKeyIdForPlacement = signal<number | null>(null);
  readonly selectedPlacedItemKey = signal<string | null>(null);

  // ── Text placement ───────────────────────────────────────────────────────
  readonly pendingTextRow = signal<number | null>(null);
  readonly pendingTextColumn = signal<number | null>(null);
  readonly textDialogInput = signal('');
  readonly textDialogWallSide = signal<SquareSide | null>(null);
  readonly editingSquareTextId = signal<number | null>(null);

  // ── Door placement ───────────────────────────────────────────────────────
  readonly pendingDoorPlacement = signal<PendingDoorPlacement | null>(null);
  readonly editingDoorId = signal<number | null>(null);

  // ── Start point / exit placement ─────────────────────────────────────────
  readonly pendingStartPointPlacement = signal<PendingStartPointPlacement | null>(null);
  readonly pendingExitPlacement = signal<PendingExitPlacement | null>(null);

  // ── Tresher placement ────────────────────────────────────────────────────
  readonly pendingTresherPlacement = signal<PendingTresherPlacement | null>(null);

  // ── Monster placement ────────────────────────────────────────────────────
  readonly pendingMonsterPlacement = signal<PendingMonsterPlacement | null>(null);
  readonly editingMonsterPlacementPos = signal<{ dungonId: number; row: number; column: number } | null>(null);
  readonly isCopyMonsterMode = signal(false);
  readonly copyMonsterSource = signal<MonsterPlacement | null>(null);
  readonly placeMonsterSelectedId = signal<number | null>(null);
  readonly placeMonsterRoam = signal(false);
  readonly placeMonsterIsDormant = signal(false);
  readonly placeMonsterGuardRow = signal<number | null>(null);
  readonly placeMonsterGuardCol = signal<number | null>(null);
  readonly placeMonsterIsStationary = signal(false);
  readonly placeMonsterStationaryTriggerRow = signal<number | null>(null);
  readonly placeMonsterStationaryTriggerCol = signal<number | null>(null);
  readonly placeMonsterNoAttackUnlessAttacked = signal(false);
  readonly placeMonsterDropTresherIds = signal<number[]>([]);
  readonly placeMonsterDropKeyIds = signal<number[]>([]);
  readonly placeMonsterDropItemIds = signal<number[]>([]);
  readonly placeMonsterDropSpellIds = signal<number[]>([]);
  readonly placeMonsterDropPotionIds = signal<number[]>([]);
  readonly placeMonsterGold = signal(0);
  readonly placeMonsterSilver = signal(0);
  readonly placeMonsterCopper = signal(0);
  readonly placeMonsterZinc = signal(0);
  readonly placeMonsterWeaponItemId = signal<number | null>(null);

  // ── Floor trap placement ─────────────────────────────────────────────────
  readonly pendingFloorTrapPlacement = signal<{ dungonId: number; row: number; column: number } | null>(null);
  readonly editingFloorTrapId = signal<number | null>(null);
  readonly isCopyFloorTrapMode = signal(false);
  readonly copyFloorTrapSource = signal<FloorTrapPlacement | null>(null);

  // ── Obstacle placement ───────────────────────────────────────────────────
  readonly pendingObstaclePlacement = signal<{ dungonId: number; row: number; column: number } | null>(null);
  readonly editingObstacleId = signal<number | null>(null);
  readonly isCopyObstacleMode = signal(false);
  readonly copyObstacleSource = signal<ObstaclePlacement | null>(null);

  // ── Portal placement ─────────────────────────────────────────────────────
  readonly portalPlacementsByDungon = signal<Record<number, PortalPlacement[]>>({});
  readonly editingPortalId = signal<number | null>(null);
  readonly selectedPortalId = signal<number | null>(null);
  readonly portalPickMode = signal<'start' | 'end' | null>(null);
  readonly portalPickingId = signal<number | null>(null);

  // ── Item / potion / spell placement ─────────────────────────────────────
  readonly pendingItemPlacement = signal<PendingItemPlacement | null>(null);
  readonly itemPlacementsByDungon = signal<Record<number, ItemPlacement[]>>({});

  readonly pendingPotionPlacement = signal<PendingItemPlacement | null>(null);
  readonly potionPlacementsByDungon = signal<Record<number, PotionPlacement[]>>({});

  readonly pendingSpellPlacement = signal<PendingSpellPlacement | null>(null);
  readonly spellPlacementsByDungon = signal<Record<number, SpellPlacement[]>>({});

  // ── Map import ───────────────────────────────────────────────────────────
  readonly pendingImportTiles = signal<Array<{ row: number; col: number }>>([]);
}
