import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { Account } from '../../services/account';
import { DungeonJsonService } from '../../services/dungeon-json';
import { DungeonStateService } from '../../services/dungeon-state';
import { GameInventoryService, PcTresherSpellData } from '../../services/game-inventory';
import { GameCombatService, TurnPhase, GameMonsterInstance, CombatLogEntry, ActiveEffect } from '../../services/game-combat';
import { GameMovementService } from '../../services/game-movement';
import { GameInteractionService, InfoPanelTab, NearbyDoorInfo, StashItem } from '../../services/game-interaction';
import { DungeonFirstPersonComponent } from '../dungeon-first-person/dungeon-first-person';
import { DungeonPreviewGridComponent } from '../dungeon-preview-grid/dungeon-preview-grid';
import { TavernModalComponent, TavernStat } from '../tavern-modal/tavern-modal';
import { Door } from '../../interfaces/door';
import { Square } from '../../interfaces/square';
import { Wall } from '../../interfaces/wall';
import { Key } from '../../interfaces/key';
import { API_BASE_URL } from '../../api-config';
import {
  AdjacentConnectionInfo,
  Cheater,
  CheaterInventory,
  DungonExit,
  ExitDestinationType,
  ExitTransitionType,
  FacingDirection,
  FirstPersonBlock,
  FirstPersonStep,
  FirstPersonView,
  GridPreviewContext,
  Monster,
  MonsterAttack,
  MonsterPlacement,
  NearbyDiscoveryItem,
  PathBlockType,
  SideRule,
  SquareSide,
  SquareText,
  normalizeSquareTextWallSide,
  StartPoint,
  Tresher,
  TresherPlacement,
  Trap,
  FloorTrapPlacement,
  ItemPlacement,
  SpellPlacement,
  PotionPlacement,
  ObstaclePlacement,
} from '../../interfaces/game';

interface GameSessionPayload {
  id: number;
  dungonid: number;
  name: string;
  dungenJson: unknown;
  lastupdated: string;
  pcTreshers?: unknown[];
  pcTresherItems?: unknown[];
  pcTresherPotions?: unknown[];
  pcTresherSpells?: unknown[];
  pcCurrentHP?: number | null;
  pcMaxHP?: number | null;
  pcSp?: number | null;
  pcMind?: number | null;
  pcStamina?: number | null;
  pcAc?: number | null;
  pcStrength?: number | null;
  pcMagicPower?: number | null;
  pcNumberOfAttacks?: number | null;
  pcNumberOfDefends?: number | null;
  pcType?: string | null;
  pcSpecies?: string | null;
  pcName?: string | null;
  currentPcId?: number | null;
  isMainGame?: boolean;
  resettablePerPc?: boolean;
  dungonSpReward?: number;
  monsterImages?: { id: number; path: string }[];
}

interface ImageRecordPayload {
  id: number;
  path: string;
}

type MonsterImpactKind = 'blood' | 'fire' | 'ice' | 'lightning' | 'arcane' | 'mind';
type MonsterImpactState = { kind: MonsterImpactKind; color?: string | null; startedAt: number; expiresAt: number };
type DiagonalFacingDirection = 'upRight' | 'downRight' | 'downLeft' | 'upLeft';
type DisplayFacingDirection = FacingDirection | DiagonalFacingDirection;
type DirectionPadDirection = DisplayFacingDirection | 'center';

interface DirectionPadButton {
  direction: DirectionPadDirection;
  label: string;
  ariaLabel: string;
}

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [DungeonFirstPersonComponent, DungeonPreviewGridComponent, TavernModalComponent],
  templateUrl: './game.html',
  styleUrl: './game.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Game implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly account = inject(Account);
  private readonly dungeonJsonService = inject(DungeonJsonService);
  private readonly dungeonState = inject(DungeonStateService);
  readonly inventoryService = inject(GameInventoryService);
  readonly combatService = inject(GameCombatService);
  readonly movementService = inject(GameMovementService);
  readonly interactionService = inject(GameInteractionService);

  private previewGridCanvasRef: ElementRef<HTMLCanvasElement> | null = null;
  private firstPersonCanvasRef: ElementRef<HTMLCanvasElement> | null = null;

  @ViewChild('previewGridCanvas')
  set previewGridCanvas(value: ElementRef<HTMLCanvasElement> | undefined) {
    this.previewGridCanvasRef = value ?? null;
    this.drawPreviewGridCanvas();
  }

  @ViewChild('firstPersonCanvas')
  set firstPersonCanvas(value: ElementRef<HTMLCanvasElement> | undefined) {
    this.firstPersonCanvasRef = value ?? null;
    this.drawFirstPersonViewCanvas();
  }

  readonly isLoadingGame = signal(false);
  readonly gameLoadError = signal<string | null>(null);
  readonly gameName = signal('Game');
  readonly gameLastUpdated = signal<string | null>(null);
  get previewActionMessage() { return this.interactionService.previewActionMessage; }

  readonly playerDeadName = computed(() => {
    if (this.turnPhase() !== 'gameover') return null;
    const currentPcName = this.playerName();
    if (currentPcName && currentPcName.trim().length > 0) {
      return currentPcName;
    }
    const preview = this.gridPreviewContext();
    if (!preview) return null;
    return this.cheaterByDungon()[preview.dungonId]?.name ?? null;
  });
  get playerDeathCause() { return this.combatService.playerDeathCause; }
  get visualFacingByDungon() { return this.movementService.visualFacingByDungon; }
  get activeInfoPanelTab() { return this.interactionService.activeInfoPanelTab; }
  get equippedTresherIndexesByDungon() { return this.inventoryService.equippedTresherIndexesByDungon; }
  get equippedItemIdsByDungon() { return this.inventoryService.equippedItemIdsByDungon; }

  get gridPreviewContext() { return this.movementService.gridPreviewContext; }
  get cheaterByDungon() { return this.dungeonState.cheaterByDungon; }
  get startPointByDungon() { return this.dungeonState.startPointByDungon; }
  get tresherListByDungon() { return this.dungeonState.tresherListByDungon; }
  get tresherPlacementsByDungon() { return this.dungeonState.tresherPlacementsByDungon; }
  get monsterListByDungon() { return this.dungeonState.monsterListByDungon; }
  get monsterPlacementsByDungon() { return this.dungeonState.monsterPlacementsByDungon; }
  get filledSquaresByDungon() { return this.dungeonState.filledSquaresByDungon; }
  get squaresByDungon() { return this.dungeonState.squaresByDungon; }
  get squareTextsByDungon() { return this.dungeonState.squareTextsByDungon; };

  private readonly monsterImageCache = new Map<number, HTMLImageElement>();
  private readonly monsterImageCacheVersion = signal(0);
  private readonly obstacleImageCache = new Map<number, HTMLImageElement>();
  private readonly obstacleImageCacheVersion = signal(0);
  private readonly spellCatalogById = signal<Map<number, PcTresherSpellData>>(new Map());
  private readonly doorImageCache = new Map<string, HTMLImageElement>();
  readonly monsterImpactEffects = signal<Record<string, MonsterImpactState>>({});
  readonly monsterImpactPulse = signal(0);
  private monsterImpactPulseTimer: ReturnType<typeof setInterval> | null = null;

  get turnPhase() { return this.combatService.turnPhase; }
  get playerAE() { return this.combatService.playerAE; }
  get playerMaxAE() { return this.combatService.playerMaxAE; }
  get playerNOA() { return this.combatService.playerNOA; }
  get playerAttacksThisTurn() { return this.combatService.playerAttacksThisTurn; }
  get playerNOD() { return this.combatService.playerNOD; }
  get playerDefendsThisTurn() { return this.combatService.playerDefendsThisTurn; }
  get playerDefendStacks() { return this.combatService.playerDefendStacks; }
  get playerBoostAttackACPenalty() { return this.combatService.playerBoostAttackACPenalty; }
  get playerType() { return this.combatService.playerType; }
  get playerSpecies() { return this.combatService.playerSpecies; }
  get playerName() { return this.combatService.playerName; }
  get playerSearchesThisTurn() { return this.combatService.playerSearchesThisTurn; }
  get playerHp() { return this.combatService.playerHp; }
  get playerMaxHp() { return this.combatService.playerMaxHp; }
  get playerBaseAC() { return this.combatService.playerBaseAC; }
  get monsterInstances() { return this.combatService.monsterInstances; }
  get combatLog() { return this.combatService.combatLog; }
  readonly currentGameId = signal<number | null>(null);
  readonly isSampleMode = signal(false);
  get pcInventoryInitializedByDungon() { return this.inventoryService.pcInventoryInitializedByDungon; }
  get pcTresherItemsById() { return this.inventoryService.pcTresherItemsById; }
  get pcTresherPotionsById() { return this.inventoryService.pcTresherPotionsById; }
  get exitsByDungon() { return this.dungeonState.exitsByDungon; }
  get playerSp() { return this.combatService.playerSp; }
  get playerMind() { return this.combatService.playerMind; }
  get playerStamina() { return this.combatService.playerStamina; }
  get playerStrength() { return this.combatService.playerStrength; }
  get playerMagicPower() { return this.combatService.playerMagicPower; }
  get playerMp() { return this.combatService.playerMp; }

  readonly playerLevel = computed(() => {
    const wStr = this.playerStrength() * 2;
    const wSta = this.playerStamina() * 2;
    const wMind = this.playerMind() * 2;

    // Count Magic Source gems in all inventory treshers
    const itemsMap = this.pcTresherItemsById();
    let magicSourceCount = 0;
    for (const t of this.inventoryTreshersForPreview()) {
      for (const itemId of [t.item1Id, t.item2Id, t.item3Id, t.item4Id]) {
        if (itemId != null) {
          const item = itemsMap.get(itemId);
          if (item && item.type === 'gem' && item.name.includes('Magic Source')) {
            magicSourceCount++;
          }
        }
      }
    }
    const wMP = this.playerMagicPower() * 2.5 + magicSourceCount;
    return this.computePlayerLevel([wStr, wSta, wMind, wMP]);
  });

  private computePlayerLevel(weightedStats: number[]): number {
    let level = 0;
    const above10 = weightedStats.filter(s => s > 10).length;
    if (above10 >= 2) level = 1;
    if (above10 >= 4) level = 2;
    if (weightedStats.filter(s => s >= 15).length >= 2) level = Math.max(level, 3);
    for (let n = 4; n <= 50; n++) {
      const t4 = 15 + (n - 4) * 5;
      const t2 = 15 + (n - 3) * 5;
      const c4 = weightedStats.filter(s => s >= t4).length;
      const c2 = weightedStats.filter(s => s >= t2).length;
      if (c4 >= 4 || c2 >= 2) {
        level = Math.max(level, n);
      } else {
        break;
      }
    }
    return level;
  }
  get pcTresherSpellsById() { return this.inventoryService.pcTresherSpellsById; }
  get selectedSpellId() { return this.combatService.selectedSpellId; }
  get selectedCombatTarget() { return this.combatService.selectedCombatTarget; }
  get outOfRangeTarget() { return this.combatService.outOfRangeTarget; }
  private get comboTracker() { return this.combatService.comboTracker; }
  get playerActiveEffects() { return this.combatService.playerActiveEffects; }
  get floorTrapPlacementsByDungon() { return this.dungeonState.floorTrapPlacementsByDungon; }
  get floorItemPlacementsByDungon() { return this.inventoryService.floorItemPlacementsByDungon; }
  get floorPotionPlacementsByDungon() { return this.inventoryService.floorPotionPlacementsByDungon; }
  get floorSpellPlacementsByDungon() { return this.inventoryService.floorSpellPlacementsByDungon; }
  get obstaclePlacementsByDungon() { return this.dungeonState.obstaclePlacementsByDungon; }
  get floorItemListByDungon() { return this.inventoryService.floorItemListByDungon; }
  get floorPotionListByDungon() { return this.inventoryService.floorPotionListByDungon; }
  get floorSpellListByDungon() { return this.inventoryService.floorSpellListByDungon; }
  get collectedFloorItemsByDungon() { return this.inventoryService.collectedFloorItemsByDungon; }
  get collectedFloorPotionsByDungon() { return this.inventoryService.collectedFloorPotionsByDungon; }
  get collectedFloorSpellsByDungon() { return this.inventoryService.collectedFloorSpellsByDungon; }
  get foundTrap() { return this.interactionService.foundTrap; }
  get bloodSplatter() { return this.combatService.bloodSplatter; }
  get playerHitFlash() { return this.combatService.playerHitFlash; }
  get spellTargetMode() { return this.combatService.spellTargetMode; }
  get spellBeamEffects() { return this.combatService.spellBeamEffects; }
  get monsterGlowKeys() { return this.combatService.monsterGlowKeys; }
  get playerYellowHitFlash() { return this.combatService.playerYellowHitFlash; }
  get spellHitFlash() { return this.combatService.spellHitFlash; }
  readonly currentPcId_ = signal<number | null>(null);
  get dungonSpReward() { return this.interactionService.dungonSpReward; }
  get dungonWon() { return this.interactionService.dungonWon; }
  get showTavernModal() { return this.interactionService.showTavernModal; }
  readonly soundMuted = signal<boolean>(localStorage.getItem('soundMuted') === 'true');
  readonly showReportBugModal = signal<boolean>(false);
  readonly bugReportUsername = signal<string>('');
  readonly bugReportMessage = signal<string>('');
  readonly bugReportSubmitting = signal<boolean>(false);
  readonly bugReportSuccess = signal<boolean>(false);
  readonly bugReportError = signal<string | null>(null);
  private tavernMusicCtx: AudioContext | null = null;

  get questItemsForTavern(): Tresher[] {
    const result: Tresher[] = [];
    for (const cheater of Object.values(this.cheaterByDungon())) {
      for (const t of cheater.inventory.treshers) {
        if (t.isquest) result.push(t);
      }
    }
    return result;
  }
  get npcDialog() { return this.interactionService.npcDialog; }
  get npcTradesPurchased() { return this.interactionService.npcTradesPurchased; }
  readonly isMainGame = signal<boolean>(false);
  readonly resettablePerPc = signal<boolean>(false);
  get stashItems() { return this.interactionService.stashItems; }
  readonly cheaterByPcId_ = signal<Record<number, Cheater>>({});
  readonly saveStatus = signal<'saving' | 'saved' | 'error' | 'lost' | null>(null);
  private saveStatusTimer: ReturnType<typeof setTimeout> | null = null;
  private isSaveInFlight = false;
  private pendingSavePayload: { gameId: number; dungonId: number; userKey: string } | null = null;
  get winStairsImageIndex() { return this.movementService.winStairsImageIndex; }
  get pendingExitTransitionType() { return this.movementService.pendingExitTransitionType; }

  readonly gridCellSize = 20;
  readonly gridColumnCount = 50;
  readonly gridRowCount = 50;
  readonly previewGridCellSize = 18;
  readonly previewGridDimension = 10;
  readonly previewGridCanvasWidth = this.previewGridCellSize * this.previewGridDimension;
  readonly previewGridCanvasHeight = this.previewGridCellSize * this.previewGridDimension;
  readonly firstPersonCanvasWidth = 330;
  readonly firstPersonCanvasHeight = 220;
  readonly firstPersonMaxDepth = 8;
  readonly maxEquippableHands = 2;
  readonly directionPadButtons: DirectionPadButton[] = [
    { direction: 'upLeft', label: '↖', ariaLabel: 'Face up-left' },
    { direction: 'up', label: '↑', ariaLabel: 'Face up' },
    { direction: 'upRight', label: '↗', ariaLabel: 'Face up-right' },
    { direction: 'left', label: '←', ariaLabel: 'Face left' },
    { direction: 'center', label: 'F', ariaLabel: 'Move forward' },
    { direction: 'right', label: '→', ariaLabel: 'Face right' },
    { direction: 'downLeft', label: '↙', ariaLabel: 'Face down-left' },
    { direction: 'down', label: '↓', ariaLabel: 'Face down' },
    { direction: 'downRight', label: '↘', ariaLabel: 'Face down-right' },
  ];

  keyList: Key[] = [];

  private savedCombatState: {
    playerHp: number | null;
    playerAE: number | null;
    turnPhase: TurnPhase | null;
    playerRow: number | null;
    playerColumn: number | null;
  } = { playerHp: null, playerAE: null, turnPhase: null, playerRow: null, playerColumn: null };
  private playerStartingHp = 20;

  ngOnInit(): void {
    this.loadGame();
    this.loadDoorImages();
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    if (!this.gridPreviewContext()) {
      return;
    }

    if (this.turnPhase() === 'gameover' || this.turnPhase() === 'monsters') {
      return;
    }

    if (event.key.toLowerCase() === 'a') {
      this.tryPlayerAttack();
      event.preventDefault();
      return;
    }

    if (event.key.toLowerCase() === 'd') {
      this.tryPlayerDefend();
      event.preventDefault();
      return;
    }

    if (event.key.toLowerCase() === 'e') {
      this.endPlayerTurnEarly();
      event.preventDefault();
      return;
    }

    if (event.key.toLowerCase() === 's') {
      this.lookForTrapsAtCurrentSquare();
      event.preventDefault();
      return;
    }

    if (event.key.toLowerCase() === 'o') {
      const doors = this.nearbyDoorsForPreview();
      const openable = doors.find((d) => d.canOpen);
      const closeable = doors.find((d) => d.door.state === 'open');
      if (openable) this.openAdjacentDoor(openable);
      else if (closeable) this.closeAdjacentDoor(closeable);
      event.preventDefault();
      return;
    }

    if (event.key.toLowerCase() === 'k') {
      const door = this.nearbyDoorsForPreview().find((d) => d.canUnlock);
      if (door) this.unlockAdjacentDoor(door);
      event.preventDefault();
      return;
    }

    if (this.isSpaceKey(event.key)) {
      this.tryMoveCheaterForward();
      event.preventDefault();
      return;
    }

    if (this.isBackwardMoveKey(event.key)) {
      this.tryMoveCheaterBackward();
      event.preventDefault();
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const preview = this.gridPreviewContext();
      if (!preview) return;
      const current = (this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER).facingDir;
      const next = this.turnFacing(current, event.key === 'ArrowLeft' ? 'left' : 'right');
      this.applyCardinalFacingDirection(next);
      event.preventDefault();
      return;
    }

    const nextDirection = this.getFacingDirectionFromKey(event.key);
    if (!nextDirection) {
      return;
    }

    this.applyCardinalFacingDirection(nextDirection);
    event.preventDefault();
  }

  setFacingDirectionFromPad(direction: DirectionPadDirection): void {
    if (direction === 'center') {
      this.tryMoveCheaterByDisplayedFacingStep(1);
      return;
    }

    if (direction === 'up' || direction === 'right' || direction === 'down' || direction === 'left') {
      this.applyCardinalFacingDirection(direction);
      return;
    }

    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }

    this.setVisualFacingDirection(preview.dungonId, direction);
    this.drawPreviewGridCanvas();
  }

  isFacingDirectionActive(direction: DirectionPadDirection): boolean {
    if (direction === 'center') {
      return false;
    }

    const preview = this.gridPreviewContext();
    if (!preview) {
      return false;
    }

    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    return this.getDisplayedFacingDirection(preview.dungonId, cheater.facingDir) === direction;
  }

  setActiveInfoPanelTab(tab: InfoPanelTab): void {
    this.activeInfoPanelTab.set(tab);
  }

  previewCheaterForView(): Cheater {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return DEFAULT_CHEATER;
    }

    return this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
  }

  previewSquaresForView(): Record<string, Square> {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return {};
    }

    return this.squaresByDungon()[preview.dungonId] ?? {};
  }

  previewFilledSquaresForView(): Record<string, true> {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return {};
    }

    return this.filledSquaresByDungon()[preview.dungonId] ?? {};
  }

  previewTresherPlacementsForView(): TresherPlacement[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.tresherPlacementsByDungon()[preview.dungonId] ?? [];
  }

  previewItemPlacementsForView(): ItemPlacement[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.floorItemPlacementsByDungon()[preview.dungonId] ?? [];
  }

  previewPotionPlacementsForView(): PotionPlacement[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.floorPotionPlacementsByDungon()[preview.dungonId] ?? [];
  }

  previewSpellPlacementsForView(): SpellPlacement[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.floorSpellPlacementsByDungon()[preview.dungonId] ?? [];
  }

  collectedFloorItemsForPreview(): Array<{ id: number; name: string; description: string; type: string; effectValue: number; damage: number; range: number; armorSlot: string | null; effectOn: string | null; effectToPc?: string | null; effectToPcValue?: number; isTwoHanded: boolean }> {
    const preview = this.gridPreviewContext();
    if (!preview) return [];
    return this.collectedFloorItemsByDungon()[preview.dungonId] ?? [];
  }

  collectedFloorPotionsForPreview(): Array<{ id: number; name: string; description: string; effectTo: string; effectAmount: number; lastFor: number }> {
    const preview = this.gridPreviewContext();
    if (!preview) return [];
    return this.collectedFloorPotionsByDungon()[preview.dungonId] ?? [];
  }

  previewDetectedFloorTrapsForView(): FloorTrapPlacement[] {
    const preview = this.gridPreviewContext();
    if (!preview) return [];
    return (this.floorTrapPlacementsByDungon()[preview.dungonId] ?? [])
      .filter(p => p.isDetected && !p.isTriggered && !p.isDisarmed);
  }

  previewObstaclePlacementsForView(): ObstaclePlacement[] {
    const preview = this.gridPreviewContext();
    if (!preview) return [];
    return (this.obstaclePlacementsByDungon()[preview.dungonId] ?? []).filter(o => !o.isDestroyed);
  }

  previewLiveMonsterPlacementsForView(): MonsterPlacement[] {
    return this.monsterInstances()
      .filter((instance) => !instance.isDead)
      .map((instance) => ({
        monsterId: instance.monsterId,
        row: instance.row,
        column: instance.column,
        roam: instance.roam,
        isDead: instance.isDead,
        currentHp: instance.currentHp,
      }));
  }

  previewStartPointForView(): StartPoint | null {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return null;
    }

    return this.startPointByDungon()[preview.dungonId] ?? null;
  }

  previewSquareTextsForView(): SquareText[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.squareTextsByDungon()[preview.dungonId] ?? [];
  }

  previewExitsForView(): DungonExit[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.exitsByDungon()[preview.dungonId] ?? [];
  }

  previewMonsterImagesBySquareForView(): Map<string, HTMLImageElement | null> {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return new Map<string, HTMLImageElement | null>();
    }

    // Read version signal so Angular re-evaluates this when images finish loading.
    this.monsterImageCacheVersion();
    const monstersById = this.getMonstersByIdForDungon(preview.dungonId);
    const imageBySquare = new Map<string, HTMLImageElement | null>();
    for (const instance of this.monsterInstances().filter((monster) => !monster.isDead)) {
      const squareKey = this.getSquareKey(instance.row, instance.column);
      const monster = monstersById.get(instance.monsterId);
      const imageId = monster?.imageId ?? null;
      const image = imageId !== null ? (this.monsterImageCache.get(imageId) ?? null) : null;
      imageBySquare.set(squareKey, image);
    }

    return imageBySquare;
  }

  previewObstacleImagesBySquareForView(): Map<string, HTMLImageElement | null> {
    const preview = this.gridPreviewContext();
    if (!preview) return new Map<string, HTMLImageElement | null>();
    this.obstacleImageCacheVersion();
    const imageBySquare = new Map<string, HTMLImageElement | null>();
    for (const obs of this.obstaclePlacementsByDungon()[preview.dungonId] ?? []) {
      if (obs.isDestroyed) continue;
      const squareKey = this.getSquareKey(obs.row, obs.column);
      const image = obs.imageId !== null ? (this.obstacleImageCache.get(obs.imageId) ?? null) : null;
      imageBySquare.set(squareKey, image);
    }
    return imageBySquare;
  }

  inventoryKeysForPreview(): Key[] {
    return this.getInventoryContextForPreview()?.inventory.keys ?? [];
  }

  inventoryTreshersForPreview(): Tresher[] {
    return this.getInventoryContextForPreview()?.inventory.treshers ?? [];
  }

  hasInventoryItemsForPreview(): boolean {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) {
      return false;
    }

    return (
      inventoryContext.inventory.keys.length > 0 ||
      inventoryContext.inventory.treshers.length > 0 ||
      (this.collectedFloorItemsByDungon()[inventoryContext.dungonId] ?? []).length > 0 ||
      (this.collectedFloorPotionsByDungon()[inventoryContext.dungonId] ?? []).length > 0
    );
  }

  isTresherEquipable(tresher: Tresher): boolean {
    return this.inventoryService.isTresherEquipable(tresher);
  }

  hasWeaponEquipped(): boolean {
    const preview = this.gridPreviewContext();
    if (!preview) return false;
    const equippedItemIds = this.equippedItemIdsByDungon()[preview.dungonId] ?? [];
    const itemsMap = this.pcTresherItemsById();
    return equippedItemIds.some((id) => itemsMap.get(id)?.type === 'weapon');
  }

  canAttackUnarmed(): boolean {
    if (this.turnPhase() !== 'player' || this.playerAE() < 1) return false;
    const preview = this.gridPreviewContext();
    if (!preview) return false;
    return this.findAdjacentLiveMonster(preview.centerRow, preview.centerColumn, 1, preview.dungonId) !== null;
  }

  /** Returns the current attack range for map highlighting (0 = no combat). */
  combatRangeForMap(): number {
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0) return 0;
    if (!this.monsterInstances().some(m => !m.isDead)) return 0;
    const preview = this.gridPreviewContext();
    if (!preview) return 0;
    // If a spell is primed, use spell range
    const spellId = this.selectedSpellId();
    if (spellId !== null) {
      const spell = this.pcTresherSpellsById().get(spellId);
      if (spell) return Math.max(1, spell.range);
    }
    // Weapon range
    const equippedItemIds = this.equippedItemIdsByDungon()[preview.dungonId] ?? [];
    const itemsMap = this.pcTresherItemsById();
    let bestRange = 1; // unarmed baseline
    for (const itemId of equippedItemIds) {
      const item = itemsMap.get(itemId);
      if (item?.type === 'weapon' && item.range > bestRange) bestRange = item.range;
    }
    return bestRange;
  }

  /** Called when the player clicks a cell on the 10x10 mini-map. */
  onMapCellClicked(cell: { row: number; column: number }): void {
    const preview = this.gridPreviewContext();
    if (!preview || this.turnPhase() !== 'player' || this.playerHp() <= 0) return;

    // Handle spell multi-target selection mode
    const targetMode = this.spellTargetMode();
    if (targetMode) {
      const monster = this.monsterInstances().find(m => !m.isDead && m.row === cell.row && m.column === cell.column);
      if (!monster) return;
      const spell = this.pcTresherSpellsById().get(targetMode.spellId);
      if (!spell) return;
      const dr = Math.abs(cell.row - preview.centerRow);
      const dc = Math.abs(cell.column - preview.centerColumn);
      if (Math.max(dr, dc) > spell.range || !this.hasLineOfSight(preview.dungonId, preview.centerRow, preview.centerColumn, cell.row, cell.column)) {
        const name = this.getMonstersByIdForDungon(preview.dungonId).get(monster.monsterId)?.name ?? 'monster';
        this.previewActionMessage.set(`${name} is out of spell range (${spell.range}).`);
        return;
      }
      const idx = targetMode.targets.findIndex(t => t.row === cell.row && t.column === cell.column);
      let newTargets: { row: number; column: number }[];
      if (idx >= 0) {
        newTargets = targetMode.targets.filter((_, i) => i !== idx);
        this.previewActionMessage.set(`Target removed. (${newTargets.length}/${targetMode.maxTargets} selected)`);
      } else if (targetMode.targets.length < targetMode.maxTargets) {
        newTargets = [...targetMode.targets, { row: cell.row, column: cell.column }];
        this.previewActionMessage.set(`Target added. (${newTargets.length}/${targetMode.maxTargets} selected)`);
      } else {
        this.previewActionMessage.set(`Max targets (${targetMode.maxTargets}) already selected.`);
        return;
      }
      this.spellTargetMode.set({ ...targetMode, targets: newTargets });
      this.drawPreviewGridCanvas();
      return;
    }

    const monster = this.monsterInstances().find(
      m => !m.isDead && m.row === cell.row && m.column === cell.column
    );
    if (!monster) return;
    if (!this.hasLineOfSight(preview.dungonId, preview.centerRow, preview.centerColumn, cell.row, cell.column)) return;

    const name = this.getMonstersByIdForDungon(preview.dungonId).get(monster.monsterId)?.name ?? 'monster';
    const range = this.combatRangeForMap();
    const dr = Math.abs(cell.row - preview.centerRow);
    const dc = Math.abs(cell.column - preview.centerColumn);
    const chebyshevDist = Math.max(dr, dc);

    if (chebyshevDist <= range) {
      // In weapon range — normal target selection
      this.outOfRangeTarget.set(null);
      this.selectedCombatTarget.set({ row: cell.row, column: cell.column });
      this.previewActionMessage.set(`Target: ${name}.`);
    } else {
      // Out of range — highlight green and report
      this.outOfRangeTarget.set({ row: cell.row, column: cell.column });
      this.previewActionMessage.set(`${name} is ${chebyshevDist} sq away — out of range (weapon range: ${range}).`);
      this.addCombatLog(`${name} is ${chebyshevDist} sq away. Weapon range: ${range}. Move closer to attack.`);
    }
    this.drawPreviewGridCanvas();
  }

  canPickAny(): boolean {
    return this.nearbyDoorsForPreview().some((d) => d.canPick) || !!this.foundTrap();
  }

  canOpenAnyDoor(): boolean {
    return this.nearbyDoorsForPreview().some((d) => d.canOpen);
  }

  canUnlockAnyDoor(): boolean {
    return this.nearbyDoorsForPreview().some((d) => d.canUnlock);
  }

  turnFacingLeft(): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const current = (this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER).facingDir;
    this.applyCardinalFacingDirection(this.turnFacing(current, 'left'));
  }

  turnFacingRight(): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const current = (this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER).facingDir;
    this.applyCardinalFacingDirection(this.turnFacing(current, 'right'));
  }

  moveForward(): void {
    this.tryMoveCheaterForward();
  }

  moveBackward(): void {
    this.tryMoveCheaterBackward();
  }

  isHealingPotion(tresher: Tresher): boolean {
    return (tresher.type ?? 'OtherTresher') === 'Potion' || this.getHealingPotionAmount(tresher) > 0;
  }

  canUseHealingPotion(tresher: Tresher): boolean {
    return (
      this.isHealingPotion(tresher) &&
      this.turnPhase() === 'player' &&
      this.playerHp() > 0 &&
      this.playerHp() < this.getEffectivePlayerMaxHp()
    );
  }

  isInventoryTresherEquipped(index: number): boolean {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) {
      return false;
    }

    return this.getEquippedTresherIndexesForDungon(
      inventoryContext.dungonId,
      inventoryContext.inventory.treshers.length
    ).includes(index);
  }

  toggleInventoryTresherEquipped(index: number): void {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) {
      return;
    }

    const { dungonId, inventory } = inventoryContext;
    if (index < 0 || index >= inventory.treshers.length) {
      return;
    }

    const selectedTresher = inventory.treshers[index];
    const tresherName = selectedTresher.name.trim() || 'Tresher';
    const equippedIndexes = this.getEquippedTresherIndexesForDungon(
      dungonId,
      inventory.treshers.length
    );
    if (equippedIndexes.includes(index)) {
      this.setEquippedTresherIndexesForDungon(
        dungonId,
        equippedIndexes.filter((equippedIndex) => equippedIndex !== index)
      );
      this.addCombatLog(`${tresherName} unequipped.`);
      this.previewActionMessage.set(`${tresherName} unequipped.`);
      return;
    }

    if (!this.isTresherEquipable(selectedTresher)) {
      this.previewActionMessage.set(`${tresherName} cannot be equipped.`);
      return;
    }

    this.setEquippedTresherIndexesForDungon(dungonId, [...equippedIndexes, index]);
    this.addCombatLog(`${tresherName} equipped.`);
    this.previewActionMessage.set(`${tresherName} equipped.`);
  }

  useInventoryHealingPotion(index: number): void {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) {
      return;
    }

    const { dungonId, inventory } = inventoryContext;
    if (index < 0 || index >= inventory.treshers.length) {
      return;
    }

    const potion = inventory.treshers[index];
    const potionName = potion.name.trim() || 'Potion';

    if (this.turnPhase() !== 'player' || this.playerHp() <= 0) {
      this.previewActionMessage.set('Potions can only be used during your turn.');
      return;
    }

    if (this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to use a potion.');
      return;
    }

    if (!this.isHealingPotion(potion)) {
      this.previewActionMessage.set(`${potionName} cannot restore health.`);
      return;
    }

    const currentHp = this.playerHp();
    const maxHp = this.getEffectivePlayerMaxHp();
    if (currentHp >= maxHp) {
      this.previewActionMessage.set('Health is already full.');
      return;
    }

    const restoredHp = Math.min(this.getHealingPotionAmount(potion), maxHp - currentHp);
    if (restoredHp <= 0) {
      this.previewActionMessage.set(`${potionName} has no healing effect.`);
      return;
    }

    this.playerHp.set(currentHp + restoredHp);
    this.removeInventoryTresherAtIndex(dungonId, index);
    this.previewActionMessage.set(`${potionName} restored ${restoredHp} HP.`);
    this.addCombatLog(`You drink ${potionName} and recover ${restoredHp} HP.`);
    this.consumePlayerAE(1, dungonId);
    if (this.playerAE() <= 0) {
      this.startMonsterTurns();
    }
    this.saveGameState();
  }

  inventoryHandsUsedForPreview(): number {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) {
      return 0;
    }

    const equippedIndexes = this.getEquippedTresherIndexesForDungon(
      inventoryContext.dungonId,
      inventoryContext.inventory.treshers.length
    );

    const tresherHands = equippedIndexes.reduce((sum, equippedIndex) => {
      const equippedItem = inventoryContext.inventory.treshers[equippedIndex];
      if (!equippedItem) {
        return sum;
      }

      return sum + this.getHandsRequiredForEquip(equippedItem);
    }, 0);

    // Weapons occupy 1 or 2 hand slots; shield-type armor (no body slot) occupies 1 hand slot
    const equippedItemIds = this.equippedItemIdsByDungon()[inventoryContext.dungonId] ?? [];
    const itemsMap = this.pcTresherItemsById();
    const bodyArmorSlots = new Set(['head', 'body', 'left-arm', 'right-arm', 'left-leg', 'right-leg']);
    const itemHands = equippedItemIds.reduce((sum, id) => {
      const it = itemsMap.get(id);
      if (!it) return sum;
      if (it.type === 'weapon') return sum + (it.isTwoHanded ? 2 : 1);
      // Armor with no body slot (e.g. shield) occupies 1 hand
      if (it.type === 'armor' && (!it.armorSlot || !bodyArmorSlots.has(it.armorSlot))) return sum + 1;
      return sum;
    }, 0);

    return tresherHands + itemHands;
  }

  equippedArmorSummaryForPreview(): string {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) {
      return 'None';
    }

    const equippedIndexes = this.getEquippedTresherIndexesForDungon(
      inventoryContext.dungonId,
      inventoryContext.inventory.treshers.length
    );

    const armorNames = equippedIndexes
      .map((index) => inventoryContext.inventory.treshers[index])
      .filter((t) => t && (t.type ?? 'OtherTresher') === 'Armor')
      .map((t) => t!.name.trim() || 'Armor');

    return armorNames.length > 0 ? armorNames.join(', ') : 'None';
  }

  getInventoryTresherMeta(tresher: Tresher): string {
    return this.inventoryService.getInventoryTresherMeta(tresher);
  }

  totalInventoryCurrency(): { gold: number; silver: number; copper: number; zinc: number } {
    return this.inventoryTreshersForPreview().reduce(
      (acc, t) => ({
        gold: acc.gold + (t.gold ?? 0),
        silver: acc.silver + (t.silver ?? 0),
        copper: acc.copper + (t.copper ?? 0),
        zinc: acc.zinc + (t.zinc ?? 0),
      }),
      { gold: 0, silver: 0, copper: 0, zinc: 0 }
    );
  }

  hasCurrencyInInventory(): boolean {
    const c = this.totalInventoryCurrency();
    return c.gold > 0 || c.silver > 0 || c.copper > 0 || c.zinc > 0;
  }

  readonly bodyPanelBgColor = computed(() => {
    const hp = this.playerHp();
    const max = this.getEffectivePlayerMaxHp();
    const pct = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 1;
    // white at 100%, increasingly red as hp drops
    const g = Math.round(pct * 255);
    const b = Math.round(pct * 255);
    return `rgb(255,${g},${b})`;
  });

  readonly equippedBodySlotsForView = computed(() => {
    const empty = {
      head: false, body: false, leftArm: false, rightArm: false,
      leftLeg: false, rightLeg: false,
      mainHand: null as { isTwoHanded: boolean; kind: 'weapon' | 'wand' | 'shield' } | null,
      offHand: null as { kind: 'weapon' | 'wand' | 'shield' } | null,
      hasRing: false, hasNecklace: false,
    };
    const preview = this.gridPreviewContext();
    if (!preview) return empty;
    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const treshers: Tresher[] = Array.isArray(cheater.inventory?.treshers) ? cheater.inventory.treshers : [];
    const itemsMap = this.pcTresherItemsById();
    const result = { ...empty };

    const bodyArmorSlots = new Set(['head', 'body', 'left-arm', 'right-arm', 'left-leg', 'right-leg']);

    const assignHandItem = (kind: 'weapon' | 'wand' | 'shield', isTwoHanded: boolean) => {
      if (isTwoHanded) {
        result.mainHand = { kind, isTwoHanded: true };
        result.offHand = null;
        return;
      }
      if (!result.mainHand) {
        result.mainHand = { kind, isTwoHanded: false };
        return;
      }
      if (!result.mainHand.isTwoHanded && !result.offHand) {
        result.offHand = { kind };
      }
    };

    const getHandItemKind = (name: string | undefined, fallback: 'weapon' | 'shield' = 'weapon'): 'weapon' | 'wand' | 'shield' => {
      const normalizedName = (name ?? '').toLowerCase();
      if (normalizedName.includes('shield') || normalizedName.includes('buckler')) {
        return 'shield';
      }
      if (normalizedName.includes('wand')) {
        return 'wand';
      }
      return fallback;
    };

    const applyItemId = (itemId: number) => {
      const item = itemsMap.get(itemId);
      if (!item) return;
      switch (item.type) {
        case 'armor':
          if (item.armorSlot === 'head') result.head = true;
          else if (item.armorSlot === 'body') result.body = true;
          else if (item.armorSlot === 'left-arm') result.leftArm = true;
          else if (item.armorSlot === 'right-arm') result.rightArm = true;
          else if (item.armorSlot === 'left-leg') result.leftLeg = true;
          else if (item.armorSlot === 'right-leg') result.rightLeg = true;
          else if (item.armorSlot === 'shield') {
            assignHandItem('shield', false);
          } else if (!item.armorSlot || !bodyArmorSlots.has(item.armorSlot ?? '')) {
            const kind = getHandItemKind(item.name, 'shield');
            if (kind === 'shield') {
              assignHandItem('shield', false);
            }
          }
          break;
        case 'weapon':
          assignHandItem(getHandItemKind(item.name), item.isTwoHanded);
          break;
        case 'ring':
          result.hasRing = true;
          break;
        case 'necklace':
          result.hasNecklace = true;
          break;
      }
    };

    const equippedIndexes = this.getEquippedTresherIndexesForDungon(preview.dungonId, treshers.length);
    for (const idx of equippedIndexes) {
      const t = treshers[idx];
      if (!t) continue;
      for (const itemId of [t.item1Id, t.item2Id, t.item3Id, t.item4Id]) {
        if (itemId != null) applyItemId(itemId);
      }
    }

    const equippedItemIds = this.equippedItemIdsByDungon()[preview.dungonId] ?? [];
    for (const itemId of equippedItemIds) applyItemId(itemId);

    return result;
  });

  readonly allTresherItemsGrouped = computed(() => {
    const treshers = this.inventoryTreshersForPreview();
    const itemsMap = this.pcTresherItemsById();
    type FlatItem = { id: number; name: string; description: string; type: string; effectValue: number | null; armorSlot: string | null; damage: number; range: number; effectToPc?: string | null; effectToPcValue?: number; tresherIdx: number };
    const flat: FlatItem[] = [];
    for (let i = 0; i < treshers.length; i++) {
      const t = treshers[i];
      for (const itemId of [t.item1Id, t.item2Id, t.item3Id, t.item4Id]) {
        if (itemId != null) {
          const item = itemsMap.get(itemId);
          if (item) flat.push({ id: item.id, name: item.name, description: item.description, type: item.type, effectValue: item.effectValue, armorSlot: item.armorSlot, damage: item.damage, range: item.range, effectToPc: item.effectToPc ?? null, effectToPcValue: item.effectToPcValue ?? 0, tresherIdx: i });
        }
      }
    }
    const seen = new Set<number>();
    const deduped = flat.filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
    deduped.sort((a, b) => a.name.localeCompare(b.name));
    const groupMap = new Map<string, FlatItem[]>();
    for (const item of deduped) {
      const type = item.type || 'Other';
      if (!groupMap.has(type)) groupMap.set(type, []);
      groupMap.get(type)!.push(item);
    }
    return [...groupMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([type, items]) => ({ type, items }));
  });

  readonly allTresherPotionsFlat = computed(() => {
    const treshers = this.inventoryTreshersForPreview();
    const potionsMap = this.pcTresherPotionsById();
    type FlatPotion = { id: number; name: string; description: string; effectTo: string; effectAmount: number; lastFor: number; tresherIdx: number };
    const flat: FlatPotion[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < treshers.length; i++) {
      const t = treshers[i];
      for (const potionId of [t.potion1Id, t.potion2Id, t.potion3Id]) {
        if (potionId != null && !seen.has(potionId)) {
          const potion = potionsMap.get(potionId);
          if (potion) { flat.push({ ...potion, tresherIdx: i }); seen.add(potionId); }
        }
      }
    }
    return flat.sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly allTresherSpellsFlat = computed(() => {
    const treshers = this.inventoryTreshersForPreview();
    const spellsMap = this.pcTresherSpellsById();
    const preview = this.gridPreviewContext();
    const flat: PcTresherSpellData[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < treshers.length; i++) {
      const t = treshers[i];
      for (const spellId of [t.spell1Id, t.spell2Id, t.spell3Id, t.spell4Id]) {
        if (spellId != null && !seen.has(spellId)) {
          const spell = spellsMap.get(spellId);
          if (spell) { flat.push(spell); seen.add(spellId); }
        }
      }
    }

    if (preview) {
      for (const spell of this.collectedFloorSpellsByDungon()[preview.dungonId] ?? []) {
        if (!seen.has(spell.id)) {
          flat.push(spell);
          seen.add(spell.id);
        }
      }
    }

    return flat.sort((a, b) => a.name.localeCompare(b.name));
  });

  getTresherInnerItems(tresher: Tresher): Array<{ id: number; name: string; description: string; type: string; effectValue: number | null; armorSlot: string | null; damage: number; range: number; effectToPc?: string | null; effectToPcValue?: number }> {
    return this.inventoryService.getTresherInnerItems(tresher);
  }

  getTresherInnerPotions(tresher: Tresher): Array<{ id: number; name: string; description: string; effectTo: string; effectAmount: number; lastFor: number }> {
    return this.inventoryService.getTresherInnerPotions(tresher);
  }

  isInnerPotionDrinkable(potion: { effectTo: string }): boolean {
    return potion.effectTo === 'HP';
  }

  canDrinkInnerPotion(): boolean {
    return this.turnPhase() === 'player' && this.playerHp() > 0;
  }

  getTresherInnerSpells(tresher: Tresher): PcTresherSpellData[] {
    return this.inventoryService.getTresherInnerSpells(tresher);
  }

  getPlayerMagicResistance(): number {
    return Math.floor(this.getEffectivePlayerMind() / 2);
  }

  canCastSpell(spell: PcTresherSpellData): boolean {
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0) return false;
    if (this.playerAE() < Math.max(1, spell.sp)) return false;
    if (this.playerMp() < Math.max(1, spell.magicCost ?? 1)) return false;
    const preview = this.gridPreviewContext();
    if (!preview) return false;
    if (spell.range === 0) return true;
    return this.findAdjacentLiveMonster(preview.centerRow, preview.centerColumn, spell.range, preview.dungonId) !== null;
  }

  initSpellCast(spellId: number): void {
    if (this.turnPhase() !== 'player') return;
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const spell = this.pcTresherSpellsById().get(spellId);
    if (!spell) return;

    if (spell.numberOfTargets > 1) {
      this.spellTargetMode.set({ spellId, maxTargets: spell.numberOfTargets, targets: [] });
      this.selectedSpellId.set(spellId);
      this.previewActionMessage.set(`${spell.name}: click up to ${spell.numberOfTargets} monsters on the map, then press Cast.`);
      this.addCombatLog(`Select up to ${spell.numberOfTargets} targets for ${spell.name}.`);
    } else {
      this.castSpell(spellId);
    }
  }

  castSpell(spellId: number): void {
    if (this.turnPhase() !== 'player') return;
    const preview = this.gridPreviewContext();
    if (!preview) return;

    const spell = this.pcTresherSpellsById().get(spellId);
    if (!spell) return;

    const mpCost = Math.max(1, spell.sp);
    if (this.playerAE() < mpCost) {
      this.addCombatLog(`Not enough AE to cast ${spell.name}. Need ${mpCost} AE.`);
      return;
    }
    const spellMpCost = Math.max(1, spell.magicCost ?? 1);
    if (this.playerMp() < spellMpCost) {
      this.addCombatLog(`Not enough MP to cast ${spell.name}. Need ${spellMpCost} MP.`);
      return;
    }

    // Range 0 = self-cast on the PC
    if (spell.range === 0) {
      this.castSpellOnSelf(spell);
      this.consumePlayerAE(mpCost, preview.dungonId);
      this.playerMp.update(v => Math.max(0, v - spellMpCost));
      return;
    }

    const target = this.getTargetMonster(preview.dungonId, preview.centerRow, preview.centerColumn, spell.range);
    if (!target) {
      this.addCombatLog(`No target in range (${spell.range}) for ${spell.name}.`);
      return;
    }

    const template = this.getMonstersByIdForDungon(preview.dungonId).get(target.monsterId);
    const monsterName = template?.name ?? 'monster';
    const magicResistance = template?.magicResistance ?? 0;

    this.selectedSpellId.set(null);

    const roll = this.rollD12(this.getEffectivePlayerMind());
    const dc = spell.successTestValue + magicResistance;
    const spellFlavor = this.formatSpellFlavor(spell);
    this.addCombatLog(`Cast ${spell.name}${spellFlavor} — rolled ${roll} (1d12+${this.getEffectivePlayerMind()}) vs DC ${dc} (TN ${spell.successTestValue} + MR ${magicResistance}).`);

    if (roll >= dc) {
      const dist = Math.max(Math.abs(target.row - preview.centerRow), Math.abs(target.column - preview.centerColumn));
      if (dist > 1) {
        this.triggerSpellBeam(preview.centerRow, preview.centerColumn, target.row, target.column, spell.effectOn === 'HP');
      }
      if (spell.lastFor > 0) {
        target.activeEffects.push({
          effectOn: spell.effectOn,
          effectAmount: spell.effectAmount,
          remainingAE: spell.lastFor,
          sourceName: spell.name,
        });
        this.triggerMonsterGlow(target.row, target.column, spell.name, spell.effectOn, spell.effectType ?? '');
        this.addCombatLog(`${spell.name}${spellFlavor} afflicts ${monsterName} for ${spell.lastFor} AE! (${spell.effectOn} -${spell.effectAmount}/AE)`);
      } else {
        if (spell.effectOn === 'HP') {
          const calc = this.calculateSpellHpDamage(spell.effectAmount, magicResistance);
          const damage = calc.damage;
          target.currentHp -= damage;
          this.triggerSpellHitFlash(spell.name, spell.effectOn, spell.effectType ?? '');
          this.triggerMonsterGlow(target.row, target.column, spell.name, spell.effectOn, spell.effectType ?? '');
          this.addCombatLog(`${spell.name}${spellFlavor} hits ${monsterName} for ${damage} damage! (Base ${spell.effectAmount} + Mind ${calc.mindBonus} (${calc.mindDiceCount}d4) - MR ${calc.mrReduction})`);
        } else {
          this.triggerMonsterGlow(target.row, target.column, spell.name, spell.effectOn, spell.effectType ?? '');
          this.addCombatLog(`${spell.name}${spellFlavor} successfully affects ${monsterName}! (${spell.effectOn} −${spell.effectAmount})`);
        }

        if (target.currentHp <= 0) {
          target.isDead = true;
          target.currentHp = 0;
          this.addCombatLog(`${monsterName} is dead!`);
          this.selectedCombatTarget.set(null); // clear target after kill
          this.dropMonsterLoot(preview.dungonId, target, template ?? null);
          const spGain = template?.spReward ?? 0;
          if (spGain > 0) {
            this.playerSp.update((s) => s + spGain);
            this.addCombatLog(`+${spGain} SP!`);
            this.awardSpToPC(spGain);
          }
        }
      }
      this.monsterInstances.update((arr) => [...arr]);
    } else {
      this.addCombatLog(`${spell.name}${spellFlavor} fizzles — ${monsterName} resists!`);
    }

    // consumePlayerAE ticks all active effects (including any just applied) once per AE point
    this.consumePlayerAE(mpCost, preview.dungonId);
    this.playerMp.update(v => Math.max(0, v - spellMpCost));
    this.drawPreviewGridCanvas();

    if (this.playerAE() <= 0) {
      this.startMonsterTurns();
    }
  }

  executeMultiTargetSpell(): void {
    const targetMode = this.spellTargetMode();
    if (!targetMode || targetMode.targets.length === 0) return;
    if (this.turnPhase() !== 'player') return;
    const preview = this.gridPreviewContext();
    if (!preview) return;

    const spell = this.pcTresherSpellsById().get(targetMode.spellId);
    if (!spell) return;

    const mpCost = Math.max(1, spell.sp);
    if (this.playerAE() < mpCost) {
      this.addCombatLog(`Not enough AE to cast ${spell.name}. Need ${mpCost} AE.`);
      return;
    }
    const spellMpCost = Math.max(1, spell.magicCost ?? 1);
    if (this.playerMp() < spellMpCost) {
      this.addCombatLog(`Not enough MP to cast ${spell.name}. Need ${spellMpCost} MP.`);
      return;
    }

    this.spellTargetMode.set(null);
    this.selectedSpellId.set(null);
    const spellFlavor = this.formatSpellFlavor(spell);

    let anyHit = false;
    for (const t of targetMode.targets) {
      const instance = this.monsterInstances().find(m => !m.isDead && m.row === t.row && m.column === t.column);
      if (!instance) continue;
      const template = this.getMonstersByIdForDungon(preview.dungonId).get(instance.monsterId);
      const monsterName = template?.name ?? 'monster';
      const magicResistance = template?.magicResistance ?? 0;
      const roll = this.rollD12(this.getEffectivePlayerMind());
      const dc = spell.successTestValue + magicResistance;
      this.addCombatLog(`${spell.name}${spellFlavor} → ${monsterName}: rolled ${roll} vs DC ${dc}.`);
      if (roll >= dc) {
        anyHit = true;
        const dist = Math.max(Math.abs(instance.row - preview.centerRow), Math.abs(instance.column - preview.centerColumn));
        if (dist > 1) {
          this.triggerSpellBeam(preview.centerRow, preview.centerColumn, instance.row, instance.column, spell.effectOn === 'HP');
        }
        if (spell.lastFor > 0) {
          instance.activeEffects.push({
            effectOn: spell.effectOn,
            effectAmount: spell.effectAmount,
            remainingAE: spell.lastFor,
            sourceName: spell.name,
          });
          this.triggerMonsterGlow(instance.row, instance.column, spell.name, spell.effectOn, spell.effectType ?? '');
          this.addCombatLog(`${spell.name}${spellFlavor} afflicts ${monsterName} for ${spell.lastFor} AE!`);
        } else {
          if (spell.effectOn === 'HP') {
            const calc = this.calculateSpellHpDamage(spell.effectAmount, magicResistance);
            const damage = calc.damage;
            instance.currentHp -= damage;
            this.triggerSpellHitFlash(spell.name, spell.effectOn, spell.effectType ?? '');
            this.triggerMonsterGlow(instance.row, instance.column, spell.name, spell.effectOn, spell.effectType ?? '');
            this.addCombatLog(`${spell.name}${spellFlavor} hits ${monsterName} for ${damage} damage! (Base ${spell.effectAmount} + Mind ${calc.mindBonus} (${calc.mindDiceCount}d4) - MR ${calc.mrReduction})`);
          } else {
            this.triggerMonsterGlow(instance.row, instance.column, spell.name, spell.effectOn, spell.effectType ?? '');
            this.addCombatLog(`${spell.name}${spellFlavor} affects ${monsterName}! (${spell.effectOn} −${spell.effectAmount})`);
          }
          if (instance.currentHp <= 0) {
            instance.isDead = true;
            instance.currentHp = 0;
            this.addCombatLog(`${monsterName} is dead!`);
            this.dropMonsterLoot(preview.dungonId, instance, template ?? null);
            const spGain = template?.spReward ?? 0;
            if (spGain > 0) {
              this.playerSp.update((s) => s + spGain);
              this.addCombatLog(`+${spGain} SP!`);
              this.awardSpToPC(spGain);
            }
          }
        }
      } else {
        this.addCombatLog(`${spell.name}${spellFlavor} fizzles — ${monsterName} resists!`);
      }
    }
    if (anyHit) {
      this.selectedCombatTarget.set(null);
    }
    this.monsterInstances.update((arr) => [...arr]);
    this.consumePlayerAE(mpCost, preview.dungonId);
    this.playerMp.update(v => Math.max(0, v - spellMpCost));
    this.drawPreviewGridCanvas();
    if (this.playerAE() <= 0) {
      this.startMonsterTurns();
    }
  }

  private castSpellOnSelf(spell: PcTresherSpellData): void {
    const spellFlavor = this.formatSpellFlavor(spell);

    if (spell.lastFor > 0) {
      // Persistent effect on the PC
      this.playerActiveEffects.update((effects) => [
        ...effects,
        {
          effectOn: spell.effectOn,
          effectAmount: spell.effectAmount,
          remainingAE: spell.lastFor,
          sourceName: spell.name,
        },
      ]);
      this.triggerSpellHitFlash(spell.name, spell.effectOn, spell.effectType ?? '');
      const per = Math.abs(spell.effectAmount);
      this.addCombatLog(`${spell.name}${spellFlavor} afflicts you for ${spell.lastFor} AE! (${spell.effectOn} ${spell.effectAmount > 0 ? '-' : '+'}${per}/AE)`);
    } else {
      // Instant effect on the PC
      if (spell.effectOn === 'HP') {
        const amount = spell.effectAmount;
        // For instant self-cast: negative values heal, positive values damage the caster
        // (This is unusual, but matches the neg-value-is-heal pattern)
        const oldHp = this.playerHp();
        const newHp = Math.max(0, Math.min(this.getEffectivePlayerMaxHp(), oldHp - amount));
        this.playerHp.set(newHp);
        this.triggerSpellHitFlash(spell.name, spell.effectOn, spell.effectType ?? '');
        if (amount > 0) {
          this.addCombatLog(`${spell.name}${spellFlavor} damages you for ${amount} HP!`);
        } else {
          this.addCombatLog(`${spell.name}${spellFlavor} restores ${Math.abs(amount)} HP!`);
        }
        if (newHp <= 0) {
          this.playerDeathCause.set(`Killed by ${spell.name}`);
          this.turnPhase.set('gameover');
          setTimeout(() => this.goHome(), 3500);
        }
      } else {
        this.triggerSpellHitFlash(spell.name, spell.effectOn, spell.effectType ?? '');
        this.addCombatLog(`${spell.name}${spellFlavor} affects you! (${spell.effectOn} ${spell.effectAmount})`);
      }
    }
    this.drawPreviewGridCanvas();
  }

  cancelSpellTargetMode(): void {
    this.spellTargetMode.set(null);
    this.selectedSpellId.set(null);
    this.previewActionMessage.set(null);
    this.drawPreviewGridCanvas();
  }

  private triggerSpellBeam(fromRow: number, fromCol: number, toRow: number, toCol: number, isHP: boolean): void {
    // Beam visuals disabled by design; impact effects are used instead.
    void fromRow;
    void fromCol;
    void toRow;
    void toCol;
    void isHP;
  }

  private triggerMonsterGlow(row: number, col: number, spellName = '', effectOn = '', effectType = ''): void {
    this.triggerMonsterImpact(row, col, this.getMonsterImpactKind(spellName, effectOn, effectType), null);
  }

  private triggerWeaponMonsterImpact(row: number, col: number, effectType: string, effectColor: string | null): void {
    this.triggerMonsterImpact(row, col, this.getMonsterImpactKind('', '', effectType), effectColor);
  }

  private triggerMonsterImpact(row: number, col: number, kind: MonsterImpactKind, color: string | null): void {
    const previewKey = `${row}_${col}`;
    const firstPersonKey = `${row}:${col}`;
    const now = Date.now();
    this.monsterGlowKeys.update(s => { const n = new Set(s); n.add(previewKey); return n; });
    const impactState: MonsterImpactState = {
      kind,
      color: color || this.getDefaultMonsterImpactColor(kind),
      startedAt: now,
      expiresAt: now + 2100,
    };
    this.monsterImpactEffects.update((all) => ({
      ...all,
      [previewKey]: impactState,
      [firstPersonKey]: impactState,
    }));
    this.ensureMonsterImpactPulseTimer();
    setTimeout(() => {
      this.monsterGlowKeys.update(s => { const n = new Set(s); n.delete(previewKey); return n; });
      this.monsterImpactEffects.update((all) => {
        if (!all[previewKey] && !all[firstPersonKey]) return all;
        const next = { ...all };
        delete next[previewKey];
        delete next[firstPersonKey];
        return next;
      });
      this.stopMonsterImpactPulseTimerIfIdle();
      this.drawPreviewGridCanvas();
    }, 2100);
  }

  private getMonsterImpactKind(spellName: string, effectOn: string, effectType: string): MonsterImpactKind {
    const normalizedType = (effectType ?? '').toLowerCase();
    if (normalizedType.includes('blood') || normalizedType.includes('bleed')) {
      return 'blood';
    }
    if (normalizedType.includes('fire')) {
      return 'fire';
    }
    if (normalizedType.includes('mind') || normalizedType.includes('psychic') || normalizedType.includes('psionic')) {
      return 'mind';
    }
    if (normalizedType.includes('lightning') || normalizedType.includes('shock') || normalizedType.includes('spark') || normalizedType.includes('storm')) {
      return 'lightning';
    }
    if (normalizedType.includes('ice') || normalizedType.includes('frost') || normalizedType.includes('cold')) {
      return 'ice';
    }
    const normalized = `${spellName} ${effectOn} ${effectType}`.toLowerCase();
    if (normalized.includes('blood') || normalized.includes('bleed')) {
      return 'blood';
    }
    if (normalized.includes('fire') || normalized.includes('burn') || normalized.includes('flame')) {
      return 'fire';
    }
    if (
      normalized.includes('mind') ||
      normalized.includes('psychic') ||
      normalized.includes('psionic')
    ) {
      return 'mind';
    }
    if (
      normalized.includes('lightning') ||
      normalized.includes('shock') ||
      normalized.includes('spark') ||
      normalized.includes('storm')
    ) {
      return 'lightning';
    }
    if (
      normalized.includes('ice') ||
      normalized.includes('frost') ||
      normalized.includes('cold')
    ) {
      return 'ice';
    }
    return 'arcane';
  }

  private getDefaultMonsterImpactColor(kind: MonsterImpactKind): string {
    if (kind === 'blood') return '#c61d2d';
    if (kind === 'fire') return '#ff5b2a';
    if (kind === 'lightning') return '#8de8ff';
    if (kind === 'ice') return '#71d6ff';
    if (kind === 'mind') return '#44dd77';
    return '#c85fff';
  }

  private ensureMonsterImpactPulseTimer(): void {
    if (this.monsterImpactPulseTimer !== null) {
      return;
    }
    this.monsterImpactPulseTimer = setInterval(() => {
      this.monsterImpactPulse.update((v) => (v + 1) % 100000);
      this.drawPreviewGridCanvas();
    }, 55);
  }

  private stopMonsterImpactPulseTimerIfIdle(): void {
    if (Object.keys(this.monsterImpactEffects()).length > 0) {
      return;
    }
    if (this.monsterImpactPulseTimer !== null) {
      clearInterval(this.monsterImpactPulseTimer);
      this.monsterImpactPulseTimer = null;
    }
  }

  private triggerPlayerYellowHitFlash(): void {
    this.playerYellowHitFlash.set(true);
    setTimeout(() => this.playerYellowHitFlash.set(false), 1500);
  }

  private triggerSpellHitFlash(spellName: string, effectOn: string, effectType: string): void {
    const kind = this.getMonsterImpactKind(spellName, effectOn, effectType);
    this.spellHitFlash.set(kind);
    setTimeout(() => this.spellHitFlash.set(null), 1500);
  }

  getBeamFpvLine(beam: { fromRow: number; fromCol: number; toRow: number; toCol: number; isHP: boolean }): { x1: number; y1: number; x2: number; y2: number } | null {
    const preview = this.gridPreviewContext();
    if (!preview) return null;

    const viewportWidth = 330;
    const viewportHeight = 220;
    const playerOrigin = { x: viewportWidth / 2, y: viewportHeight * 0.63 };
    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const facing = cheater.facingDir;

    const firstPersonView = this.getFirstPersonView(preview, cheater);
    const maxFrameDepth = Math.max(2, Math.min(12, firstPersonView.steps.length + 2));
    const frameAtDepth = (depth: number): { left: number; right: number; top: number; bottom: number } => {
      const ratio = Math.min(1, depth / maxFrameDepth);
      const marginX = ratio * (viewportWidth * 0.38);
      const marginY = ratio * (viewportHeight * 0.33);
      return {
        left: marginX,
        right: viewportWidth - marginX,
        top: marginY,
        bottom: viewportHeight - marginY,
      };
    };

    const toForwardRight = (row: number, col: number): { forward: number; right: number } => {
      const dr = row - preview.centerRow;
      const dc = col - preview.centerColumn;
      switch (facing) {
        case 'up':
          return { forward: -dr, right: dc };
        case 'right':
          return { forward: dc, right: dr };
        case 'down':
          return { forward: dr, right: -dc };
        case 'left':
          return { forward: -dc, right: -dr };
      }
    };

    const projectSquareCenter = (row: number, col: number): { x: number; y: number } | null => {
      const { forward, right } = toForwardRight(row, col);
      if (forward <= 0) return null;

      const depth = Math.min(firstPersonView.steps.length + 1, Math.max(1, Math.round(forward)));
      const nearFrame = frameAtDepth(depth);
      const farFrame = frameAtDepth(depth + 1);

      const midLeft = nearFrame.left * 0.65 + farFrame.left * 0.35;
      const midRight = nearFrame.right * 0.65 + farFrame.right * 0.35;
      const midTop = nearFrame.top * 0.65 + farFrame.top * 0.35;
      const midBottom = nearFrame.bottom * 0.65 + farFrame.bottom * 0.35;
      const tileWidth = midRight - midLeft;
      const tileHeight = midBottom - midTop;

      const perspectiveOffset = right / (forward + 0.65);
      const centeredX = (midLeft + midRight) / 2 + perspectiveOffset * tileWidth * 0.82;
      const minCenterX = midLeft + tileWidth * 0.12;
      const maxCenterX = midRight - tileWidth * 0.12;
      const centerX = Math.max(minCenterX, Math.min(maxCenterX, centeredX));
      const centerY = midTop + tileHeight * 0.52;

      return { x: centerX, y: centerY };
    };

    const targetPoint = projectSquareCenter(beam.toRow, beam.toCol);
    if (!targetPoint) return null;

    const sourcePoint =
      beam.fromRow === preview.centerRow && beam.fromCol === preview.centerColumn
        ? playerOrigin
        : (projectSquareCenter(beam.fromRow, beam.fromCol) ?? playerOrigin);

    return { x1: sourcePoint.x, y1: sourcePoint.y, x2: targetPoint.x, y2: targetPoint.y };
  }

  drinkTresherInnerPotion(tresherIndex: number, potionId: number): void {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) return;

    const { dungonId, inventory } = inventoryContext;
    if (tresherIndex < 0 || tresherIndex >= inventory.treshers.length) return;

    if (this.turnPhase() !== 'player' || this.playerHp() <= 0) {
      this.previewActionMessage.set('Potions can only be used during your turn.');
      return;
    }

    const potion = this.pcTresherPotionsById().get(potionId);
    if (!potion) return;

    if (potion.effectTo !== 'HP') {
      this.previewActionMessage.set(`${potion.name} does not affect health.`);
      return;
    }

    this.removeInnerPotionSlotFromInventoryTresher(dungonId, tresherIndex, potionId);

    if (potion.lastFor > 1) {
      // Lasting regeneration: ticks once per AE spent by anyone
      this.playerActiveEffects.update((effects) => [
        ...effects,
        { effectOn: 'HP', effectAmount: potion.effectAmount, remainingAE: potion.lastFor, sourceName: potion.name },
      ]);
      this.addCombatLog(`You drink ${potion.name}. Regenerating +${potion.effectAmount} HP for ${potion.lastFor} AE.`);
      this.previewActionMessage.set(`${potion.name}: +${potion.effectAmount} HP for ${potion.lastFor} AE.`);
    } else {
      const variance = Math.floor(Math.random() * 3) + 1;
      const sign = Math.random() < 0.5 ? 1 : -1;
      const delta = potion.effectAmount + sign * variance;

      const currentHp = this.playerHp();
      const maxHp = this.getEffectivePlayerMaxHp();
      const newHp = Math.max(0, Math.min(currentHp + delta, maxHp));
      const change = newHp - currentHp;

      this.playerHp.set(newHp);

      const changeText = change >= 0 ? `restored ${change} HP` : `lost ${Math.abs(change)} HP`;
      this.previewActionMessage.set(`${potion.name}: ${changeText}.`);
      this.addCombatLog(`You drink ${potion.name} and ${changeText}.`);
    }
    this.saveGameState();
  }

  isItemEquipable(type: string): boolean {
    return this.inventoryService.isItemEquipable(type);
  }

  isItemEquippedById(itemId: number): boolean {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) {
      return false;
    }
    return (this.equippedItemIdsByDungon()[inventoryContext.dungonId] ?? []).includes(itemId);
  }

  toggleItemEquipped(itemId: number): void {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) {
      return;
    }
    if (this.turnPhase() !== 'player' || this.playerHp() <= 0) {
      this.previewActionMessage.set('You can only equip items during your turn.');
      return;
    }
    if (this.playerAE() < 1) {
      this.previewActionMessage.set('Not enough AE to equip or unequip.');
      return;
    }
    const { dungonId } = inventoryContext;
    const item = this.pcTresherItemsById().get(itemId);
    if (!item) {
      return;
    }
    const itemName = item.name || 'Item';
    const equippedIds = this.equippedItemIdsByDungon()[dungonId] ?? [];
    const prevEffectiveHpMax = this.getEffectivePlayerMaxHp();
    const prevEffectiveMpMax = this.getEffectivePlayerMagicPower();
    const prevEffectiveAEMax = this.getEffectivePlayerMaxAE();
    if (equippedIds.includes(itemId)) {
      this.equippedItemIdsByDungon.update((all) => ({ ...all, [dungonId]: equippedIds.filter((id) => id !== itemId) }));
      this.syncCurrentResourcesAfterEquipChange(prevEffectiveHpMax, prevEffectiveMpMax, prevEffectiveAEMax);
      this.addCombatLog(`${itemName} unequipped.`);
      this.previewActionMessage.set(`${itemName} unequipped.`);
    } else {
      // Weapons use a hand slot — enforce the hand limit before equipping
      if (item.type === 'weapon') {
        const handsNeeded = item.isTwoHanded ? 2 : 1;
        if (this.inventoryHandsUsedForPreview() + handsNeeded > this.maxEquippableHands) {
          const msg = item.isTwoHanded
            ? 'A two-handed weapon requires both hands free.'
            : 'Both hands are full. Unequip a weapon or shield first.';
          this.previewActionMessage.set(msg);
          return;
        }
      }
      // Shield-type armor (no body slot) also occupies 1 hand
      if (item.type === 'armor') {
        const bodyArmorSlots = new Set(['head', 'body', 'left-arm', 'right-arm', 'left-leg', 'right-leg']);
        if (!item.armorSlot || !bodyArmorSlots.has(item.armorSlot)) {
          if (this.inventoryHandsUsedForPreview() + 1 > this.maxEquippableHands) {
            this.previewActionMessage.set('Both hands are full. Unequip a weapon or shield first.');
            return;
          }
        }
      }
      this.equippedItemIdsByDungon.update((all) => ({ ...all, [dungonId]: [...equippedIds, itemId] }));
      this.syncCurrentResourcesAfterEquipChange(prevEffectiveHpMax, prevEffectiveMpMax, prevEffectiveAEMax);
      this.addCombatLog(`${itemName} equipped.`);
      this.previewActionMessage.set(`${itemName} equipped.`);
    }
    this.consumePlayerAE(1, dungonId);
    if (this.playerAE() <= 0) {
      this.startMonsterTurns();
    }
  }

  dropInventoryInnerItem(tresherIndex: number, itemId: number): void {
    const inventoryContext = this.getInventoryContextForPreview();
    if (!inventoryContext) return;
    const { dungonId, inventory } = inventoryContext;
    if (tresherIndex < 0 || tresherIndex >= inventory.treshers.length) return;

    const existingCheater = this.cheaterByDungon()[dungonId] ?? { ...DEFAULT_CHEATER };
    const existingInventory = this.normalizeCheaterInventory(existingCheater.inventory);
    const tresher = existingInventory.treshers[tresherIndex];
    const updatedTresher: Tresher = {
      ...tresher,
      item1Id: tresher.item1Id === itemId ? null : tresher.item1Id,
      item2Id: tresher.item2Id === itemId ? null : tresher.item2Id,
      item3Id: tresher.item3Id === itemId ? null : tresher.item3Id,
      item4Id: tresher.item4Id === itemId ? null : tresher.item4Id,
    };
    const updatedTreshers = existingInventory.treshers.map((t, i) => i === tresherIndex ? updatedTresher : t);

    this.cheaterByDungon.update((allCheaters) => ({
      ...allCheaters,
      [dungonId]: {
        ...existingCheater,
        inventory: { keys: existingInventory.keys, treshers: updatedTreshers },
      },
    }));

    const prevEffectiveHpMax = this.getEffectivePlayerMaxHp();
    const prevEffectiveMpMax = this.getEffectivePlayerMagicPower();
    const prevEffectiveAEMax = this.getEffectivePlayerMaxAE();
    // Unequip the item if it was equipped
    this.equippedItemIdsByDungon.update((all) => ({
      ...all,
      [dungonId]: (all[dungonId] ?? []).filter((id) => id !== itemId),
    }));
    this.syncCurrentResourcesAfterEquipChange(prevEffectiveHpMax, prevEffectiveMpMax, prevEffectiveAEMax);

    const itemName = this.pcTresherItemsById().get(itemId)?.name || 'Item';
    this.previewActionMessage.set(`${itemName} dropped.`);
    this.saveGameState();
  }

  dropCollectedFloorItem(itemId: number): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const { dungonId } = preview;
    const items = this.collectedFloorItemsByDungon()[dungonId] ?? [];
    const item = items.find((it) => it.id === itemId);
    if (!item) return;

    // Remove from collected
    this.collectedFloorItemsByDungon.update((all) => ({
      ...all,
      [dungonId]: (all[dungonId] ?? []).filter((it) => it.id !== itemId),
    }));

    const prevEffectiveHpMax = this.getEffectivePlayerMaxHp();
    const prevEffectiveMpMax = this.getEffectivePlayerMagicPower();
    const prevEffectiveAEMax = this.getEffectivePlayerMaxAE();
    // Unequip if equipped
    this.equippedItemIdsByDungon.update((all) => ({
      ...all,
      [dungonId]: (all[dungonId] ?? []).filter((id) => id !== itemId),
    }));
    this.syncCurrentResourcesAfterEquipChange(prevEffectiveHpMax, prevEffectiveMpMax, prevEffectiveAEMax);

    // Place back on current floor square
    this.floorItemPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: [...(all[dungonId] ?? []), { itemId, row: preview.centerRow, column: preview.centerColumn }],
    }));

    this.previewActionMessage.set(`${item.name || 'Item'} dropped on the floor.`);
    this.drawPreviewGridCanvas();
    this.saveGameState();
  }

  drinkCollectedFloorPotion(potionId: number): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const { dungonId } = preview;

    if (this.turnPhase() !== 'player' || this.playerHp() <= 0) {
      this.previewActionMessage.set('Potions can only be used during your turn.');
      return;
    }

    const potions = this.collectedFloorPotionsByDungon()[dungonId] ?? [];
    const potion = potions.find((p) => p.id === potionId);
    if (!potion) return;

    if (potion.effectTo !== 'HP') {
      this.previewActionMessage.set(`${potion.name || 'Potion'} does not affect health.`);
      return;
    }

    // Remove from collected (consume one)
    const potionIdx = potions.findIndex((p) => p.id === potionId);
    this.collectedFloorPotionsByDungon.update((all) => ({
      ...all,
      [dungonId]: (all[dungonId] ?? []).filter((_, i) => i !== potionIdx),
    }));

    if (potion.lastFor > 1) {
      this.playerActiveEffects.update((effects) => [
        ...effects,
        { effectOn: 'HP', effectAmount: potion.effectAmount, remainingAE: potion.lastFor, sourceName: potion.name },
      ]);
      this.addCombatLog(`You drink ${potion.name}. Regenerating +${potion.effectAmount} HP for ${potion.lastFor} AE.`);
      this.previewActionMessage.set(`${potion.name}: +${potion.effectAmount} HP for ${potion.lastFor} AE.`);
    } else {
      const variance = Math.floor(Math.random() * 3) + 1;
      const sign = Math.random() < 0.5 ? 1 : -1;
      const delta = potion.effectAmount + sign * variance;
      const currentHp = this.playerHp();
      const maxHp = this.getEffectivePlayerMaxHp();
      const newHp = Math.max(0, Math.min(currentHp + delta, maxHp));
      const change = newHp - currentHp;
      this.playerHp.set(newHp);
      const changeText = change >= 0 ? `restored ${change} HP` : `lost ${Math.abs(change)} HP`;
      this.previewActionMessage.set(`${potion.name}: ${changeText}.`);
      this.addCombatLog(`You drink ${potion.name} and ${changeText}.`);
    }
    this.saveGameState();
  }

  nearbyItemsForPreview(): NearbyDiscoveryItem[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    const currentRow = preview.centerRow;
    const currentColumn = preview.centerColumn;
    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const displayDirection = this.getDisplayedFacingDirection(preview.dungonId, cheater.facingDir);
    const forward = this.getMovementDeltaForDisplayFacingDirection(displayDirection);
    const targetRow = currentRow + forward.rowOffset;
    const targetColumn = currentColumn + forward.columnOffset;
    const hasValidTargetSquare =
      targetRow >= 0 &&
      targetColumn >= 0 &&
      targetRow < this.gridRowCount &&
      targetColumn < this.gridColumnCount;
    const isRelevantSquare = (row: number, column: number): boolean =>
      (row === currentRow && column === currentColumn) ||
      (hasValidTargetSquare && row === targetRow && column === targetColumn);

    const items: NearbyDiscoveryItem[] = [];

    for (const key of this.keyList) {
      if (key.rownId === null || key.columnId === null) {
        continue;
      }

      if (!isRelevantSquare(key.rownId, key.columnId)) {
        continue;
      }

      items.push({
        kind: 'Key',
        name: key.name.trim() || 'Unnamed Key',
        description: key.description.trim() || 'No description.',
        row: key.rownId,
        column: key.columnId,
      });
    }

    const treshersById = this.getTreshersByIdForDungon(preview.dungonId);
    for (const placement of this.tresherPlacementsByDungon()[preview.dungonId] ?? []) {
      if (!isRelevantSquare(placement.row, placement.column)) {
        continue;
      }

      const tresher = treshersById.get(placement.tresherId);
      if (!tresher) {
        continue;
      }

      items.push({
        kind: 'Tresher',
        name: tresher.name.trim() || 'Unnamed Tresher',
        description: tresher.description.trim() || 'No description.',
        row: placement.row,
        column: placement.column,
      });
    }

    const monstersById = this.getMonstersByIdForDungon(preview.dungonId);
    const liveInstances = this.monsterInstances().filter((m) => !m.isDead);
    const frontSquareBlocked = hasValidTargetSquare &&
      (() => {
        const conn = this.getMovementConnectionInfoBetweenAdjacentSquares(
          preview.dungonId, currentRow, currentColumn, targetRow, targetColumn
        );
        return conn.type === 'closedDoor' || conn.type === 'wall';
      })();
    for (const inst of liveInstances) {
      const isInCurrentSquare = inst.row === currentRow && inst.column === currentColumn;
      const isInFrontSquare = hasValidTargetSquare && inst.row === targetRow && inst.column === targetColumn;
      if (!isInCurrentSquare && (!isInFrontSquare || frontSquareBlocked)) {
        continue;
      }

      const monster = monstersById.get(inst.monsterId);
      if (!monster) {
        continue;
      }

      const roamText = inst.roam ? ' (roaming)' : '';
      items.push({
        kind: 'Monster',
        name: (monster.name.trim() || 'Unnamed Monster') + roamText,
        description: monster.description.trim() || 'No description.',
        row: inst.row,
        column: inst.column,
      });
    }

    const facingWallSides = this.getFacingWallSides(displayDirection);

    for (const st of this.squareTextsByDungon()[preview.dungonId] ?? []) {
      const isCurrentSquare = st.row === currentRow && st.column === currentColumn;
      const isTargetSquare = hasValidTargetSquare && st.row === targetRow && st.column === targetColumn;

      if (isCurrentSquare) {
        if (!st.wallSide) {
          // Floor text — show when standing on this square
          items.push({
            kind: 'Text',
            name: 'Message',
            description: st.text,
            row: st.row,
            column: st.column,
          });
        } else if (facingWallSides.includes(st.wallSide)) {
          // Wall note — show when facing this wall
          items.push({
            kind: 'Text',
            name: 'Wall Note',
            description: st.text,
            row: st.row,
            column: st.column,
          });
        }
      } else if (isTargetSquare && st.wallSide) {
        // Wall note on the adjacent facing square pointing back toward us
        const oppositeWall = this.oppositeWallSide(st.wallSide);
        if (facingWallSides.includes(oppositeWall)) {
          items.push({
            kind: 'Text',
            name: 'Wall Note',
            description: st.text,
            row: st.row,
            column: st.column,
          });
        }
      }
    }

    const floorItemsById = new Map(
      (this.floorItemListByDungon()[preview.dungonId] ?? []).map((it) => [it.id, it])
    );
    for (const placement of this.floorItemPlacementsByDungon()[preview.dungonId] ?? []) {
      if (!isRelevantSquare(placement.row, placement.column)) continue;
      const item = floorItemsById.get(placement.itemId);
      if (!item) continue;
      items.push({
        kind: 'Item',
        name: item.name.trim() || 'Unnamed Item',
        description: item.description.trim() || 'No description.',
        row: placement.row,
        column: placement.column,
      });
    }

    const floorPotionsById = new Map(
      (this.floorPotionListByDungon()[preview.dungonId] ?? []).map((p) => [p.id, p])
    );
    for (const placement of this.floorPotionPlacementsByDungon()[preview.dungonId] ?? []) {
      if (!isRelevantSquare(placement.row, placement.column)) continue;
      const potion = floorPotionsById.get(placement.potionId);
      if (!potion) continue;
      items.push({
        kind: 'Potion',
        name: potion.name.trim() || 'Unnamed Potion',
        description: potion.description.trim() || 'No description.',
        row: placement.row,
        column: placement.column,
      });
    }

    for (const placement of this.floorSpellPlacementsByDungon()[preview.dungonId] ?? []) {
      if (!isRelevantSquare(placement.row, placement.column)) continue;
      const spell = this.resolveSpellData(preview.dungonId, placement.spellId);
      if (!spell) continue;
      items.push({
        kind: 'Spell',
        name: spell.name.trim() || 'Unnamed Spell',
        description: spell.description.trim() || 'No description.',
        row: placement.row,
        column: placement.column,
      });
    }

    for (const obs of this.obstaclePlacementsByDungon()[preview.dungonId] ?? []) {
      if (obs.isDestroyed) continue;
      if (!isRelevantSquare(obs.row, obs.column)) continue;
      const itemNote = obs.containsItemId !== null && !obs.itemTaken ? ' [Contains an item]' : '';
      const hpNote = obs.isIndestructible ? ' (Indestructible)' : ` (HP: ${obs.currentHp ?? obs.hp}/${obs.hp})`;
      items.push({
        kind: 'Obstacle',
        name: obs.name || 'Obstacle',
        description: (obs.note ? obs.note : 'No description.') + hpNote + itemNote,
        row: obs.row,
        column: obs.column,
      });
    }

    return items.sort((left, right) => {
      const leftDistance =
        Math.abs(left.row - currentRow) + Math.abs(left.column - currentColumn);
      const rightDistance =
        Math.abs(right.row - currentRow) + Math.abs(right.column - currentColumn);

      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }

      if (left.kind !== right.kind) {
        return left.kind.localeCompare(right.kind);
      }

      if (left.row !== right.row) {
        return left.row - right.row;
      }

      return left.column - right.column;
    });
  }

  nearbyDoorsForPreview(): NearbyDoorInfo[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    const row = preview.centerRow;
    const col = preview.centerColumn;
    const squares = this.squaresByDungon()[preview.dungonId] ?? {};
    const inventoryKeys = this.inventoryKeysForPreview();

    const cardinalChecks: {
      side: SquareSide;
      neighborSide: SquareSide;
      dr: number;
      dc: number;
      label: string;
    }[] = [
      { side: 'toTop', neighborSide: 'toBottom', dr: -1, dc: 0, label: 'North' },
      { side: 'toRight', neighborSide: 'toLeft', dr: 0, dc: 1, label: 'East' },
      { side: 'toBottom', neighborSide: 'toTop', dr: 1, dc: 0, label: 'South' },
      { side: 'toLeft', neighborSide: 'toRight', dr: 0, dc: -1, label: 'West' },
    ];

    const doors: NearbyDoorInfo[] = [];
    const seenDoorIds = new Set<number>();
    const squareKey = this.getSquareKey(row, col);
    const currentSquare = squares[squareKey];
    if (!currentSquare) {
      return [];
    }

    for (const check of cardinalChecks) {
      const connection = currentSquare[check.side];
      if (!this.isDoorConnection(connection)) {
        continue;
      }
      if (connection.isHidden && !connection.isFound) {
        continue;
      }
      if (seenDoorIds.has(connection.id)) {
        continue;
      }
      seenDoorIds.add(connection.id);

      const neighborKey = this.getSquareKey(row + check.dr, col + check.dc);
      const canOpen = !connection.isLocked && connection.state === 'closed';
      let canUnlock = false;
      let matchingKeyIndex: number | null = null;
      let canPick = false;

      if (connection.isLocked && connection.state === 'closed' && connection.keyLock) {
        const keyIdx = inventoryKeys.findIndex(
          (k) => k.doorId === connection.id || k.id === connection.keyLock!.id
        );
        if (keyIdx !== -1) {
          canUnlock = true;
          matchingKeyIndex = keyIdx;
        }
      }

      if (connection.isLocked && connection.state === 'closed' && !canUnlock && (connection.toPick ?? 0) > 0) {
        canPick = true;
      }

      const itemReq = connection.itemRequirement ?? null;
      const canPassWithItem = !!(itemReq && connection.state === 'closed' && this.playerHasItem(itemReq.itemId));

      doors.push({
        door: connection,
        squareKey,
        side: check.side,
        neighborSquareKey: neighborKey,
        neighborSide: check.neighborSide,
        direction: check.label,
        canOpen,
        canUnlock,
        canPick,
        matchingKeyIndex,
        canPassWithItem,
      });
    }

    return doors;
  }

  openAdjacentDoor(doorInfo: NearbyDoorInfo): void {
    if (!doorInfo.canOpen) {
      return;
    }
    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }
    this.setDoorState(preview.dungonId, doorInfo, 'open');
    this.previewActionMessage.set(`You open the ${doorInfo.door.name || 'door'} to the ${doorInfo.direction}.`);
    this.drawPreviewGridCanvas();
    this.drawFirstPersonViewCanvas();
  }

  closeAdjacentDoor(doorInfo: NearbyDoorInfo): void {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }
    this.setDoorState(preview.dungonId, doorInfo, 'closed');
    this.previewActionMessage.set(`You close the ${doorInfo.door.name || 'door'} to the ${doorInfo.direction}.`);
    this.drawPreviewGridCanvas();
    this.drawFirstPersonViewCanvas();
  }

  useItemToOpenDoor(doorInfo: NearbyDoorInfo): void {
    if (!doorInfo.canPassWithItem) return;
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const req = doorInfo.door.itemRequirement;
    if (!req) return;
    if (req.consume) {
      this.removeItemFromInventory(preview.dungonId, req.itemId);
    }
    this.setDoorState(preview.dungonId, doorInfo, 'open');
    const doorName = doorInfo.door.name || 'door';
    const consumed = req.consume ? ` You gave up the ${req.itemName}.` : '';
    this.previewActionMessage.set(`You use the ${req.itemName} to open the ${doorName}.${consumed}`);
    this.drawPreviewGridCanvas();
    this.drawFirstPersonViewCanvas();
  }

  private playerHasItem(itemId: number): boolean {
    const inv = this.getInventoryContextForPreview()?.inventory;
    if (!inv) return false;
    return inv.treshers.some(
      (t) => t.item1Id === itemId || t.item2Id === itemId || t.item3Id === itemId || t.item4Id === itemId
    );
  }

  private removeItemFromInventory(dungonId: number, itemId: number): void {
    const existingCheater = this.cheaterByDungon()[dungonId];
    if (!existingCheater) return;
    const inv = this.normalizeCheaterInventory(existingCheater.inventory);
    let removed = false;
    const updatedTreshers = inv.treshers.map((t) => {
      if (removed) return t;
      const slot = t.item1Id === itemId ? 'item1Id'
        : t.item2Id === itemId ? 'item2Id'
        : t.item3Id === itemId ? 'item3Id'
        : t.item4Id === itemId ? 'item4Id'
        : null;
      if (!slot) return t;
      removed = true;
      return { ...t, [slot]: null };
    });
    this.cheaterByDungon.update((all) => ({
      ...all,
      [dungonId]: { ...existingCheater, inventory: { keys: inv.keys, treshers: updatedTreshers } },
    }));
  }

  unlockAdjacentDoor(doorInfo: NearbyDoorInfo): void {
    if (!doorInfo.canUnlock || doorInfo.matchingKeyIndex === null) {
      return;
    }
    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }

    const inventoryKeys = this.inventoryKeysForPreview();
    const key = inventoryKeys[doorInfo.matchingKeyIndex];

    this.setDoorLocked(preview.dungonId, doorInfo, false);
    this.previewActionMessage.set(
      `You use ${key.name || 'the key'} to unlock the ${doorInfo.door.name || 'door'} to the ${doorInfo.direction}.`
    );
    this.drawPreviewGridCanvas();
    this.drawFirstPersonViewCanvas();
  }

  private setDoorState(dungonId: number, doorInfo: NearbyDoorInfo, state: Door['state']): void {
    this.squaresByDungon.update((allSquares) => {
      const squares = { ...(allSquares[dungonId] ?? {}) };

      const sq = squares[doorInfo.squareKey];
      if (sq) {
        const connection = sq[doorInfo.side];
        if (this.isDoorConnection(connection)) {
          const updatedDoor = { ...connection, state };
          squares[doorInfo.squareKey] = this.withSquareSide(sq, doorInfo.side, updatedDoor);

          const neighborSq = squares[doorInfo.neighborSquareKey];
          if (neighborSq) {
            squares[doorInfo.neighborSquareKey] = this.withSquareSide(
              neighborSq,
              doorInfo.neighborSide,
              updatedDoor
            );
          }
        }
      }

      return { ...allSquares, [dungonId]: squares };
    });
  }

  private setDoorLocked(dungonId: number, doorInfo: NearbyDoorInfo, isLocked: boolean): void {
    this.squaresByDungon.update((allSquares) => {
      const squares = { ...(allSquares[dungonId] ?? {}) };

      const sq = squares[doorInfo.squareKey];
      if (sq) {
        const connection = sq[doorInfo.side];
        if (this.isDoorConnection(connection)) {
          const updatedDoor = { ...connection, isLocked };
          squares[doorInfo.squareKey] = this.withSquareSide(sq, doorInfo.side, updatedDoor);

          const neighborSq = squares[doorInfo.neighborSquareKey];
          if (neighborSq) {
            squares[doorInfo.neighborSquareKey] = this.withSquareSide(
              neighborSq,
              doorInfo.neighborSide,
              updatedDoor
            );
          }
        }
      }

      return { ...allSquares, [dungonId]: squares };
    });
  }

  private setDoorFound(
    dungonId: number,
    squareKey: string,
    side: SquareSide,
    neighborSquareKey: string,
    neighborSide: SquareSide
  ): void {
    this.squaresByDungon.update((allSquares) => {
      const squares = { ...(allSquares[dungonId] ?? {}) };
      const sq = squares[squareKey];
      if (sq) {
        const connection = sq[side];
        if (this.isDoorConnection(connection)) {
          const updatedDoor = { ...connection, isFound: true };
          squares[squareKey] = this.withSquareSide(sq, side, updatedDoor);
          const neighborSq = squares[neighborSquareKey];
          if (neighborSq) {
            squares[neighborSquareKey] = this.withSquareSide(neighborSq, neighborSide, updatedDoor);
          }
        }
      }
      return { ...allSquares, [dungonId]: squares };
    });
  }

  hasCurrentSquarePickupItems(): boolean {
    const current = this.getCurrentPreviewSquareContext();
    if (!current) {
      return false;
    }

    const hasKeys = this.getKeysAtSquare(current.row, current.column).length > 0;
    const hasTreshers = this.getTresherPlacementsAtSquare(current.dungonId, current.row, current.column).length > 0;
    const hasFloorItems = (this.floorItemPlacementsByDungon()[current.dungonId] ?? []).some(
      (placement) => placement.row === current.row && placement.column === current.column
    );
    const hasFloorPotions = (this.floorPotionPlacementsByDungon()[current.dungonId] ?? []).some(
      (placement) => placement.row === current.row && placement.column === current.column
    );
    const hasFloorSpells = (this.floorSpellPlacementsByDungon()[current.dungonId] ?? []).some(
      (placement) => placement.row === current.row && placement.column === current.column
    );

    return hasKeys || hasTreshers || hasFloorItems || hasFloorPotions || hasFloorSpells;
  }

  canTakeSomeFromCurrentSquare(): boolean {
    const current = this.getCurrentPreviewSquareContext();
    if (!current) {
      return false;
    }

    return this.getTresherPlacementsAtSquare(current.dungonId, current.row, current.column).length > 1;
  }

  pickLockDoor(doorInfo: NearbyDoorInfo): void {
    if (!doorInfo.canPick) return;
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const dc = doorInfo.door.toPick ?? 10;
    const roll = this.randomInt(1, 12) + this.getEffectivePlayerMind();
    const doorName = doorInfo.door.name || 'door';
    if (roll >= dc) {
      this.setDoorLocked(preview.dungonId, doorInfo, false);
      this.previewActionMessage.set(`You pick the lock on the ${doorName} (rolled ${roll} vs DC ${dc}). Door unlocked!`);
      this.addCombatLog(`Pick lock: rolled ${roll} vs DC ${dc}. Success.`);
    } else {
      this.previewActionMessage.set(`Failed to pick the lock on the ${doorName} (rolled ${roll} vs DC ${dc}).`);
      this.addCombatLog(`Pick lock: rolled ${roll} vs DC ${dc}. Failed.`);
      if (doorInfo.door.trap) {
        this.triggerTrap(doorInfo.door.trap);
      }
    }
    this.saveGameState();
    this.drawPreviewGridCanvas();
    this.drawFirstPersonViewCanvas();
  }

  searchForTraps(): void {
    if (!this.canSearch()) return;
    const current = this.getCurrentPreviewSquareContext();
    if (!current) return;

    this.consumePlayerAE(1, current.dungonId);
    this.playerSearchesThisTurn.update((n) => n + 1);

    const mindRoll = this.randomInt(1, 12) + this.getEffectivePlayerMind();
    this.addCombatLog(`Search — rolled ${mindRoll} (1d12+${this.getEffectivePlayerMind()}).`);

    // Check floor traps at current square
    const floorTraps = (this.floorTrapPlacementsByDungon()[current.dungonId] ?? [])
      .filter(p => p.row === current.row && p.column === current.column && !p.isTriggered && !p.isDisarmed);
    for (const fp of floorTraps) {
      if (mindRoll >= fp.trap.toDetect) {
        this.foundTrap.set({ trap: fp.trap, source: 'floor', floorTrapId: fp.id });
        this.previewActionMessage.set(`You find a floor trap: ${fp.trap.name || 'Unknown Trap'} (rolled ${mindRoll} vs DC ${fp.trap.toDetect}).`);
        // Mark the trap as detected so it shows on the map
        this.floorTrapPlacementsByDungon.update(all => ({
          ...all,
          [current.dungonId]: (all[current.dungonId] ?? []).map(p =>
            p.id === fp.id ? { ...p, isDetected: true } : p
          )
        }));
        this.saveGameState();
        if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
        return;
      }
    }

    // Check floor traps in adjacent squares (one cell away through open/door connections)
    const filledSquares = this.filledSquaresByDungon()[current.dungonId] ?? {};
    const adjacentChecks: Array<{ dr: number; dc: number; label: string }> = [
      { dr: -1, dc: 0, label: 'North' },
      { dr: 0, dc: 1, label: 'East' },
      { dr: 1, dc: 0, label: 'South' },
      { dr: 0, dc: -1, label: 'West' },
    ];
    for (const adj of adjacentChecks) {
      const adjRow = current.row + adj.dr;
      const adjCol = current.column + adj.dc;
      const adjKey = this.getSquareKey(adjRow, adjCol);
      if (!filledSquares[adjKey]) continue;
      // Only search through traversable connections — not solid walls or hidden undiscovered doors
      const blockType = this.getMovementBlockTypeBetweenAdjacentSquares(
        current.dungonId, current.row, current.column, adjRow, adjCol
      );
      if (blockType === 'wall') continue;
      const adjFloorTraps = (this.floorTrapPlacementsByDungon()[current.dungonId] ?? [])
        .filter(p => p.row === adjRow && p.column === adjCol && !p.isTriggered && !p.isDisarmed);
      for (const fp of adjFloorTraps) {
        if (mindRoll >= fp.trap.toDetect) {
          this.foundTrap.set({ trap: fp.trap, source: 'floor', floorTrapId: fp.id, adjacentRow: adjRow, adjacentColumn: adjCol });
          this.previewActionMessage.set(`You find a floor trap to the ${adj.label}: ${fp.trap.name || 'Unknown Trap'} (rolled ${mindRoll} vs DC ${fp.trap.toDetect}).`);
          // Mark the trap as detected so it shows on the map
          this.floorTrapPlacementsByDungon.update(all => ({
            ...all,
            [current.dungonId]: (all[current.dungonId] ?? []).map(p =>
              p.id === fp.id ? { ...p, isDetected: true } : p
            )
          }));
          this.saveGameState();
          if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
          return;
        }
      }
    }

    // Check tresher traps at current square
    const treshers = this.getTreshersAtSquare(current.dungonId, current.row, current.column);
    for (let i = 0; i < treshers.length; i++) {
      const t = treshers[i];
      if (t.trap && mindRoll >= t.trap.toDetect) {
        this.foundTrap.set({ trap: t.trap, source: 'tresher', tresherIndex: i });
        this.previewActionMessage.set(`You find a trap on ${t.name || 'tresher'}: ${t.trap.name || 'Trap'} (rolled ${mindRoll} vs DC ${t.trap.toDetect}).`);
        this.saveGameState();
        if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
        return;
      }
    }

    // Check tresher traps at adjacent squares (one cell away through open/door connections)
    for (const adj of adjacentChecks) {
      const adjRow = current.row + adj.dr;
      const adjCol = current.column + adj.dc;
      const adjKey = this.getSquareKey(adjRow, adjCol);
      if (!filledSquares[adjKey]) continue;
      const blockType = this.getMovementBlockTypeBetweenAdjacentSquares(
        current.dungonId, current.row, current.column, adjRow, adjCol
      );
      if (blockType === 'wall') continue;
      const adjTreshers = this.getTreshersAtSquare(current.dungonId, adjRow, adjCol);
      for (let i = 0; i < adjTreshers.length; i++) {
        const t = adjTreshers[i];
        if (t.trap && mindRoll >= t.trap.toDetect) {
          this.foundTrap.set({ trap: t.trap, source: 'tresher', tresherIndex: i, adjacentRow: adjRow, adjacentColumn: adjCol });
          this.previewActionMessage.set(`You find a trap on ${t.name || 'tresher'} to the ${adj.label}: ${t.trap.name || 'Trap'} (rolled ${mindRoll} vs DC ${t.trap.toDetect}).`);
          this.saveGameState();
          if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
          return;
        }
      }
    }

    // Check adjacent door traps
    for (const doorInfo of this.nearbyDoorsForPreview()) {
      if (doorInfo.door.trap && mindRoll >= doorInfo.door.trap.toDetect) {
        this.foundTrap.set({ trap: doorInfo.door.trap, source: 'door', doorInfo });
        this.previewActionMessage.set(`You find a trap on the ${doorInfo.door.name || 'door'} (rolled ${mindRoll} vs DC ${doorInfo.door.trap.toDetect}).`);
        this.saveGameState();
        if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
        return;
      }
    }

    // Check for hidden doors
    const squares = this.squaresByDungon()[current.dungonId] ?? {};
    const currentSquare = squares[this.getSquareKey(current.row, current.column)];
    if (currentSquare) {
      const hiddenDoorChecks: Array<{ side: SquareSide; neighborSide: SquareSide; dr: number; dc: number; label: string }> = [
        { side: 'toTop', neighborSide: 'toBottom', dr: -1, dc: 0, label: 'North' },
        { side: 'toRight', neighborSide: 'toLeft', dr: 0, dc: 1, label: 'East' },
        { side: 'toBottom', neighborSide: 'toTop', dr: 1, dc: 0, label: 'South' },
        { side: 'toLeft', neighborSide: 'toRight', dr: 0, dc: -1, label: 'West' },
      ];
      for (const cs of hiddenDoorChecks) {
        const connection = currentSquare[cs.side];
        if (this.isDoorConnection(connection) && connection.isHidden && !connection.isFound) {
          if (mindRoll >= connection.toFind) {
            this.setDoorFound(
              current.dungonId,
              this.getSquareKey(current.row, current.column),
              cs.side,
              this.getSquareKey(current.row + cs.dr, current.column + cs.dc),
              cs.neighborSide
            );
            const doorName = connection.name || 'hidden door';
            this.previewActionMessage.set(`You find a ${doorName} to the ${cs.label}! (rolled ${mindRoll} vs DC ${connection.toFind})`);
            this.saveGameState();
            this.drawPreviewGridCanvas();
            this.drawFirstPersonViewCanvas();
            if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
            return;
          }
        }
      }
    }

    this.foundTrap.set(null);
    this.previewActionMessage.set(`No traps found (rolled ${mindRoll}).`);
    if (this.playerAE() <= 0) {
      this.startMonsterTurns();
    }
  }

  currentSquareObstacles(): ObstaclePlacement[] {
    const preview = this.gridPreviewContext();
    if (!preview) return [];
    return (this.obstaclePlacementsByDungon()[preview.dungonId] ?? []).filter(
      (obs) => !obs.isDestroyed && obs.row === preview.centerRow && obs.column === preview.centerColumn
    );
  }

  smashObstacle(obstacleId: number): void {
    if (this.turnPhase() !== 'player') return;
    const preview = this.gridPreviewContext();
    if (!preview) return;
    if (this.playerAE() <= 0) return;

    const obstacles = this.obstaclePlacementsByDungon()[preview.dungonId] ?? [];
    const obs = obstacles.find((o) => o.id === obstacleId);
    if (!obs || obs.isDestroyed || obs.isIndestructible) return;

    // Deal player strength + 1d6 damage
    const damage = this.randomInt(1, 6) + this.getEffectivePlayerStrength();
    const newHp = Math.max(0, (obs.currentHp ?? obs.hp) - damage);
    const destroyed = newHp <= 0;

    this.addCombatLog(`You smash ${obs.name || 'the obstacle'} for ${damage} damage!${destroyed ? ' It is destroyed!' : ` (HP: ${newHp}/${obs.hp})`}`);
    this.previewActionMessage.set(destroyed ? `${obs.name || 'Obstacle'} destroyed!` : `${obs.name || 'Obstacle'} HP: ${newHp}/${obs.hp}`);

    this.obstaclePlacementsByDungon.update((all) => ({
      ...all,
      [preview.dungonId]: (all[preview.dungonId] ?? []).map((o) =>
        o.id === obstacleId ? { ...o, currentHp: newHp, isDestroyed: destroyed } : o
      ),
    }));

    // If destroyed and has item, drop it at this square
    if (destroyed && obs.containsItemId !== null && !obs.itemTaken) {
      this.floorItemPlacementsByDungon.update((all) => ({
        ...all,
        [preview.dungonId]: [...(all[preview.dungonId] ?? []), { itemId: obs.containsItemId!, row: obs.row, column: obs.column }],
      }));
      this.addCombatLog(`An item falls from the rubble of ${obs.name || 'the obstacle'}!`);
    }

    this.consumePlayerAE(1, preview.dungonId);
    this.saveGameState();
    if (this.playerAE() <= 0 && this.turnPhase() !== 'gameover') this.startMonsterTurns();
  }

  takeItemFromObstacle(obstacleId: number): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;

    const obstacles = this.obstaclePlacementsByDungon()[preview.dungonId] ?? [];
    const obs = obstacles.find((o) => o.id === obstacleId);
    if (!obs || obs.containsItemId === null || obs.itemTaken) return;

    this.obstaclePlacementsByDungon.update((all) => ({
      ...all,
      [preview.dungonId]: (all[preview.dungonId] ?? []).map((o) =>
        o.id === obstacleId ? { ...o, itemTaken: true } : o
      ),
    }));

    this.floorItemPlacementsByDungon.update((all) => ({
      ...all,
      [preview.dungonId]: [...(all[preview.dungonId] ?? []), { itemId: obs.containsItemId!, row: obs.row, column: obs.column }],
    }));

    const itemName = (this.floorItemListByDungon()[preview.dungonId] ?? []).find((i) => i.id === obs.containsItemId)?.name ?? 'an item';
    this.addCombatLog(`You take ${itemName} from ${obs.name || 'the obstacle'}.`);
    this.previewActionMessage.set(`Found ${itemName}!`);
    this.saveGameState();
  }

  tryDisarmTrap(): void {
    const found = this.foundTrap();
    if (!found) return;
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const dc = found.trap.toDisarm;
    const roll = this.randomInt(1, 12) + this.getEffectivePlayerMind();
    if (roll >= dc) {
      this.previewActionMessage.set(`Trap disarmed! (rolled ${roll} vs DC ${dc})`);
      this.addCombatLog(`Disarm trap: rolled ${roll} vs DC ${dc}. Success.`);
      if (found.source === 'floor' && found.floorTrapId != null) {
        this.floorTrapPlacementsByDungon.update(all => ({
          ...all,
          [preview.dungonId]: (all[preview.dungonId] ?? []).map(p =>
            p.id === found.floorTrapId ? { ...p, isDisarmed: true } : p
          )
        }));
      }
      this.foundTrap.set(null);
      this.saveGameState();
    } else {
      this.previewActionMessage.set(`Failed to disarm trap! (rolled ${roll} vs DC ${dc})`);
      this.addCombatLog(`Disarm trap: rolled ${roll} vs DC ${dc}. Failed - trap triggers!`);
      this.triggerTrap(found.trap);
      this.foundTrap.set(null);
      this.saveGameState();
    }
  }

  private triggerTrap(trap: Trap): void {
    this.previewActionMessage.set(`Trap triggered! ${trap.name || 'A trap'} goes off!`);
    if (trap.damage <= 0) {
      this.addCombatLog(`Trap triggered! ${trap.name || 'Trap'}`);
      return;
    }
    if (trap.damageTo === 'HP') {
      const newHp = Math.max(0, this.playerHp() - trap.damage);
      this.playerHp.set(newHp);
      this.addCombatLog(`Trap triggered! ${trap.name || 'Trap'} deals ${trap.damage} damage to HP.`);
      if (newHp <= 0) {
        this.playerDeathCause.set(`Killed by a trap${trap.name ? ': ' + trap.name : ''}`);
        this.turnPhase.set('gameover');
        setTimeout(() => this.goHome(), 3500);
      }
    } else if (trap.damageTo === 'Stamina') {
      this.addCombatLog(`Trap triggered! ${trap.name || 'Trap'} deals ${trap.damage} damage to Stamina.`);
    } else if (trap.damageTo === 'Mind') {
      this.addCombatLog(`Trap triggered! ${trap.name || 'Trap'} deals ${trap.damage} damage to Mind.`);
    } else if (trap.damageTo === 'AE') {
      const newAE = Math.max(0, this.playerAE() - trap.damage);
      this.playerAE.set(newAE);
      this.addCombatLog(`Trap triggered! ${trap.name || 'Trap'} drains ${trap.damage} Action Economy (AE).`);
    } else if (trap.damageTo === 'ROS') {
      const dungonId = this.gridPreviewContext()?.dungonId;
      if (dungonId !== undefined) {
        const existingCheater = this.cheaterByDungon()[dungonId];
        if (existingCheater) {
          const newROS = Math.max(1, existingCheater.rangeOfSight - trap.damage);
          this.cheaterByDungon.update((all) => ({
            ...all,
            [dungonId]: { ...existingCheater, rangeOfSight: newROS },
          }));
          this.addCombatLog(`Trap triggered! ${trap.name || 'Trap'} reduces Range of Sight by ${trap.damage} (now ${newROS}).`);
        }
      }
    }
  }

  lookForTrapsAtCurrentSquare(): void {
    this.searchForTraps();
  }

  takeAllFromCurrentSquare(): void {
    const current = this.getCurrentPreviewSquareContext();
    if (!current) {
      return;
    }

    const keysAtSquare = this.getKeysAtSquare(current.row, current.column);
    const tresherPlacements = this.getTresherPlacementsAtSquare(
      current.dungonId,
      current.row,
      current.column
    );
    const treshersAtSquare = this.getTreshersAtSquare(current.dungonId, current.row, current.column);

    const floorItemsHere = (this.floorItemPlacementsByDungon()[current.dungonId] ?? []).filter(
      (p) => p.row === current.row && p.column === current.column
    );
    const floorPotionsHere = (this.floorPotionPlacementsByDungon()[current.dungonId] ?? []).filter(
      (p) => p.row === current.row && p.column === current.column
    );
    const floorSpellsHere = (this.floorSpellPlacementsByDungon()[current.dungonId] ?? []).filter(
      (p) => p.row === current.row && p.column === current.column
    );

    if (keysAtSquare.length === 0 && tresherPlacements.length === 0 && floorItemsHere.length === 0 && floorPotionsHere.length === 0 && floorSpellsHere.length === 0) {
      this.previewActionMessage.set('Nothing to take on this square.');
      return;
    }

    this.addItemsToCheaterInventory(current.dungonId, keysAtSquare, treshersAtSquare);

    if (keysAtSquare.length > 0) {
      this.keyList = this.keyList.map((key) =>
        key.rownId === current.row && key.columnId === current.column
          ? {
              ...key,
              rownId: null,
              columnId: null,
            }
          : key
      );
    }

    if (tresherPlacements.length > 0) {
      this.removeTresherPlacementsAtSquare(current.dungonId, current.row, current.column);
      this.activateTresherGuards(current.dungonId, current.row, current.column);
    }

    if (floorItemsHere.length > 0) {
      const itemsById = new Map(
        (this.floorItemListByDungon()[current.dungonId] ?? []).map((it) => [it.id, it])
      );
      const itemsToCollect = floorItemsHere
        .map((p) => itemsById.get(p.itemId))
        .filter((it): it is NonNullable<typeof it> => it !== undefined);

      // Add to pcTresherItemsById so the equip system can resolve them
      this.pcTresherItemsById.update((map) => {
        const updated = new Map(map);
        for (const it of itemsToCollect) {
          updated.set(it.id, { ...it, effectValue: it.effectValue ?? 0 });
        }
        return updated;
      });

      // Store in collected signal
      this.collectedFloorItemsByDungon.update((all) => ({
        ...all,
        [current.dungonId]: [...(all[current.dungonId] ?? []), ...itemsToCollect],
      }));

      // Remove placements from floor
      const pickedItemIds = new Set(floorItemsHere.map((p) => p.itemId));
      this.floorItemPlacementsByDungon.update((all) => ({
        ...all,
        [current.dungonId]: (all[current.dungonId] ?? []).filter(
          (p) => !(p.row === current.row && p.column === current.column && pickedItemIds.has(p.itemId))
        ),
      }));
    }

    if (floorPotionsHere.length > 0) {
      const potionsById = new Map(
        (this.floorPotionListByDungon()[current.dungonId] ?? []).map((p) => [p.id, p])
      );
      const potionsToCollect = floorPotionsHere
        .map((p) => potionsById.get(p.potionId))
        .filter((p): p is NonNullable<typeof p> => p !== undefined);

      // Store in collected signal
      this.collectedFloorPotionsByDungon.update((all) => ({
        ...all,
        [current.dungonId]: [...(all[current.dungonId] ?? []), ...potionsToCollect],
      }));

      // Remove placements from floor
      const pickedPotionIds = new Set(floorPotionsHere.map((p) => p.potionId));
      this.floorPotionPlacementsByDungon.update((all) => ({
        ...all,
        [current.dungonId]: (all[current.dungonId] ?? []).filter(
          (p) => !(p.row === current.row && p.column === current.column && pickedPotionIds.has(p.potionId))
        ),
      }));
    }

    if (floorSpellsHere.length > 0) {
      const spellsToCollect = floorSpellsHere
        .map((p) => this.resolveSpellData(current.dungonId, p.spellId))
        .filter((s): s is NonNullable<typeof s> => s !== null);

      if (spellsToCollect.length > 0) {
        this.pcTresherSpellsById.update((map) => {
          const updated = new Map(map);
          for (const spell of spellsToCollect) {
            updated.set(spell.id, spell);
          }
          return updated;
        });
      }

      this.collectedFloorSpellsByDungon.update((all) => ({
        ...all,
        [current.dungonId]: [...(all[current.dungonId] ?? []), ...spellsToCollect],
      }));

      const pickedSpellIds = new Set(floorSpellsHere.map((p) => p.spellId));
      this.floorSpellPlacementsByDungon.update((all) => ({
        ...all,
        [current.dungonId]: (all[current.dungonId] ?? []).filter(
          (p) => !(p.row === current.row && p.column === current.column && pickedSpellIds.has(p.spellId))
        ),
      }));
    }

    const totalItemCount = keysAtSquare.length + tresherPlacements.length + floorItemsHere.length + floorPotionsHere.length + floorSpellsHere.length;
    this.previewActionMessage.set(
      `Took ${totalItemCount} item${totalItemCount === 1 ? '' : 's'} into inventory.`
    );
    this.drawPreviewGridCanvas();
  }

  takeSomeFromCurrentSquare(): void {
    const current = this.getCurrentPreviewSquareContext();
    if (!current) {
      return;
    }

    const tresherPlacements = this.getTresherPlacementsAtSquare(
      current.dungonId,
      current.row,
      current.column
    );

    if (tresherPlacements.length <= 1) {
      this.previewActionMessage.set('Take Some is available when more than one tresher is here.');
      return;
    }

    const treshersById = this.getTreshersByIdForDungon(current.dungonId);
    const placementToTake = tresherPlacements.find((placement) => treshersById.has(placement.tresherId));
    if (!placementToTake) {
      this.previewActionMessage.set('Could not find a tresher to take from this square.');
      return;
    }

    const tresherToTake = treshersById.get(placementToTake.tresherId);
    if (!tresherToTake) {
      return;
    }

    this.addItemsToCheaterInventory(current.dungonId, [], [tresherToTake]);
    this.removeSingleTresherPlacement(
      current.dungonId,
      current.row,
      current.column,
      placementToTake.tresherId
    );
    this.activateTresherGuards(current.dungonId, current.row, current.column);

    const remainingCount = tresherPlacements.length - 1;
    this.previewActionMessage.set(
      `Took 1 tresher. ${remainingCount} tresher${remainingCount === 1 ? '' : 's'} remain here.`
    );
    this.drawPreviewGridCanvas();
  }

  private loadGame(): void {
    const gameId = Number.parseInt(this.route.snapshot.paramMap.get('gameId') ?? '', 10);
    const isSample = !Number.isInteger(gameId) || gameId <= 0;

    if (isSample) {
      // Sample play mode — no auth required
      const pcIdRaw = this.route.snapshot.queryParamMap.get('pcId') ?? '';
      const pcId = Number.parseInt(pcIdRaw, 10);
      if (!Number.isInteger(pcId) || pcId <= 0) {
        this.gameLoadError.set('Invalid sample game parameters.');
        return;
      }

      this.isSampleMode.set(true);
      this.isLoadingGame.set(true);
      this.gameLoadError.set(null);

      this.http
        .get<GameSessionPayload>(`${API_BASE_URL}/games/sample-session`, {
          params: { pcId: String(pcId) },
        })
        .pipe(finalize(() => this.isLoadingGame.set(false)))
        .subscribe({
          next: (game) => {
            const playerMaxHp = this.resolvePlayerMaxHp(game.pcMaxHP);
            this.playerMaxHp.set(playerMaxHp);
            this.playerStartingHp = this.resolvePlayerCurrentHp(game.pcCurrentHP, playerMaxHp);
            this.currentGameId.set(null);
            this.gameName.set(game.name || 'Sample Game');
            this.gameLastUpdated.set(null);
            this.playerSp.set(0);
            this.playerMind.set(typeof game.pcMind === 'number' ? Math.max(0, Math.floor(game.pcMind)) : 0);
            this.playerStamina.set(typeof game.pcStamina === 'number' ? Math.max(0, Math.floor(game.pcStamina)) : 0);
            this.playerBaseAC.set(typeof game.pcAc === 'number' ? Math.max(1, game.pcAc) : 10);
            this.playerStrength.set(typeof game.pcStrength === 'number' ? Math.max(0, Math.floor(game.pcStrength)) : 0);
            this.playerMagicPower.set(typeof game.pcMagicPower === 'number' ? Math.max(0, Math.floor(game.pcMagicPower)) : 0);
            this.playerMp.set(this.getEffectivePlayerMagicPower());
            this.playerNOA.set(typeof game.pcNumberOfAttacks === 'number' ? Math.max(1, Math.floor(game.pcNumberOfAttacks)) : 1);
            this.playerNOD.set(typeof game.pcNumberOfDefends === 'number' ? Math.max(1, Math.floor(game.pcNumberOfDefends)) : 1);
            this.currentPcId_.set(null);
            this.dungonSpReward.set(0);
            this.loadDungonJsonState(game.dungonid, game.dungenJson);
            // Force-reset so PC treshers always seed fresh in sample mode (dungeon JSON may have flag set to true)
            this.setPcInventoryInitialized(game.dungonid, false);
            this.seedPcTreshersIntoInventory(game.dungonid, game.pcTreshers);
            if (Array.isArray(game.pcTresherItems)) {
              const itemMap = new Map<number, { id: number; name: string; description: string; type: string; effectValue: number | null; damage: number; range: number; armorSlot: string | null; effectOn: string | null; effectToPc?: string | null; effectToPcValue?: number; weaponEffectType?: string; weaponEffectColor?: string; isTwoHanded: boolean }>();
              for (const raw of game.pcTresherItems) {
                const it = raw as { id: number; name: string; description: string; type: string; effectValue: number | null; damage: number; range: number; armorSlot: string | null; effectOn: string | null; effectToPc?: string | null; effectToPcValue?: number; weaponEffectType?: string; weaponEffectColor?: string; isTwoHanded: boolean };
                if (typeof it.id === 'number') {
                  itemMap.set(it.id, { ...it, damage: typeof it.damage === 'number' ? it.damage : 6, range: typeof it.range === 'number' ? Math.max(1, it.range) : 1, effectToPc: typeof it.effectToPc === 'string' ? it.effectToPc : null, effectToPcValue: typeof it.effectToPcValue === 'number' ? it.effectToPcValue : 0, weaponEffectType: typeof it.weaponEffectType === 'string' ? it.weaponEffectType : 'Blood', weaponEffectColor: typeof it.weaponEffectColor === 'string' ? it.weaponEffectColor : '#cc0000', isTwoHanded: it.isTwoHanded === true });
                }
              }
              this.pcTresherItemsById.set(itemMap);
            }
            if (Array.isArray(game.pcTresherPotions)) {
              const potionMap = new Map<number, { id: number; name: string; description: string; effectTo: string; effectAmount: number; lastFor: number }>();
              for (const raw of game.pcTresherPotions) {
                const p = raw as { id: number; name: string; description: string; effectTo: string; effectAmount: number; lastFor: number };
                if (typeof p.id === 'number') {
                  potionMap.set(p.id, p);
                }
              }
              this.pcTresherPotionsById.set(potionMap);
            }
            if (Array.isArray(game.pcTresherSpells)) {
              const spellMap = new Map<number, PcTresherSpellData>();
              for (const raw of game.pcTresherSpells) {
                const s = raw as PcTresherSpellData;
                if (typeof s.id === 'number') {
                  spellMap.set(s.id, {
                    id: s.id,
                    name: typeof s.name === 'string' && s.name ? s.name : 'Unnamed Spell',
                    description: typeof s.description === 'string' ? s.description : '',
                    range: typeof s.range === 'number' ? Math.max(1, s.range) : 1,
                    effectOn: typeof s.effectOn === 'string' ? s.effectOn : 'HP',
                    effectAmount: typeof s.effectAmount === 'number' ? s.effectAmount : 0,
                    successTestValue: typeof s.successTestValue === 'number' ? s.successTestValue : 10,
                    sp: typeof s.sp === 'number' ? Math.max(1, s.sp) : 1,
                    lastFor: typeof s.lastFor === 'number' ? Math.max(0, s.lastFor) : 0,
                    numberOfTargets: typeof s.numberOfTargets === 'number' ? Math.max(1, s.numberOfTargets) : 1,
                    magicCost: typeof s.magicCost === 'number' ? Math.max(1, s.magicCost) : 1,
                  });
                }
              }
              this.pcTresherSpellsById.update((existingMap) => {
                const merged = new Map(existingMap);
                for (const [id, spell] of spellMap) {
                  merged.set(id, spell);
                }
                return merged;
              });
            }
            this.setInitialPreviewContext(game.dungonid);
            // Pre-populate monster image cache from paths returned by the server
            if (Array.isArray(game.monsterImages)) {
              for (const mi of game.monsterImages) {
                if (typeof mi.id !== 'number' || !mi.path) continue;
                if (this.monsterImageCache.has(mi.id)) continue;
                const url = this.resolveImageUrl(mi.path);
                if (!url) continue;
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                  this.monsterImageCache.set(mi.id, img);
                  this.monsterImageCacheVersion.update((v) => v + 1);
                  this.drawFirstPersonViewCanvas();
                };
                img.src = url;
              }
            }
            this.loadMonsterImages(game.dungonid);
            this.loadObstacleImages(game.dungonid);
            this.playerType.set(typeof game.pcType === 'string' ? game.pcType : null);
            this.playerSpecies.set(typeof game.pcSpecies === 'string' ? game.pcSpecies : null);
            this.playerName.set(typeof game.pcName === 'string' ? game.pcName : null);
            this.initializeCombatState(game.dungonid);
          },
        });
      return;
    }

    const userKey = this.account.getKey();
    if (!userKey) {
      this.gameLoadError.set('Please log in to load a game.');
      return;
    }

    this.loadSpellCatalog(userKey);

    this.isLoadingGame.set(true);
    this.gameLoadError.set(null);
    this.previewActionMessage.set(null);
    this.activeInfoPanelTab.set('nearby');
    this.equippedTresherIndexesByDungon.set({});

    this.http
      .get<GameSessionPayload>(`${API_BASE_URL}/games/${gameId}`, {
        params: { userkey: userKey },
      })
      .pipe(finalize(() => this.isLoadingGame.set(false)))
      .subscribe({
        next: (game) => {
          const playerMaxHp = this.resolvePlayerMaxHp(game.pcMaxHP);
          this.playerMaxHp.set(playerMaxHp);
          this.playerStartingHp = this.resolvePlayerCurrentHp(game.pcCurrentHP, playerMaxHp);

          this.currentGameId.set(gameId);
          this.gameName.set(game.name || 'Game');
          this.gameLastUpdated.set(game.lastupdated ?? null);
          this.playerSp.set(typeof game.pcSp === 'number' ? Math.max(0, Math.floor(game.pcSp)) : 0);
          this.playerMind.set(typeof game.pcMind === 'number' ? Math.max(0, Math.floor(game.pcMind)) : 0);
          this.playerStamina.set(typeof game.pcStamina === 'number' ? Math.max(0, Math.floor(game.pcStamina)) : 0);
          this.playerBaseAC.set(typeof game.pcAc === 'number' ? Math.max(1, game.pcAc) : 10);
          this.playerStrength.set(typeof game.pcStrength === 'number' ? Math.max(0, Math.floor(game.pcStrength)) : 0);
          this.playerMagicPower.set(typeof game.pcMagicPower === 'number' ? Math.max(0, Math.floor(game.pcMagicPower)) : 0);
          this.playerMp.set(this.getEffectivePlayerMagicPower());
          this.playerNOA.set(typeof game.pcNumberOfAttacks === 'number' ? Math.max(1, Math.floor(game.pcNumberOfAttacks)) : 1);
          this.playerNOD.set(typeof game.pcNumberOfDefends === 'number' ? Math.max(1, Math.floor(game.pcNumberOfDefends)) : 1);
          this.currentPcId_.set(typeof game.currentPcId === 'number' ? game.currentPcId : null);
          this.playerType.set(typeof game.pcType === 'string' ? game.pcType : null);
          this.playerSpecies.set(typeof game.pcSpecies === 'string' ? game.pcSpecies : null);
          this.playerName.set(typeof game.pcName === 'string' ? game.pcName : null);
          this.isMainGame.set(game.isMainGame === true);
          this.resettablePerPc.set(game.resettablePerPc === true);
          if (game.isMainGame === true) {
            this.loadStash();
          }
          this.dungonSpReward.set(typeof game.dungonSpReward === 'number' ? Math.max(0, Math.floor(game.dungonSpReward)) : 0);
          this.loadDungonJsonState(game.dungonid, game.dungenJson);
          this.seedPcTreshersIntoInventory(game.dungonid, game.pcTreshers);
          if (Array.isArray(game.pcTresherItems)) {
            const itemMap = new Map<number, { id: number; name: string; description: string; type: string; effectValue: number | null; damage: number; range: number; armorSlot: string | null; effectOn: string | null; effectToPc?: string | null; effectToPcValue?: number; weaponEffectType?: string; weaponEffectColor?: string; isTwoHanded: boolean }>();
            for (const raw of game.pcTresherItems) {
              const it = raw as { id: number; name: string; description: string; type: string; effectValue: number | null; damage: number; range: number; armorSlot: string | null; effectOn: string | null; effectToPc?: string | null; effectToPcValue?: number; weaponEffectType?: string; weaponEffectColor?: string; isTwoHanded: boolean };
              if (typeof it.id === 'number') {
                itemMap.set(it.id, { ...it, damage: typeof it.damage === 'number' ? it.damage : 6, range: typeof it.range === 'number' ? Math.max(1, it.range) : 1, effectToPc: typeof it.effectToPc === 'string' ? it.effectToPc : null, effectToPcValue: typeof it.effectToPcValue === 'number' ? it.effectToPcValue : 0, weaponEffectType: typeof it.weaponEffectType === 'string' ? it.weaponEffectType : 'Blood', weaponEffectColor: typeof it.weaponEffectColor === 'string' ? it.weaponEffectColor : '#cc0000', isTwoHanded: it.isTwoHanded === true });
              }
            }
            this.pcTresherItemsById.set(itemMap);
          }
          if (Array.isArray(game.pcTresherPotions)) {
            const potionMap = new Map<number, { id: number; name: string; description: string; effectTo: string; effectAmount: number; lastFor: number }>();
            for (const raw of game.pcTresherPotions) {
              const p = raw as { id: number; name: string; description: string; effectTo: string; effectAmount: number; lastFor: number };
              if (typeof p.id === 'number') {
                potionMap.set(p.id, p);
              }
            }
            this.pcTresherPotionsById.set(potionMap);
          }
          if (Array.isArray(game.pcTresherSpells)) {
            const spellMap = new Map<number, PcTresherSpellData>();
            for (const raw of game.pcTresherSpells) {
              const s = raw as PcTresherSpellData;
              if (typeof s.id === 'number') {
                spellMap.set(s.id, {
                  id: s.id,
                  name: typeof s.name === 'string' && s.name ? s.name : 'Unnamed Spell',
                  description: typeof s.description === 'string' ? s.description : '',
                  range: typeof s.range === 'number' ? Math.max(1, s.range) : 1,
                  effectOn: typeof s.effectOn === 'string' ? s.effectOn : 'HP',
                  effectAmount: typeof s.effectAmount === 'number' ? s.effectAmount : 0,
                  successTestValue: typeof s.successTestValue === 'number' ? s.successTestValue : 10,
                  sp: typeof s.sp === 'number' ? Math.max(1, s.sp) : 1,
                  lastFor: typeof s.lastFor === 'number' ? Math.max(0, s.lastFor) : 0,
                  numberOfTargets: typeof s.numberOfTargets === 'number' ? Math.max(1, s.numberOfTargets) : 1,
                  magicCost: typeof s.magicCost === 'number' ? Math.max(1, s.magicCost) : 1,
                });
              }
            }
            this.pcTresherSpellsById.update((existingMap) => {
              const merged = new Map(existingMap);
              for (const [id, spell] of spellMap) {
                merged.set(id, spell);
              }
              return merged;
            });
          }
          this.setInitialPreviewContext(game.dungonid);
          this.loadMonsterImages(game.dungonid);
          this.loadObstacleImages(game.dungonid);
          this.initializeCombatState(game.dungonid);
          this.showTavernModal.set(true);
          this.startTavernMusic();
        },
        error: () => {
          this.gameLoadError.set('Failed to load game.');
        },
      });
  }

  private loadMonsterImages(dungonId: number): void {
    const monsters = this.monsterListByDungon()[dungonId] ?? [];
    const imageIds = new Set<number>();
    for (const monster of monsters) {
      if (monster.imageId !== null && !this.monsterImageCache.has(monster.imageId)) {
        imageIds.add(monster.imageId);
      }
    }

    if (imageIds.size === 0) {
      return;
    }

    const userKey = this.account.getKey();

    if (!userKey) {
      // Sample mode: fetch only public images by ID
      this.http
        .get<{ id: number; path: string }[]>(`${API_BASE_URL}/images/by-ids`, {
          params: { ids: Array.from(imageIds).join(',') },
        })
        .subscribe({
          next: (images) => {
            for (const image of images) {
              if (!imageIds.has(image.id) || !image.path) {
                continue;
              }
              const url = this.resolveImageUrl(image.path);
              if (!url) {
                continue;
              }
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => {
                this.monsterImageCache.set(image.id, img);
                this.monsterImageCacheVersion.update((v) => v + 1);
                this.drawFirstPersonViewCanvas();
              };
              img.src = url;
            }
          },
        });
      return;
    }

    this.http
      .get<ImageRecordPayload[]>(`${API_BASE_URL}/images`, {
        params: { userkey: userKey, scope: 'library' },
      })
      .subscribe({
        next: (images) => {
          for (const image of images) {
            if (!imageIds.has(image.id) || !image.path) {
              continue;
            }

            const url = this.resolveImageUrl(image.path);
            if (!url) {
              continue;
            }

            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              this.monsterImageCache.set(image.id, img);
              this.monsterImageCacheVersion.update((v) => v + 1);
              this.drawFirstPersonViewCanvas();
            };
            img.src = url;
          }
        },
      });
  }

  private loadSpellCatalog(userKey: string): void {
    if (this.spellCatalogById().size > 0) {
      return;
    }

    this.http
      .get<unknown[]>(`${API_BASE_URL}/spells`, { params: { userkey: userKey } })
      .subscribe({
        next: (items) => {
          if (!Array.isArray(items) || items.length === 0) {
            return;
          }

          const catalog = new Map<number, PcTresherSpellData>();
          for (const raw of items) {
            if (!raw || typeof raw !== 'object') continue;
            const src = raw as Record<string, unknown>;
            const id = typeof src['id'] === 'number' ? src['id'] : null;
            if (id === null) continue;
            catalog.set(id, {
              id,
              name: typeof src['name'] === 'string' && src['name'] ? src['name'] : 'Unnamed Spell',
              description: typeof src['description'] === 'string' ? src['description'] : '',
              range: typeof src['range'] === 'number' ? Math.max(1, src['range']) : 1,
              effectOn: typeof src['effectOn'] === 'string' ? src['effectOn'] : 'HP',
              effectAmount: typeof src['effectAmount'] === 'number' ? src['effectAmount'] : 0,
              successTestValue: typeof src['successTestValue'] === 'number' ? src['successTestValue'] : 10,
              sp: typeof src['sp'] === 'number' ? Math.max(1, src['sp']) : 1,
              lastFor: typeof src['lastFor'] === 'number' ? Math.max(0, src['lastFor']) : 0,
              numberOfTargets: typeof src['numberOfTargets'] === 'number' ? Math.max(1, src['numberOfTargets']) : 1,
            });
          }

          if (catalog.size === 0) {
            return;
          }

          this.spellCatalogById.set(catalog);
          this.pcTresherSpellsById.update((existingMap) => {
            const merged = new Map(existingMap);
            for (const [id, spell] of catalog) {
              if (!merged.has(id)) {
                merged.set(id, spell);
              }
            }
            return merged;
          });
        },
        error: () => {
          // Best-effort lookup source only.
        },
      });
  }

  private resolveSpellData(dungonId: number, spellId: number): PcTresherSpellData | null {
    return (
      this.pcTresherSpellsById().get(spellId) ??
      (this.floorSpellListByDungon()[dungonId] ?? []).find((s) => s.id === spellId) ??
      this.spellCatalogById().get(spellId) ??
      null
    );
  }

  private loadObstacleImages(dungonId: number): void {
    const placements = this.obstaclePlacementsByDungon()[dungonId] ?? [];
    const imageIds = new Set<number>();
    for (const p of placements) {
      if (p.imageId !== null && !this.obstacleImageCache.has(p.imageId)) {
        imageIds.add(p.imageId);
      }
    }
    if (imageIds.size === 0) return;
    const userKey = this.account.getKey();
    if (!userKey) {
      this.http
        .get<{ id: number; path: string }[]>(`${API_BASE_URL}/images/by-ids`, {
          params: { ids: Array.from(imageIds).join(',') },
        })
        .subscribe({
          next: (images) => {
            for (const image of images) {
              if (!imageIds.has(image.id) || !image.path) continue;
              const url = this.resolveImageUrl(image.path);
              if (!url) continue;
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => {
                this.obstacleImageCache.set(image.id, img);
                this.obstacleImageCacheVersion.update((v) => v + 1);
              };
              img.src = url;
            }
          },
        });
      return;
    }
    this.http
      .get<ImageRecordPayload[]>(`${API_BASE_URL}/images`, {
        params: { userkey: userKey, scope: 'library' },
      })
      .subscribe({
        next: (images) => {
          for (const image of images) {
            if (!imageIds.has(image.id) || !image.path) continue;
            const url = this.resolveImageUrl(image.path);
            if (!url) continue;
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              this.obstacleImageCache.set(image.id, img);
              this.obstacleImageCacheVersion.update((v) => v + 1);
            };
            img.src = url;
          }
        },
      });
  }

  private resolveImageUrl(imagePath: string): string {
    const trimmed = typeof imagePath === 'string' ? imagePath.trim() : '';
    if (!trimmed) {
      return '';
    }

    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    return trimmed.startsWith('/')
      ? `${API_BASE_URL}${trimmed}`
      : `${API_BASE_URL}/${trimmed}`;
  }

  private setInitialPreviewContext(dungonId: number): void {
    const startpoint = this.startPointByDungon()[dungonId] ?? null;
    const filledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
    const saved = this.savedCombatState;

    let centerRow = 0;
    let centerColumn = 0;

    const hasSavedPosition = saved.playerRow !== null && saved.playerColumn !== null;
    if (hasSavedPosition) {
      const savedKey = this.getSquareKey(saved.playerRow!, saved.playerColumn!);
      if (filledSquares[savedKey]) {
        centerRow = saved.playerRow!;
        centerColumn = saved.playerColumn!;
      }
    }

    if (!hasSavedPosition || (centerRow === 0 && centerColumn === 0)) {
      const startpointKey = startpoint ? this.getSquareKey(startpoint.row, startpoint.col) : null;
      if (startpoint && startpointKey && filledSquares[startpointKey]) {
        centerRow = startpoint.row;
        centerColumn = startpoint.col;
      }
    }

    if (centerRow === 0 && centerColumn === 0) {
      const firstFilledSquareKey = Object.keys(filledSquares)[0];
      if (!firstFilledSquareKey) {
        this.gameLoadError.set('This game has no playable squares.');
        return;
      }

      const [rowText, colText] = firstFilledSquareKey.split(':');
      centerRow = Number.parseInt(rowText ?? '0', 10);
      centerColumn = Number.parseInt(colText ?? '0', 10);
    }

    const halfDimension = Math.floor(this.previewGridDimension / 2);
    this.gridPreviewContext.set({
      dungonId,
      centerRow,
      centerColumn,
      startRow: centerRow - halfDimension,
      startColumn: centerColumn - halfDimension,
    });

    const cheater = this.cheaterByDungon()[dungonId] ?? DEFAULT_CHEATER;
    this.setVisualFacingDirection(dungonId, cheater.facingDir);

    this.drawPreviewGridCanvas();
  }

  private applyCardinalFacingDirection(nextDirection: FacingDirection): void {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }

    const currentCheater = this.cheaterByDungon()[preview.dungonId] ?? { ...DEFAULT_CHEATER };
    if (currentCheater.facingDir === nextDirection) {
      this.setVisualFacingDirection(preview.dungonId, nextDirection);
      this.drawPreviewGridCanvas();
      return;
    }

    this.cheaterByDungon.update((allCheaters) => ({
      ...allCheaters,
      [preview.dungonId]: {
        ...currentCheater,
        facingDir: nextDirection,
      },
    }));

    this.setVisualFacingDirection(preview.dungonId, nextDirection);
    this.drawPreviewGridCanvas();
  }

  private setVisualFacingDirection(
    dungonId: number,
    direction: DisplayFacingDirection
  ): void {
    this.visualFacingByDungon.update((allDirections) => ({
      ...allDirections,
      [dungonId]: direction,
    }));
  }

  private getDisplayedFacingDirection(
    dungonId: number,
    fallback: FacingDirection
  ): DisplayFacingDirection {
    return this.visualFacingByDungon()[dungonId] ?? fallback;
  }

  private currentSquareItemsForPreview(): NearbyDiscoveryItem[] {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return [];
    }

    return this.nearbyItemsForPreview().filter(
      (item) => item.row === preview.centerRow && item.column === preview.centerColumn
    );
  }

  private getInventoryContextForPreview():
    | { dungonId: number; inventory: CheaterInventory }
    | null {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return null;
    }

    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    return {
      dungonId: preview.dungonId,
      inventory: {
        keys: Array.isArray(cheater.inventory?.keys) ? cheater.inventory.keys : [],
        treshers: Array.isArray(cheater.inventory?.treshers) ? cheater.inventory.treshers : [],
      },
    };
  }

  private getEquippedTresherIndexesForDungon(dungonId: number, itemCount: number): number[] {
    return this.inventoryService.getEquippedTresherIndexesForDungon(dungonId, itemCount);
  }

  private setEquippedTresherIndexesForDungon(dungonId: number, indexes: number[]): void {
    this.inventoryService.setEquippedTresherIndexesForDungon(dungonId, indexes);
  }

  private getHandsRequiredForEquip(tresher: Tresher): number {
    return this.inventoryService.getHandsRequiredForEquip(tresher);
  }

  private getCurrentPreviewSquareContext():
    | { dungonId: number; row: number; column: number }
    | null {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return null;
    }

    return {
      dungonId: preview.dungonId,
      row: preview.centerRow,
      column: preview.centerColumn,
    };
  }

  private getKeysAtSquare(row: number, column: number): Key[] {
    return this.keyList.filter((key) => key.rownId === row && key.columnId === column);
  }

  private getTresherPlacementsAtSquare(
    dungonId: number,
    row: number,
    column: number
  ): TresherPlacement[] {
    return (this.tresherPlacementsByDungon()[dungonId] ?? []).filter(
      (placement) => placement.row === row && placement.column === column
    );
  }

  private getTreshersByIdForDungon(dungonId: number): Map<number, Tresher> {
    return new Map(
      (this.tresherListByDungon()[dungonId] ?? []).map((tresher) => [tresher.id, tresher] as const)
    );
  }

  private getMonstersByIdForDungon(dungonId: number): Map<number, Monster> {
    return new Map(
      (this.monsterListByDungon()[dungonId] ?? []).map((monster) => [monster.id, monster] as const)
    );
  }

  private getTreshersAtSquare(dungonId: number, row: number, column: number): Tresher[] {
    const treshersById = this.getTreshersByIdForDungon(dungonId);
    return this.getTresherPlacementsAtSquare(dungonId, row, column)
      .map((placement) => treshersById.get(placement.tresherId))
      .filter((item): item is Tresher => item !== undefined)
      .map((tresher) => ({ ...tresher }));
  }

  private addItemsToCheaterInventory(dungonId: number, keys: Key[], treshers: Tresher[]): void {
    this.inventoryService.addItemsToCheaterInventory(dungonId, keys, treshers);
  }

  private seedPcTreshersIntoInventory(dungonId: number, rawPcTreshers: unknown[] | undefined): void {
    this.inventoryService.seedPcTreshersIntoInventory(dungonId, rawPcTreshers);
  }

  private removeInnerPotionSlotFromInventoryTresher(dungonId: number, tresherIndex: number, potionId: number): void {
    this.inventoryService.removeInnerPotionSlotFromInventoryTresher(dungonId, tresherIndex, potionId);
  }

  private removeInventoryTresherAtIndex(dungonId: number, index: number): void {
    this.inventoryService.removeInventoryTresherAtIndex(dungonId, index);
  }

  private removeTresherPlacementsAtSquare(dungonId: number, row: number, column: number): void {
    this.tresherPlacementsByDungon.update((allPlacements) => {
      const existingPlacements = allPlacements[dungonId] ?? [];
      const filteredPlacements = existingPlacements.filter(
        (placement) => placement.row !== row || placement.column !== column
      );

      if (filteredPlacements.length === existingPlacements.length) {
        return allPlacements;
      }

      return {
        ...allPlacements,
        [dungonId]: filteredPlacements,
      };
    });
  }

  private removeSingleTresherPlacement(
    dungonId: number,
    row: number,
    column: number,
    tresherId: number
  ): void {
    this.tresherPlacementsByDungon.update((allPlacements) => {
      const existingPlacements = allPlacements[dungonId] ?? [];
      let removed = false;
      const filteredPlacements = existingPlacements.filter((placement) => {
        if (
          !removed &&
          placement.row === row &&
          placement.column === column &&
          placement.tresherId === tresherId
        ) {
          removed = true;
          return false;
        }

        return true;
      });

      if (!removed) {
        return allPlacements;
      }

      return {
        ...allPlacements,
        [dungonId]: filteredPlacements,
      };
    });
  }

  private drawPreviewGridCanvas(): void {
    const preview = this.gridPreviewContext();
    const canvas = this.previewGridCanvasRef?.nativeElement;
    if (!preview || !canvas) {
      return;
    }

    const width = this.previewGridCanvasWidth;
    const height = this.previewGridCanvasHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#000000';
    context.fillRect(0, 0, width, height);

    const filledSquares = this.filledSquaresByDungon()[preview.dungonId] ?? {};
    const visibleSquareKeys = this.getVisibleSquareKeysForPreview(preview);

    // Pass 1: draw all filled squares as dark gray so rooms are always visible
    context.fillStyle = '#555555';
    for (let previewRow = 0; previewRow < this.previewGridDimension; previewRow += 1) {
      for (let previewColumn = 0; previewColumn < this.previewGridDimension; previewColumn += 1) {
        const sourceRow = preview.startRow + previewRow;
        const sourceColumn = preview.startColumn + previewColumn;
        const sourceSquareKey = this.getSquareKey(sourceRow, sourceColumn);
        if (!filledSquares[sourceSquareKey]) continue;
        context.fillRect(
          previewColumn * this.previewGridCellSize,
          previewRow * this.previewGridCellSize,
          this.previewGridCellSize,
          this.previewGridCellSize
        );
      }
    }

    // Pass 2: overwrite visible squares with light gray
    context.fillStyle = '#c7c7c7';
    for (let previewRow = 0; previewRow < this.previewGridDimension; previewRow += 1) {
      for (let previewColumn = 0; previewColumn < this.previewGridDimension; previewColumn += 1) {
        const sourceRow = preview.startRow + previewRow;
        const sourceColumn = preview.startColumn + previewColumn;
        const sourceSquareKey = this.getSquareKey(sourceRow, sourceColumn);
        if (!filledSquares[sourceSquareKey] || !visibleSquareKeys.has(sourceSquareKey)) {
          continue;
        }
        context.fillRect(
          previewColumn * this.previewGridCellSize,
          previewRow * this.previewGridCellSize,
          this.previewGridCellSize,
          this.previewGridCellSize
        );
      }
    }

    context.strokeStyle = 'rgba(255, 255, 255, 0.88)';
    context.lineWidth = 1;
    context.beginPath();

    for (let column = 0; column <= this.previewGridDimension; column += 1) {
      const x = column * this.previewGridCellSize + 0.5;
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }

    for (let row = 0; row <= this.previewGridDimension; row += 1) {
      const y = row * this.previewGridCellSize + 0.5;
      context.moveTo(0, y);
      context.lineTo(width, y);
    }

    context.stroke();

    const squares = Object.values(this.squaresByDungon()[preview.dungonId] ?? {});
    if (squares.length > 0) {
      context.strokeStyle = '#ff2f2f';
      context.lineWidth = 2;
      context.beginPath();

      for (const square of squares) {
        const sourceSquareKey = this.getSquareKey(square.row, square.column);
        if (!visibleSquareKeys.has(sourceSquareKey)) {
          continue;
        }

        const previewRow = square.row - preview.startRow;
        const previewColumn = square.column - preview.startColumn;
        if (
          previewRow < 0 ||
          previewColumn < 0 ||
          previewRow >= this.previewGridDimension ||
          previewColumn >= this.previewGridDimension
        ) {
          continue;
        }

        const left = previewColumn * this.previewGridCellSize;
        const top = previewRow * this.previewGridCellSize;
        const right = left + this.previewGridCellSize;
        const bottom = top + this.previewGridCellSize;

        if (this.isWallConnection(square.toTop)) {
          context.moveTo(left, top);
          context.lineTo(right, top);
        }

        if (this.isWallConnection(square.toRight)) {
          context.moveTo(right, top);
          context.lineTo(right, bottom);
        }

        if (this.isWallConnection(square.toBottom)) {
          context.moveTo(left, bottom);
          context.lineTo(right, bottom);
        }

        if (this.isWallConnection(square.toLeft)) {
          context.moveTo(left, top);
          context.lineTo(left, bottom);
        }
      }

      context.stroke();

      context.strokeStyle = '#20d646';
      context.lineWidth = 2;
      context.beginPath();

      for (const square of squares) {
        const sourceSquareKey = this.getSquareKey(square.row, square.column);
        if (!visibleSquareKeys.has(sourceSquareKey)) {
          continue;
        }

        const previewRow = square.row - preview.startRow;
        const previewColumn = square.column - preview.startColumn;
        if (
          previewRow < 0 ||
          previewColumn < 0 ||
          previewRow >= this.previewGridDimension ||
          previewColumn >= this.previewGridDimension
        ) {
          continue;
        }

        const left = previewColumn * this.previewGridCellSize;
        const top = previewRow * this.previewGridCellSize;
        const right = left + this.previewGridCellSize;
        const bottom = top + this.previewGridCellSize;

        if (this.isDoorConnection(square.toTop) && (!square.toTop.isHidden || square.toTop.isFound)) {
          context.moveTo(left, top);
          context.lineTo(right, top);
        }

        if (this.isDoorConnection(square.toRight) && (!square.toRight.isHidden || square.toRight.isFound)) {
          context.moveTo(right, top);
          context.lineTo(right, bottom);
        }

        if (this.isDoorConnection(square.toBottom) && (!square.toBottom.isHidden || square.toBottom.isFound)) {
          context.moveTo(left, bottom);
          context.lineTo(right, bottom);
        }

        if (this.isDoorConnection(square.toLeft) && (!square.toLeft.isHidden || square.toLeft.isFound)) {
          context.moveTo(left, top);
          context.lineTo(left, bottom);
        }
      }

      context.stroke();
    }

    context.fillStyle = '#2e84ff';
    for (const key of this.keyList) {
      if (key.rownId === null || key.columnId === null) {
        continue;
      }

      if (!visibleSquareKeys.has(this.getSquareKey(key.rownId, key.columnId))) {
        continue;
      }

      const previewRow = key.rownId - preview.startRow;
      const previewColumn = key.columnId - preview.startColumn;
      if (
        previewRow < 0 ||
        previewColumn < 0 ||
        previewRow >= this.previewGridDimension ||
        previewColumn >= this.previewGridDimension
      ) {
        continue;
      }

      const centerX = previewColumn * this.previewGridCellSize + this.previewGridCellSize / 2;
      const centerY = previewRow * this.previewGridCellSize + this.previewGridCellSize / 2;
      context.beginPath();
      context.arc(centerX, centerY, 3, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = '#dbe8ff';
      context.lineWidth = 1;
      context.stroke();
    }

    const tresherPlacements = this.tresherPlacementsByDungon()[preview.dungonId] ?? [];
    for (const placement of tresherPlacements) {
      const placementSquareKey = this.getSquareKey(placement.row, placement.column);
      if (!visibleSquareKeys.has(placementSquareKey)) {
        continue;
      }

      const previewRow = placement.row - preview.startRow;
      const previewColumn = placement.column - preview.startColumn;
      if (
        previewRow < 0 ||
        previewColumn < 0 ||
        previewRow >= this.previewGridDimension ||
        previewColumn >= this.previewGridDimension
      ) {
        continue;
      }

      const centerX = previewColumn * this.previewGridCellSize + this.previewGridCellSize / 2;
      const centerY = previewRow * this.previewGridCellSize + this.previewGridCellSize / 2;
      this.drawTresherCoinMarker(context, centerX, centerY, 3.5);
    }

    const floorItemPlacements = this.floorItemPlacementsByDungon()[preview.dungonId] ?? [];
    for (const placement of floorItemPlacements) {
      const placementSquareKey = this.getSquareKey(placement.row, placement.column);
      if (!visibleSquareKeys.has(placementSquareKey)) {
        continue;
      }

      const previewRow = placement.row - preview.startRow;
      const previewColumn = placement.column - preview.startColumn;
      if (
        previewRow < 0 ||
        previewColumn < 0 ||
        previewRow >= this.previewGridDimension ||
        previewColumn >= this.previewGridDimension
      ) {
        continue;
      }

      const centerX = previewColumn * this.previewGridCellSize + this.previewGridCellSize / 2;
      const centerY = previewRow * this.previewGridCellSize + this.previewGridCellSize / 2;
      this.drawFloorItemMarker(context, centerX, centerY, 3.5);
    }

    const floorPotionPlacements = this.floorPotionPlacementsByDungon()[preview.dungonId] ?? [];
    for (const placement of floorPotionPlacements) {
      const placementSquareKey = this.getSquareKey(placement.row, placement.column);
      if (!visibleSquareKeys.has(placementSquareKey)) {
        continue;
      }

      const previewRow = placement.row - preview.startRow;
      const previewColumn = placement.column - preview.startColumn;
      if (
        previewRow < 0 ||
        previewColumn < 0 ||
        previewRow >= this.previewGridDimension ||
        previewColumn >= this.previewGridDimension
      ) {
        continue;
      }

      const centerX = previewColumn * this.previewGridCellSize + this.previewGridCellSize / 2;
      const centerY = previewRow * this.previewGridCellSize + this.previewGridCellSize / 2;
      this.drawFloorItemMarker(context, centerX, centerY, 3.5);
    }

    const liveMonsterInstancesForMap = this.monsterInstances().filter((m) => !m.isDead);
    for (const inst of liveMonsterInstancesForMap) {
      const placementSquareKey = this.getSquareKey(inst.row, inst.column);
      if (!visibleSquareKeys.has(placementSquareKey)) {
        continue;
      }

      const previewRow = inst.row - preview.startRow;
      const previewColumn = inst.column - preview.startColumn;
      if (
        previewRow < 0 ||
        previewColumn < 0 ||
        previewRow >= this.previewGridDimension ||
        previewColumn >= this.previewGridDimension
      ) {
        continue;
      }

      const centerX = previewColumn * this.previewGridCellSize + this.previewGridCellSize / 2;
      const centerY = previewRow * this.previewGridCellSize + this.previewGridCellSize / 2;

      const sel = this.selectedCombatTarget();
      const oor = this.outOfRangeTarget();
      const isSelected = sel && sel.row === inst.row && sel.column === inst.column;
      const isOutOfRange = oor && oor.row === inst.row && oor.column === inst.column;

      if (isOutOfRange) {
        this.drawMonsterMarkerGreen(context, centerX, centerY, 3.5);
      } else if (isSelected) {
        this.drawMonsterMarkerSelected(context, centerX, centerY, 3.5);
      } else {
        this.drawMonsterMarker(context, centerX, centerY, 3.5);
      }
    }

    const startpoint = this.startPointByDungon()[preview.dungonId] ?? null;
    if (
      startpoint &&
      visibleSquareKeys.has(this.getSquareKey(startpoint.row, startpoint.col))
    ) {
      const previewRow = startpoint.row - preview.startRow;
      const previewColumn = startpoint.col - preview.startColumn;
      if (
        previewRow >= 0 &&
        previewColumn >= 0 &&
        previewRow < this.previewGridDimension &&
        previewColumn < this.previewGridDimension
      ) {
        const centerX = previewColumn * this.previewGridCellSize + this.previewGridCellSize / 2;
        const centerY = previewRow * this.previewGridCellSize + this.previewGridCellSize / 2;
        context.fillStyle = '#ff3b30';
        context.beginPath();
        context.arc(centerX, centerY, 4, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = '#ffd6d3';
        context.lineWidth = 1;
        context.stroke();
      }
    }

    // Draw "T" markers for square texts
    for (const st of this.squareTextsByDungon()[preview.dungonId] ?? []) {
      if (!visibleSquareKeys.has(this.getSquareKey(st.row, st.column))) {
        continue;
      }

      const previewRow = st.row - preview.startRow;
      const previewColumn = st.column - preview.startColumn;
      if (
        previewRow >= 0 &&
        previewColumn >= 0 &&
        previewRow < this.previewGridDimension &&
        previewColumn < this.previewGridDimension
      ) {
        const centerX = previewColumn * this.previewGridCellSize + this.previewGridCellSize / 2;
        const centerY = previewRow * this.previewGridCellSize + this.previewGridCellSize / 2;
        context.fillStyle = '#e17055';
        context.font = 'bold 9px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('T', centerX, centerY);
      }
    }

    const centerPreviewRow = preview.centerRow - preview.startRow;
    const centerPreviewColumn = preview.centerColumn - preview.startColumn;
    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const displayDirection = this.getDisplayedFacingDirection(
      preview.dungonId,
      cheater.facingDir
    );
    if (
      centerPreviewRow >= 0 &&
      centerPreviewColumn >= 0 &&
      centerPreviewRow < this.previewGridDimension &&
      centerPreviewColumn < this.previewGridDimension
    ) {
      context.strokeStyle = '#f3d13d';
      context.lineWidth = 2;
      context.strokeRect(
        centerPreviewColumn * this.previewGridCellSize + 1,
        centerPreviewRow * this.previewGridCellSize + 1,
        this.previewGridCellSize - 2,
        this.previewGridCellSize - 2
      );

      this.drawFacingArrow(
        context,
        centerPreviewColumn * this.previewGridCellSize,
        centerPreviewRow * this.previewGridCellSize,
        this.previewGridCellSize,
        displayDirection
      );
    }

    // Draw spell target mode highlights (purple ring around each selected target)
    const targetMode = this.spellTargetMode();
    if (targetMode) {
      for (const t of targetMode.targets) {
        const tpRow = t.row - preview.startRow;
        const tpCol = t.column - preview.startColumn;
        if (tpRow >= 0 && tpCol >= 0 && tpRow < this.previewGridDimension && tpCol < this.previewGridDimension) {
          const cx = tpCol * this.previewGridCellSize + this.previewGridCellSize / 2;
          const cy = tpRow * this.previewGridCellSize + this.previewGridCellSize / 2;
          context.beginPath();
          context.arc(cx, cy, this.previewGridCellSize / 2 - 1, 0, Math.PI * 2);
          context.strokeStyle = '#cc44ff';
          context.lineWidth = 2.5;
          context.stroke();
        }
      }
    }

    // Draw monster hit splat/glow rings
    const glowKeys = this.monsterGlowKeys();
    const impactByKey = this.monsterImpactEffects();
    if (glowKeys.size > 0) {
      for (const inst of this.monsterInstances()) {
        const key = `${inst.row}_${inst.column}`;
        if (!glowKeys.has(key)) continue;
        const gpRow = inst.row - preview.startRow;
        const gpCol = inst.column - preview.startColumn;
        if (gpRow >= 0 && gpCol >= 0 && gpRow < this.previewGridDimension && gpCol < this.previewGridDimension) {
          const cx = gpCol * this.previewGridCellSize + this.previewGridCellSize / 2;
          const cy = gpRow * this.previewGridCellSize + this.previewGridCellSize / 2;
          const impact = impactByKey[key];
          const pulse = (Math.sin(this.monsterImpactPulse() * 0.55) + 1) / 2;
          const ringColor = impact?.color ?? (impact?.kind === 'blood'
            ? '#c61d2d'
            : impact?.kind === 'lightning'
              ? '#8de8ff'
              : impact?.kind === 'ice'
                ? '#62c7ff'
                : impact?.kind === 'fire'
                  ? '#ff5028'
                  : impact?.kind === 'mind'
                    ? '#44dd77'
                    : '#f4cf63');
          const coreColor = impact?.kind === 'blood'
            ? 'rgba(198, 29, 45, 0.34)'
            : impact?.kind === 'lightning'
              ? 'rgba(140, 232, 255, 0.28)'
              : impact?.kind === 'ice'
                ? 'rgba(100, 210, 255, 0.40)'
                : impact?.kind === 'fire'
                  ? 'rgba(255, 95, 42, 0.42)'
                  : impact?.kind === 'mind'
                    ? 'rgba(70, 220, 120, 0.35)'
                    : 'rgba(244, 207, 99, 0.35)';

          context.save();
          context.shadowColor = ringColor;
          context.shadowBlur = 11 + pulse * 8;
          context.fillStyle = coreColor;
          context.beginPath();
          context.arc(cx, cy, this.previewGridCellSize * (0.24 + pulse * 0.1), 0, Math.PI * 2);
          context.fill();
          context.beginPath();
          context.arc(cx, cy, this.previewGridCellSize * (0.38 + pulse * 0.12), 0, Math.PI * 2);
          context.strokeStyle = ringColor;
          context.lineWidth = 3;
          context.stroke();

          // Splat spikes so every hit has a visible impact burst.
          const spikeCount = 9;
          for (let i = 0; i < spikeCount; i += 1) {
            const ang = (Math.PI * 2 * i) / spikeCount + pulse * 0.7;
            const r1 = this.previewGridCellSize * 0.14;
            const r2 = this.previewGridCellSize * (0.26 + pulse * 0.11);
            context.beginPath();
            context.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
            context.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
            context.strokeStyle = ringColor;
            context.lineWidth = 1.7;
            context.stroke();
          }

          context.restore();
        }
      }
    }

    this.drawFirstPersonViewCanvas();
  }

  private drawFirstPersonViewCanvas(): void {
    const preview = this.gridPreviewContext();
    const canvas = this.firstPersonCanvasRef?.nativeElement;
    if (!preview || !canvas) {
      return;
    }

    const width = this.firstPersonCanvasWidth;
    const height = this.firstPersonCanvasHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const ceilingGradient = context.createLinearGradient(0, 0, 0, height / 2);
    ceilingGradient.addColorStop(0, '#1a1a2e');
    ceilingGradient.addColorStop(0.5, '#2a2a4a');
    ceilingGradient.addColorStop(1, '#3d3d5c');
    context.fillStyle = ceilingGradient;
    context.fillRect(0, 0, width, height / 2);

    const floorGradient = context.createLinearGradient(0, height / 2, 0, height);
    floorGradient.addColorStop(0, '#3b3024');
    floorGradient.addColorStop(0.4, '#4a3c2e');
    floorGradient.addColorStop(1, '#2e2418');
    context.fillStyle = floorGradient;
    context.fillRect(0, height / 2, width, height / 2);

    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const displayDirection = this.getDisplayedFacingDirection(
      preview.dungonId,
      cheater.facingDir
    );
    const firstPersonView = this.getFirstPersonView(preview, cheater);
    const tresherPlacements = this.tresherPlacementsByDungon()[preview.dungonId] ?? [];
    const tresherCountBySquare = new Map<string, number>();
    const bagSquareKeys = new Set<string>();
    for (const placement of tresherPlacements) {
      const squareKey = this.getSquareKey(placement.row, placement.column);
      const existingCount = tresherCountBySquare.get(squareKey) ?? 0;
      tresherCountBySquare.set(squareKey, existingCount + 1);
      bagSquareKeys.add(squareKey);
    }
    for (const placement of (this.floorItemPlacementsByDungon()[preview.dungonId] ?? [])) {
      bagSquareKeys.add(this.getSquareKey(placement.row, placement.column));
    }
    for (const placement of (this.floorPotionPlacementsByDungon()[preview.dungonId] ?? [])) {
      bagSquareKeys.add(this.getSquareKey(placement.row, placement.column));
    }

    const liveMonsterInstances = this.monsterInstances().filter((m) => !m.isDead);
    const monstersById = this.getMonstersByIdForDungon(preview.dungonId);
    const monsterImageBySquare = new Map<string, HTMLImageElement | null>();
    for (const inst of liveMonsterInstances) {
      const squareKey = this.getSquareKey(inst.row, inst.column);
      const monster = monstersById.get(inst.monsterId);
      const imageId = monster?.imageId ?? null;
      const img = imageId !== null ? (this.monsterImageCache.get(imageId) ?? null) : null;
      monsterImageBySquare.set(squareKey, img);
    }

    if (firstPersonView.steps.length === 0) {
      context.fillStyle = '#d1d6de';
      context.font = '13px sans-serif';
      context.fillText('No first-person view for this tile.', 16, height / 2);
      return;
    }

    const maxFrameDepth = Math.max(2, Math.min(12, firstPersonView.steps.length + 2));
    const frameAtDepth = (depth: number): { left: number; right: number; top: number; bottom: number } => {
      const ratio = Math.min(1, depth / maxFrameDepth);
      const marginX = ratio * (width * 0.38);
      const marginY = ratio * (height * 0.33);
      return {
        left: marginX,
        right: width - marginX,
        top: marginY,
        bottom: height - marginY,
      };
    };

    const depthSegments = firstPersonView.steps.map((step, depth) => ({
      depth,
      step,
      nearFrame: frameAtDepth(depth),
      farFrame: frameAtDepth(depth + 1),
    }));
    const farToNearSegments = [...depthSegments].reverse();

    // Pass 1: paint floor and ceiling perspective bands first.
    for (const segment of farToNearSegments) {
      const { depth, nearFrame, farFrame } = segment;
      const depthAlpha = Math.max(0.06, 0.25 - depth * 0.03);
      const floorPoints = [
        { x: nearFrame.left, y: nearFrame.bottom },
        { x: nearFrame.right, y: nearFrame.bottom },
        { x: farFrame.right, y: farFrame.bottom },
        { x: farFrame.left, y: farFrame.bottom },
      ];
      const ceilingPoints = [
        { x: nearFrame.left, y: nearFrame.top },
        { x: nearFrame.right, y: nearFrame.top },
        { x: farFrame.right, y: farFrame.top },
        { x: farFrame.left, y: farFrame.top },
      ];

      const floorGradient = context.createLinearGradient(0, farFrame.bottom, 0, nearFrame.bottom);
      floorGradient.addColorStop(0, `rgba(64, 51, 39, ${Math.min(0.72, depthAlpha + 0.04)})`);
      floorGradient.addColorStop(1, `rgba(90, 71, 54, ${Math.min(0.78, depthAlpha + 0.1)})`);
      context.fillStyle = floorGradient;
      context.beginPath();
      context.moveTo(nearFrame.left, nearFrame.bottom);
      context.lineTo(nearFrame.right, nearFrame.bottom);
      context.lineTo(farFrame.right, farFrame.bottom);
      context.lineTo(farFrame.left, farFrame.bottom);
      context.closePath();
      context.fill();
      this.drawSurfaceTextureInPolygon(
        context,
        floorPoints,
        nearFrame.left * 3 + nearFrame.bottom * 5 + farFrame.right * 7 + depth * 29,
        depth,
        'floor'
      );

      const ceilingGradient = context.createLinearGradient(0, nearFrame.top, 0, farFrame.top);
      ceilingGradient.addColorStop(0, `rgba(38, 34, 58, ${Math.min(0.72, depthAlpha + 0.09)})`);
      ceilingGradient.addColorStop(1, `rgba(58, 53, 80, ${Math.min(0.76, depthAlpha + 0.05)})`);
      context.fillStyle = ceilingGradient;
      context.beginPath();
      context.moveTo(nearFrame.left, nearFrame.top);
      context.lineTo(nearFrame.right, nearFrame.top);
      context.lineTo(farFrame.right, farFrame.top);
      context.lineTo(farFrame.left, farFrame.top);
      context.closePath();
      context.fill();
      this.drawSurfaceTextureInPolygon(
        context,
        ceilingPoints,
        nearFrame.right * 11 + nearFrame.top * 13 + farFrame.left * 17 + depth * 31,
        depth,
        'ceiling'
      );
    }

    const endFrame = frameAtDepth(firstPersonView.steps.length);
    const endStep = firstPersonView.steps[firstPersonView.steps.length - 1] ?? null;
    const canExtendEndWall = firstPersonView.endBlock.type === 'wall' && endStep !== null;
    const endWallExtension = canExtendEndWall
      ? Math.max(2, (endFrame.right - endFrame.left) * 0.18)
      : 0;
    const extendedEndLeft =
      canExtendEndWall && this.isSideSightTransparent(endStep.leftBlock)
        ? Math.max(0, endFrame.left - endWallExtension)
        : endFrame.left;
    const extendedEndRight =
      canExtendEndWall && this.isSideSightTransparent(endStep.rightBlock)
        ? Math.min(width, endFrame.right + endWallExtension)
        : endFrame.right;
    const endWallWidth = Math.max(0, extendedEndRight - extendedEndLeft);
    const endFillColor =
      firstPersonView.endBlock.type === 'none'
        ? '#000000'
        : this.getFirstPersonFrontColor(firstPersonView.endBlock.type);
    context.fillStyle = endFillColor;
    context.fillRect(
      extendedEndLeft,
      endFrame.top,
      endWallWidth,
      endFrame.bottom - endFrame.top
    );

    if (firstPersonView.endBlock.type !== 'none') {
      context.strokeStyle = 'rgba(250, 250, 250, 0.26)';
      context.lineWidth = 1;
      context.strokeRect(
        extendedEndLeft,
        endFrame.top,
        endWallWidth,
        endFrame.bottom - endFrame.top
      );

      if (firstPersonView.endBlock.type === 'wall') {
        const endWallSeed =
          extendedEndLeft * 7 + endFrame.top * 13 + firstPersonView.steps.length * 19;
        this.drawBrickPatternInRect(
          context,
          extendedEndLeft,
          endFrame.top,
          endWallWidth,
          endFrame.bottom - endFrame.top,
          endWallSeed + 179,
          firstPersonView.steps.length
        );
      }

      if (
        firstPersonView.endBlock.type === 'openDoor' ||
        firstPersonView.endBlock.type === 'closedDoor'
      ) {
        this.drawFirstPersonDoorFace(context, endFrame, firstPersonView.endBlock, false);
      }
    }

    // Pass 2: draw walls, side surfaces, and portals.

    for (const segment of farToNearSegments) {
      const { depth, step, nearFrame, farFrame } = segment;
      const isFarthestVisibleLayer = depth === firstPersonView.steps.length - 1;

      const leftOpeningBackBlock = step.leftOpeningBackBlock;
      const rightOpeningBackBlock = step.rightOpeningBackBlock;
      const canSeeLeftOpeningBackWall = this.hasClearSideSightToDepth(
        firstPersonView.steps,
        depth,
        'left'
      );
      const canSeeRightOpeningBackWall = this.hasClearSideSightToDepth(
        firstPersonView.steps,
        depth,
        'right'
      );

      if (leftOpeningBackBlock && canSeeLeftOpeningBackWall) {
        this.drawFirstPersonOpeningBackWall(
          context,
          nearFrame,
          farFrame,
          'left',
          leftOpeningBackBlock,
          depth,
          !isFarthestVisibleLayer
        );
      }

      if (rightOpeningBackBlock && canSeeRightOpeningBackWall) {
        this.drawFirstPersonOpeningBackWall(
          context,
          nearFrame,
          farFrame,
          'right',
          rightOpeningBackBlock,
          depth,
          !isFarthestVisibleLayer
        );
      }
    }

    for (const segment of farToNearSegments) {
      const { depth, step, nearFrame, farFrame } = segment;

      this.drawFirstPersonSideSurface(context, nearFrame, farFrame, 'left', step.leftBlock, depth);
      this.drawFirstPersonSideSurface(context, nearFrame, farFrame, 'right', step.rightBlock, depth);

      if (step.forwardDoor && step.forwardDoor.type === 'openDoor') {
        this.drawFirstPersonDoorFace(context, farFrame, step.forwardDoor, true);
      }
    }

    // Pass 3: draw floor items and monsters last so they stay visible.
    for (const segment of farToNearSegments) {
      const { step, nearFrame, farFrame } = segment;
      const squareKey = this.getSquareKey(step.row, step.column);
      if (bagSquareKeys.has(squareKey)) {
        this.drawFirstPersonFloorBag(context, nearFrame, farFrame);
      }

      if (step.hasKey) {
        this.drawFirstPersonFloorKey(context, nearFrame, farFrame);
      }

      if (step.visibleMonsterSlots.length > 0) {
        const visibleMonsterSlots = [...step.visibleMonsterSlots].sort(
          (leftSlot, rightSlot) =>
            Math.abs(rightSlot.lateralOffset) - Math.abs(leftSlot.lateralOffset)
        );
        const lateralRange = Math.max(
          1,
          ...visibleMonsterSlots.map((slot) => Math.abs(slot.lateralOffset))
        );

        for (const slot of visibleMonsterSlots) {
          if (!monsterImageBySquare.has(slot.squareKey)) {
            continue;
          }

          if (slot.isPeek) {
            this.drawFirstPersonPeekMonster(
              context,
              width,
              nearFrame,
              farFrame,
              monsterImageBySquare.get(slot.squareKey) ?? null,
              slot.lateralOffset < 0 ? 'left' : 'right'
            );
          } else {
            this.drawFirstPersonMonster(
              context,
              nearFrame,
              farFrame,
              monsterImageBySquare.get(slot.squareKey) ?? null,
              slot.lateralOffset,
              lateralRange
            );
          }
        }
      }
    }

    context.fillStyle = '#dde4ee';
    context.font = '12px sans-serif';
    context.fillText(
      `Facing ${this.getFacingDirectionLabel(displayDirection)}`,
      12,
      18
    );
  }

  private getFirstPersonView(preview: GridPreviewContext, cheater: Cheater): FirstPersonView {
    const squares = this.squaresByDungon()[preview.dungonId] ?? {};
    const filledSquares = this.filledSquaresByDungon()[preview.dungonId] ?? {};
    const startSquareKey = this.getSquareKey(preview.centerRow, preview.centerColumn);
    if (!squares[startSquareKey] || !filledSquares[startSquareKey]) {
      return {
        steps: [],
        endBlock: this.toFirstPersonBlock('void', null),
      };
    }

    const forward = this.getMovementDeltaForFacingDirection(cheater.facingDir);
    const leftOffset = {
      rowOffset: -forward.columnOffset,
      columnOffset: forward.rowOffset,
    };
    const rightOffset = {
      rowOffset: forward.columnOffset,
      columnOffset: -forward.rowOffset,
    };
    const keyPositions = new Set(
      this.keyList
        .filter((key) => key.rownId !== null && key.columnId !== null)
        .map((key) => this.getSquareKey(key.rownId ?? -1, key.columnId ?? -1))
    );

    const steps: FirstPersonStep[] = [];
    const addStep = (row: number, column: number): void => {
      const squareKey = this.getSquareKey(row, column);
      const leftBlock = this.getLateralBlockType(
        preview.dungonId,
        row,
        column,
        leftOffset.rowOffset,
        leftOffset.columnOffset
      );
      const rightBlock = this.getLateralBlockType(
        preview.dungonId,
        row,
        column,
        rightOffset.rowOffset,
        rightOffset.columnOffset
      );

      steps.push({
        row,
        column,
        leftBlock,
        rightBlock,
        leftOpeningBackBlock:
          leftBlock.type === 'none'
            ? this.getSideOpeningBackBlock(
                preview.dungonId,
                row,
                column,
                leftOffset.rowOffset,
                leftOffset.columnOffset,
                forward.rowOffset,
                forward.columnOffset
              )
            : null,
        rightOpeningBackBlock:
          rightBlock.type === 'none'
            ? this.getSideOpeningBackBlock(
                preview.dungonId,
                row,
                column,
                rightOffset.rowOffset,
                rightOffset.columnOffset,
                forward.rowOffset,
                forward.columnOffset
              )
            : null,
        forwardDoor: null,
        visibleMonsterSlots: [],
        hasKey: keyPositions.has(squareKey),
      });
    };

    let currentRow = preview.centerRow;
    let currentColumn = preview.centerColumn;
    addStep(currentRow, currentColumn);

    const maxDepth = Math.max(
      1,
      Math.min(this.firstPersonMaxDepth, Math.floor(Math.max(1, this.getEffectiveRangeOfSight(preview.dungonId) + 1)))
    );
    let endBlock: FirstPersonBlock = this.toFirstPersonBlock('none', null);

    for (let depth = 0; depth < maxDepth; depth += 1) {
      const nextRow = currentRow + forward.rowOffset;
      const nextColumn = currentColumn + forward.columnOffset;
      const forwardConnection = this.getMovementConnectionInfoBetweenAdjacentSquares(
        preview.dungonId,
        currentRow,
        currentColumn,
        nextRow,
        nextColumn
      );

      if (
        forwardConnection.type === 'openDoor' ||
        forwardConnection.type === 'closedDoor'
      ) {
        steps[steps.length - 1] = {
          ...steps[steps.length - 1],
          forwardDoor: this.toFirstPersonBlock(forwardConnection.type, forwardConnection.door),
        };
      }

      if (forwardConnection.type === 'wall' || forwardConnection.type === 'closedDoor') {
        endBlock = this.toFirstPersonBlock(forwardConnection.type, forwardConnection.door);
        break;
      }

      const nextSquareKey = this.getSquareKey(nextRow, nextColumn);
      if (!squares[nextSquareKey] || !filledSquares[nextSquareKey]) {
        endBlock = this.toFirstPersonBlock('void', null);
        break;
      }

      currentRow = nextRow;
      currentColumn = nextColumn;
      addStep(currentRow, currentColumn);
    }

    for (let depth = 0; depth < steps.length; depth += 1) {
      const step = steps[depth];
      steps[depth] = {
        ...step,
        visibleMonsterSlots: this.getVisibleMonsterSlotsForDepth(
          preview.dungonId,
          steps,
          depth,
          step.row,
          step.column,
          leftOffset,
          rightOffset
        ),
      };
    }

    return {
      steps,
      endBlock,
    };
  }

  private drawFirstPersonSideSurface(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    side: 'left' | 'right',
    block: FirstPersonBlock,
    wallDepth: number
  ): void {
    if (block.type === 'none' || block.type === 'void') {
      return;
    }

    const seamPad = block.type === 'wall' ? 1.4 : 1;
    const verticalPad = block.type === 'wall' ? 0.8 : 0.5;

    const points =
      side === 'left'
        ? [
            { x: nearFrame.left - seamPad, y: nearFrame.top - verticalPad },
            { x: farFrame.left - seamPad, y: farFrame.top - verticalPad },
            { x: farFrame.left - seamPad, y: farFrame.bottom + verticalPad },
            { x: nearFrame.left - seamPad, y: nearFrame.bottom + verticalPad },
          ]
        : [
            { x: nearFrame.right + seamPad, y: nearFrame.top - verticalPad },
            { x: farFrame.right + seamPad, y: farFrame.top - verticalPad },
            { x: farFrame.right + seamPad, y: farFrame.bottom + verticalPad },
            { x: nearFrame.right + seamPad, y: nearFrame.bottom + verticalPad },
          ];

    context.fillStyle =
      block.type === 'wall'
        ? this.getFirstPersonWallPanelColor(wallDepth)
        : this.getFirstPersonSideColor(block.type);
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    context.lineTo(points[1].x, points[1].y);
    context.lineTo(points[2].x, points[2].y);
    context.lineTo(points[3].x, points[3].y);
    context.closePath();
    context.fill();

    if (block.type === 'wall') {
      const textureSeed = nearFrame.top * 11 + nearFrame.left * 5 + (side === 'left' ? 17 : 29);
      this.drawBrickPatternInPolygon(context, points, textureSeed + 131, wallDepth);
    }

    if (block.type === 'closedDoor') {
      this.drawFirstPersonSideDoorMarker(context, nearFrame, farFrame, side, block.type);
    }
  }

  private drawFirstPersonOpeningBackWall(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    side: 'left' | 'right',
    block: FirstPersonBlock,
    wallDepth: number,
    drawConnector = true
  ): void {
    if (block.type === 'none') {
      return;
    }

    const openingWidth =
      side === 'left' ? farFrame.left - nearFrame.left : nearFrame.right - farFrame.right;
    const nearInset = Math.max(4, openingWidth * 2.8);
    const farInset = Math.max(3, openingWidth * 1.8);
    const seamOverlap = 1.4;
    const portalNearX =
      side === 'left' ? nearFrame.left - seamOverlap : nearFrame.right + seamOverlap;
    const portalFarX =
      side === 'left' ? farFrame.left - seamOverlap : farFrame.right + seamOverlap;

    const backWallPoints =
      side === 'left'
        ? [
            { x: nearFrame.left - nearInset, y: nearFrame.top },
            { x: farFrame.left - farInset, y: farFrame.top },
            { x: farFrame.left - farInset, y: farFrame.bottom },
            { x: nearFrame.left - nearInset, y: nearFrame.bottom },
          ]
        : [
            { x: nearFrame.right + nearInset, y: nearFrame.top },
            { x: farFrame.right + farInset, y: farFrame.top },
            { x: farFrame.right + farInset, y: farFrame.bottom },
            { x: nearFrame.right + nearInset, y: nearFrame.bottom },
          ];

    const connectorPoints = [
      { x: portalNearX, y: nearFrame.top },
      { x: portalFarX, y: farFrame.top },
      backWallPoints[1],
      backWallPoints[2],
      { x: portalFarX, y: farFrame.bottom },
      { x: portalNearX, y: nearFrame.bottom },
    ];

    context.fillStyle = this.getFirstPersonOpeningBackWallColor(block.type, wallDepth);
    if (drawConnector) {
      context.beginPath();
      context.moveTo(connectorPoints[0].x, connectorPoints[0].y);
      for (let index = 1; index < connectorPoints.length; index += 1) {
        context.lineTo(connectorPoints[index].x, connectorPoints[index].y);
      }
      context.closePath();
      context.fill();
    }

    context.beginPath();
    context.moveTo(backWallPoints[0].x, backWallPoints[0].y);
    context.lineTo(backWallPoints[1].x, backWallPoints[1].y);
    context.lineTo(backWallPoints[2].x, backWallPoints[2].y);
    context.lineTo(backWallPoints[3].x, backWallPoints[3].y);
    context.closePath();
    context.fill();

    if (block.type === 'wall') {
      const connectorSeed =
        nearFrame.left * 3 + farFrame.top * 7 + wallDepth * 19 + (side === 'left' ? 41 : 73);
      const backWallSeed =
        nearFrame.top * 5 + farFrame.right * 11 + wallDepth * 23 + (side === 'left' ? 59 : 97);
      if (drawConnector) {
        this.drawBrickPatternInPolygon(context, connectorPoints, connectorSeed + 211, wallDepth + 1);
      }
      this.drawBrickPatternInPolygon(context, backWallPoints, backWallSeed + 257, wallDepth + 1);
    }

    if (block.type !== 'void') {
      context.strokeStyle = 'rgba(222, 232, 245, 0.14)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(backWallPoints[0].x, backWallPoints[0].y);
      context.lineTo(backWallPoints[1].x, backWallPoints[1].y);
      context.lineTo(backWallPoints[2].x, backWallPoints[2].y);
      context.lineTo(backWallPoints[3].x, backWallPoints[3].y);
      context.closePath();
      context.stroke();
    }

    if (block.type === 'openDoor' || block.type === 'closedDoor') {
      const doorFrame =
        side === 'left'
          ? {
              left: backWallPoints[0].x * 0.6 + backWallPoints[1].x * 0.4,
              right: backWallPoints[0].x * 0.25 + backWallPoints[1].x * 0.75,
              top: backWallPoints[1].y,
              bottom: backWallPoints[2].y,
            }
          : {
              left: backWallPoints[0].x * 0.75 + backWallPoints[1].x * 0.25,
              right: backWallPoints[0].x * 0.4 + backWallPoints[1].x * 0.6,
              top: backWallPoints[1].y,
              bottom: backWallPoints[2].y,
            };
      this.drawFirstPersonDoorFace(context, doorFrame, block, false);
    }
  }

  private drawFirstPersonSideDoorMarker(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    side: 'left' | 'right',
    doorType: 'openDoor' | 'closedDoor'
  ): void {
    const midTop = (nearFrame.top + farFrame.top) / 2;
    const midBottom = (nearFrame.bottom + farFrame.bottom) / 2;
    const x =
      side === 'left' ? (nearFrame.left + farFrame.left) / 2 : (nearFrame.right + farFrame.right) / 2;

    context.strokeStyle = '#f0a6a6';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, midTop + 2);
    context.lineTo(x, midBottom - 2);
    context.stroke();

    if (doorType === 'openDoor') {
      const swing = side === 'left' ? 6 : -6;
      context.strokeStyle = '#ff7f7f';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x, midTop + 4);
      context.lineTo(x + swing, midTop + 9);
      context.stroke();
    }
  }

  private drawFirstPersonMonster(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    image: HTMLImageElement | null,
    lateralOffset: number,
    lateralRange: number
  ): void {
    const midLeft = nearFrame.left * 0.65 + farFrame.left * 0.35;
    const midRight = nearFrame.right * 0.65 + farFrame.right * 0.35;
    const midTop = nearFrame.top * 0.65 + farFrame.top * 0.35;
    const midBottom = nearFrame.bottom * 0.65 + farFrame.bottom * 0.35;
    const tileWidth = midRight - midLeft;
    const tileHeight = midBottom - midTop;
    const normalizedOffset =
      lateralRange <= 0 ? 0 : lateralOffset / (Math.max(1, lateralRange) + 0.65);
    const centeredX = (midLeft + midRight) / 2 + normalizedOffset * tileWidth * 0.82;
    const minCenterX = midLeft + tileWidth * 0.12;
    const maxCenterX = midRight - tileWidth * 0.12;
    const centerX = Math.max(minCenterX, Math.min(maxCenterX, centeredX));
    const scale = 1 - Math.min(0.32, Math.abs(normalizedOffset) * 0.22);

    if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
      const maxWidth = tileWidth * 0.6 * scale;
      const maxHeight = tileHeight * 0.75 * scale;
      const aspectRatio = image.naturalWidth / image.naturalHeight;
      let drawWidth = maxWidth;
      let drawHeight = drawWidth / aspectRatio;
      if (drawHeight > maxHeight) {
        drawHeight = maxHeight;
        drawWidth = drawHeight * aspectRatio;
      }

      drawWidth = Math.max(8, drawWidth);
      drawHeight = Math.max(8, drawHeight);

      const drawX = centerX - drawWidth / 2;
      const drawY = midBottom - drawHeight;
      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      return;
    }

    const centerY = midTop + tileHeight * 0.55;
    const size = Math.max(4, Math.min(tileWidth, tileHeight) * 0.25 * scale);

    context.fillStyle = '#d63031';
    context.beginPath();
    context.moveTo(centerX, centerY - size);
    context.lineTo(centerX + size, centerY);
    context.lineTo(centerX, centerY + size);
    context.lineTo(centerX - size, centerY);
    context.closePath();
    context.fill();

    context.strokeStyle = '#ff7675';
    context.lineWidth = 1;
    context.stroke();
  }

  private drawFirstPersonPeekMonster(
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    image: HTMLImageElement | null,
    side: 'left' | 'right'
  ): void {
    const midLeft = nearFrame.left * 0.65 + farFrame.left * 0.35;
    const midRight = nearFrame.right * 0.65 + farFrame.right * 0.35;
    const midTop = nearFrame.top * 0.65 + farFrame.top * 0.35;
    const midBottom = nearFrame.bottom * 0.65 + farFrame.bottom * 0.35;
    const tileWidth = midRight - midLeft;
    const tileHeight = midBottom - midTop;
    const edgeX = side === 'left' ? nearFrame.left : nearFrame.right;

    context.save();
    context.beginPath();
    if (side === 'left') {
      context.rect(nearFrame.left, 0, canvasWidth - nearFrame.left, context.canvas.height);
    } else {
      context.rect(0, 0, nearFrame.right, context.canvas.height);
    }
    context.clip();
    context.globalAlpha = 0.8;

    if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
      const maxWidth = tileWidth * 0.6;
      const maxHeight = tileHeight * 0.75;
      const aspectRatio = image.naturalWidth / image.naturalHeight;
      let drawWidth = maxWidth;
      let drawHeight = drawWidth / aspectRatio;
      if (drawHeight > maxHeight) {
        drawHeight = maxHeight;
        drawWidth = drawHeight * aspectRatio;
      }
      drawWidth = Math.max(8, drawWidth);
      drawHeight = Math.max(8, drawHeight);
      context.drawImage(image, edgeX - drawWidth / 2, midBottom - drawHeight, drawWidth, drawHeight);
    } else {
      const centerY = midTop + tileHeight * 0.55;
      const size = Math.max(4, Math.min(tileWidth, tileHeight) * 0.25);
      context.fillStyle = '#d63031';
      context.beginPath();
      context.moveTo(edgeX, centerY - size);
      context.lineTo(edgeX + size, centerY);
      context.lineTo(edgeX, centerY + size);
      context.lineTo(edgeX - size, centerY);
      context.closePath();
      context.fill();
      context.strokeStyle = '#ff7675';
      context.lineWidth = 1;
      context.stroke();
    }

    context.globalAlpha = 1;
    context.restore();
  }

  private drawFirstPersonFloorKey(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number }
  ): void {
    const midLeft = (nearFrame.left + farFrame.left) / 2;
    const midRight = (nearFrame.right + farFrame.right) / 2;
    const centerX = (midLeft + midRight) / 2;
    const floorY = (nearFrame.bottom + farFrame.bottom) / 2;
    const tileWidth = midRight - midLeft;
    const size = Math.max(3, Math.min(12, tileWidth * 0.13));

    context.strokeStyle = '#d7e7ff';
    context.fillStyle = '#2e84ff';
    context.lineWidth = Math.max(1, size * 0.18);

    context.beginPath();
    context.arc(centerX - size * 0.42, floorY - size * 0.22, size * 0.3, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.beginPath();
    context.moveTo(centerX - size * 0.12, floorY - size * 0.2);
    context.lineTo(centerX + size * 0.56, floorY - size * 0.2);
    context.stroke();
  }

  private drawFirstPersonFloorBag(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number }
  ): void {
    const midLeft = (nearFrame.left + farFrame.left) / 2;
    const midRight = (nearFrame.right + farFrame.right) / 2;
    const tileWidth = midRight - midLeft;
    const centerX = (midLeft + midRight) / 2;
    const floorY = (nearFrame.bottom + farFrame.bottom) / 2;
    const bagW = Math.max(12, Math.min(64, tileWidth * 0.45));
    const bagH = bagW * 1.15;
    const bagLeft = centerX - bagW / 2;
    const bagBottom = floorY - 1;
    const bagTop = bagBottom - bagH;
    const r = bagW * 0.20;

    // Soft glow shadow under the bag so it reads against any floor
    const glowRadius = bagW * 0.65;
    const glowGrad = context.createRadialGradient(centerX, bagBottom, 0, centerX, bagBottom, glowRadius);
    glowGrad.addColorStop(0, 'rgba(210, 140, 30, 0.45)');
    glowGrad.addColorStop(1, 'rgba(210, 140, 30, 0)');
    context.fillStyle = glowGrad;
    context.beginPath();
    context.ellipse(centerX, bagBottom, glowRadius, glowRadius * 0.35, 0, 0, Math.PI * 2);
    context.fill();

    // Bag body (rounded rectangle)
    context.fillStyle = '#a06820';
    context.beginPath();
    context.moveTo(bagLeft + r, bagTop);
    context.lineTo(bagLeft + bagW - r, bagTop);
    context.quadraticCurveTo(bagLeft + bagW, bagTop, bagLeft + bagW, bagTop + r);
    context.lineTo(bagLeft + bagW, bagBottom - r);
    context.quadraticCurveTo(bagLeft + bagW, bagBottom, bagLeft + bagW - r, bagBottom);
    context.lineTo(bagLeft + r, bagBottom);
    context.quadraticCurveTo(bagLeft, bagBottom, bagLeft, bagBottom - r);
    context.lineTo(bagLeft, bagTop + r);
    context.quadraticCurveTo(bagLeft, bagTop, bagLeft + r, bagTop);
    context.closePath();
    context.fill();

    // Neck / drawstring tie
    const neckW = bagW * 0.38;
    const neckH = bagH * 0.18;
    context.fillStyle = '#6b430e';
    context.fillRect(centerX - neckW / 2, bagTop - neckH, neckW, neckH);

    // Knot at top
    context.fillStyle = '#ffd700';
    context.beginPath();
    context.arc(centerX, bagTop - neckH * 0.4, bagW * 0.16, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#b8860b';
    context.lineWidth = Math.max(0.5, bagW * 0.02);
    context.stroke();

    // Highlight
    context.fillStyle = 'rgba(255, 210, 100, 0.28)';
    context.beginPath();
    context.ellipse(bagLeft + bagW * 0.28, bagTop + bagH * 0.27, bagW * 0.18, bagH * 0.20, -0.3, 0, Math.PI * 2);
    context.fill();

    // Outline
    context.strokeStyle = '#3a1e04';
    context.lineWidth = Math.max(1, bagW * 0.04);
    context.beginPath();
    context.moveTo(bagLeft + r, bagTop);
    context.lineTo(bagLeft + bagW - r, bagTop);
    context.quadraticCurveTo(bagLeft + bagW, bagTop, bagLeft + bagW, bagTop + r);
    context.lineTo(bagLeft + bagW, bagBottom - r);
    context.quadraticCurveTo(bagLeft + bagW, bagBottom, bagLeft + bagW - r, bagBottom);
    context.lineTo(bagLeft + r, bagBottom);
    context.quadraticCurveTo(bagLeft, bagBottom, bagLeft, bagBottom - r);
    context.lineTo(bagLeft, bagTop + r);
    context.quadraticCurveTo(bagLeft, bagTop, bagLeft + r, bagTop);
    context.closePath();
    context.stroke();
  }

  private drawFloorItemMarker(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number
  ): void {
    const s = Math.max(2, size);
    context.fillStyle = '#4fc3f7';
    context.beginPath();
    context.moveTo(centerX, centerY - s);
    context.lineTo(centerX + s, centerY);
    context.lineTo(centerX, centerY + s);
    context.lineTo(centerX - s, centerY);
    context.closePath();
    context.fill();
    context.strokeStyle = '#e0f7fa';
    context.lineWidth = 0.75;
    context.stroke();
  }

  private drawTresherCoinMarker(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number
  ): void {
    const clampedRadius = Math.max(2, radius);

    context.fillStyle = '#f5c332';
    context.beginPath();
    context.arc(centerX, centerY, clampedRadius, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = '#fff1b8';
    context.lineWidth = 1;
    context.stroke();
  }

  private drawMonsterMarker(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number
  ): void {
    const s = Math.max(2, size);
    context.fillStyle = '#d63031';
    context.beginPath();
    context.moveTo(centerX, centerY - s);
    context.lineTo(centerX + s, centerY);
    context.lineTo(centerX, centerY + s);
    context.lineTo(centerX - s, centerY);
    context.closePath();
    context.fill();

    context.strokeStyle = '#ff7675';
    context.lineWidth = 1;
    context.stroke();
  }

  private drawMonsterMarkerSelected(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number
  ): void {
    const s = Math.max(2, size) + 1;
    context.fillStyle = '#ff4444';
    context.beginPath();
    context.moveTo(centerX, centerY - s);
    context.lineTo(centerX + s, centerY);
    context.lineTo(centerX, centerY + s);
    context.lineTo(centerX - s, centerY);
    context.closePath();
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1.5;
    context.stroke();
  }

  private drawMonsterMarkerGreen(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number
  ): void {
    const s = Math.max(2, size) + 1;
    context.fillStyle = '#00b300';
    context.beginPath();
    context.moveTo(centerX, centerY - s);
    context.lineTo(centerX + s, centerY);
    context.lineTo(centerX, centerY + s);
    context.lineTo(centerX - s, centerY);
    context.closePath();
    context.fill();
    context.strokeStyle = '#80ff80';
    context.lineWidth = 1.5;
    context.stroke();
  }

  private getFirstPersonSideColor(block: PathBlockType): string {
    if (block === 'closedDoor') {
      return '#8f2525';
    }

    if (block === 'openDoor') {
      return '#ab2f2f';
    }

    if (block === 'wall') {
      return '#a8adb6';
    }

    return '#1b1d21';
  }

  private getFirstPersonFrontColor(block: PathBlockType): string {
    if (block === 'closedDoor') {
      return '#9d2727';
    }

    if (block === 'openDoor') {
      return '#b13131';
    }

    if (block === 'wall') {
      return '#d6d9df';
    }

    return '#191b1f';
  }

  private getFirstPersonOpeningBackWallColor(block: PathBlockType, wallDepth: number): string {
    if (block === 'closedDoor') {
      return '#6f1e1e';
    }

    if (block === 'openDoor') {
      return '#7f2525';
    }

    if (block === 'wall') {
      const normalizedDepth = Math.max(0, wallDepth);
      const darkenAmount = Math.min(0.86, normalizedDepth * 0.085);
      return this.darkenHexColor(this.getFirstPersonFrontColor('wall'), darkenAmount);
    }

    return '#14171b';
  }

  private drawSurfaceTextureInPolygon(
    context: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    seed: number,
    surfaceDepth: number,
    surface: 'floor' | 'ceiling'
  ): void {
    if (points.length < 3) {
      return;
    }

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);

    context.save();
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }
    context.closePath();
    context.clip();
    this.drawSurfaceTextureInRect(
      context,
      left,
      top,
      right - left,
      bottom - top,
      seed,
      surfaceDepth,
      surface
    );
    context.restore();
  }

  private drawSurfaceTextureInRect(
    context: CanvasRenderingContext2D,
    left: number,
    top: number,
    width: number,
    height: number,
    seed: number,
    surfaceDepth: number,
    surface: 'floor' | 'ceiling'
  ): void {
    if (width <= 0 || height <= 0) {
      return;
    }

    const normalizedDepth = Math.max(0, surfaceDepth);
    const area = width * height;
    const dotCount = Math.max(4, Math.floor(area / (surface === 'floor' ? 190 : 210)));
    const alphaBase = Math.max(0.02, 0.085 - normalizedDepth * 0.008);
    const toneBase = surface === 'floor' ? 122 : 134;
    const toneRange = surface === 'floor' ? 30 : 24;

    for (let index = 0; index < dotCount; index += 1) {
      const x = left + this.getSeededNoise(seed, index * 6 + 1) * width;
      const y = top + this.getSeededNoise(seed, index * 6 + 2) * height;
      const radius = 0.35 + this.getSeededNoise(seed, index * 6 + 3) * 0.8;
      const tone = toneBase + Math.floor(this.getSeededNoise(seed, index * 6 + 4) * toneRange);
      const alpha = alphaBase * (0.55 + this.getSeededNoise(seed, index * 6 + 5) * 0.9);

      context.fillStyle = `rgba(${tone}, ${tone}, ${tone}, ${alpha})`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }

    const streakCount = Math.max(1, Math.floor(area / 2200));
    const streakAlpha = Math.max(0.02, 0.09 - normalizedDepth * 0.008);
    context.strokeStyle =
      surface === 'floor'
        ? `rgba(74, 62, 50, ${streakAlpha})`
        : `rgba(82, 88, 104, ${streakAlpha})`;
    context.lineWidth = 1;

    for (let index = 0; index < streakCount; index += 1) {
      const startX = left + this.getSeededNoise(seed + 41, index * 7 + 1) * width;
      const startY = top + this.getSeededNoise(seed + 41, index * 7 + 2) * height;
      const length = 4 + this.getSeededNoise(seed + 41, index * 7 + 3) * 8;
      const angle = this.getSeededNoise(seed + 41, index * 7 + 4) * Math.PI * 2;
      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(startX + Math.cos(angle) * length, startY + Math.sin(angle) * length);
      context.stroke();
    }
  }

  private drawBrickPatternInPolygon(
    context: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    seed: number,
    wallDepth: number
  ): void {
    if (points.length < 3) {
      return;
    }

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);

    context.save();
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }
    context.closePath();
    context.clip();
    this.drawBrickPatternInRect(context, left, top, right - left, bottom - top, seed, wallDepth);
    context.restore();
  }

  private drawBrickPatternInRect(
    context: CanvasRenderingContext2D,
    left: number,
    top: number,
    width: number,
    height: number,
    seed: number,
    wallDepth: number
  ): void {
    if (width <= 0 || height <= 0) {
      return;
    }

    const normalizedDepth = Math.max(0, wallDepth);
    const brickHeight = Math.max(4, Math.min(12, height * 0.18));
    const brickWidth = Math.max(8, brickHeight * 1.9);
    const mortarAlpha = Math.max(0.08, 0.2 - normalizedDepth * 0.012);
    const tintAlpha = Math.max(0.05, 0.16 - normalizedDepth * 0.01);
    const right = left + width;
    const bottom = top + height;
    const rowCount = Math.ceil(height / brickHeight);

    for (let row = 0; row < rowCount; row += 1) {
      const rowTop = top + row * brickHeight;
      const rowBottom = Math.min(bottom, rowTop + brickHeight);
      const rowHeight = rowBottom - rowTop;
      if (rowHeight <= 0) {
        continue;
      }

      const staggerBase = row % 2 === 0 ? 0 : brickWidth * 0.5;
      const staggerNoise = (this.getSeededNoise(seed, row * 5 + 1) - 0.5) * brickWidth * 0.2;
      let brickColumn = 0;

      for (
        let brickLeft = left - brickWidth + staggerBase + staggerNoise;
        brickLeft < right;
        brickLeft += brickWidth
      ) {
        const visibleLeft = Math.max(left, brickLeft);
        const visibleRight = Math.min(right, brickLeft + brickWidth);
        const visibleWidth = visibleRight - visibleLeft;
        if (visibleWidth <= 1) {
          brickColumn += 1;
          continue;
        }

        const toneNoise = this.getSeededNoise(seed + row * 19 + brickColumn * 31, 2);
        const tone = 132 + Math.floor(toneNoise * 34);
        const alpha = tintAlpha * (0.7 + toneNoise * 0.6);
        context.fillStyle = `rgba(${tone}, ${tone}, ${tone}, ${alpha})`;
        context.fillRect(
          visibleLeft + 0.6,
          rowTop + 0.6,
          Math.max(0, visibleWidth - 1.2),
          Math.max(0, rowHeight - 1.2)
        );
        brickColumn += 1;
      }
    }

    context.strokeStyle = `rgba(74, 80, 92, ${mortarAlpha})`;
    context.lineWidth = 1;
    context.beginPath();

    for (let y = top + brickHeight; y < bottom; y += brickHeight) {
      context.moveTo(left, y);
      context.lineTo(right, y);
    }

    for (let row = 0; row < rowCount; row += 1) {
      const rowTop = top + row * brickHeight;
      const rowBottom = Math.min(bottom, rowTop + brickHeight);
      if (rowBottom - rowTop <= 0) {
        continue;
      }

      const staggerBase = row % 2 === 0 ? 0 : brickWidth * 0.5;
      const staggerNoise = (this.getSeededNoise(seed, row * 5 + 1) - 0.5) * brickWidth * 0.2;
      for (let x = left + staggerBase + staggerNoise; x < right; x += brickWidth) {
        context.moveTo(x, rowTop);
        context.lineTo(x, rowBottom);
      }
    }

    context.stroke();
  }

  private hasClearSideSightToDepth(
    steps: FirstPersonStep[],
    depth: number,
    side: 'left' | 'right'
  ): boolean {
    for (let index = 0; index <= depth; index += 1) {
      const step = steps[index];
      if (!step) {
        return false;
      }

      const block = side === 'left' ? step.leftBlock : step.rightBlock;
      if (!this.isSideSightTransparent(block)) {
        return false;
      }
    }

    return true;
  }

  private getVisibleMonsterSlotsForDepth(
    dungonId: number,
    steps: FirstPersonStep[],
    depth: number,
    row: number,
    column: number,
    leftOffset: { rowOffset: number; columnOffset: number },
    rightOffset: { rowOffset: number; columnOffset: number }
  ): Array<{ squareKey: string; lateralOffset: number; isPeek?: boolean }> {
    const squares = this.squaresByDungon()[dungonId] ?? {};
    const filledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
    const visibleSlots: Array<{ squareKey: string; lateralOffset: number; isPeek?: boolean }> = [
      { squareKey: this.getSquareKey(row, column), lateralOffset: 0 },
    ];

    if (depth <= 0) {
      return visibleSlots;
    }

    const collectSideSlots = (
      side: 'left' | 'right',
      offset: { rowOffset: number; columnOffset: number },
      lateralDirection: number
    ): void => {
      if (!this.hasClearSideSightToDepth(steps, depth, side)) {
        return;
      }

      let currentRow = row;
      let currentColumn = column;
      for (let distance = 1; distance <= depth; distance += 1) {
        const nextRow = currentRow + offset.rowOffset;
        const nextColumn = currentColumn + offset.columnOffset;
        const connection = this.getMovementConnectionInfoBetweenAdjacentSquares(
          dungonId,
          currentRow,
          currentColumn,
          nextRow,
          nextColumn
        );
        if (!this.isTransparentConnectionType(connection.type)) {
          break;
        }

        const squareKey = this.getSquareKey(nextRow, nextColumn);
        if (!squares[squareKey] || !filledSquares[squareKey]) {
          break;
        }

        visibleSlots.push({
          squareKey,
          lateralOffset: lateralDirection * distance,
        });
        currentRow = nextRow;
        currentColumn = nextColumn;
      }
    };

    collectSideSlots('left', leftOffset, -1);
    collectSideSlots('right', rightOffset, 1);

    // Corner-peek: side just opened at this depth (wall before, opening now)
    if (depth >= 1) {
      const addPeekIfMonsterPresent = (
        side: 'left' | 'right',
        offset: { rowOffset: number; columnOffset: number },
        lateralDirection: number
      ): void => {
        const prevStep = steps[depth - 1];
        const currStep = steps[depth];
        if (!prevStep || !currStep) return;
        const prevBlock = side === 'left' ? prevStep.leftBlock : prevStep.rightBlock;
        const currBlock = side === 'left' ? currStep.leftBlock : currStep.rightBlock;
        // Previous step must have been a wall, current step must be open
        if (this.isSideSightTransparent(prevBlock)) return;
        if (!this.isSideSightTransparent(currBlock)) return;
        // Check the diagonal square (one ahead, one to the side)
        const diagRow = row + offset.rowOffset;
        const diagCol = column + offset.columnOffset;
        const squareKey = this.getSquareKey(diagRow, diagCol);
        if (!squares[squareKey] || !filledSquares[squareKey]) return;
        if (visibleSlots.some((s) => s.squareKey === squareKey)) return;
        visibleSlots.push({ squareKey, lateralOffset: lateralDirection, isPeek: true });
      };
      addPeekIfMonsterPresent('left', leftOffset, -1);
      addPeekIfMonsterPresent('right', rightOffset, 1);
    }

    return visibleSlots;
  }

  private isSideSightTransparent(block: FirstPersonBlock): boolean {
    return block.type === 'none' || block.type === 'openDoor';
  }

  private isTransparentConnectionType(type: PathBlockType): boolean {
    return type === 'none' || type === 'openDoor';
  }

  private getFirstPersonWallPanelColor(depth: number): string {
    const normalizedDepth = Math.max(0, Math.floor(depth));
    return this.darkenHexColor(this.getFirstPersonFrontColor('wall'), Math.min(0.9, normalizedDepth * 0.1));
  }

  private getSeededNoise(seed: number, step: number): number {
    const value = Math.sin(seed * 12.9898 + step * 78.233) * 43758.5453123;
    return value - Math.floor(value);
  }

  private darkenHexColor(hexColor: string, amount: number): string {
    const normalized = hexColor.startsWith('#') ? hexColor.slice(1) : hexColor;
    if (normalized.length !== 6) {
      return hexColor;
    }

    const parseChannel = (startIndex: number): number => {
      const channel = Number.parseInt(normalized.slice(startIndex, startIndex + 2), 16);
      if (Number.isNaN(channel)) {
        return 0;
      }

      return Math.max(0, Math.min(255, Math.floor(channel * (1 - amount))));
    };

    return `#${parseChannel(0).toString(16).padStart(2, '0')}${parseChannel(2).toString(16).padStart(2, '0')}${parseChannel(4).toString(16).padStart(2, '0')}`;
  }

  private toFirstPersonBlock(type: PathBlockType, door: Door | null, wall: Wall | null = null): FirstPersonBlock {
    return {
      type,
      hasKeyhole: Boolean(door?.keyLock),
      isDestructible: wall?.isDestructible === true,
    };
  }

  private loadDoorImages(): void {
    for (const key of ['open', 'closed'] as const) {
      if (this.doorImageCache.has(key)) continue;
      const img = new Image();
      img.onload = () => {
        this.doorImageCache.set(key, img);
        this.drawFirstPersonViewCanvas();
      };
      img.src = key === 'open' ? '/images/dooropen.jpg' : '/images/doorclosed.jpg';
    }
  }

  private drawFirstPersonDoorFace(
    context: CanvasRenderingContext2D,
    frame: { left: number; right: number; top: number; bottom: number },
    block: FirstPersonBlock,
    isPortal: boolean
  ): void {
    if (block.type !== 'openDoor' && block.type !== 'closedDoor') {
      return;
    }
    if (block.type === 'openDoor') {
      return;
    }

    const frameWidth = frame.right - frame.left;
    const frameHeight = frame.bottom - frame.top;
    const insetX = Math.max(2, frameWidth * 0.1);
    const insetY = Math.max(2, frameHeight * 0.08);
    const doorLeft = frame.left + insetX;
    const doorRight = frame.right - insetX;
    const doorTop = frame.top + insetY;
    const doorBottom = frame.bottom - insetY;
    const doorW = doorRight - doorLeft;
    const doorH = doorBottom - doorTop;

    const img = this.doorImageCache.get('closed') ?? null;

    context.save();
    context.globalAlpha = isPortal ? 0.84 : 1;

    if (img) {
      context.drawImage(img, doorLeft, doorTop, doorW, doorH);
    } else {
      context.fillStyle = '#b33030';
      context.fillRect(doorLeft, doorTop, doorW, doorH);
      context.strokeStyle = '#f0b0b0';
      context.lineWidth = Math.max(1, Math.min(2, doorW * 0.04));
      context.strokeRect(doorLeft, doorTop, doorW, doorH);
      if (block.hasKeyhole) {
        const keyholeX = doorRight - Math.max(4, doorW * 0.28);
        const keyholeY = doorTop + doorH * 0.64;
        const keyholeRadius = Math.max(1.2, doorW * 0.03);
        context.fillStyle = '#1f1111';
        context.beginPath();
        context.arc(keyholeX, keyholeY, keyholeRadius, 0, Math.PI * 2);
        context.fill();
      }
    }

    context.restore();
  }

  private getLateralBlockType(
    dungonId: number,
    row: number,
    column: number,
    rowOffset: number,
    columnOffset: number
  ): FirstPersonBlock {
    const squares = this.squaresByDungon()[dungonId] ?? {};
    const filledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
    const sourceSquare = squares[this.getSquareKey(row, column)];
    if (!sourceSquare || !filledSquares[this.getSquareKey(row, column)]) {
      return this.toFirstPersonBlock('void', null);
    }

    const side = this.getSquareSideFromOffset(rowOffset, columnOffset);
    if (!side) {
      return this.toFirstPersonBlock('void', null);
    }

    const connection = sourceSquare[side];
    if (this.isWallConnection(connection)) {
      return this.toFirstPersonBlock('wall', null);
    }

    if (this.isDoorConnection(connection)) {
      if (connection.isHidden && !connection.isFound) {
        return this.toFirstPersonBlock('wall', null);
      }
      return this.toFirstPersonBlock(
        connection.state === 'closed' ? 'closedDoor' : 'openDoor',
        connection
      );
    }

    const neighborRow = row + rowOffset;
    const neighborColumn = column + columnOffset;
    const neighborSquareKey = this.getSquareKey(neighborRow, neighborColumn);
    if (!filledSquares[neighborSquareKey] || !squares[neighborSquareKey]) {
      return this.toFirstPersonBlock('void', null);
    }

    return this.toFirstPersonBlock('none', null);
  }

  private getSideOpeningBackBlock(
    dungonId: number,
    row: number,
    column: number,
    sideRowOffset: number,
    sideColumnOffset: number,
    forwardRowOffset: number,
    forwardColumnOffset: number
  ): FirstPersonBlock | null {
    const sideRow = row + sideRowOffset;
    const sideColumn = column + sideColumnOffset;
    const sideForwardRow = sideRow + forwardRowOffset;
    const sideForwardColumn = sideColumn + forwardColumnOffset;
    const sideForwardConnection = this.getMovementConnectionInfoBetweenAdjacentSquares(
      dungonId,
      sideRow,
      sideColumn,
      sideForwardRow,
      sideForwardColumn
    );

    if (sideForwardConnection.type === 'none') {
      return null;
    }

    return this.toFirstPersonBlock(sideForwardConnection.type, sideForwardConnection.door);
  }

  private getSquareSideFromOffset(rowOffset: number, columnOffset: number): SquareSide | null {
    if (rowOffset === -1 && columnOffset === 0) {
      return 'toTop';
    }

    if (rowOffset === 1 && columnOffset === 0) {
      return 'toBottom';
    }

    if (rowOffset === 0 && columnOffset === -1) {
      return 'toLeft';
    }

    if (rowOffset === 0 && columnOffset === 1) {
      return 'toRight';
    }

    return null;
  }

  private getVisibleSquareKeysForPreview(preview: GridPreviewContext): Set<string> {
    const visibleSquareKeys = new Set<string>();
    const filledSquares = this.filledSquaresByDungon()[preview.dungonId] ?? {};
    const range = this.getEffectiveRangeOfSight(preview.dungonId);

    const sourceSquareKey = this.getSquareKey(preview.centerRow, preview.centerColumn);
    if (filledSquares[sourceSquareKey]) {
      visibleSquareKeys.add(sourceSquareKey);
    }

    for (let previewRow = 0; previewRow < this.previewGridDimension; previewRow += 1) {
      for (let previewColumn = 0; previewColumn < this.previewGridDimension; previewColumn += 1) {
        const sourceRow = preview.startRow + previewRow;
        const sourceColumn = preview.startColumn + previewColumn;
        const squareKey = this.getSquareKey(sourceRow, sourceColumn);
        if (!filledSquares[squareKey]) {
          continue;
        }

        if (!this.isWithinSightRange(preview.centerRow, preview.centerColumn, sourceRow, sourceColumn, range)) {
          continue;
        }

        if (
          !this.hasLineOfSight(
            preview.dungonId,
            preview.centerRow,
            preview.centerColumn,
            sourceRow,
            sourceColumn
          )
        ) {
          continue;
        }

        visibleSquareKeys.add(squareKey);
      }
    }

    return visibleSquareKeys;
  }

  private isWithinSightRange(
    fromRow: number,
    fromColumn: number,
    toRow: number,
    toColumn: number,
    range: number
  ): boolean {
    const rowOffset = toRow - fromRow;
    const columnOffset = toColumn - fromColumn;
    return Math.hypot(rowOffset, columnOffset) <= range;
  }

  private hasLineOfSight(
    dungonId: number,
    fromRow: number,
    fromColumn: number,
    toRow: number,
    toColumn: number
  ): boolean {
    if (fromRow === toRow && fromColumn === toColumn) {
      return true;
    }

    const squares = this.squaresByDungon()[dungonId] ?? {};
    if (!squares[this.getSquareKey(fromRow, fromColumn)]) {
      return false;
    }

    if (!squares[this.getSquareKey(toRow, toColumn)]) {
      return false;
    }

    const startX = fromColumn + 0.5;
    const startY = fromRow + 0.5;
    const endX = toColumn + 0.5;
    const endY = toRow + 0.5;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const stepX = deltaX > 0 ? 1 : deltaX < 0 ? -1 : 0;
    const stepY = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
    const absoluteDeltaX = Math.abs(deltaX);
    const absoluteDeltaY = Math.abs(deltaY);

    let currentRow = fromRow;
    let currentColumn = fromColumn;

    let tMaxX =
      stepX === 0
        ? Number.POSITIVE_INFINITY
        : (stepX > 0 ? currentColumn + 1 - startX : startX - currentColumn) / absoluteDeltaX;

    let tMaxY =
      stepY === 0
        ? Number.POSITIVE_INFINITY
        : (stepY > 0 ? currentRow + 1 - startY : startY - currentRow) / absoluteDeltaY;

    const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY : 1 / absoluteDeltaX;
    const tDeltaY = stepY === 0 ? Number.POSITIVE_INFINITY : 1 / absoluteDeltaY;
    const epsilon = 0.0000001;
    let guard = 0;
    const maxSteps = this.gridRowCount * this.gridColumnCount + 5;

    while ((currentRow !== toRow || currentColumn !== toColumn) && guard < maxSteps) {
      guard += 1;

      if (tMaxX < tMaxY - epsilon) {
        const nextColumn = currentColumn + stepX;
        if (
          this.isSightBlockedBetweenAdjacentSquares(
            dungonId,
            currentRow,
            currentColumn,
            currentRow,
            nextColumn
          )
        ) {
          return false;
        }

        currentColumn = nextColumn;
        tMaxX += tDeltaX;
        continue;
      }

      if (tMaxY < tMaxX - epsilon) {
        const nextRow = currentRow + stepY;
        if (
          this.isSightBlockedBetweenAdjacentSquares(
            dungonId,
            currentRow,
            currentColumn,
            nextRow,
            currentColumn
          )
        ) {
          return false;
        }

        currentRow = nextRow;
        tMaxY += tDeltaY;
        continue;
      }

      const nextColumn = currentColumn + stepX;
      const nextRow = currentRow + stepY;
      const blockedToHorizontal =
        stepX !== 0 &&
        this.isSightBlockedBetweenAdjacentSquares(
          dungonId,
          currentRow,
          currentColumn,
          currentRow,
          nextColumn
        );

      const blockedToVertical =
        stepY !== 0 &&
        this.isSightBlockedBetweenAdjacentSquares(
          dungonId,
          currentRow,
          currentColumn,
          nextRow,
          currentColumn
        );

      // Both adjacent walls blocked = full cover, no LOS.
      // One wall blocked = partial cover (LOS exists, -2 to hit via getAttackCoverPenalty).
      if (blockedToHorizontal && blockedToVertical) {
        return false;
      }

      currentColumn = nextColumn;
      currentRow = nextRow;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    }

    return currentRow === toRow && currentColumn === toColumn;
  }

  /**
   * Returns -2 if the target has partial cover (one wall clips the diagonal ray), or 0 otherwise.
   * Used to apply a -2 to-hit penalty when attacking diagonally past a corner wall.
   */
  private getAttackCoverPenalty(
    dungonId: number,
    fromRow: number,
    fromColumn: number,
    toRow: number,
    toColumn: number
  ): number {
    if (fromRow === toRow && fromColumn === toColumn) return 0;

    const squares = this.squaresByDungon()[dungonId] ?? {};
    if (!squares[this.getSquareKey(fromRow, fromColumn)]) return 0;
    if (!squares[this.getSquareKey(toRow, toColumn)]) return 0;

    const startX = fromColumn + 0.5;
    const startY = fromRow + 0.5;
    const endX = toColumn + 0.5;
    const endY = toRow + 0.5;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const stepX = deltaX > 0 ? 1 : deltaX < 0 ? -1 : 0;
    const stepY = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
    const absoluteDeltaX = Math.abs(deltaX);
    const absoluteDeltaY = Math.abs(deltaY);

    let currentRow = fromRow;
    let currentColumn = fromColumn;

    let tMaxX = stepX === 0 ? Number.POSITIVE_INFINITY
      : (stepX > 0 ? currentColumn + 1 - startX : startX - currentColumn) / absoluteDeltaX;
    let tMaxY = stepY === 0 ? Number.POSITIVE_INFINITY
      : (stepY > 0 ? currentRow + 1 - startY : startY - currentRow) / absoluteDeltaY;

    const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY : 1 / absoluteDeltaX;
    const tDeltaY = stepY === 0 ? Number.POSITIVE_INFINITY : 1 / absoluteDeltaY;
    const epsilon = 0.0000001;
    let guard = 0;
    const maxSteps = this.gridRowCount * this.gridColumnCount + 5;

    while ((currentRow !== toRow || currentColumn !== toColumn) && guard < maxSteps) {
      guard += 1;

      if (tMaxX < tMaxY - epsilon) {
        currentColumn += stepX;
        tMaxX += tDeltaX;
        continue;
      }

      if (tMaxY < tMaxX - epsilon) {
        currentRow += stepY;
        tMaxY += tDeltaY;
        continue;
      }

      // Exact diagonal corner — exactly one wall blocked = partial cover
      const nextColumn = currentColumn + stepX;
      const nextRow = currentRow + stepY;
      const blockedH = stepX !== 0 && this.isSightBlockedBetweenAdjacentSquares(
        dungonId, currentRow, currentColumn, currentRow, nextColumn);
      const blockedV = stepY !== 0 && this.isSightBlockedBetweenAdjacentSquares(
        dungonId, currentRow, currentColumn, nextRow, currentColumn);

      if (blockedH !== blockedV) {
        return -2; // partial cover
      }

      currentColumn = nextColumn;
      currentRow = nextRow;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    }

    return 0;
  }

  private isSightBlockedBetweenAdjacentSquares(
    dungonId: number,
    fromRow: number,
    fromColumn: number,
    toRow: number,
    toColumn: number
  ): boolean {
    const rowDelta = toRow - fromRow;
    const columnDelta = toColumn - fromColumn;

    if (Math.abs(rowDelta) + Math.abs(columnDelta) !== 1) {
      return true;
    }

    const squares = this.squaresByDungon()[dungonId] ?? {};
    const fromSquare = squares[this.getSquareKey(fromRow, fromColumn)];
    const toSquare = squares[this.getSquareKey(toRow, toColumn)];
    if (!fromSquare || !toSquare) {
      return true;
    }

    let fromSide: SquareSide;
    let toSide: SquareSide;

    if (rowDelta === -1) {
      fromSide = 'toTop';
      toSide = 'toBottom';
    } else if (rowDelta === 1) {
      fromSide = 'toBottom';
      toSide = 'toTop';
    } else if (columnDelta === -1) {
      fromSide = 'toLeft';
      toSide = 'toRight';
    } else {
      fromSide = 'toRight';
      toSide = 'toLeft';
    }

    const fromConnection = fromSquare[fromSide];
    const toConnection = toSquare[toSide];
    return this.isSightBlockingConnection(fromConnection) || this.isSightBlockingConnection(toConnection);
  }

  private isSightBlockingConnection(connection: Door | Wall | null): boolean {
    if (this.isWallConnection(connection)) return true;
    if (this.isDoorConnection(connection)) {
      if (connection.isHidden && !connection.isFound) return true;
      return (connection as Door).state !== 'open';
    }
    return false;
  }

  private isSpaceKey(key: string): boolean {
    return key === ' ' || key === 'Space' || key === 'Spacebar';
  }

  private isBackwardMoveKey(key: string): boolean {
    return key.toLowerCase() === 'b';
  }

  private tryMoveCheaterForward(): void {
    this.tryMoveCheaterByFacingStep(1);
  }

  private tryMoveCheaterBackward(): void {
    this.tryMoveCheaterByFacingStep(-1);
  }

  private tryMoveCheaterByDisplayedFacingStep(stepMultiplier: 1 | -1): void {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }

    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const displayDirection = this.getDisplayedFacingDirection(preview.dungonId, cheater.facingDir);
    const moveDelta = this.getMovementDeltaForDisplayFacingDirection(displayDirection);
    this.tryMoveCheaterByDelta(
      preview,
      moveDelta.rowOffset * stepMultiplier,
      moveDelta.columnOffset * stepMultiplier
    );
  }

  private tryMoveCheaterByFacingStep(stepMultiplier: 1 | -1): void {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }

    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const moveDelta = this.getMovementDeltaForFacingDirection(cheater.facingDir);
    this.tryMoveCheaterByDelta(
      preview,
      moveDelta.rowOffset * stepMultiplier,
      moveDelta.columnOffset * stepMultiplier
    );
  }

  private tryMoveCheaterByDelta(
    preview: GridPreviewContext,
    rowOffset: number,
    columnOffset: number
  ): void {
    if (rowOffset === 0 && columnOffset === 0) {
      return;
    }

    const nextRow = preview.centerRow + rowOffset;
    const nextColumn = preview.centerColumn + columnOffset;
    if (
      nextRow < 0 ||
      nextColumn < 0 ||
      nextRow >= this.gridRowCount ||
      nextColumn >= this.gridColumnCount
    ) {
      return;
    }

    const filledSquares = this.filledSquaresByDungon()[preview.dungonId] ?? {};
    if (!filledSquares[this.getSquareKey(nextRow, nextColumn)]) {
      return;
    }

    const isCardinalStep = Math.abs(rowOffset) + Math.abs(columnOffset) === 1;
    const isDiagonalStep = Math.abs(rowOffset) === 1 && Math.abs(columnOffset) === 1;

    if (isCardinalStep) {
      if (
        this.isMovementBlockedBetweenAdjacentSquares(
          preview.dungonId,
          preview.centerRow,
          preview.centerColumn,
          nextRow,
          nextColumn
        )
      ) {
        return;
      }
    } else if (isDiagonalStep) {
      if (
        this.isDiagonalMovementBlocked(
          preview.dungonId,
          preview.centerRow,
          preview.centerColumn,
          rowOffset,
          columnOffset
        )
      ) {
        return;
      }
    } else {
      return;
    }

    const nextSquareKey = this.getSquareKey(nextRow, nextColumn);
    const hasLiveMonster = this.monsterInstances().some(
      (m) => !m.isDead && m.row === nextRow && m.column === nextColumn
    );
    if (hasLiveMonster) {
      return;
    }

    // Block movement into squares that have a non-destroyed obstacle
    const obstaclesForDungon = this.obstaclePlacementsByDungon()[preview.dungonId] ?? [];
    const hasObstacleAtDest = obstaclesForDungon.some(
      (obs) => obs.row === nextRow && obs.column === nextColumn && !obs.isDestroyed
    );
    if (hasObstacleAtDest) {
      return;
    }

    const moveCost = isDiagonalStep ? 2 : 1;
    if (this.turnPhase() === 'player' && this.playerAE() < moveCost) {
      return;
    }

    if (this.turnPhase() === 'player') {
      this.consumePlayerAE(moveCost, preview.dungonId);
    }

    const halfDimension = Math.floor(this.previewGridDimension / 2);
    this.gridPreviewContext.set({
      ...preview,
      centerRow: nextRow,
      centerColumn: nextColumn,
      startRow: nextRow - halfDimension,
      startColumn: nextColumn - halfDimension,
    });

    this.logNearbyAfterMove();
    this.triggerNpcGreetings();

    this.playStepSound(0.22);

    // Check if player stepped onto an exit
    const exits = this.exitsByDungon()[preview.dungonId] ?? [];
    const landedExit = exits.find((e) => e.row === nextRow && e.column === nextColumn);
    if (landedExit && landedExit.destinationType === 'outside' && !this.dungonWon() && !this.pendingExitTransitionType()) {
      const exitReq = landedExit.itemRequirement ?? null;
      if (exitReq && !this.playerHasItem(exitReq.itemId)) {
        this.previewActionMessage.set(`You need the ${exitReq.itemName} to exit here.`);
      } else {
        if (exitReq?.consume) {
          this.removeItemFromInventory(preview.dungonId, exitReq.itemId);
        }
        this.triggerDungonWin(landedExit.transitionType ?? 'open');
      }
    }

    // Check if player stepped onto a floor trap
    this.checkFloorTrapsAtCurrentSquare(preview.dungonId, nextRow, nextColumn);

    this.drawPreviewGridCanvas();

    if (this.turnPhase() === 'player' && this.playerAE() <= 0) {
      this.startMonsterTurns();
    }
  }

  private isDiagonalMovementBlocked(
    dungonId: number,
    fromRow: number,
    fromColumn: number,
    rowOffset: number,
    columnOffset: number
  ): boolean {
    const targetRow = fromRow + rowOffset;
    const targetColumn = fromColumn + columnOffset;
    const viaVertical = this.canTraverseTwoStepPath(
      dungonId,
      fromRow,
      fromColumn,
      fromRow + rowOffset,
      fromColumn,
      targetRow,
      targetColumn
    );
    const viaHorizontal = this.canTraverseTwoStepPath(
      dungonId,
      fromRow,
      fromColumn,
      fromRow,
      fromColumn + columnOffset,
      targetRow,
      targetColumn
    );

    return !viaVertical && !viaHorizontal;
  }

  private canTraverseTwoStepPath(
    dungonId: number,
    fromRow: number,
    fromColumn: number,
    middleRow: number,
    middleColumn: number,
    targetRow: number,
    targetColumn: number
  ): boolean {
    const filledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
    if (!filledSquares[this.getSquareKey(middleRow, middleColumn)]) {
      return false;
    }

    if (!filledSquares[this.getSquareKey(targetRow, targetColumn)]) {
      return false;
    }

    if (
      this.isMovementBlockedBetweenAdjacentSquares(
        dungonId,
        fromRow,
        fromColumn,
        middleRow,
        middleColumn
      )
    ) {
      return false;
    }

    if (
      this.isMovementBlockedBetweenAdjacentSquares(
        dungonId,
        middleRow,
        middleColumn,
        targetRow,
        targetColumn
      )
    ) {
      return false;
    }

    return true;
  }

  private getMovementDeltaForFacingDirection(
    direction: FacingDirection
  ): { rowOffset: number; columnOffset: number } {
    if (direction === 'up') {
      return { rowOffset: -1, columnOffset: 0 };
    }

    if (direction === 'right') {
      return { rowOffset: 0, columnOffset: 1 };
    }

    if (direction === 'down') {
      return { rowOffset: 1, columnOffset: 0 };
    }

    return { rowOffset: 0, columnOffset: -1 };
  }

  private getFacingWallSides(direction: DisplayFacingDirection): SquareSide[] {
    switch (direction) {
      case 'up': return ['toTop'];
      case 'down': return ['toBottom'];
      case 'left': return ['toLeft'];
      case 'right': return ['toRight'];
      case 'upRight': return ['toTop', 'toRight'];
      case 'upLeft': return ['toTop', 'toLeft'];
      case 'downRight': return ['toBottom', 'toRight'];
      case 'downLeft': return ['toBottom', 'toLeft'];
      default: return [];
    }
  }

  private oppositeWallSide(side: SquareSide): SquareSide {
    const map: Record<SquareSide, SquareSide> = {
      toTop: 'toBottom',
      toBottom: 'toTop',
      toLeft: 'toRight',
      toRight: 'toLeft',
    };
    return map[side];
  }

  private checkFloorTrapsAtCurrentSquare(dungonId: number, row: number, column: number): void {
    const traps = this.floorTrapPlacementsByDungon()[dungonId] ?? [];
    const activeTrap = traps.find(
      (p) => p.row === row && p.column === column && !p.isTriggered && !p.isDisarmed
    );
    if (!activeTrap) return;

    this.floorTrapPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: (all[dungonId] ?? []).map((p) =>
        p.id === activeTrap.id ? { ...p, isTriggered: true } : p
      ),
    }));

    this.triggerTrap(activeTrap.trap);
    this.saveGameState();
  }

  private getMovementDeltaForDisplayFacingDirection(
    direction: DisplayFacingDirection
  ): { rowOffset: number; columnOffset: number } {
    if (direction === 'upRight') {
      return { rowOffset: -1, columnOffset: 1 };
    }

    if (direction === 'downRight') {
      return { rowOffset: 1, columnOffset: 1 };
    }

    if (direction === 'downLeft') {
      return { rowOffset: 1, columnOffset: -1 };
    }

    if (direction === 'upLeft') {
      return { rowOffset: -1, columnOffset: -1 };
    }

    return this.getMovementDeltaForFacingDirection(direction);
  }

  private isMovementBlockedBetweenAdjacentSquares(
    dungonId: number,
    fromRow: number,
    fromColumn: number,
    toRow: number,
    toColumn: number
  ): boolean {
    const blockType = this.getMovementBlockTypeBetweenAdjacentSquares(
      dungonId,
      fromRow,
      fromColumn,
      toRow,
      toColumn
    );

    return blockType === 'wall' || blockType === 'closedDoor' || blockType === 'void';
  }

  private getMovementBlockTypeBetweenAdjacentSquares(
    dungonId: number,
    fromRow: number,
    fromColumn: number,
    toRow: number,
    toColumn: number
  ): PathBlockType {
    return this.getMovementConnectionInfoBetweenAdjacentSquares(
      dungonId,
      fromRow,
      fromColumn,
      toRow,
      toColumn
    ).type;
  }

  private getMovementConnectionInfoBetweenAdjacentSquares(
    dungonId: number,
    fromRow: number,
    fromColumn: number,
    toRow: number,
    toColumn: number
  ): AdjacentConnectionInfo {
    const rowDelta = toRow - fromRow;
    const columnDelta = toColumn - fromColumn;
    if (Math.abs(rowDelta) + Math.abs(columnDelta) !== 1) {
      return { type: 'void', door: null };
    }

    const squares = this.squaresByDungon()[dungonId] ?? {};
    const fromSquare = squares[this.getSquareKey(fromRow, fromColumn)];
    if (!fromSquare) {
      return { type: 'void', door: null };
    }

    let fromSide: SquareSide;
    let toSide: SquareSide;

    if (rowDelta === -1) {
      fromSide = 'toTop';
      toSide = 'toBottom';
    } else if (rowDelta === 1) {
      fromSide = 'toBottom';
      toSide = 'toTop';
    } else if (columnDelta === -1) {
      fromSide = 'toLeft';
      toSide = 'toRight';
    } else {
      fromSide = 'toRight';
      toSide = 'toLeft';
    }

    const fromConnection = fromSquare[fromSide];

    if (this.isWallConnection(fromConnection)) {
      return { type: 'wall', door: null };
    }

    if (this.isDoorConnection(fromConnection)) {
      if (fromConnection.isHidden && !fromConnection.isFound) {
        return { type: 'wall', door: null };
      }
      return {
        type: fromConnection.state === 'closed' ? 'closedDoor' : 'openDoor',
        door: fromConnection,
      };
    }

    const toSquare = squares[this.getSquareKey(toRow, toColumn)];
    if (!toSquare) {
      return { type: 'void', door: null };
    }

    const toConnection = toSquare[toSide];

    if (this.isWallConnection(toConnection)) {
      return { type: 'wall', door: null };
    }

    if (this.isDoorConnection(toConnection)) {
      if (toConnection.isHidden && !toConnection.isFound) {
        return { type: 'wall', door: null };
      }
      return {
        type: toConnection.state === 'closed' ? 'closedDoor' : 'openDoor',
        door: toConnection,
      };
    }

    const obstacles = this.obstaclePlacementsByDungon()[dungonId] ?? [];
    const hasObstacle = obstacles.some(
      (obs) => obs.row === toRow && obs.column === toColumn && !obs.isDestroyed
    );
    if (hasObstacle) {
      return { type: 'wall', door: null };
    }

    return { type: 'none', door: null };
  }

  private getFacingDirectionFromKey(key: string): FacingDirection | null {
    if (key === 'ArrowUp') {
      return 'up';
    }

    if (key === 'ArrowDown') {
      return 'down';
    }

    return null;
  }

  private turnFacing(current: FacingDirection, turn: 'left' | 'right'): FacingDirection {
    const order: FacingDirection[] = ['up', 'right', 'down', 'left'];
    const delta = turn === 'right' ? 1 : -1;
    return order[(order.indexOf(current) + delta + 4) % 4];
  }

  private normalizeFacingDirection(direction: unknown): FacingDirection {
    return direction === 'up' || direction === 'right' || direction === 'down' || direction === 'left'
      ? direction
      : DEFAULT_CHEATER.facingDir;
  }

  private drawFacingArrow(
    context: CanvasRenderingContext2D,
    left: number,
    top: number,
    size: number,
    direction: DisplayFacingDirection
  ): void {
    const centerX = left + size / 2;
    const centerY = top + size / 2;
    const tipOffset = size * 0.34;
    const baseOffset = size * 0.14;
    const wingOffset = size * 0.2;

    const vector = this.getFacingVector(direction);
    const perpendicular = {
      x: -vector.y,
      y: vector.x,
    };

    const tipX = centerX + vector.x * tipOffset;
    const tipY = centerY + vector.y * tipOffset;
    const baseX = centerX - vector.x * baseOffset;
    const baseY = centerY - vector.y * baseOffset;
    const wingAX = baseX + perpendicular.x * wingOffset;
    const wingAY = baseY + perpendicular.y * wingOffset;
    const wingBX = baseX - perpendicular.x * wingOffset;
    const wingBY = baseY - perpendicular.y * wingOffset;

    context.fillStyle = '#30d158';
    context.strokeStyle = '#1f8f3a';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(tipX, tipY);
    context.lineTo(wingAX, wingAY);
    context.lineTo(wingBX, wingBY);
    context.closePath();
    context.fill();
    context.stroke();
  }

  private getFacingVector(direction: DisplayFacingDirection): { x: number; y: number } {
    if (direction === 'up') {
      return { x: 0, y: -1 };
    }

    if (direction === 'upRight') {
      return { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
    }

    if (direction === 'right') {
      return { x: 1, y: 0 };
    }

    if (direction === 'downRight') {
      return { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    }

    if (direction === 'down') {
      return { x: 0, y: 1 };
    }

    if (direction === 'downLeft') {
      return { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
    }

    if (direction === 'left') {
      return { x: -1, y: 0 };
    }

    return { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
  }

  private getFacingDirectionLabel(direction: DisplayFacingDirection): string {
    if (direction === 'upRight') {
      return 'UP-RIGHT';
    }

    if (direction === 'downRight') {
      return 'DOWN-RIGHT';
    }

    if (direction === 'downLeft') {
      return 'DOWN-LEFT';
    }

    if (direction === 'upLeft') {
      return 'UP-LEFT';
    }

    return direction.toUpperCase();
  }

  private synchronizeDoorConnections(
    squares: Record<string, Square>
  ): Record<string, Square> {
    const synchronizedSquares = Object.entries(squares).reduce<Record<string, Square>>(
      (accumulator, [squareKey, square]) => {
        accumulator[squareKey] = { ...square };
        return accumulator;
      },
      {}
    );

    for (const squareKey of Object.keys(synchronizedSquares)) {
      const square = synchronizedSquares[squareKey];

      for (const sideRule of SIDE_RULES) {
        if (sideRule.side === 'toTop' || sideRule.side === 'toLeft') {
          continue;
        }

        const neighborRow = square.row + sideRule.neighborRowOffset;
        const neighborColumn = square.column + sideRule.neighborColumnOffset;
        const neighborKey = this.getSquareKey(neighborRow, neighborColumn);
        const neighborSquare = synchronizedSquares[neighborKey];
        if (!neighborSquare) {
          continue;
        }

        const currentConnection = synchronizedSquares[squareKey][sideRule.side];
        const neighborConnection = neighborSquare[sideRule.oppositeSide];
        const currentDoor = this.isDoorConnection(currentConnection) ? currentConnection : null;
        const neighborDoor = this.isDoorConnection(neighborConnection) ? neighborConnection : null;
        if (!currentDoor && !neighborDoor) {
          continue;
        }

        const sharedDoor = currentDoor ?? neighborDoor;
        if (!sharedDoor) {
          continue;
        }

        if (synchronizedSquares[squareKey][sideRule.side] !== sharedDoor) {
          synchronizedSquares[squareKey] = this.withSquareSide(
            synchronizedSquares[squareKey],
            sideRule.side,
            sharedDoor
          );
        }

        if (synchronizedSquares[neighborKey][sideRule.oppositeSide] !== sharedDoor) {
          synchronizedSquares[neighborKey] = this.withSquareSide(
            synchronizedSquares[neighborKey],
            sideRule.oppositeSide,
            sharedDoor
          );
        }
      }
    }

    return synchronizedSquares;
  }

  private withSquareSide(
    square: Square,
    side: SquareSide,
    value: Door | Wall | null
  ): Square {
    return {
      ...square,
      [side]: value,
    };
  }

  private isWallConnection(connection: Door | Wall | null): connection is Wall {
    return connection !== null && !('keyLock' in connection);
  }

  private isDoorConnection(connection: Door | Wall | null): connection is Door {
    return connection !== null && 'keyLock' in connection;
  }

  private getSquareKey(row: number, column: number): string {
    return `${row}:${column}`;
  }

  private loadDungonJsonState(dungonId: number, rawDungonJson: unknown): void {
    const parsed = this.parseDungonJsonPayload(rawDungonJson);

    this.filledSquaresByDungon.update((allSquares) => ({
      ...allSquares,
      [dungonId]: parsed.filledSquares,
    }));

    this.squaresByDungon.update((allSquares) => ({
      ...allSquares,
      [dungonId]: parsed.squares,
    }));

    this.cheaterByDungon.update((allCheaters) => ({
      ...allCheaters,
      [dungonId]: (() => {
        // For main-game dungons, load the PC-specific cheater if one exists
        if (this.isMainGame()) {
          const pcId = this.currentPcId_();
          if (pcId !== null && parsed.cheaterByPcId[pcId]) {
            return parsed.cheaterByPcId[pcId];
          }
        }
        return parsed.cheater;
      })(),
    }));

    this.cheaterByPcId_.set(parsed.cheaterByPcId);

    this.startPointByDungon.update((allStartPoints) => ({
      ...allStartPoints,
      [dungonId]: parsed.startpoint,
    }));

    this.tresherListByDungon.update((allTreshers) => ({
      ...allTreshers,
      [dungonId]: parsed.tresherList,
    }));

    this.tresherPlacementsByDungon.update((allPlacements) => ({
      ...allPlacements,
      [dungonId]: parsed.tresherPlacements,
    }));

    this.monsterListByDungon.update((allMonsters) => ({
      ...allMonsters,
      [dungonId]: parsed.monsterList,
    }));

    this.monsterPlacementsByDungon.update((allPlacements) => ({
      ...allPlacements,
      [dungonId]: parsed.monsterPlacements,
    }));

    this.squareTextsByDungon.update((allTexts) => ({
      ...allTexts,
      [dungonId]: parsed.squareTexts ?? [],
    }));

    this.exitsByDungon.update((allExits) => ({
      ...allExits,
      [dungonId]: parsed.exits,
    }));

    this.setPcInventoryInitialized(dungonId, parsed.pcInventoryInitialized);

    this.floorTrapPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.floorTrapPlacements,
    }));

    this.obstaclePlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.obstaclePlacements,
    }));

    this.floorItemPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.itemPlacements,
    }));

    this.floorPotionPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.potionPlacements,
    }));

    this.floorSpellPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.spellPlacements,
    }));

    this.floorItemListByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.floorItemList,
    }));

    this.floorPotionListByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.floorPotionList,
    }));

    this.floorSpellListByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.floorSpellList,
    }));

    this.collectedFloorItemsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.collectedFloorItems,
    }));

    this.collectedFloorPotionsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.collectedFloorPotions,
    }));

    this.collectedFloorSpellsByDungon.update((all) => ({
      ...all,
      [dungonId]: parsed.collectedFloorSpells,
    }));

    if (parsed.collectedFloorSpells.length > 0 || parsed.floorSpellList.length > 0) {
      this.pcTresherSpellsById.update((map) => {
        const updated = new Map(map);
        for (const spell of parsed.floorSpellList) {
          updated.set(spell.id, spell);
        }
        for (const spell of parsed.collectedFloorSpells) {
          updated.set(spell.id, spell);
        }
        return updated;
      });
    }

    // Ensure collected floor items are in the item lookup map so the equip system can resolve them
    if (parsed.collectedFloorItems.length > 0) {
      this.pcTresherItemsById.update((map) => {
        const updated = new Map(map);
        for (const it of parsed.collectedFloorItems) {
          updated.set(it.id, { ...it, effectValue: it.effectValue ?? 0 });
        }
        return updated;
      });
    }

    this.keyList = parsed.keyList;

    const monsterHeldKeyIds = new Set(
      parsed.monsterList.flatMap((m) => m.keyIds ?? [])
    );
    const aliveMonsterIds = new Set(
      parsed.monsterPlacements
        .filter((p) => !p.isDead)
        .map((p) => p.monsterId)
    );
    const aliveHeldKeyIds = new Set(
      parsed.monsterList
        .filter((m) => aliveMonsterIds.has(m.id))
        .flatMap((m) => m.keyIds ?? [])
    );
    if (aliveHeldKeyIds.size > 0) {
      this.keyList = this.keyList.map((key) =>
        aliveHeldKeyIds.has(key.id)
          ? { ...key, rownId: null, columnId: null }
          : key
      );
    }

    this.npcTradesPurchased.set(parsed.npcTradesPurchased);

    this.savedCombatState = {
      playerHp: parsed.savedPlayerHp,
      playerAE: parsed.savedPlayerAE,
      turnPhase: parsed.savedTurnPhase,
      playerRow: parsed.savedPlayerRow,
      playerColumn: parsed.savedPlayerColumn,
    };
  }

  private parseDungonJsonPayload(rawDungonJson: unknown): {
    filledSquares: Record<string, true>;
    squares: Record<string, Square>;
    keyList: Key[];
    cheater: Cheater;
    startpoint: StartPoint | null;
    tresherList: Tresher[];
    tresherPlacements: TresherPlacement[];
    monsterList: Monster[];
    monsterPlacements: MonsterPlacement[];
    squareTexts: SquareText[];
    exits: DungonExit[];
    floorTrapPlacements: FloorTrapPlacement[];
    obstaclePlacements: ObstaclePlacement[];
    itemPlacements: ItemPlacement[];
    potionPlacements: PotionPlacement[];
    spellPlacements: SpellPlacement[];
    floorItemList: Array<{ id: number; name: string; description: string; type: string; effectValue: number; damage: number; range: number; armorSlot: string | null; effectOn: string | null; weaponEffectType?: string; weaponEffectColor?: string; isTwoHanded: boolean }>;
    floorPotionList: Array<{ id: number; name: string; description: string; effectTo: string; effectAmount: number; lastFor: number }>;
    floorSpellList: PcTresherSpellData[];
    collectedFloorItems: Array<{ id: number; name: string; description: string; type: string; effectValue: number; damage: number; range: number; armorSlot: string | null; effectOn: string | null; weaponEffectType?: string; weaponEffectColor?: string; isTwoHanded: boolean }>;
    collectedFloorPotions: Array<{ id: number; name: string; description: string; effectTo: string; effectAmount: number; lastFor: number }>;
    collectedFloorSpells: PcTresherSpellData[];
    pcInventoryInitialized: boolean;
    savedPlayerHp: number | null;
    savedPlayerAE: number | null;
    savedTurnPhase: TurnPhase | null;
    savedPlayerRow: number | null;
    savedPlayerColumn: number | null;
    npcTradesPurchased: number[];
    cheaterByPcId: Record<number, Cheater>;
  } {
    if (!rawDungonJson || typeof rawDungonJson !== 'object') {
      return {
        filledSquares: {},
        squares: {},
        keyList: [],
        cheater: { ...DEFAULT_CHEATER },
        startpoint: null,
        tresherList: [],
        tresherPlacements: [],
        monsterList: [],
        monsterPlacements: [],
        squareTexts: [],
        exits: [],
        floorTrapPlacements: [],
        obstaclePlacements: [],
        itemPlacements: [],
        potionPlacements: [],
        spellPlacements: [],
        floorItemList: [],
        floorPotionList: [],
        floorSpellList: [],
        collectedFloorItems: [],
        collectedFloorPotions: [],
        collectedFloorSpells: [],
        pcInventoryInitialized: false,
        savedPlayerHp: null,
        savedPlayerAE: null,
        savedTurnPhase: null,
        savedPlayerRow: null,
        savedPlayerColumn: null,
        npcTradesPurchased: [],
        cheaterByPcId: {},
      };
    }

    const source = rawDungonJson as {
      filledSquares?: unknown;
      squares?: unknown;
      keyList?: unknown[];
      cheater?: unknown;
      startpoint?: unknown;
      startPoint?: unknown;
      tresherList?: unknown[];
      trasherList?: unknown[];
      tresher?: unknown[];
      tresherPlacements?: unknown[];
      tresherPlacementList?: unknown[];
      trasherPlacements?: unknown[];
      monsterList?: unknown[];
      monsters?: unknown[];
      monsterPlacements?: unknown[];
      monsterPlacementList?: unknown[];
      squareTexts?: unknown[];
      pcInventoryInitialized?: unknown;
      playerHp?: unknown;
      playerAE?: unknown;
      turnPhase?: unknown;
      playerRow?: unknown;
      playerColumn?: unknown;
      exits?: unknown[];
      exitList?: unknown[];
      floorTrapPlacements?: unknown[];
      obstaclePlacements?: unknown[];
      itemPlacements?: unknown[];
      potionPlacements?: unknown[];
      spellPlacements?: unknown[];
      floorItemList?: unknown[];
      floorPotionList?: unknown[];
      floorSpellList?: unknown[];
      spellList?: unknown[];
      collectedFloorItems?: unknown[];
      collectedFloorPotions?: unknown[];
      collectedFloorSpells?: unknown[];
      npcTradesPurchased?: unknown[];
      cheaterByPcId?: unknown;
    };

    const filledSquaresSource =
      source.filledSquares && typeof source.filledSquares === 'object'
        ? (source.filledSquares as Record<string, unknown>)
        : {};
    const filledSquares = Object.keys(filledSquaresSource).reduce<Record<string, true>>(
      (accumulator, key) => {
        if (Boolean(filledSquaresSource[key])) {
          accumulator[key] = true;
        }

        return accumulator;
      },
      {}
    );

    const rawSquares =
      source.squares && typeof source.squares === 'object'
        ? (source.squares as Record<string, Square>)
        : {};
    const squares = this.synchronizeDoorConnections(rawSquares);

    const keyList = Array.isArray(source.keyList)
      ? source.keyList
          .map((item) => {
            if (!item || typeof item !== 'object') {
              return null;
            }

            const sourceKey = item as Partial<Key>;
            if (typeof sourceKey.id !== 'number') {
              return null;
            }

            return {
              id: sourceKey.id,
              name: typeof sourceKey.name === 'string' ? sourceKey.name : '',
              description:
                typeof sourceKey.description === 'string' ? sourceKey.description : '',
              doorId: typeof sourceKey.doorId === 'number' ? sourceKey.doorId : null,
              rownId: typeof sourceKey.rownId === 'number' ? sourceKey.rownId : null,
              columnId: typeof sourceKey.columnId === 'number' ? sourceKey.columnId : null,
            } as Key;
          })
          .filter((item): item is Key => item !== null)
      : [];

    const sourceCheater =
      source.cheater && typeof source.cheater === 'object'
        ? (source.cheater as Partial<Cheater> & {
            inventory?: unknown;
            inventoryKeys?: unknown[];
            inventoryTreshers?: unknown[];
          })
        : {};

    const inventory = this.dungeonJsonService.parseCheaterInventory(sourceCheater);
    const cheater: Cheater = {
      name:
        typeof sourceCheater.name === 'string' && sourceCheater.name.trim()
          ? sourceCheater.name
          : DEFAULT_CHEATER.name,
      rangeOfSight:
        typeof sourceCheater.rangeOfSight === 'number' && Number.isFinite(sourceCheater.rangeOfSight)
          ? sourceCheater.rangeOfSight
          : DEFAULT_CHEATER.rangeOfSight,
      facingDir: this.normalizeFacingDirection(sourceCheater.facingDir),
      inventory,
    };

    const sourceStartPointRaw =
      source.startpoint && typeof source.startpoint === 'object'
        ? source.startpoint
        : source.startPoint && typeof source.startPoint === 'object'
          ? source.startPoint
          : null;

    let startpoint: StartPoint | null = null;
    if (sourceStartPointRaw) {
      const sourceStartPoint = sourceStartPointRaw as Partial<StartPoint>;
      const parsedRow =
        typeof sourceStartPoint.row === 'number' && Number.isFinite(sourceStartPoint.row)
          ? Math.floor(sourceStartPoint.row)
          : null;
      const parsedCol =
        typeof sourceStartPoint.col === 'number' && Number.isFinite(sourceStartPoint.col)
          ? Math.floor(sourceStartPoint.col)
          : null;

      if (parsedRow !== null && parsedCol !== null) {
        startpoint = {
          row: parsedRow,
          col: parsedCol,
          description:
            typeof sourceStartPoint.description === 'string'
              ? sourceStartPoint.description
              : '',
          playerSees:
            typeof sourceStartPoint.playerSees === 'string'
              ? sourceStartPoint.playerSees
              : '',
        };
      }
    }

    const sourceTresherList =
      Array.isArray(source.tresherList)
        ? source.tresherList
        : Array.isArray(source.trasherList)
          ? source.trasherList
          : Array.isArray(source.tresher)
            ? source.tresher
            : [];

    const tresherList = sourceTresherList
      .map((item) => this.dungeonJsonService.parseTresherItem(item))
      .filter((item): item is Tresher => item !== null);

    const sourceTresherPlacements = Array.isArray(source.tresherPlacements)
      ? source.tresherPlacements
      : Array.isArray(source.tresherPlacementList)
        ? source.tresherPlacementList
        : Array.isArray(source.trasherPlacements)
          ? source.trasherPlacements
          : [];

    const validTresherIds = new Set(tresherList.map((tresher) => tresher.id));
    const tresherPlacements = sourceTresherPlacements
      .map((item) => this.dungeonJsonService.parseTresherPlacementItem(item))
      .filter(
        (item): item is TresherPlacement => item !== null && validTresherIds.has(item.tresherId)
      );

    const sourceMonsterList = Array.isArray(source.monsterList)
      ? source.monsterList
      : Array.isArray(source.monsters)
        ? source.monsters
        : [];

    const monsterList = sourceMonsterList
      .map((item) => this.parseMonsterItem(item))
      .filter((item): item is Monster => item !== null);

    const sourceMonsterPlacements = Array.isArray(source.monsterPlacements)
      ? source.monsterPlacements
      : Array.isArray(source.monsterPlacementList)
        ? source.monsterPlacementList
        : [];

    const validMonsterIds = new Set(monsterList.map((monster) => monster.id));
    const monsterPlacements = sourceMonsterPlacements
      .map((item) => this.parseMonsterPlacementItem(item))
      .filter(
        (item): item is MonsterPlacement => item !== null && validMonsterIds.has(item.monsterId)
      );

    const savedPlayerHpRaw = this.toFiniteNumber(source.playerHp);
    const savedPlayerAERaw = this.toFiniteNumber(source.playerAE);
    const savedTurnPhaseRaw = source.turnPhase;
    const savedTurnPhase: TurnPhase | null =
      savedTurnPhaseRaw === 'player' || savedTurnPhaseRaw === 'monsters' || savedTurnPhaseRaw === 'gameover'
        ? savedTurnPhaseRaw
        : null;

    const savedPlayerRow = this.toFiniteNumber(source.playerRow);
    const savedPlayerColumn = this.toFiniteNumber(source.playerColumn);
    const pcInventoryInitialized =
      source.pcInventoryInitialized === true ||
      savedPlayerHpRaw !== null ||
      savedPlayerAERaw !== null ||
      savedTurnPhase !== null ||
      savedPlayerRow !== null ||
      savedPlayerColumn !== null;

    const squareTexts: SquareText[] = Array.isArray(source.squareTexts)
      ? source.squareTexts
          .filter(
            (item): item is Record<string, unknown> =>
              !!item && typeof item === 'object'
          )
          .map((item) => ({
            id: Math.max(0, Math.floor(Number(item['id']) || 0)),
            row: Math.max(0, Math.floor(Number(item['row']) || 0)),
            column: Math.max(0, Math.floor(Number(item['column']) || 0)),
            text: typeof item['text'] === 'string' ? item['text'] : '',
            wallSide: normalizeSquareTextWallSide(item['wallSide']),
          }))
          .filter((st) => st.text.trim().length > 0)
      : [];

    const sourceExits = Array.isArray(source.exits)
      ? source.exits
      : Array.isArray(source.exitList)
        ? source.exitList
        : [];
    const exits: DungonExit[] = sourceExits
      .map((item) => this.parseExitItem(item))
      .filter((item): item is DungonExit => item !== null);

    const floorTrapPlacements = this.dungeonJsonService.parseFloorTrapPlacements(source.floorTrapPlacements);
    const obstaclePlacements = this.dungeonJsonService.parseObstaclePlacements(source.obstaclePlacements);

    const itemPlacements: ItemPlacement[] = Array.isArray(source.itemPlacements)
      ? source.itemPlacements
          .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
          .map((x) => {
            const itemId = typeof x['itemId'] === 'number' ? x['itemId'] : null;
            const row = typeof x['row'] === 'number' ? Math.floor(x['row']) : null;
            const column = typeof x['column'] === 'number' ? Math.floor(x['column']) : null;
            if (itemId === null || row === null || column === null) return null;
            return { itemId, row, column } as ItemPlacement;
          })
          .filter((x): x is ItemPlacement => x !== null)
      : [];

    const potionPlacements: PotionPlacement[] = Array.isArray(source.potionPlacements)
      ? source.potionPlacements
          .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
          .map((x) => {
            const potionId = typeof x['potionId'] === 'number' ? x['potionId'] : null;
            const row = typeof x['row'] === 'number' ? Math.floor(x['row']) : null;
            const column = typeof x['column'] === 'number' ? Math.floor(x['column']) : null;
            if (potionId === null || row === null || column === null) return null;
            return { potionId, row, column } as PotionPlacement;
          })
          .filter((x): x is PotionPlacement => x !== null)
      : [];

    const spellPlacements: SpellPlacement[] = Array.isArray(source.spellPlacements)
      ? source.spellPlacements
          .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
          .map((x) => {
            const spellId = typeof x['spellId'] === 'number' ? x['spellId'] : null;
            const row = typeof x['row'] === 'number' ? Math.floor(x['row']) : null;
            const column = typeof x['column'] === 'number' ? Math.floor(x['column']) : null;
            if (spellId === null || row === null || column === null) return null;
            return { spellId, row, column } as SpellPlacement;
          })
          .filter((x): x is SpellPlacement => x !== null)
      : [];

    const floorItemList: Array<{ id: number; name: string; description: string; type: string; effectValue: number; damage: number; range: number; armorSlot: string | null; effectOn: string | null; weaponEffectType?: string; weaponEffectColor?: string; isTwoHanded: boolean }> =
      Array.isArray(source.floorItemList)
        ? source.floorItemList
            .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
            .map((x) => {
              const id = typeof x['id'] === 'number' ? x['id'] : null;
              if (id === null) return null;
              return {
                id,
                name: typeof x['name'] === 'string' ? x['name'] : '',
                description: typeof x['description'] === 'string' ? x['description'] : '',
                type: typeof x['type'] === 'string' ? x['type'] : 'other',
                effectValue: typeof x['effectValue'] === 'number' ? x['effectValue'] : 0,
                damage: typeof x['damage'] === 'number' ? x['damage'] : 6,
                range: typeof x['range'] === 'number' ? Math.max(1, x['range']) : 1,
                armorSlot: typeof x['armorSlot'] === 'string' ? x['armorSlot'] : null,
                effectOn: typeof x['effectOn'] === 'string' ? x['effectOn'] : null,
                weaponEffectType: typeof x['weaponEffectType'] === 'string' ? x['weaponEffectType'] : 'Blood',
                weaponEffectColor: typeof x['weaponEffectColor'] === 'string' ? x['weaponEffectColor'] : '#cc0000',
                isTwoHanded: x['isTwoHanded'] === true,
              };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
        : [];

    const floorPotionList: Array<{ id: number; name: string; description: string; effectTo: string; effectAmount: number; lastFor: number }> =
      Array.isArray(source.floorPotionList)
        ? source.floorPotionList
            .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
            .map((x) => {
              const id = typeof x['id'] === 'number' ? x['id'] : null;
              if (id === null) return null;
              return {
                id,
                name: typeof x['name'] === 'string' ? x['name'] : '',
                description: typeof x['description'] === 'string' ? x['description'] : '',
                effectTo: typeof x['effectTo'] === 'string' ? x['effectTo'] : 'HP',
                effectAmount: typeof x['effectAmount'] === 'number' ? x['effectAmount'] : 0,
                lastFor: typeof x['lastFor'] === 'number' ? Math.max(0, x['lastFor']) : 0,
              };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
        : [];

    const npcTradesPurchased: number[] = Array.isArray(source.npcTradesPurchased)
      ? source.npcTradesPurchased.filter((x): x is number => typeof x === 'number')
      : [];

    const parseItemArray = (raw: unknown[]): Array<{ id: number; name: string; description: string; type: string; effectValue: number; damage: number; range: number; armorSlot: string | null; effectOn: string | null; weaponEffectType?: string; weaponEffectColor?: string; isTwoHanded: boolean }> =>
      raw
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((x) => {
          const id = typeof x['id'] === 'number' ? x['id'] : null;
          if (id === null) return null;
          return {
            id,
            name: typeof x['name'] === 'string' ? x['name'] : '',
            description: typeof x['description'] === 'string' ? x['description'] : '',
            type: typeof x['type'] === 'string' ? x['type'] : 'other',
            effectValue: typeof x['effectValue'] === 'number' ? x['effectValue'] : 0,
            damage: typeof x['damage'] === 'number' ? x['damage'] : 6,
            range: typeof x['range'] === 'number' ? Math.max(1, x['range']) : 1,
            armorSlot: typeof x['armorSlot'] === 'string' ? x['armorSlot'] : null,
            effectOn: typeof x['effectOn'] === 'string' ? x['effectOn'] : null,
            weaponEffectType: typeof x['weaponEffectType'] === 'string' ? x['weaponEffectType'] : 'Blood',
            weaponEffectColor: typeof x['weaponEffectColor'] === 'string' ? x['weaponEffectColor'] : '#cc0000',
            isTwoHanded: x['isTwoHanded'] === true,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

    const parsePotionArray = (raw: unknown[]): Array<{ id: number; name: string; description: string; effectTo: string; effectAmount: number; lastFor: number }> =>
      raw
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((x) => {
          const id = typeof x['id'] === 'number' ? x['id'] : null;
          if (id === null) return null;
          return {
            id,
            name: typeof x['name'] === 'string' ? x['name'] : '',
            description: typeof x['description'] === 'string' ? x['description'] : '',
            effectTo: typeof x['effectTo'] === 'string' ? x['effectTo'] : 'HP',
            effectAmount: typeof x['effectAmount'] === 'number' ? x['effectAmount'] : 0,
            lastFor: typeof x['lastFor'] === 'number' ? Math.max(0, x['lastFor']) : 0,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

    const parseSpellArray = (raw: unknown[]): PcTresherSpellData[] =>
      raw
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((x) => {
          const id = typeof x['id'] === 'number' ? x['id'] : null;
          if (id === null) return null;
          return {
            id,
            name: typeof x['name'] === 'string' ? x['name'] : '',
            description: typeof x['description'] === 'string' ? x['description'] : '',
            range: typeof x['range'] === 'number' ? x['range'] : 1,
            effectOn: typeof x['effectOn'] === 'string' ? x['effectOn'] : 'HP',
            effectAmount: typeof x['effectAmount'] === 'number' ? x['effectAmount'] : 0,
            successTestValue: typeof x['successTestValue'] === 'number' ? x['successTestValue'] : 0,
            sp: typeof x['sp'] === 'number' ? x['sp'] : 0,
            lastFor: typeof x['lastFor'] === 'number' ? x['lastFor'] : 0,
            numberOfTargets: typeof x['numberOfTargets'] === 'number' ? Math.max(1, x['numberOfTargets']) : 1,
            magicCost: typeof x['magicCost'] === 'number' ? Math.max(1, x['magicCost']) : 1,
          } as PcTresherSpellData;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

    const floorSpellList: PcTresherSpellData[] = Array.isArray(source.floorSpellList)
      ? parseSpellArray(source.floorSpellList)
      : Array.isArray(source.spellList)
        ? parseSpellArray(source.spellList)
        : [];

    const collectedFloorItems = Array.isArray(source.collectedFloorItems) ? parseItemArray(source.collectedFloorItems) : [];
    const collectedFloorPotions = Array.isArray(source.collectedFloorPotions) ? parsePotionArray(source.collectedFloorPotions) : [];
    const collectedFloorSpells = Array.isArray(source.collectedFloorSpells) ? parseSpellArray(source.collectedFloorSpells) : [];

    const cheaterByPcId: Record<number, Cheater> = {};
    if (source.cheaterByPcId && typeof source.cheaterByPcId === 'object') {
      for (const [key, val] of Object.entries(source.cheaterByPcId as Record<string, unknown>)) {
        const pcId = Number(key);
        if (!Number.isInteger(pcId) || pcId <= 0 || !val || typeof val !== 'object') continue;
        const raw = val as Partial<Cheater> & { inventory?: unknown };
        cheaterByPcId[pcId] = {
          name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : DEFAULT_CHEATER.name,
          rangeOfSight: typeof raw.rangeOfSight === 'number' && Number.isFinite(raw.rangeOfSight) ? raw.rangeOfSight : DEFAULT_CHEATER.rangeOfSight,
          facingDir: this.normalizeFacingDirection(raw.facingDir),
          inventory: this.dungeonJsonService.parseCheaterInventory(raw),
        };
      }
    }

    return {
      filledSquares,
      squares,
      keyList,
      cheater,
      startpoint,
      tresherList,
      tresherPlacements,
      monsterList,
      monsterPlacements,
      squareTexts,
      exits,
      floorTrapPlacements,
      obstaclePlacements,
      itemPlacements,
      potionPlacements,
      spellPlacements,
      floorItemList,
      floorPotionList,
      floorSpellList,
      collectedFloorItems,
      collectedFloorPotions,
      collectedFloorSpells,
      pcInventoryInitialized,
      savedPlayerHp: savedPlayerHpRaw,
      savedPlayerAE: savedPlayerAERaw,
      savedTurnPhase: savedTurnPhase,
      savedPlayerRow: savedPlayerRow !== null ? Math.floor(savedPlayerRow) : null,
      savedPlayerColumn: savedPlayerColumn !== null ? Math.floor(savedPlayerColumn) : null,
      npcTradesPurchased,
      cheaterByPcId,
    };
  }

  private parseMonsterItem(item: unknown): Monster | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const source = item as Partial<Monster> & {
      movement_economy?: unknown;
      run_at?: unknown;
      number_of_attacks?: unknown;
    };

    const parsedId = this.toFiniteNumber(source.id);
    if (parsedId === null) {
      return null;
    }

    return {
      id: Math.max(0, Math.floor(parsedId)),
      imageId: typeof source.imageId === 'number' ? source.imageId : null,
      tresherIds: Array.isArray(source.tresherIds)
        ? source.tresherIds
            .map((val) => this.toFiniteNumber(val))
            .filter((val): val is number => val !== null)
        : [],
      keyIds: Array.isArray(source.keyIds)
        ? source.keyIds
            .map((val) => this.toFiniteNumber(val))
            .filter((val): val is number => val !== null)
        : [],
      name: typeof source.name === 'string' && source.name.trim() ? source.name : 'Unnamed Monster',
      type: typeof source.type === 'string' ? source.type : 'Unknown',
      description: typeof source.description === 'string' ? source.description : '',
      hp: Math.max(1, this.normalizeNumber(this.toFiniteNumber(source.hp), 1)),
      movementEconomy: Math.max(
        0,
        this.normalizeNumber(
          this.toFiniteNumber(source.movementEconomy ?? source.movement_economy),
          0
        )
      ),
      ac: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.ac), 10)),
      runAt: Math.max(
        0,
        this.normalizeNumber(this.toFiniteNumber(source.runAt ?? source.run_at), 0)
      ),
      numberOfAttacks: Math.max(
        0,
        this.normalizeNumber(
          this.toFiniteNumber(source.numberOfAttacks ?? source.number_of_attacks),
          1
        )
      ),
      attacks: this.normalizeMonsterAttacks(source.attacks),
      spReward: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.spReward), 0)),
      soundId: typeof source.soundId === 'number' ? source.soundId : null,
      magic: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.magic), 0)),
      magicResistance: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.magicResistance), 0)),
      callsReinforcements: (source as Record<string, unknown>)['callsReinforcements'] === true,
      toHitPlusNeeded: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.toHitPlusNeeded), 0)),
      npcGreeting: typeof source.npcGreeting === 'string' && source.npcGreeting.trim() ? source.npcGreeting : null,
      npcInfo1: typeof source.npcInfo1 === 'string' && source.npcInfo1.trim() ? source.npcInfo1 : null,
      npcInfo2: typeof source.npcInfo2 === 'string' && source.npcInfo2.trim() ? source.npcInfo2 : null,
      npcInfo3: typeof source.npcInfo3 === 'string' && source.npcInfo3.trim() ? source.npcInfo3 : null,
      npcOnlyAttackWhenAttacked: (source as Record<string, unknown>)['npcOnlyAttackWhenAttacked'] === true,
      npcGivesInfoAfterDamaged: (source as Record<string, unknown>)['npcGivesInfoAfterDamaged'] === true,
      npcAttacksAfterInfo: (source as Record<string, unknown>)['npcAttacksAfterInfo'] === true,
      npcCanTrade: (source as Record<string, unknown>)['npcCanTrade'] === true,
    };
  }

  private parseMonsterPlacementItem(item: unknown): MonsterPlacement | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const source = item as Partial<MonsterPlacement> & {
      monsterID?: unknown;
      monster_id?: unknown;
      rownId?: unknown;
      columnId?: unknown;
      col?: unknown;
      isRoaming?: unknown;
      rome?: unknown;
      tresherIds?: unknown;
      keyIds?: unknown;
    };

    const monsterIdRaw =
      source.monsterId !== undefined
        ? source.monsterId
        : source.monsterID !== undefined
          ? source.monsterID
          : source.monster_id;
    const rowRaw = source.row !== undefined ? source.row : source.rownId;
    const columnRaw =
      source.column !== undefined
        ? source.column
        : source.columnId !== undefined
          ? source.columnId
          : source.col;
    const roamRaw =
      source.roam !== undefined
        ? source.roam
        : source.isRoaming !== undefined
          ? source.isRoaming
          : source.rome;

    const monsterId = this.toFiniteNumber(monsterIdRaw);
    const row = this.toFiniteNumber(rowRaw);
    const column = this.toFiniteNumber(columnRaw);
    if (monsterId === null || row === null || column === null) {
      return null;
    }

    const result: MonsterPlacement = {
      monsterId: Math.max(0, Math.floor(monsterId)),
      row: Math.floor(row),
      column: Math.floor(column),
      roam: roamRaw === true,
    };

    if (source.isDead === true) {
      result.isDead = true;
    }
    const savedHp = this.toFiniteNumber(source.currentHp);
    if (savedHp !== null) {
      result.currentHp = savedHp;
    }
    if (Array.isArray(source.tresherIds)) {
      result.tresherIds = source.tresherIds
        .map((v) => this.toFiniteNumber(v))
        .filter((v): v is number => v !== null)
        .map((v) => Math.max(0, Math.floor(v)));
    }
    if (Array.isArray(source.keyIds)) {
      result.keyIds = source.keyIds
        .map((v) => this.toFiniteNumber(v))
        .filter((v): v is number => v !== null)
        .map((v) => Math.max(0, Math.floor(v)));
    }
    const rawItemIds = (source as Record<string, unknown>)['itemIds'];
    if (Array.isArray(rawItemIds)) {
      result.itemIds = rawItemIds
        .map((v) => this.toFiniteNumber(v))
        .filter((v): v is number => v !== null)
        .map((v) => Math.max(0, Math.floor(v)));
    }
    const rawSpellIds = (source as Record<string, unknown>)['spellIds'];
    if (Array.isArray(rawSpellIds)) {
      result.spellIds = rawSpellIds
        .map((v) => this.toFiniteNumber(v))
        .filter((v): v is number => v !== null)
        .map((v) => Math.max(0, Math.floor(v)));
    }
    const rawPotionIds = (source as Record<string, unknown>)['potionIds'];
    if (Array.isArray(rawPotionIds)) {
      result.potionIds = rawPotionIds
        .map((v) => this.toFiniteNumber(v))
        .filter((v): v is number => v !== null)
        .map((v) => Math.max(0, Math.floor(v)));
    }
    const gold = this.toFiniteNumber((source as Record<string, unknown>)['gold']);
    if (gold !== null && gold > 0) result.gold = Math.max(0, Math.floor(gold));
    const silver = this.toFiniteNumber((source as Record<string, unknown>)['silver']);
    if (silver !== null && silver > 0) result.silver = Math.max(0, Math.floor(silver));
    const copper = this.toFiniteNumber((source as Record<string, unknown>)['copper']);
    if (copper !== null && copper > 0) result.copper = Math.max(0, Math.floor(copper));
    const zinc = this.toFiniteNumber((source as Record<string, unknown>)['zinc']);
    if (zinc !== null && zinc > 0) result.zinc = Math.max(0, Math.floor(zinc));
    const weaponItemId = this.toFiniteNumber((source as Record<string, unknown>)['weaponItemId']);
    if (weaponItemId !== null) result.weaponItemId = Math.max(0, Math.floor(weaponItemId));

    if (source.isDormant === true) {
      result.isDormant = true;
    }
    const guardRow = this.toFiniteNumber((source as Record<string, unknown>)['guardRow']);
    if (guardRow !== null) {
      result.guardRow = Math.floor(guardRow);
    }
    const guardColRaw = this.toFiniteNumber((source as Record<string, unknown>)['guardColumn']);
    if (guardColRaw !== null) {
      result.guardColumn = Math.floor(guardColRaw);
    }
    if ((source as Record<string, unknown>)['isStationary'] === true) {
      result.isStationary = true;
    }
    const stationaryTriggerRow = this.toFiniteNumber((source as Record<string, unknown>)['stationaryTriggerRow']);
    if (stationaryTriggerRow !== null) {
      result.stationaryTriggerRow = Math.floor(stationaryTriggerRow);
    }
    const stationaryTriggerCol = this.toFiniteNumber((source as Record<string, unknown>)['stationaryTriggerCol']);
    if (stationaryTriggerCol !== null) {
      result.stationaryTriggerCol = Math.floor(stationaryTriggerCol);
    }
    if ((source as Record<string, unknown>)['noAttackUnlessAttacked'] === true) {
      result.noAttackUnlessAttacked = true;
    }

    return result;
  }

  private normalizeMonsterAttacks(value: unknown): MonsterAttack[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const source = item as Partial<MonsterAttack> & { plus_to_hit?: unknown };
        return {
          type: typeof source.type === 'string' ? source.type : 'Weapon',
          description: typeof source.description === 'string' ? source.description : '',
          damage: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.damage), 0)),
          plusToHit: Math.max(
            0,
            this.normalizeNumber(this.toFiniteNumber(source.plusToHit ?? source.plus_to_hit), 0)
          ),
          weaponItemId: typeof source.weaponItemId === 'number' ? source.weaponItemId : null,
          spellId: typeof source.spellId === 'number' ? source.spellId : null,
          curseId: typeof source.curseId === 'number' ? source.curseId : null,
        };
      })
      .filter((item): item is MonsterAttack => item !== null);
  }

  private normalizeCheaterInventory(
    inventory: CheaterInventory | null | undefined
  ): CheaterInventory {
    return this.inventoryService.normalizeCheaterInventory(inventory);
  }

  private getHealingPotionAmount(tresher: Tresher): number {
    return (tresher.type ?? 'OtherTresher') === 'Potion' ? 6 : 0;
  }

  private resolvePlayerMaxHp(value: unknown): number {
    const parsedValue = this.toFiniteNumber(value);
    if (parsedValue === null) {
      return 20;
    }

    return Math.max(1, Math.floor(parsedValue));
  }

  private resolvePlayerCurrentHp(value: unknown, maxHp: number): number {
    const parsedValue = this.toFiniteNumber(value);
    if (parsedValue === null) {
      return maxHp;
    }

    return Math.max(0, Math.min(Math.floor(parsedValue), maxHp));
  }

  private setPcInventoryInitialized(dungonId: number, isInitialized: boolean): void {
    this.inventoryService.setPcInventoryInitialized(dungonId, isInitialized);
  }

  private toFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private normalizeNumber(value: number | null, fallback: number): number {
    return value === null ? fallback : value;
  }

  private normalizeNullableNumber(value: number | null): number | null {
    if (value === null) {
      return null;
    }

    return Math.floor(value);
  }

  private parseExitItem(item: unknown): DungonExit | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const source = item as Partial<DungonExit> & {
      col?: unknown;
      destinationDungonID?: unknown;
      exitType?: unknown;
    };

    const parsedId = this.toFiniteNumber(source.id);
    const row = this.toFiniteNumber(source.row);
    const column = this.toFiniteNumber(source.column ?? source.col);
    if (parsedId === null || row === null || column === null) {
      return null;
    }

    const destinationType: ExitDestinationType =
      source.destinationType === 'dungon' ? 'dungon' : 'outside';
    const destinationRaw =
      source.destinationDungonId !== undefined
        ? source.destinationDungonId
        : (source as unknown as Record<string, unknown>)['destinationDungonID'];
    const parsedDestination = this.normalizeNullableNumber(this.toFiniteNumber(destinationRaw));
    const transitionSource = source.transitionType ?? source.exitType;
    const transitionType: ExitTransitionType =
      transitionSource === 'stairsUp' || transitionSource === 'stairsDown' || transitionSource === 'open'
        ? transitionSource
        : 'open';

    return {
      id: Math.max(0, Math.floor(parsedId)),
      row: Math.floor(row),
      column: Math.floor(column),
      destinationType,
      destinationDungonId: destinationType === 'dungon' ? parsedDestination : null,
      transitionType,
      itemRequirement: this.parseExitItemRequirement((source as unknown as Record<string, unknown>)['itemRequirement']),
    };
  }

  private parseExitItemRequirement(raw: unknown): { itemId: number; itemName: string; consume: boolean } | null {
    if (!raw || typeof raw !== 'object') return null;
    const src = raw as Partial<Record<string, unknown>>;
    const itemId = typeof src['itemId'] === 'number' ? src['itemId'] : null;
    if (itemId === null) return null;
    return {
      itemId,
      itemName: typeof src['itemName'] === 'string' ? src['itemName'] : '',
      consume: src['consume'] === true,
    };
  }

  closeTavernModal(): void {
    this.showTavernModal.set(false);
    this.stopTavernMusic();
  }

  toggleMute(): void {
    const muted = !this.soundMuted();
    this.soundMuted.set(muted);
    localStorage.setItem('soundMuted', muted ? 'true' : 'false');
    if (muted) {
      this.stopTavernMusic();
    } else if (this.showTavernModal()) {
      this.startTavernMusic();
    }
  }

  openReportBug(): void {
    const username = this.account.getUsername() ?? '';
    this.bugReportUsername.set(username);
    this.bugReportMessage.set('');
    this.bugReportSuccess.set(false);
    this.bugReportError.set(null);
    this.showReportBugModal.set(true);
  }

  closeReportBug(): void {
    this.showReportBugModal.set(false);
  }

  submitBugReport(): void {
    const comment = this.bugReportMessage().trim();
    if (!comment) return;
    this.bugReportSubmitting.set(true);
    this.bugReportError.set(null);
    const username = this.bugReportUsername().trim() || 'Anonymous';
    const preview = this.gridPreviewContext();
    const gameJson = preview ? JSON.stringify(this.buildDungenJsonForSave(preview.dungonId), null, 2) : '{}';
    const message = `${comment}\n\n--- Game State ---\n${gameJson}`;
    this.http.post(`${API_BASE_URL}/contact`, {
      name: username,
      email: 'noreply@tdodj.com',
      problem: 'Report Bug',
      username,
      message,
    }).subscribe({
      next: () => {
        this.bugReportSubmitting.set(false);
        this.bugReportSuccess.set(true);
      },
      error: () => {
        this.bugReportSubmitting.set(false);
        this.bugReportError.set('Failed to send report. Please try again.');
      },
    });
  }

  private startTavernMusic(): void {
    if (this.soundMuted() || this.tavernMusicCtx) return;
    try {
      const ctx = new AudioContext();
      this.tavernMusicCtx = ctx;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.18, ctx.currentTime);
      masterGain.connect(ctx.destination);

      // Simple medieval tavern melody: pentatonic loop
      const bpm = 112;
      const beat = 60 / bpm;
      // Notes as frequencies: D4, F4, G4, A4, C5, D5
      const notes = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33, 392.0, 440.0,
                      349.23, 392.0, 329.63, 293.66, 349.23, 392.0, 440.0, 523.25];
      const durations = [1, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 1];

      const schedule = (loopOffset: number): void => {
        if (!this.tavernMusicCtx || this.soundMuted()) return;
        let t = ctx.currentTime + loopOffset;
        let totalDuration = 0;
        for (let i = 0; i < notes.length; i++) {
          const dur = durations[i] * beat;
          const osc = ctx.createOscillator();
          const env = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(notes[i], t);
          env.gain.setValueAtTime(0.001, t);
          env.gain.linearRampToValueAtTime(1, t + 0.02);
          env.gain.setValueAtTime(1, t + dur * 0.75);
          env.gain.linearRampToValueAtTime(0.001, t + dur * 0.98);
          osc.connect(env);
          env.connect(masterGain);
          osc.start(t);
          osc.stop(t + dur);
          t += dur;
          totalDuration += dur;
        }
        // Also add a simple drum/thump pulse on beats 1 & 3
        t = ctx.currentTime + loopOffset;
        for (let beat2 = 0; beat2 < totalDuration; beat2 += beat * 2) {
          const drum = ctx.createOscillator();
          const drumGain = ctx.createGain();
          drum.type = 'sine';
          drum.frequency.setValueAtTime(120, t + beat2);
          drum.frequency.exponentialRampToValueAtTime(40, t + beat2 + 0.08);
          drumGain.gain.setValueAtTime(0.6, t + beat2);
          drumGain.gain.exponentialRampToValueAtTime(0.001, t + beat2 + 0.12);
          drum.connect(drumGain);
          drumGain.connect(masterGain);
          drum.start(t + beat2);
          drum.stop(t + beat2 + 0.12);
        }
        // Schedule next loop
        setTimeout(() => schedule(0), totalDuration * 1000 - 100);
      };
      schedule(0);
    } catch { /* audio not supported */ }
  }

  private stopTavernMusic(): void {
    if (this.tavernMusicCtx) {
      try { this.tavernMusicCtx.close(); } catch { /* ignore */ }
      this.tavernMusicCtx = null;
    }
  }

  get currentUserKey(): string {
    return this.account.getKey() ?? '';
  }

  onTavernSpChanged(newSp: number): void {
    this.playerSp.set(newSp);
  }

  onTavernStatChanged(event: { stat: TavernStat; newValue: number }): void {
    if (event.stat === 'strength') this.playerStrength.set(event.newValue);
    if (event.stat === 'stamina') this.playerStamina.set(event.newValue);
    if (event.stat === 'mind') this.playerMind.set(event.newValue);
    if (event.stat === 'magicPower') this.playerMagicPower.set(event.newValue);
    if (event.stat === 'numberOfAttacks') this.playerNOA.set(event.newValue);
    if (event.stat === 'numberOfDefends') this.playerNOD.set(event.newValue);
  }

  onQuestItemsTurnedIn(tresherIds: number[]): void {
    const idSet = new Set(tresherIds);
    this.cheaterByDungon.update((allCheaters) => {
      const updated: Record<number, Cheater> = {};
      for (const [key, cheater] of Object.entries(allCheaters)) {
        const n = Number(key);
        updated[n] = {
          ...cheater,
          inventory: {
            ...cheater.inventory,
            treshers: cheater.inventory.treshers.filter((t) => !(t.isquest && idSet.has(t.id))),
          },
        };
      }
      return updated;
    });
    this.saveGameState();
  }

  onTavernTresherGoldChanged(event: { tresherId: number; newGold: number }): void {
    this.cheaterByDungon.update((allCheaters) => {
      const updated: Record<number, Cheater> = {};
      for (const [key, cheater] of Object.entries(allCheaters)) {
        const n = Number(key);
        updated[n] = {
          ...cheater,
          inventory: {
            ...cheater.inventory,
            treshers: cheater.inventory.treshers.map((t) =>
              t.id === event.tresherId ? { ...t, gold: event.newGold } : t
            ),
          },
        };
      }
      return updated;
    });
  }

  loadStash(): void {
    const userKey = this.account.getKey();
    if (!userKey) return;
    this.http
      .get<{ result: number; items: StashItem[] }>(`${API_BASE_URL}/tavern-stash`, { params: { userkey: userKey } })
      .subscribe({
        next: (res) => {
          if (res.result === 1 && Array.isArray(res.items)) {
            this.stashItems.set(res.items);
          }
        },
        error: () => { /* stash load failure is non-critical */ },
      });
  }

  onDepositToStash(items: Tresher[]): void {
    const userKey = this.account.getKey();
    if (!userKey || items.length === 0) return;

    // Optimistically remove items from cheater inventories
    const depositIds = new Set(items.map((t) => t.id));
    this.cheaterByDungon.update((allCheaters) => {
      const updated: Record<number, Cheater> = {};
      for (const [key, cheater] of Object.entries(allCheaters)) {
        const n = Number(key);
        const remaining: Tresher[] = [];
        const toRemoveCount: Record<number, number> = {};
        for (const id of depositIds) { toRemoveCount[id] = (toRemoveCount[id] ?? 0) + 1; }
        for (const t of cheater.inventory.treshers) {
          if (depositIds.has(t.id) && (toRemoveCount[t.id] ?? 0) > 0) {
            toRemoveCount[t.id]--;
          } else {
            remaining.push(t);
          }
        }
        updated[n] = { ...cheater, inventory: { ...cheater.inventory, treshers: remaining } };
      }
      return updated;
    });
    this.saveGameState();

    const stashItems = items.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      type: t.type ?? 'OtherTresher',
      gold: t.gold,
      silver: t.silver,
      copper: t.copper,
      zinc: t.zinc,
      spReward: t.spReward,
      imageId: t.imageId,
      soundId: t.soundId,
      isquest: t.isquest ?? false,
    }));

    this.http
      .post<{ result: number; items: StashItem[] }>(`${API_BASE_URL}/tavern-stash/deposit`, { userkey: userKey, items: stashItems })
      .subscribe({
        next: (res) => {
          if (res.result === 1 && Array.isArray(res.items)) {
            this.stashItems.set(res.items);
          }
        },
        error: () => { /* deposit failure — stash may be out of sync until next load */ },
      });
  }

  onResetMyProgress(): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const dungonId = preview.dungonId;
    this.cheaterByDungon.update((all) => {
      const next = { ...all };
      delete next[dungonId];
      return next;
    });
    this.saveGameState();
  }

  onWithdrawFromStash(itemIndexes: number[]): void {
    const userKey = this.account.getKey();
    if (!userKey || itemIndexes.length === 0) return;

    this.http
      .post<{ result: number; remaining: StashItem[]; withdrawn: StashItem[] }>(`${API_BASE_URL}/tavern-stash/withdraw`, { userkey: userKey, itemIndexes })
      .subscribe({
        next: (res) => {
          if (res.result === 1) {
            this.stashItems.set(res.remaining ?? []);
            // Add withdrawn items to the current dungeon's cheater inventory
            const preview = this.gridPreviewContext();
            if (!preview) return;
            const withdrawn: StashItem[] = res.withdrawn ?? [];
            if (withdrawn.length === 0) return;
            const newTreshers: Tresher[] = withdrawn.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              type: s.type,
              gold: s.gold,
              silver: s.silver,
              copper: s.copper,
              zinc: s.zinc,
              spReward: s.spReward,
              imageId: s.imageId,
              soundId: s.soundId,
              isquest: s.isquest,
              item1Id: null, item2Id: null, item3Id: null, item4Id: null,
              spell1Id: null, spell2Id: null, spell3Id: null, spell4Id: null,
              curse1Id: null, curse2Id: null,
              potion1Id: null, potion2Id: null, potion3Id: null,
              trap: null,
            }));
            const dungonId = preview.dungonId;
            const existingCheater = this.cheaterByDungon()[dungonId] ?? { ...DEFAULT_CHEATER };
            this.cheaterByDungon.update((allCheaters) => ({
              ...allCheaters,
              [dungonId]: {
                ...existingCheater,
                inventory: {
                  ...existingCheater.inventory,
                  treshers: [...existingCheater.inventory.treshers, ...newTreshers],
                },
              },
            }));
            this.saveGameState();
          }
        },
        error: () => { /* withdraw failure is non-critical */ },
      });
  }

  confirmExit(): void {
    const transitionType = this.pendingExitTransitionType();
    if (transitionType === null) return;
    this.pendingExitTransitionType.set(null);
    this.triggerDungonWin(transitionType);
  }

  cancelExit(): void {
    this.pendingExitTransitionType.set(null);
  }

  // ─── NPC dialog ───────────────────────────────────────────────────────────

  dismissNpcDialog(): void {
    this.npcDialog.set(null);
  }

  canTalkToNpc(): boolean {
    if (this.turnPhase() !== 'player') return false;
    const preview = this.gridPreviewContext();
    if (!preview) return false;
    const monstersById = this.getMonstersByIdForDungon(preview.dungonId);
    return this.monsterInstances().some((m) => {
      if (m.isDead || m.npcIsHostile) return false;
      const template = monstersById.get(m.monsterId);
      if (!template) return false;
      const isNpc =
        template.npcGreeting ||
        template.npcInfo1 ||
        template.npcInfo2 ||
        template.npcInfo3 ||
        template.npcCanTrade;
      if (!isNpc) return false;
      const dist = Math.max(
        Math.abs(m.row - preview.centerRow),
        Math.abs(m.column - preview.centerColumn)
      );
      return dist <= 1;
    });
  }

  talkToNpc(): void {
    if (!this.canTalkToNpc()) return;
    const preview = this.gridPreviewContext();
    if (!preview) return;
    const monstersById = this.getMonstersByIdForDungon(preview.dungonId);
    const target = this.monsterInstances().find((m) => {
      if (m.isDead || m.npcIsHostile) return false;
      const template = monstersById.get(m.monsterId);
      if (!template) return false;
      const isNpc =
        template.npcGreeting ||
        template.npcInfo1 ||
        template.npcInfo2 ||
        template.npcInfo3 ||
        template.npcCanTrade;
      if (!isNpc) return false;
      const dist = Math.max(
        Math.abs(m.row - preview.centerRow),
        Math.abs(m.column - preview.centerColumn)
      );
      return dist <= 1;
    });
    if (!target) return;
    const template = monstersById.get(target.monsterId);
    if (!template) return;
    this.addCombatLog(this.npcApproachLine(template.name, template.type));
    const creativeGreeting = template.npcGreeting
      ? this.npcWrapSpeech(template.name, template.type, template.npcGreeting)
      : undefined;
    this.npcDialog.set({ instance: target, template, creativeGreeting });
  }

  npcShareInfo(): void {
    const dialog = this.npcDialog();
    if (!dialog) return;
    const { instance: inst, template } = dialog;

    // Check if info is gated behind being attacked+spared
    if (template.npcGivesInfoAfterDamaged && !inst.isSpared) {
      this.addCombatLog(this.npcRefusalLine(template.name, template.type));
      return;
    }

    if (inst.hasSharedInfo) {
      this.addCombatLog(`${template.name} has nothing more to tell you.`);
      return;
    }

    const infoParts = [template.npcInfo1, template.npcInfo2, template.npcInfo3].filter((x): x is string => Boolean(x));
    if (infoParts.length === 0) {
      this.addCombatLog(`${template.name} shrugs. "I know nothing of use."`);
      return;
    }

    inst.hasSharedInfo = true;
    for (const info of infoParts) {
      this.addCombatLog(this.npcWrapSpeech(template.name, template.type, info));
    }

    if (template.npcAttacksAfterInfo) {
      inst.npcIsHostile = true;
      this.addCombatLog(this.pickRandom([
        `${template.name} snarls — "Now you know too much!" and attacks!`,
        `${template.name}'s eyes go cold. "A pity. You leave me no choice." They lunge!`,
        `"Now you'll have to die," ${template.name} hisses, drawing a weapon!`,
      ]));
    }

    this.monsterInstances.update((arr) => [...arr]);
    this.npcDialog.set({ ...dialog, instance: inst });
  }

  spareNpc(): void {
    const dialog = this.npcDialog();
    if (!dialog) return;
    const { instance: inst, template } = dialog;
    if (inst.isSpared) {
      this.addCombatLog(`${template.name} is already spared.`);
      return;
    }
    inst.isSpared = true;
    this.addCombatLog(`You lower your weapon. ${template.name} looks relieved.`);
    this.monsterInstances.update((arr) => [...arr]);
    this.npcDialog.set({ ...dialog, instance: inst });
  }

  getNpcShopItems(): { tresher: Tresher; price: number; purchased: boolean }[] {
    const dialog = this.npcDialog();
    if (!dialog || !dialog.template.npcCanTrade) return [];
    const preview = this.gridPreviewContext();
    if (!preview) return [];
    const treshersById = this.getTreshersByIdForDungon(preview.dungonId);
    const purchased = new Set(this.npcTradesPurchased());
    return dialog.template.tresherIds
      .map((id) => {
        const tresher = treshersById.get(id);
        if (!tresher) return null;
        return { tresher, price: Math.max(5, tresher.spReward), purchased: purchased.has(id) };
      })
      .filter((item): item is { tresher: Tresher; price: number; purchased: boolean } => item !== null);
  }

  npcBuyTresher(tresherId: number): void {
    const dialog = this.npcDialog();
    if (!dialog) return;
    const preview = this.gridPreviewContext();
    if (!preview) return;

    if (this.npcTradesPurchased().includes(tresherId)) {
      this.addCombatLog(`You already purchased that item.`);
      return;
    }

    const treshersById = this.getTreshersByIdForDungon(preview.dungonId);
    const tresher = treshersById.get(tresherId);
    if (!tresher) return;

    const price = Math.max(5, tresher.spReward);
    if (this.playerSp() < price) {
      this.addCombatLog(`Not enough SP — ${tresher.name} costs ${price} SP and you only have ${this.playerSp()}.`);
      return;
    }

    this.playerSp.update((s) => s - price);
    this.npcTradesPurchased.update((ids) => [...ids, tresherId]);
    this.addItemsToCheaterInventory(preview.dungonId, [], [tresher]);
    this.addCombatLog(`You paid ${price} SP for ${tresher.name}. It's now in your inventory.`);
  }

  private triggerDungonWin(transitionType?: ExitTransitionType): void {
    this.dungonWon.set(true);
    if (transitionType === 'stairsUp' && this.winStairsImageIndex() === null) {
      const idx = (Math.floor(Math.random() * 3) + 1) as 1 | 2 | 3;
      this.winStairsImageIndex.set(idx);
    }
    const spReward = this.dungonSpReward();
    if (spReward > 0) {
      this.playerSp.update((s) => s + spReward);
      this.awardSpToPC(spReward);
    }
    this.showTavernModal.set(true);
    this.startTavernMusic();
  }

  private awardSpToPC(amount: number): void {
    if (amount <= 0) {
      return;
    }

    const pcId = this.currentPcId_();
    if (!pcId) {
      return;
    }

    const userKey = this.account.getKey();
    if (!userKey) {
      return;
    }

    this.http
      .patch<{ result: number; sp: number }>(
        `${API_BASE_URL}/pcs/${pcId}/award-sp`,
        { userkey: userKey, amount }
      )
      .subscribe();
  }

  // ── Combat System ──────────────────────────────────────────────

  private initializeCombatState(dungonId: number): void {
    const placements = this.monsterPlacementsByDungon()[dungonId] ?? [];
    const monstersById = this.getMonstersByIdForDungon(dungonId);
    const saved = this.savedCombatState;
    const hasSavedCombat = saved.turnPhase !== null;

    const instances: GameMonsterInstance[] = placements.map((placement, index) => {
      const template = monstersById.get(placement.monsterId);
      const templateHp = template?.hp ?? 1;
      return {
        placementIndex: index,
        monsterId: placement.monsterId,
        row: placement.row,
        column: placement.column,
        roam: placement.roam,
        currentHp: hasSavedCombat && placement.currentHp != null ? placement.currentHp : templateHp,
        isDead: hasSavedCombat && placement.isDead === true,
        remainingAE: 0,
        attacksUsedThisTurn: 0,
        dropTresherIds: Array.isArray(placement.tresherIds) ? placement.tresherIds : [],
        dropKeyIds: Array.isArray(placement.keyIds) ? placement.keyIds : [],
        dropItemIds: Array.isArray(placement.itemIds) ? placement.itemIds : [],
        dropSpellIds: Array.isArray(placement.spellIds) ? placement.spellIds : [],
        dropPotionIds: Array.isArray(placement.potionIds) ? placement.potionIds : [],
        activeEffects: [],
        isDormant: placement.isDormant === true,
        guardRow: typeof placement.guardRow === 'number' ? placement.guardRow : null,
        guardColumn: typeof placement.guardColumn === 'number' ? placement.guardColumn : null,
        isStationary: placement.isStationary === true,
        stationaryTriggerRow: typeof placement.stationaryTriggerRow === 'number' ? placement.stationaryTriggerRow : null,
        stationaryTriggerCol: typeof placement.stationaryTriggerCol === 'number' ? placement.stationaryTriggerCol : null,
        noAttackUnlessAttacked: placement.noAttackUnlessAttacked === true,
        hasCalledReinforcements: false,
        hasGreeted: false,
        hasSharedInfo: false,
        isSpared: false,
        npcIsHostile: false,
      };
    });
    this.monsterInstances.set(instances);

    if (hasSavedCombat) {
      this.playerHp.set(
        this.resolvePlayerCurrentHp(saved.playerHp ?? this.playerStartingHp, this.playerMaxHp())
      );
      const effectiveAEMax = this.getEffectivePlayerMaxAE();
      const restoredAE = saved.playerAE ?? effectiveAEMax;
      this.turnPhase.set(saved.turnPhase!);
      this.playerAE.set(
        Math.max(0, Math.min(saved.turnPhase === 'player' && restoredAE <= 0 ? effectiveAEMax : restoredAE, effectiveAEMax))
      );
    } else {
      this.playerHp.set(this.playerStartingHp);
      this.playerAE.set(this.getEffectivePlayerMaxAE());
      this.playerAttacksThisTurn.set(0);
      this.playerSearchesThisTurn.set(0);
      this.turnPhase.set('player');
    }

    this.combatLog.set([]);
    this.playerActiveEffects.set([]);
    this.addCombatLog('Your turn. AE: ' + this.playerAE());
    this.savedCombatState = { playerHp: null, playerAE: null, turnPhase: null, playerRow: null, playerColumn: null };
  }

  private logNearbyAfterMove(): void {
    const doors = this.nearbyDoorsForPreview();
    const items = this.nearbyItemsForPreview();
    if (doors.length === 0 && items.length === 0) {
      return;
    }
    const parts: string[] = [];
    for (const d of doors) {
      const label = d.door.name || 'Door';
      const state = d.door.state === 'open' ? 'open' : d.door.isLocked ? 'locked' : 'closed';
      parts.push(`${label} (${d.direction}, ${state})`);
    }
    for (const item of items) {
      parts.push(`${item.kind}: ${item.name}`);
    }
    this.addCombatLog(`Nearby — ${parts.join(', ')}`);
  }

  private triggerNpcGreetings(): void {
    const preview = this.gridPreviewContext();
    if (!preview) return;

    const monstersById = this.getMonstersByIdForDungon(preview.dungonId);
    const instances = this.monsterInstances().filter(
      (m) => !m.isDead && !m.isDormant
    );

    for (const inst of instances) {
      const template = monstersById.get(inst.monsterId);
      if (!template?.npcGreeting) continue;
      if (inst.hasGreeted) continue;

      const dist = Math.max(
        Math.abs(inst.row - preview.centerRow),
        Math.abs(inst.column - preview.centerColumn)
      );
      if (dist > 1) continue;

      const hasLOS = this.hasLineOfSight(
        preview.dungonId, preview.centerRow, preview.centerColumn, inst.row, inst.column
      );
      if (!hasLOS) continue;

      inst.hasGreeted = true;
      const creativeGreeting = this.npcWrapSpeech(template.name, template.type, template.npcGreeting);
      this.addCombatLog(creativeGreeting);
      this.npcDialog.set({ instance: inst, template, creativeGreeting });
      this.monsterInstances.update((arr) => [...arr]);
      break; // one greeting per move
    }
  }

  private addCombatLog(text: string): void {
    this.combatLog.update((log) => [...log.slice(-49), { text }]);
  }

  private normalizeEffectToPcStat(stat: string | null | undefined): 'HP' | 'AC' | 'Magic' | 'Mind' | 'Stamina' | 'Strength' | 'AE' | 'NOA' | 'ROS' | null {
    if (!stat) return null;
    const s = stat.trim().toLowerCase();
    if (s === 'hp') return 'HP';
    if (s === 'ac') return 'AC';
    if (s === 'magic' || s === 'mp') return 'Magic';
    if (s === 'mind') return 'Mind';
    if (s === 'stamina' || s === 'staman') return 'Stamina';
    if (s === 'strength' || s === 'strench') return 'Strength';
    if (s === 'ae' || s === 'action economy') return 'AE';
    if (s === 'noa' || s === '# of attacks' || s === '#oa' || s === 'number of attacks') return 'NOA';
    if (s === 'ros' || s === 'sight' || s === 'range of sight') return 'ROS';
    return null;
  }

  private getEquippedItemBonusForStat(dungonId: number, stat: 'HP' | 'AC' | 'Magic' | 'Mind' | 'Stamina' | 'Strength' | 'AE' | 'NOA' | 'ROS'): number {
    const equippedItemIds = this.equippedItemIdsByDungon()[dungonId] ?? [];
    const itemsMap = this.pcTresherItemsById();
    let total = 0;
    for (const itemId of equippedItemIds) {
      const item = itemsMap.get(itemId);
      if (!item) continue;
      const rawTarget = item.effectToPc ?? item.effectOn;
      const target = this.normalizeEffectToPcStat(rawTarget ?? null);
      if (target !== stat) continue;
      const value = typeof item.effectToPcValue === 'number'
        ? item.effectToPcValue
        : (item.effectValue ?? 0);
      total += value;
    }
    return total;
  }

  private getEffectiveRangeOfSight(dungonId: number): number {
    const cheater = this.cheaterByDungon()[dungonId] ?? DEFAULT_CHEATER;
    const baseRange =
      typeof cheater.rangeOfSight === 'number' && Number.isFinite(cheater.rangeOfSight)
        ? Math.max(0, cheater.rangeOfSight)
        : DEFAULT_CHEATER.rangeOfSight;
    return Math.max(0, baseRange + this.getEquippedItemBonusForStat(dungonId, 'ROS'));
  }

  private getEffectivePlayerMaxHp(): number {
    const preview = this.gridPreviewContext();
    if (!preview) return this.playerMaxHp();
    return Math.max(1, this.playerMaxHp() + this.getEquippedItemBonusForStat(preview.dungonId, 'HP'));
  }

  private getEffectivePlayerStrength(): number {
    const preview = this.gridPreviewContext();
    if (!preview) return this.playerStrength();
    return this.playerStrength() + this.getEquippedItemBonusForStat(preview.dungonId, 'Strength');
  }

  private getEffectivePlayerStamina(): number {
    const preview = this.gridPreviewContext();
    if (!preview) return this.playerStamina();
    return this.playerStamina() + this.getEquippedItemBonusForStat(preview.dungonId, 'Stamina');
  }

  private getEffectivePlayerMind(): number {
    const preview = this.gridPreviewContext();
    if (!preview) return this.playerMind();
    return this.playerMind() + this.getEquippedItemBonusForStat(preview.dungonId, 'Mind');
  }

  private getEffectivePlayerMagicPower(): number {
    const preview = this.gridPreviewContext();
    if (!preview) return this.playerMagicPower();
    return this.playerMagicPower() + this.getEquippedItemBonusForStat(preview.dungonId, 'Magic');
  }

  private getEffectivePlayerMaxAE(): number {
    const preview = this.gridPreviewContext();
    if (!preview) return this.playerMaxAE;
    return Math.max(0, this.playerMaxAE + this.getEquippedItemBonusForStat(preview.dungonId, 'AE'));
  }

  private getEffectivePlayerNOA(): number {
    const preview = this.gridPreviewContext();
    if (!preview) return this.playerNOA();
    return Math.max(1, this.playerNOA() + this.getEquippedItemBonusForStat(preview.dungonId, 'NOA'));
  }

  private syncCurrentResourcesAfterEquipChange(prevEffectiveHpMax: number, prevEffectiveMpMax: number, prevEffectiveAEMax: number): void {
    const nextEffectiveHpMax = this.getEffectivePlayerMaxHp();
    const nextEffectiveMpMax = this.getEffectivePlayerMagicPower();
    const nextEffectiveAEMax = this.getEffectivePlayerMaxAE();

    const hpDelta = nextEffectiveHpMax - prevEffectiveHpMax;
    if (hpDelta !== 0) {
      const adjustedHp = this.playerHp() + hpDelta;
      this.playerHp.set(Math.max(0, Math.min(adjustedHp, nextEffectiveHpMax)));
    } else {
      this.playerHp.set(Math.max(0, Math.min(this.playerHp(), nextEffectiveHpMax)));
    }

    const mpDelta = nextEffectiveMpMax - prevEffectiveMpMax;
    if (mpDelta !== 0) {
      const adjustedMp = this.playerMp() + mpDelta;
      this.playerMp.set(Math.max(0, Math.min(adjustedMp, nextEffectiveMpMax)));
    } else {
      this.playerMp.set(Math.max(0, Math.min(this.playerMp(), nextEffectiveMpMax)));
    }

    const aeDelta = nextEffectiveAEMax - prevEffectiveAEMax;
    if (aeDelta !== 0) {
      const adjustedAE = this.playerAE() + aeDelta;
      this.playerAE.set(Math.max(0, Math.min(adjustedAE, nextEffectiveAEMax)));
    } else {
      this.playerAE.set(Math.max(0, Math.min(this.playerAE(), nextEffectiveAEMax)));
    }
  }

  playerMaxHpForView(): number {
    return this.getEffectivePlayerMaxHp();
  }

  playerStrengthForView(): number {
    return this.getEffectivePlayerStrength();
  }

  playerStaminaForView(): number {
    return this.getEffectivePlayerStamina();
  }

  playerMindForView(): number {
    return this.getEffectivePlayerMind();
  }

  playerMagicPowerForView(): number {
    return this.getEffectivePlayerMagicPower();
  }

  playerMaxAEForView(): number {
    return this.getEffectivePlayerMaxAE();
  }

  playerNOAForView(): number {
    return this.getEffectivePlayerNOA();
  }

  playerACForView(): number {
    return this.getPlayerAC();
  }

  private getPlayerAC(): number {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return this.playerBaseAC();
    }
    const equippedIndexes = this.equippedTresherIndexesByDungon()[preview.dungonId] ?? [];
    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const inventory = cheater.inventory?.treshers ?? [];
    let armorCount = 0;
    for (const idx of equippedIndexes) {
      if ((inventory[idx] as unknown as Record<string, unknown>)?.['armorType']) {
        armorCount += 1;
      }
    }
    const equippedItemIds = this.equippedItemIdsByDungon()[preview.dungonId] ?? [];
    const itemsMap = this.pcTresherItemsById();
    let armorItemBonus = this.getEquippedItemBonusForStat(preview.dungonId, 'AC');
    for (const itemId of equippedItemIds) {
      const item = itemsMap.get(itemId);
      if (!item || item.effectValue == null) continue;
      const hasLegacyAcEffect = item.type === 'armor' || ((item.type === 'ring' || item.type === 'necklace') && item.effectOn === 'AC');
      if (hasLegacyAcEffect && this.normalizeEffectToPcStat(item.effectToPc ?? item.effectOn ?? null) !== 'AC') {
        armorItemBonus += item.effectValue;
      }
    }
    return this.playerBaseAC() + armorCount + armorItemBonus - this.playerBoostAttackACPenalty();
  }

  endPlayerTurnEarly(): void {
    if (this.turnPhase() !== 'player') {
      return;
    }
    this.playerAE.set(0);
    this.playerMp.set(this.getEffectivePlayerMagicPower());
    this.addCombatLog('You end your turn early.');
    this.startMonsterTurns();
  }

  canAde(): boolean {
    return this.turnPhase() === 'player' && this.playerAE() >= 2 && this.canPlayerAttack() && this.canPlayerDefend();
  }

  tryAde(): void {
    if (!this.canAde()) return;
    this.tryPlayerAttack();
    // Re-check defend is still possible after the attack consumed 1 AE
    if (this.canPlayerDefend()) {
      this.tryPlayerDefend();
    }
    // End turn regardless
    if (this.turnPhase() === 'player') {
      this.endPlayerTurnEarly();
    }
  }

  canPlayerDefend(): boolean {
    return this.turnPhase() === 'player' && this.playerAE() >= 1 && this.playerDefendsThisTurn() < this.playerNOD();
  }

  tryPlayerDefend(): void {
    if (!this.canPlayerDefend()) return;
    const preview = this.gridPreviewContext();
    if (!preview) return;
    this.consumePlayerAE(1, preview.dungonId);
    this.playerDefendsThisTurn.update((n) => n + 1);
    this.playerDefendStacks.update((s) => s + 1);
    this.addCombatLog(`You defend! +2 AC for the next attack against you. (${this.playerDefendStacks()} stack${this.playerDefendStacks() !== 1 ? 's' : ''} active)`);
    if (this.playerAE() <= 0) {
      this.startMonsterTurns();
    }
  }

  goHome(): void {
    const dest = this.account.getKey() ? '/dashboard' : '/';
    void this.router.navigate([dest]);
  }

  canSearch(): boolean {    if (this.turnPhase() !== 'player' || this.playerAE() < 1) return false;
    const searches = this.playerSearchesThisTurn();
    const type = (this.playerType() ?? '').toLowerCase();
    const isThiephOrShorties = type === 'thieph' || type === 'shorties';
    // Thieph and Shorties can search twice per round; everyone else only once
    if (isThiephOrShorties && searches >= 2) return false;
    if (!isThiephOrShorties && searches >= 1) return false;
    return true;
  }

  canPlayerAttack(): boolean {
    if (this.turnPhase() !== 'player' || this.playerAE() < 1 || this.playerAttacksThisTurn() >= this.getEffectivePlayerNOA()) return false;
    const preview = this.gridPreviewContext();
    if (!preview) return false;
    const equippedItemIds = this.equippedItemIdsByDungon()[preview.dungonId] ?? [];
    const itemsMap = this.pcTresherItemsById();
    let bestRange = 0;
    for (const itemId of equippedItemIds) {
      const item = itemsMap.get(itemId);
      if (item?.type === 'weapon' && item.range > bestRange) bestRange = item.range;
    }
    const effectiveRange = bestRange === 0 ? 1 : bestRange; // unarmed = melee range 1
    return this.findAdjacentLiveMonster(preview.centerRow, preview.centerColumn, effectiveRange, preview.dungonId) !== null;
  }

  canBoostAttack(): boolean {
    return this.isFighterClass() && this.canPlayerAttack() && this.playerAttacksThisTurn() === 0;
  }

  isFighterClass(): boolean {
    const t = (this.playerType() ?? '').toLowerCase();
    return t === 'fighter' || t === 'figher';
  }

  tryBoostAttack(): void {
    if (this.turnPhase() !== 'player') { this.addCombatLog('Boost: not your turn.'); return; }
    if (!this.isFighterClass()) { this.addCombatLog('Boost: only Fighters can use Boost Attack.'); return; }
    if (this.playerAttacksThisTurn() > 0) { this.addCombatLog('Boost: must be used before any other attack this turn.'); return; }
    if (this.playerAE() < 1) { this.addCombatLog('Boost: no AE remaining.'); return; }

    const preview = this.gridPreviewContext();
    if (!preview) { this.addCombatLog('Boost: no active dungeon context.'); return; }

    const bestWeapon = this.getBestEquippedWeaponAttackStats(preview.dungonId);
    let bestRange = bestWeapon?.bestRange ?? 0;
    const weaponToHit = bestWeapon?.weaponToHit ?? 0;
    const weaponDamageDivisor = bestWeapon?.weaponDamageDivisor ?? 6;
    const weaponName = bestWeapon?.weaponName ?? '';

    const isUnarmed = bestRange === 0;
    if (isUnarmed) {
      bestRange = 1;
    }
    const playerAttackSource = isUnarmed
      ? 'your bare hands'
      : (weaponName || `a +${weaponToHit} weapon`);

    const adjacentMonster = this.getTargetMonster(preview.dungonId, preview.centerRow, preview.centerColumn, bestRange);
    if (!adjacentMonster) {
      this.addCombatLog('No monster in weapon range.');
      return;
    }

    const template = this.getMonstersByIdForDungon(preview.dungonId).get(adjacentMonster.monsterId);
    const toHitRequired = template?.toHitPlusNeeded ?? 0;
    if (isUnarmed && toHitRequired > 0) {
      this.addCombatLog(`Your bare hands cannot hit ${template?.name ?? 'this monster'}! Need a +${toHitRequired} weapon.`);
      return;
    }
    if (!isUnarmed && weaponToHit < toHitRequired) {
      this.addCombatLog(`Your +${weaponToHit} weapon cannot hit ${template?.name ?? 'this monster'}! Need +${toHitRequired} or better.`);
      return;
    }

    const aeToConsume = this.playerAE();
    this.consumePlayerAE(aeToConsume, preview.dungonId);
    if (this.turnPhase() === 'gameover') return;
    this.playerAttacksThisTurn.update(n => n + 1);
    this.playClangSound();
    const monsterAC = template?.ac ?? 10;

    const prevCombo = this.comboTracker();
    const isSameTarget = prevCombo?.placementIndex === adjacentMonster.placementIndex;
    const comboCount = isSameTarget ? prevCombo!.count : 0;
    const comboBonus = Math.min(comboCount, 4);
    this.comboTracker.set({ placementIndex: adjacentMonster.placementIndex, count: comboCount + 1 });
    if (comboBonus > 0) {
      this.addCombatLog(`Combo ×${comboCount + 1}! +${comboBonus} to hit!`);
    }

    const level = this.playerLevel();
    const boostDieSize = level >= 6 ? 6 : level >= 3 ? 4 : 3;
    const boostDieRoll = this.rollWithBoost(boostDieSize);

    const rollBonus = isUnarmed ? -1 : weaponToHit;
    const hitRoll = this.rollD12(rollBonus + this.getEffectivePlayerStamina() + comboBonus) + boostDieRoll;
    this.addCombatLog(`Boost Attack! +${boostDieRoll} (1d${boostDieSize}) to hit. Your AC is -4 until your next turn!`);

    if (hitRoll >= monsterAC) {
      const damage = isUnarmed
        ? Math.max(1, 1 + Math.floor(this.getEffectivePlayerStrength() / 2))
        : Math.max(1, this.randomInt(1, Math.max(1, Math.ceil(12 / Math.max(1, weaponDamageDivisor)))) + this.getEffectivePlayerStrength());
      adjacentMonster.currentHp -= damage;
      if (!adjacentMonster.npcIsHostile) {
        adjacentMonster.npcIsHostile = true;
      }
      this.triggerWeaponMonsterImpact(
        adjacentMonster.row,
        adjacentMonster.column,
        isUnarmed ? 'Blood' : (bestWeapon?.weaponEffectType ?? 'Blood'),
        isUnarmed ? '#cc0000' : (bestWeapon?.weaponEffectColor ?? '#cc0000')
      );
      this.addCombatLog(
        `You ${isUnarmed ? 'punch' : 'hit'} ${template?.name ?? 'monster'} with ${playerAttackSource} for ${damage} dmg! (rolled ${hitRoll} vs AC ${monsterAC})`
      );
      if (adjacentMonster.currentHp <= 0) {
        adjacentMonster.isDead = true;
        adjacentMonster.currentHp = 0;
        this.addCombatLog(`${template?.name ?? 'Monster'} is dead!`);
        this.selectedCombatTarget.set(null);
        this.comboTracker.set(null);
        this.dropMonsterLoot(preview.dungonId, adjacentMonster, template ?? null);
        const spGain = template?.spReward ?? 0;
        if (spGain > 0) {
          this.playerSp.update((s) => s + spGain);
          this.addCombatLog(`+${spGain} SP!`);
          this.awardSpToPC(spGain);
        }
      } else if (template?.npcGivesInfoAfterDamaged && !adjacentMonster.isSpared) {
        this.addCombatLog(`${template.name} staggers — you can spare it and ask for information.`);
        this.npcDialog.set({ instance: adjacentMonster, template });
      }
      this.monsterInstances.update((arr) => [...arr]);
    } else {
      this.addCombatLog(
        `You miss ${template?.name ?? 'monster'} with ${playerAttackSource}. (rolled ${hitRoll} vs AC ${monsterAC})`
      );
    }

    this.playerBoostAttackACPenalty.set(4);
    this.drawPreviewGridCanvas();
    this.startMonsterTurns();
  }

  tryPlayerAttack(): void {
    if (this.turnPhase() !== 'player') {
      return;
    }
    if (this.playerAE() < 1) {
      return;
    }

    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }

    const bestWeapon = this.getBestEquippedWeaponAttackStats(preview.dungonId);
    let bestRange = bestWeapon?.bestRange ?? 0;
    const weaponToHit = bestWeapon?.weaponToHit ?? 0;
    const weaponDamageDivisor = bestWeapon?.weaponDamageDivisor ?? 6;
    const weaponName = bestWeapon?.weaponName ?? '';

    const isUnarmed = bestRange === 0;
    if (isUnarmed) {
      bestRange = 1; // unarmed melee range
    }
    const playerAttackSource = isUnarmed
      ? 'your bare hands'
      : (weaponName || `a +${weaponToHit} weapon`);

    const adjacentMonster = this.getTargetMonster(preview.dungonId, preview.centerRow, preview.centerColumn, bestRange);
    if (!adjacentMonster) {
      this.addCombatLog('No monster in weapon range.');
      return;
    }

    const template = this.getMonstersByIdForDungon(preview.dungonId).get(adjacentMonster.monsterId);
    const toHitRequired = template?.toHitPlusNeeded ?? 0;
    if (isUnarmed && toHitRequired > 0) {
      this.addCombatLog(`Your bare hands cannot hit ${template?.name ?? 'this monster'}! Need a +${toHitRequired} weapon.`);
      return;
    }
    if (!isUnarmed && weaponToHit < toHitRequired) {
      this.addCombatLog(`Your +${weaponToHit} weapon cannot hit ${template?.name ?? 'this monster'}! Need +${toHitRequired} or better.`);
      return;
    }

    this.consumePlayerAE(1, preview.dungonId);
    this.playerAttacksThisTurn.update(n => n + 1);
    this.playClangSound();
    const monsterAC = template?.ac ?? 10;

    const prevCombo = this.comboTracker();
    const isSameTarget = prevCombo?.placementIndex === adjacentMonster.placementIndex;
    const comboCount = isSameTarget ? prevCombo!.count : 0;
    const comboBonus = Math.min(comboCount, 4);
    this.comboTracker.set({ placementIndex: adjacentMonster.placementIndex, count: comboCount + 1 });
    if (comboBonus > 0) {
      this.addCombatLog(`Combo ×${comboCount + 1}! +${comboBonus} to hit!`);
    }

    const coverPenalty = this.getAttackCoverPenalty(
      preview.dungonId, preview.centerRow, preview.centerColumn,
      adjacentMonster.row, adjacentMonster.column
    );
    if (coverPenalty !== 0) {
      this.addCombatLog(`Partial cover! ${coverPenalty} to hit.`);
    }
    const rollBonus = (isUnarmed ? -1 : weaponToHit) + coverPenalty;
    const hitRoll = this.rollD12(rollBonus + this.getEffectivePlayerStamina() + comboBonus);
    if (hitRoll >= monsterAC) {
      const damage = isUnarmed
        ? Math.max(1, 1 + Math.floor(this.getEffectivePlayerStrength() / 2))
        : Math.max(1, this.randomInt(1, Math.max(1, Math.ceil(12 / Math.max(1, weaponDamageDivisor)))) + this.getEffectivePlayerStrength());
      adjacentMonster.currentHp -= damage;
      // If this is an NPC that only attacks when attacked, mark it hostile now
      if (!adjacentMonster.npcIsHostile) {
        adjacentMonster.npcIsHostile = true;
      }
      this.triggerWeaponMonsterImpact(
        adjacentMonster.row,
        adjacentMonster.column,
        isUnarmed ? 'Blood' : (bestWeapon?.weaponEffectType ?? 'Blood'),
        isUnarmed ? '#cc0000' : (bestWeapon?.weaponEffectColor ?? '#cc0000')
      );
      this.addCombatLog(
        `You ${isUnarmed ? 'punch' : 'hit'} ${template?.name ?? 'monster'} with ${playerAttackSource} for ${damage} dmg! (rolled ${hitRoll} vs AC ${monsterAC})`
      );
      if (adjacentMonster.currentHp <= 0) {
        adjacentMonster.isDead = true;
        adjacentMonster.currentHp = 0;
        this.addCombatLog(`${template?.name ?? 'Monster'} is dead!`);
        this.selectedCombatTarget.set(null); // clear target after kill
        this.comboTracker.set(null);
        this.dropMonsterLoot(preview.dungonId, adjacentMonster, template ?? null);
        const spGain = template?.spReward ?? 0;
        if (spGain > 0) {
          this.playerSp.update((s) => s + spGain);
          this.addCombatLog(`+${spGain} SP!`);
          this.awardSpToPC(spGain);
        }
      } else if (template?.npcGivesInfoAfterDamaged && !adjacentMonster.isSpared) {
        this.addCombatLog(`${template.name} staggers — you can spare it and ask for information.`);
        this.npcDialog.set({ instance: adjacentMonster, template });
      }
      this.monsterInstances.update((arr) => [...arr]);
    } else {
      this.addCombatLog(
        `You miss ${template?.name ?? 'monster'} with ${playerAttackSource}. (rolled ${hitRoll} vs AC ${monsterAC})`
      );
    }

    this.drawPreviewGridCanvas();

    if (this.playerAE() <= 0) {
      this.startMonsterTurns();
    }
  }

  private getBestEquippedWeaponAttackStats(dungonId: number): {
    bestRange: number;
    weaponToHit: number;
    weaponDamageDivisor: number;
    weaponName: string;
    weaponEffectType: string;
    weaponEffectColor: string | null;
  } | null {
    const equippedItemIds = this.equippedItemIdsByDungon()[dungonId] ?? [];
    const itemsMap = this.pcTresherItemsById();
    let hasWeapon = false;
    let bestRange = 0;
    let weaponToHit = 0;
    let weaponDamageDivisor = 6;
    let weaponName = '';
    let weaponEffectType = 'Blood';
    let weaponEffectColor: string | null = '#cc0000';

    for (const itemId of equippedItemIds) {
      const item = itemsMap.get(itemId);
      if (item?.type !== 'weapon') {
        continue;
      }

      hasWeapon = true;
      if (item.range > bestRange) {
        bestRange = item.range;
      }

      if (!weaponName || (item.effectValue ?? 0) > weaponToHit) {
        weaponToHit = item.effectValue ?? 0;
        weaponDamageDivisor = item.damage > 0 ? item.damage : 6;
        weaponName = item.name || '';
        weaponEffectType = item.weaponEffectType || 'Blood';
        weaponEffectColor = item.weaponEffectColor || '#cc0000';
      }
    }

    if (!hasWeapon) {
      return null;
    }

    return {
      bestRange,
      weaponToHit,
      weaponDamageDivisor,
      weaponName,
      weaponEffectType,
      weaponEffectColor,
    };
  }

  private tickActiveEffectsOnce(dungonId: number): void {
    // Tick player active effects
    const pEffects = this.playerActiveEffects();
    if (pEffects.length > 0) {
      const pRemaining: ActiveEffect[] = [];
      for (const eff of pEffects) {
        if (eff.effectOn === 'HP') {
          const newHp = Math.min(this.getEffectivePlayerMaxHp(), Math.max(0, this.playerHp() + eff.effectAmount));
          this.playerHp.set(newHp);
          const sign = eff.effectAmount >= 0 ? '+' : '';
          this.addCombatLog(`${eff.sourceName}: ${sign}${eff.effectAmount} HP (${eff.remainingAE - 1} AE left).`);
          if (newHp <= 0) {
            this.playerDeathCause.set(`Killed by ${eff.sourceName}`);
            this.turnPhase.set('gameover');
            setTimeout(() => this.goHome(), 3500);
          }
        } else {
          this.addCombatLog(`${eff.sourceName}: ${eff.effectOn} ${eff.effectAmount} (${eff.remainingAE - 1} AE left).`);
        }
        if (eff.remainingAE - 1 > 0) {
          pRemaining.push({ ...eff, remainingAE: eff.remainingAE - 1 });
        } else {
          this.addCombatLog(`${eff.sourceName} wears off.`);
        }
      }
      this.playerActiveEffects.set(pRemaining);
    }

    // Tick monster active effects
    const instances = this.monsterInstances();
    const monstersById = this.getMonstersByIdForDungon(dungonId);
    let anyMonsterChanged = false;
    for (const instance of instances) {
      if (instance.isDead || instance.activeEffects.length === 0) continue;
      anyMonsterChanged = true;
      const template = monstersById.get(instance.monsterId);
      const mRemaining: ActiveEffect[] = [];
      let monsterDied = false;
      for (const eff of instance.activeEffects) {
        if (eff.effectOn === 'HP') {
          instance.currentHp -= eff.effectAmount;
          this.triggerBloodSplatter();
          this.addCombatLog(`${eff.sourceName}: -${eff.effectAmount} HP on ${template?.name ?? 'monster'} (${eff.remainingAE - 1} AE left).`);
          if (instance.currentHp <= 0) {
            instance.isDead = true;
            instance.currentHp = 0;
            monsterDied = true;
            this.addCombatLog(`${template?.name ?? 'Monster'} is dead!`);
            this.dropMonsterLoot(dungonId, instance, template ?? null);
            const spGain = template?.spReward ?? 0;
            if (spGain > 0) {
              this.playerSp.update((s) => s + spGain);
              this.addCombatLog(`+${spGain} SP!`);
              this.awardSpToPC(spGain);
            }
            break;
          }
        } else {
          this.addCombatLog(`${eff.sourceName}: ${eff.effectOn} -${eff.effectAmount} on ${template?.name ?? 'monster'} (${eff.remainingAE - 1} AE left).`);
        }
        if (eff.remainingAE - 1 > 0) {
          mRemaining.push({ ...eff, remainingAE: eff.remainingAE - 1 });
        } else {
          this.addCombatLog(`${eff.sourceName} on ${template?.name ?? 'monster'} wears off.`);
        }
      }
      instance.activeEffects = monsterDied ? [] : mRemaining;
    }
    if (anyMonsterChanged) {
      this.monsterInstances.update((arr) => [...arr]);
    }
  }

  private consumePlayerAE(amount: number, dungonId: number): void {
    for (let i = 0; i < amount; i++) {
      this.playerAE.update((ae) => Math.max(0, ae - 1));
      this.tickActiveEffectsOnce(dungonId);
      if (this.turnPhase() === 'gameover') return;
    }
  }

  private consumeMonsterAE(monster: GameMonsterInstance, amount: number, dungonId: number): void {
    for (let i = 0; i < amount; i++) {
      monster.remainingAE = Math.max(0, monster.remainingAE - 1);
      this.tickActiveEffectsOnce(dungonId);
      if (this.turnPhase() === 'gameover') return;
    }
  }

  private rollWithBoost(dieSize: number): number {
    const boostDie: Record<number, number> = { 12: 6, 6: 4, 4: 3, 3: 2, 2: 2 };
    const roll = this.randomInt(1, dieSize);
    const boostCursed = this.playerActiveEffects().some(e => e.effectOn === 'Boost Dice');
    if (!boostCursed && roll === dieSize && boostDie[dieSize] != null) {
      return roll + this.rollWithBoost(boostDie[dieSize]);
    }
    return roll;
  }

  private rollD12(bonus: number = 0): number {
    return this.rollWithBoost(12) + bonus;
  }


  private rollMindDamageBonus(): { total: number; diceCount: number } {
    const diceCount = Math.max(1, Math.ceil(this.getEffectivePlayerMind() / 12));
    let total = 0;
    for (let i = 0; i < diceCount; i += 1) {
      total += this.randomInt(1, 4);
    }
    return { total, diceCount };
  }

  private calculateSpellHpDamage(effectAmount: number, monsterMagicResistance: number): { damage: number; mindBonus: number; mindDiceCount: number; mrReduction: number } {
    const { total: mindBonus, diceCount: mindDiceCount } = this.rollMindDamageBonus();
    const mrReduction = Math.ceil(Math.max(0, monsterMagicResistance) / 2);
    const damage = Math.max(1, effectAmount + mindBonus - mrReduction);
    return { damage, mindBonus, mindDiceCount, mrReduction };
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private npcWrapSpeech(name: string, type: string, line: string): string {
    const t = type.toLowerCase();
    const humanAesthetic = [
      `${name} leans in and murmurs, "${line}"`,
      `${name} clears their throat. "${line}"`,
      `"${line}" ${name} says, arms folded.`,
      `${name} pauses, then speaks. "${line}"`,
      `${name} glances about before saying, "${line}"`,
      `${name} looks you in the eye. "${line}"`,
    ];
    const goblinAesthetic = [
      `"HEH! ${line}" ${name} cackles.`,
      `${name} scratches its head. "Uhhhh... ${line}. Yeah, that's it!"`,
      `"You didn't hear this from me — ${line}" ${name} squeaks.`,
      `${name} taps its nose knowingly. "${line}"`,
    ];
    const undeadAesthetic = [
      `${name}'s hollow voice intones: "${line}"`,
      `"${line}" — the spirit of ${name} echoes.`,
      `${name} rasps from beyond the veil: "${line}"`,
      `The whisper of ${name} chills the air: "${line}"`,
    ];
    const demonicAesthetic = [
      `${name}'s voice reverberates with dark amusement: "${line}"`,
      `"${line}," ${name} hisses through a twisted grin.`,
      `${name} regards you with contempt before conceding: "${line}"`,
      `Smoke curls from ${name}'s lips: "${line}"`,
    ];
    const beastAesthetic = [
      `${name} growls something that roughly translates to: "${line}"`,
      `With a rumbling breath, ${name} communicates: "${line}"`,
      `${name} grunts and stamps a foot. "${line}"`,
    ];
    const arcaneAesthetic = [
      `${name} traces a sigil in the air. "${line}"`,
      `${name} speaks with measured precision: "${line}"`,
      `"${line}" — ${name} intones, as if reciting from memory.`,
    ];
    if (t.includes('goblin') || t.includes('kobold') || t.includes('gremlin') || t.includes('boggart')) return this.pickRandom(goblinAesthetic);
    if (t.includes('undead') || t.includes('ghost') || t.includes('zombie') || t.includes('lich') || t.includes('skeleton') || t.includes('wraith') || t.includes('specter')) return this.pickRandom(undeadAesthetic);
    if (t.includes('demon') || t.includes('devil') || t.includes('fiend') || t.includes('infernal')) return this.pickRandom(demonicAesthetic);
    if (t.includes('beast') || t.includes('animal') || t.includes('troll') || t.includes('ogre')) return this.pickRandom(beastAesthetic);
    if (t.includes('mage') || t.includes('wizard') || t.includes('scholar') || t.includes('celestial') || t.includes('arcane')) return this.pickRandom(arcaneAesthetic);
    return this.pickRandom(humanAesthetic);
  }

  private npcRefusalLine(name: string, type: string): string {
    const t = type.toLowerCase();
    const generic = [
      `${name} eyes you warily. "Prove you can show mercy, and then we'll talk."`,
      `"Earn my trust first," ${name} says flatly.`,
      `${name} folds their arms. "Show me mercy, then maybe I'll speak."`,
    ];
    const goblin = [
      `"NUH-UH! Not tellin'!" ${name} folds its arms smugly.`,
      `${name} blows a raspberry. "Fight me an' spare me FIRST, then maybe!"`,
    ];
    const undead = [
      `${name}'s hollow voice drifts: "Prove your resolve, then the dead may speak."`,
    ];
    if (t.includes('goblin') || t.includes('kobold') || t.includes('gremlin')) return this.pickRandom(goblin);
    if (t.includes('undead') || t.includes('ghost') || t.includes('skeleton')) return this.pickRandom(undead);
    return this.pickRandom(generic);
  }

  private npcApproachLine(name: string, type: string): string {
    const t = type.toLowerCase();
    const generic = [
      `You approach ${name} cautiously.`,
      `You step forward to speak with ${name}.`,
      `You address ${name} with a nod of acknowledgment.`,
    ];
    const goblin = [
      `You cautiously approach the jittery ${name}.`,
      `You try to look non-threatening as you approach ${name}.`,
    ];
    if (t.includes('goblin') || t.includes('kobold') || t.includes('gremlin')) return this.pickRandom(goblin);
    return this.pickRandom(generic);
  }

  private triggerBloodSplatter(): void {
    const drops: { x: number; y: number; r: number }[] = [];
    const count = 6 + Math.floor(Math.random() * 7);
    for (let i = 0; i < count; i++) {
      drops.push({
        x: 10 + Math.floor(Math.random() * 310),
        y: 5 + Math.floor(Math.random() * 200),
        r: 2 + Math.floor(Math.random() * 9),
      });
    }
    this.bloodSplatter.set(drops);
    setTimeout(() => this.bloodSplatter.set([]), 2000);
  }

  private triggerPlayerHitFlash(): void {
    this.playerHitFlash.set(true);
    setTimeout(() => this.playerHitFlash.set(false), 1500);
  }

  private dropMonsterLoot(
    dungonId: number,
    monster: GameMonsterInstance,
    template: Monster | null
  ): void {
    if (!template) {
      return;
    }

    const droppedNames: string[] = [];

    const tresherIds = [...monster.dropTresherIds, ...(template.tresherIds ?? [])];
    if (tresherIds.length > 0) {
      const newPlacements: TresherPlacement[] = tresherIds.map((tresherId) => ({
        tresherId,
        row: monster.row,
        column: monster.column,
      }));

      this.tresherPlacementsByDungon.update((allPlacements) => ({
        ...allPlacements,
        [dungonId]: [...(allPlacements[dungonId] ?? []), ...newPlacements],
      }));

      const treshersById = this.getTreshersByIdForDungon(dungonId);
      for (const id of tresherIds) {
        droppedNames.push(treshersById.get(id)?.name ?? 'item');
      }
    }

    const keyIds = [...monster.dropKeyIds, ...(template.keyIds ?? [])];
    if (keyIds.length > 0) {
      const keyIdSet = new Set(keyIds);
      this.keyList = this.keyList.map((key) =>
        keyIdSet.has(key.id)
          ? { ...key, rownId: monster.row, columnId: monster.column }
          : key
      );
      for (const keyId of keyIds) {
        const key = this.keyList.find((k) => k.id === keyId);
        droppedNames.push(key?.name ?? 'key');
      }
    }

    const itemIds = [...monster.dropItemIds];
    if (itemIds.length > 0) {
      const newPlacements = itemIds.map((itemId) => ({
        itemId,
        row: monster.row,
        column: monster.column,
      }));
      this.floorItemPlacementsByDungon.update((allPlacements) => ({
        ...allPlacements,
        [dungonId]: [...(allPlacements[dungonId] ?? []), ...newPlacements],
      }));
      const itemsById = new Map((this.floorItemListByDungon()[dungonId] ?? []).map((item) => [item.id, item]));
      for (const id of itemIds) {
        droppedNames.push(itemsById.get(id)?.name ?? 'item');
      }
    }

    const potionIds = [...monster.dropPotionIds];
    if (potionIds.length > 0) {
      const newPlacements = potionIds.map((potionId) => ({
        potionId,
        row: monster.row,
        column: monster.column,
      }));
      this.floorPotionPlacementsByDungon.update((allPlacements) => ({
        ...allPlacements,
        [dungonId]: [...(allPlacements[dungonId] ?? []), ...newPlacements],
      }));
      const potionsById = new Map((this.floorPotionListByDungon()[dungonId] ?? []).map((potion) => [potion.id, potion]));
      for (const id of potionIds) {
        droppedNames.push(potionsById.get(id)?.name ?? 'potion');
      }
    }

    const spellIds = [...monster.dropSpellIds];
    if (spellIds.length > 0) {
      const newPlacements = spellIds.map((spellId) => ({
        spellId,
        row: monster.row,
        column: monster.column,
      }));
      this.floorSpellPlacementsByDungon.update((allPlacements) => ({
        ...allPlacements,
        [dungonId]: [...(allPlacements[dungonId] ?? []), ...newPlacements],
      }));
      const spellsById = new Map((this.floorSpellListByDungon()[dungonId] ?? []).map((spell) => [spell.id, spell]));
      for (const id of spellIds) {
        droppedNames.push(spellsById.get(id)?.name ?? 'spell');
      }
    }

    if (droppedNames.length > 0) {
      this.addCombatLog(`${template.name} dropped: ${droppedNames.join(', ')}`);
    }
  }

  private findAdjacentLiveMonster(row: number, col: number, maxRange = 1, dungonId?: number): GameMonsterInstance | null {
    const instances = this.monsterInstances();
    for (const monster of instances) {
      if (monster.isDead) {
        continue;
      }
      const dr = Math.abs(monster.row - row);
      const dc = Math.abs(monster.column - col);
      if (dr <= maxRange && dc <= maxRange && (dr + dc) > 0) {
        if (dungonId != null && !this.hasLineOfSight(dungonId, row, col, monster.row, monster.column)) {
          continue;
        }
        return monster;
      }
    }
    return null;
  }

  /**
   * Returns a 0-7 priority index for auto-targeting based on the player's
   * facing direction (0 = front = highest priority, 7 = back = lowest).
   */
  private getTargetDirectionPriority(
    facing: FacingDirection,
    playerRow: number, playerCol: number,
    monsterRow: number, monsterCol: number
  ): number {
    const dr = monsterRow - playerRow;
    const dc = monsterCol - playerCol;
    // Angle from north (CW positive); atan2(east, north)
    const monsterAngle = Math.atan2(dc, -dr);
    const facingAngle: Record<FacingDirection, number> = {
      up: 0,
      right: Math.PI / 2,
      down: Math.PI,
      left: -Math.PI / 2,
    };
    let rel = monsterAngle - facingAngle[facing];
    if (rel > Math.PI) rel -= 2 * Math.PI;
    if (rel < -Math.PI) rel += 2 * Math.PI;
    const abs = Math.abs(rel);
    const sign = rel >= 0 ? 1 : -1;
    if (abs <= Math.PI / 8)         return 0; // front
    if (abs <= 3 * Math.PI / 8)     return sign >= 0 ? 1 : 2; // front-right / front-left
    if (abs <= 5 * Math.PI / 8)     return sign >= 0 ? 3 : 4; // right / left
    if (abs <= 7 * Math.PI / 8)     return sign >= 0 ? 6 : 5; // back-right / back-left
    return 7; // back
  }

  /**
   * Finds the highest-priority monster in Chebyshev range with line-of-sight,
   * ordered front → front-right → front-left → right → left → back-left → back-right → back,
   * then by distance (closer first) within the same angular region.
   */
  private findPriorityTarget(
    dungonId: number,
    playerRow: number,
    playerCol: number,
    range: number
  ): GameMonsterInstance | null {
    const facing = (this.cheaterByDungon()[dungonId] ?? DEFAULT_CHEATER).facingDir;
    const inRange = this.monsterInstances().filter(m => {
      if (m.isDead) return false;
      const dr = Math.abs(m.row - playerRow);
      const dc = Math.abs(m.column - playerCol);
      return dr <= range && dc <= range && (dr + dc) > 0 &&
        this.hasLineOfSight(dungonId, playerRow, playerCol, m.row, m.column);
    });
    if (inRange.length === 0) return null;
    inRange.sort((a, b) => {
      const ap = this.getTargetDirectionPriority(facing, playerRow, playerCol, a.row, a.column);
      const bp = this.getTargetDirectionPriority(facing, playerRow, playerCol, b.row, b.column);
      if (ap !== bp) return ap - bp;
      const ad = Math.max(Math.abs(a.row - playerRow), Math.abs(a.column - playerCol));
      const bd = Math.max(Math.abs(b.row - playerRow), Math.abs(b.column - playerCol));
      return ad - bd;
    });
    return inRange[0];
  }

  /**
   * Returns the monster to attack/cast at:
   * 1. Uses selectedCombatTarget if there's a live monster there within range.
   * 2. Falls back to findPriorityTarget and updates selectedCombatTarget.
   */
  private getTargetMonster(
    dungonId: number,
    playerRow: number,
    playerCol: number,
    range: number
  ): GameMonsterInstance | null {
    const sel = this.selectedCombatTarget();
    if (sel) {
      const dr = Math.abs(sel.row - playerRow);
      const dc = Math.abs(sel.column - playerCol);
      if (dr <= range && dc <= range) {
        const m = this.monsterInstances().find(
          x => !x.isDead && x.row === sel.row && x.column === sel.column
        );
        if (m && this.hasLineOfSight(dungonId, playerRow, playerCol, m.row, m.column)) {
          return m;
        }
      }
    }
    // Auto-select by direction priority
    const auto = this.findPriorityTarget(dungonId, playerRow, playerCol, range);
    if (auto) {
      this.selectedCombatTarget.set({ row: auto.row, column: auto.column });
    }
    return auto;
  }

  private isAdjacentTo(r1: number, c1: number, r2: number, c2: number): boolean {
    const dr = Math.abs(r1 - r2);
    const dc = Math.abs(c1 - c2);
    return dr <= 1 && dc <= 1 && (dr + dc) > 0;
  }

  private canUseAdjacentMeleeAttack(
    dungonId: number,
    attackerRow: number,
    attackerColumn: number,
    targetRow: number,
    targetColumn: number
  ): boolean {
    if (!this.isAdjacentTo(attackerRow, attackerColumn, targetRow, targetColumn)) {
      return false;
    }

    const rowDelta = targetRow - attackerRow;
    const columnDelta = targetColumn - attackerColumn;
    const absRowDelta = Math.abs(rowDelta);
    const absColumnDelta = Math.abs(columnDelta);

    // Orthogonal adjacent melee requires a clear shared edge.
    if (absRowDelta + absColumnDelta === 1) {
      return !this.isSightBlockedBetweenAdjacentSquares(
        dungonId,
        attackerRow,
        attackerColumn,
        targetRow,
        targetColumn
      );
    }

    // Diagonal adjacent melee cannot cut through blocked corner walls.
    if (absRowDelta === 1 && absColumnDelta === 1) {
      const blockedVertical = this.isSightBlockedBetweenAdjacentSquares(
        dungonId,
        attackerRow,
        attackerColumn,
        targetRow,
        attackerColumn
      );

      const blockedHorizontal = this.isSightBlockedBetweenAdjacentSquares(
        dungonId,
        attackerRow,
        attackerColumn,
        attackerRow,
        targetColumn
      );

      return !blockedVertical && !blockedHorizontal;
    }

    return false;
  }

  private playStepSound(volume = 0.2): void {
    if (this.soundMuted()) return;
    try {
      const ctx = new AudioContext();
      const now = ctx.currentTime;

      // Short noise burst — stone scuff texture
      const bufSize = Math.ceil(ctx.sampleRate * 0.04);
      const noiseBuffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) noiseData[i] = Math.random() * 2 - 1;
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 800;
      noiseFilter.Q.value = 0.8;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(volume * 0.9, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noiseSource.start(now);
      noiseSource.stop(now + 0.04);

      // Low thud — heel impact body
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.07);
      gain.gain.setValueAtTime(volume * 2.0, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
      osc.onended = () => ctx.close();
    } catch { /* audio not supported */ }
  }

  private playClangSound(): void {
    if (this.soundMuted()) return;
    try {
      const ctx = new AudioContext();
      const now = ctx.currentTime;

      // Very short high-freq noise burst for the sharp metallic transient
      const bufSize = Math.ceil(ctx.sampleRate * 0.016);
      const noiseBuffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) noiseData[i] = Math.random() * 2 - 1;
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 9000;
      noiseFilter.Q.value = 1.8;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.85, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.016);
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noiseSource.start(now);
      noiseSource.stop(now + 0.016);

      // Inharmonic square-wave partials — very short decay for sharpness
      for (const [freq, vol, decay] of [
        [2400, 0.22, 0.07],
        [3700, 0.16, 0.05],
        [5500, 0.09, 0.04],
        [1200, 0.14, 0.09],
      ] as [number, number, number][]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + decay);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + decay);
      }

      // Hard snap thump — fast frequency drop, very short
      const thump = ctx.createOscillator();
      const thumpGain = ctx.createGain();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(300, now);
      thump.frequency.exponentialRampToValueAtTime(90, now + 0.022);
      thumpGain.gain.setValueAtTime(0.72, now);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      thump.connect(thumpGain);
      thumpGain.connect(ctx.destination);
      thump.start(now);
      thump.stop(now + 0.035);

      setTimeout(() => ctx.close(), 300);
    } catch { /* audio not supported */ }
  }

  private activateTresherGuards(dungonId: number, row: number, column: number): void {
    const monstersById = this.getMonstersByIdForDungon(dungonId);
    const instances = this.monsterInstances();
    let anyActivated = false;
    for (const m of instances) {
      if (!m.isDead && m.isDormant && m.guardRow === row && m.guardColumn === column) {
        m.isDormant = false;
        anyActivated = true;
        const template = monstersById.get(m.monsterId);
        this.addCombatLog(`${template?.name ?? 'Monster'} was guarding that treasure!`);
      }
    }
    if (anyActivated) {
      this.monsterInstances.update((arr) => [...arr]);
    }
  }

  private startMonsterTurns(): void {
    this.turnPhase.set('monsters');
    this.addCombatLog('--- Monster turns ---');
    this.comboTracker.set(null);
    this.outOfRangeTarget.set(null);

    const preview = this.gridPreviewContext();
    if (!preview) {
      this.endMonsterTurns();
      return;
    }

    const monstersById = this.getMonstersByIdForDungon(preview.dungonId);
    const instances = this.monsterInstances();
    for (const monster of instances) {
      if (monster.isDead || monster.isDormant) {
        monster.remainingAE = 0;
        monster.attacksUsedThisTurn = 0;
        continue;
      }
      const template = monstersById.get(monster.monsterId);
      monster.remainingAE = (template?.movementEconomy ?? 0) + (template?.numberOfAttacks ?? 0);
      monster.attacksUsedThisTurn = 0;
    }
    this.monsterInstances.update((arr) => [...arr]);

    this.processMonsterRound(preview.dungonId);
  }

  private processMonsterRound(dungonId: number): void {
    const instances = this.monsterInstances();
    const anyHasAE = instances.some((m) => !m.isDead && !m.isDormant && m.remainingAE > 0);
    if (!anyHasAE) {
      this.endMonsterTurns();
      return;
    }

    const preview = this.gridPreviewContext();
    if (!preview) {
      this.endMonsterTurns();
      return;
    }

    const monstersById = this.getMonstersByIdForDungon(dungonId);
    const playerRow = preview.centerRow;
    const playerCol = preview.centerColumn;

    // Activate dormant guard monsters if player is on their guarded square
    for (const m of instances) {
      if (!m.isDead && m.isDormant && m.guardRow !== null && m.guardColumn !== null) {
        if (playerRow === m.guardRow && playerCol === m.guardColumn) {
          m.isDormant = false;
          const t = monstersById.get(m.monsterId);
          this.addCombatLog(`${t?.name ?? 'Monster'} guards this spot and attacks!`);
          const tpl = monstersById.get(m.monsterId);
          m.remainingAE = (tpl?.movementEconomy ?? 0) + (tpl?.numberOfAttacks ?? 0);
        }
      }
      if (!m.isDead && m.isStationary && m.stationaryTriggerRow !== null && m.stationaryTriggerCol !== null) {
        if (playerRow === m.stationaryTriggerRow && playerCol === m.stationaryTriggerCol) {
          m.isStationary = false;
          const t = monstersById.get(m.monsterId);
          this.addCombatLog(`${t?.name ?? 'Monster'} starts moving!`);
        }
      }
    }

    for (const monster of instances) {
      if (monster.isDead || monster.isDormant || monster.remainingAE <= 0) {
        continue;
      }

      const template = monstersById.get(monster.monsterId);
      if (!template) {
        monster.remainingAE = 0;
        continue;
      }

      const maxAttacks = template.numberOfAttacks;
      const isAdjacent = this.canUseAdjacentMeleeAttack(dungonId, monster.row, monster.column, playerRow, playerCol);
      const canDetectPlayer = isAdjacent || this.isMonsterWithinRangeOfPlayer(monster, playerRow, playerCol, 5, dungonId);
      const shouldFlee = monster.currentHp <= template.runAt && template.runAt > 0;
      const isPassive = (template.npcOnlyAttackWhenAttacked || monster.noAttackUnlessAttacked) && !monster.npcIsHostile;

      // Call for reinforcements before acting (first time only, costs full turn)
      if (template.callsReinforcements && !monster.hasCalledReinforcements && canDetectPlayer) {
        monster.hasCalledReinforcements = true;
        monster.remainingAE = 0;
        this.addCombatLog(`${template.name} calls for reinforcements!`);
        for (const other of instances) {
          if (other !== monster && !other.isDead && other.isDormant) {
            other.isDormant = false;
            const otherTpl = monstersById.get(other.monsterId);
            other.remainingAE = (otherTpl?.movementEconomy ?? 0) + (otherTpl?.numberOfAttacks ?? 0);
          }
        }
        continue;
      }

      if (shouldFlee) {
        this.monsterTryFlee(monster, dungonId, playerRow, playerCol);
      } else if (isAdjacent && monster.attacksUsedThisTurn < maxAttacks) {
        // Won't attack unless attacked first (template or per-placement flag)
        if (isPassive) {
          monster.remainingAE = 0;
        } else {
          this.monsterAttackPlayer(monster, template, dungonId, playerRow, playerCol);
        }
      } else if (!isAdjacent && canDetectPlayer && !monster.isStationary) {
        // Peaceful or stationary NPCs don't move toward the player
        if (isPassive) {
          monster.remainingAE = 0;
        } else {
          this.monsterMoveToward(monster, dungonId, playerRow, playerCol);
        }
      } else if (monster.roam && !monster.isStationary) {
        this.monsterMoveRandom(monster, dungonId);
      } else {
        monster.remainingAE = 0;
      }

      if (this.turnPhase() === 'gameover') {
        return;
      }
    }

    this.monsterInstances.update((arr) => [...arr]);
    this.syncMonsterPlacementsFromInstances(dungonId);
    this.drawPreviewGridCanvas();

    setTimeout(() => this.processMonsterRound(dungonId), 300);
  }

  private monsterAttackPlayer(
    monster: GameMonsterInstance,
    template: Monster,
    dungonId: number,
    playerRow: number,
    playerCol: number
  ): void {
    this.consumeMonsterAE(monster, 1, dungonId);
    if (monster.isDead) return;
    monster.attacksUsedThisTurn += 1;

    const attack = template.attacks[monster.attacksUsedThisTurn - 1] ?? template.attacks[0];
    const plusToHit = attack?.plusToHit ?? 0;
    const maxDamage = attack?.damage ?? 1;
    const attackLabel = this.getMonsterAttackLabel(attack);

    if (attack?.type === 'Weapon') {
      this.playClangSound();
    }

    const coverPenalty = this.getAttackCoverPenalty(dungonId, monster.row, monster.column, playerRow, playerCol);
    const hitRoll = this.rollD12(plusToHit + coverPenalty);
    let playerAC = this.getPlayerAC();
    if (this.playerDefendStacks() > 0) {
      playerAC += 2;
      this.playerDefendStacks.update((s) => s - 1);
    }

    if (hitRoll >= playerAC) {
      const damage = maxDamage <= 1 ? 1 : this.randomInt(1, maxDamage);
      this.playerHp.update((hp) => Math.max(0, hp - damage));
      this.triggerPlayerHitFlash();
      this.addCombatLog(
        `${template.name} hits you with ${attackLabel} for ${damage} dmg! (rolled ${hitRoll} vs AC ${playerAC})`
      );

      if (this.playerHp() <= 0) {
        this.playerDeathCause.set(`Slain by ${template.name}`);
        this.turnPhase.set('gameover');
        this.addCombatLog('You have been slain. Game Over!');
        setTimeout(() => this.goHome(), 3500);
      }
    } else {
      this.addCombatLog(
        `${template.name} misses you with ${attackLabel}. (rolled ${hitRoll} vs AC ${playerAC})`
      );
    }
  }

  private getMonsterAttackLabel(attack: MonsterAttack | undefined): string {
    if (!attack) return 'an attack';
    const type = (attack.type || '').trim();
    const description = (attack.description || '').trim();
    if (type && description) {
      return `${type} (${description})`;
    }
    if (type) {
      return type;
    }
    if (description) {
      return description;
    }
    return 'an attack';
  }

  private formatSpellFlavor(spell: PcTresherSpellData): string {
    const type = (spell.effectType || 'Other').trim() || 'Other';
    const color = (spell.effectColor || '').trim();
    if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
      return ` [${type} ${color.toUpperCase()}]`;
    }
    return ` [${type}]`;
  }

  private monsterTryFlee(
    monster: GameMonsterInstance,
    dungonId: number,
    playerRow: number,
    playerCol: number
  ): void {
    const directions = this.getShuffledDirections();
    let bestDir: { rowOffset: number; columnOffset: number } | null = null;
    let bestDist = this.chebyshevDistance(monster.row, monster.column, playerRow, playerCol);

    for (const dir of directions) {
      const nr = monster.row + dir.rowOffset;
      const nc = monster.column + dir.columnOffset;
      const dist = this.chebyshevDistance(nr, nc, playerRow, playerCol);
      if (dist > bestDist && this.canMonsterMoveTo(monster, dungonId, nr, nc)) {
        const isDiag = dir.rowOffset !== 0 && dir.columnOffset !== 0;
        if (isDiag && monster.remainingAE < 2) {
          continue;
        }
        bestDist = dist;
        bestDir = dir;
      }
    }

    if (bestDir) {
      const isDiag = bestDir.rowOffset !== 0 && bestDir.columnOffset !== 0;
      this.consumeMonsterAE(monster, isDiag ? 2 : 1, dungonId);
      if (!monster.isDead) {
        monster.row += bestDir.rowOffset;
        monster.column += bestDir.columnOffset;
        this.playStepSound(0.1);
      }
    } else {
      monster.remainingAE = 0;
    }
  }

  private monsterMoveToward(
    monster: GameMonsterInstance,
    dungonId: number,
    playerRow: number,
    playerCol: number
  ): void {
    const directions = this.getShuffledDirections();
    let bestDir: { rowOffset: number; columnOffset: number } | null = null;
    let bestDist = this.chebyshevDistance(monster.row, monster.column, playerRow, playerCol);

    for (const dir of directions) {
      const nr = monster.row + dir.rowOffset;
      const nc = monster.column + dir.columnOffset;
      const dist = this.chebyshevDistance(nr, nc, playerRow, playerCol);
      if (dist < bestDist && this.canMonsterMoveTo(monster, dungonId, nr, nc)) {
        const isDiag = dir.rowOffset !== 0 && dir.columnOffset !== 0;
        if (isDiag && monster.remainingAE < 2) {
          continue;
        }
        bestDist = dist;
        bestDir = dir;
      }
    }

    if (bestDir) {
      const isDiag = bestDir.rowOffset !== 0 && bestDir.columnOffset !== 0;
      this.consumeMonsterAE(monster, isDiag ? 2 : 1, dungonId);
      if (!monster.isDead) {
        monster.row += bestDir.rowOffset;
        monster.column += bestDir.columnOffset;
        this.playStepSound(0.12);
      }
    } else {
      monster.remainingAE = 0;
    }
  }

  private monsterMoveRandom(monster: GameMonsterInstance, dungonId: number): void {
    const directions = this.getShuffledDirections();
    for (const dir of directions) {
      const nr = monster.row + dir.rowOffset;
      const nc = monster.column + dir.columnOffset;
      if (this.canMonsterMoveTo(monster, dungonId, nr, nc)) {
        const isDiag = dir.rowOffset !== 0 && dir.columnOffset !== 0;
        if (isDiag && monster.remainingAE < 2) {
          continue;
        }
        this.consumeMonsterAE(monster, isDiag ? 2 : 1, dungonId);
        if (!monster.isDead) {
          monster.row = nr;
          monster.column = nc;
          this.playStepSound(0.12);
        }
        return;
      }
    }
    monster.remainingAE = 0;
  }

  private canMonsterMoveTo(
    monster: GameMonsterInstance,
    dungonId: number,
    targetRow: number,
    targetCol: number
  ): boolean {
    if (targetRow < 0 || targetCol < 0 || targetRow >= this.gridRowCount || targetCol >= this.gridColumnCount) {
      return false;
    }

    const filledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
    if (!filledSquares[this.getSquareKey(targetRow, targetCol)]) {
      return false;
    }

    const rowOffset = targetRow - monster.row;
    const colOffset = targetCol - monster.column;
    const isCardinal = Math.abs(rowOffset) + Math.abs(colOffset) === 1;
    const isDiag = Math.abs(rowOffset) === 1 && Math.abs(colOffset) === 1;

    if (!isCardinal && !isDiag) {
      return false;
    }

    if (isCardinal) {
      if (this.isMovementBlockedBetweenAdjacentSquares(dungonId, monster.row, monster.column, targetRow, targetCol)) {
        return false;
      }
    } else if (isDiag) {
      if (this.isDiagonalMovementBlocked(dungonId, monster.row, monster.column, rowOffset, colOffset)) {
        return false;
      }
    }

    const preview = this.gridPreviewContext();
    if (preview && targetRow === preview.centerRow && targetCol === preview.centerColumn) {
      return false;
    }

    const otherMonster = this.monsterInstances().some(
      (m) => m !== monster && !m.isDead && m.row === targetRow && m.column === targetCol
    );
    if (otherMonster) {
      return false;
    }

    return true;
  }

  private isMonsterWithinRangeOfPlayer(
    monster: GameMonsterInstance,
    playerRow: number,
    playerCol: number,
    range: number,
    dungonId: number
  ): boolean {
    const dist = this.chebyshevDistance(monster.row, monster.column, playerRow, playerCol);
    if (dist > range) {
      return false;
    }

    const directions = this.getShuffledDirections();
    const currentDist = dist;
    for (const dir of directions) {
      const nr = monster.row + dir.rowOffset;
      const nc = monster.column + dir.columnOffset;
      const moveDist = this.chebyshevDistance(nr, nc, playerRow, playerCol);
      if (moveDist < currentDist && this.canMonsterMoveTo(monster, dungonId, nr, nc)) {
        return true;
      }
    }

    return this.isAdjacentTo(monster.row, monster.column, playerRow, playerCol);
  }

  private chebyshevDistance(r1: number, c1: number, r2: number, c2: number): number {
    return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));
  }

  private getShuffledDirections(): { rowOffset: number; columnOffset: number }[] {
    const dirs = [
      { rowOffset: -1, columnOffset: 0 },
      { rowOffset: 1, columnOffset: 0 },
      { rowOffset: 0, columnOffset: -1 },
      { rowOffset: 0, columnOffset: 1 },
      { rowOffset: -1, columnOffset: -1 },
      { rowOffset: -1, columnOffset: 1 },
      { rowOffset: 1, columnOffset: -1 },
      { rowOffset: 1, columnOffset: 1 },
    ];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    return dirs;
  }

  private syncMonsterPlacementsFromInstances(dungonId: number): void {
    const instances = this.monsterInstances();
    const updatedPlacements: MonsterPlacement[] = instances.map((inst) => ({
      monsterId: inst.monsterId,
      row: inst.row,
      column: inst.column,
      roam: inst.roam,
    }));

    this.monsterPlacementsByDungon.update((all) => ({
      ...all,
      [dungonId]: updatedPlacements,
    }));
  }

  private endMonsterTurns(): void {
    const preview = this.gridPreviewContext();
    if (preview) {
      this.syncMonsterPlacementsFromInstances(preview.dungonId);
    }

    this.resetMonsterAE();
    this.drawPreviewGridCanvas();

    if (this.turnPhase() !== 'gameover') {
      this.playerDefendStacks.set(0);
      this.playerBoostAttackACPenalty.set(0);
      this.playerAE.set(this.getEffectivePlayerMaxAE());
      this.playerMp.set(this.getEffectivePlayerMagicPower());
      this.playerAttacksThisTurn.set(0);
      this.playerDefendsThisTurn.set(0);
      this.playerSearchesThisTurn.set(0);
      this.turnPhase.set('player');
      this.addCombatLog('Your turn. AE: ' + this.getEffectivePlayerMaxAE());
    }

    this.saveGameState();
  }

  private resetMonsterAE(): void {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return;
    }
    const monstersById = this.getMonstersByIdForDungon(preview.dungonId);
    const instances = this.monsterInstances();
    for (const monster of instances) {
      if (monster.isDead) {
        monster.remainingAE = 0;
        monster.attacksUsedThisTurn = 0;
        continue;
      }
      const template = monstersById.get(monster.monsterId);
      monster.remainingAE = (template?.movementEconomy ?? 0) + (template?.numberOfAttacks ?? 0);
      monster.attacksUsedThisTurn = 0;
    }
    this.monsterInstances.update((arr) => [...arr]);
  }

  private saveGameState(): void {
    const gameId = this.currentGameId();
    const preview = this.gridPreviewContext();
    const userKey = this.account.getKey();
    if (!gameId || !preview || !userKey) return;

    // Always update the pending payload to the latest state snapshot
    this.pendingSavePayload = { gameId, dungonId: preview.dungonId, userKey };

    // If already saving, just leave the pending payload — it will be sent when the current one finishes
    if (this.isSaveInFlight) return;

    this.flushSave();
  }

  private flushSave(retryPayload?: { gameId: number; dungonId: number; userKey: string; dungenJson: Record<string, unknown> }): void {
    // If caller passed an explicit retry payload, use it; otherwise consume the pending queue
    let payload: { gameId: number; userKey: string; dungenJson: Record<string, unknown> };
    if (retryPayload) {
      payload = retryPayload;
    } else {
      const pending = this.pendingSavePayload;
      if (!pending) return;
      this.pendingSavePayload = null;
      payload = { gameId: pending.gameId, userKey: pending.userKey, dungenJson: this.buildDungenJsonForSave(pending.dungonId) };
    }

    this.isSaveInFlight = true;
    this.saveStatus.set('saving');
    if (this.saveStatusTimer !== null) { clearTimeout(this.saveStatusTimer); this.saveStatusTimer = null; }

    this.http
      .put(`${API_BASE_URL}/games/${payload.gameId}/save`, { userkey: payload.userKey, dungenJson: payload.dungenJson })
      .subscribe({
        next: () => {
          this.isSaveInFlight = false;
          this.saveStatus.set('saved');
          this.saveStatusTimer = setTimeout(() => this.saveStatus.set(null), 3000);
          // If another save was queued while we were in-flight, send it now
          if (this.pendingSavePayload) this.flushSave();
        },
        error: () => {
          // Retry once with the same serialized snapshot (the DB still has the last good state)
          this.addCombatLog('[Warning] Save failed — retrying...');
          setTimeout(() => {
            this.http
              .put(`${API_BASE_URL}/games/${payload.gameId}/save`, { userkey: payload.userKey, dungenJson: payload.dungenJson })
              .subscribe({
                next: () => {
                  this.isSaveInFlight = false;
                  this.saveStatus.set('saved');
                  this.saveStatusTimer = setTimeout(() => this.saveStatus.set(null), 3000);
                  if (this.pendingSavePayload) this.flushSave();
                },
                error: () => {
                  // Both attempts failed — DB is out of sync with UI
                  this.isSaveInFlight = false;
                  this.saveStatus.set('lost');
                  this.addCombatLog('[ERROR] Progress could not be saved. Reload the page to restore from last save.');
                },
              });
          }, 2500);
        },
      });
  }

  private buildDungenJsonForSave(dungonId: number): Record<string, unknown> {
    const preview = this.gridPreviewContext();
    const instances = this.monsterInstances();
    const monstersById = this.getMonstersByIdForDungon(dungonId);

    const monsterList = (this.monsterListByDungon()[dungonId] ?? []).map((template) => {
      const liveInstance = instances.find((m) => m.monsterId === template.id);
      return {
        ...template,
        hp: liveInstance ? liveInstance.currentHp : template.hp,
      };
    });

    const monsterPlacements = instances.map((inst) => ({
      monsterId: inst.monsterId,
      row: inst.row,
      column: inst.column,
      roam: inst.roam,
      isDead: inst.isDead,
      currentHp: inst.currentHp,
      ...(inst.dropTresherIds.length > 0 ? { tresherIds: inst.dropTresherIds } : {}),
      ...(inst.dropKeyIds.length > 0 ? { keyIds: inst.dropKeyIds } : {}),
      ...(inst.dropItemIds.length > 0 ? { itemIds: inst.dropItemIds } : {}),
      ...(inst.dropSpellIds.length > 0 ? { spellIds: inst.dropSpellIds } : {}),
      ...(inst.dropPotionIds.length > 0 ? { potionIds: inst.dropPotionIds } : {}),
    }));

    return {
      filledSquares: this.filledSquaresByDungon()[dungonId] ?? {},
      squares: this.squaresByDungon()[dungonId] ?? {},
      keyList: this.keyList,
      cheater: this.cheaterByDungon()[dungonId] ?? DEFAULT_CHEATER,
      cheaterByPcId: (() => {
        if (!this.isMainGame()) return {};
        const pcId = this.currentPcId_();
        if (pcId === null) return this.cheaterByPcId_();
        return { ...this.cheaterByPcId_(), [pcId]: this.cheaterByDungon()[dungonId] ?? DEFAULT_CHEATER };
      })(),
      pcInventoryInitialized: this.pcInventoryInitializedByDungon()[dungonId] ?? false,
      startpoint: this.startPointByDungon()[dungonId] ?? null,
      tresherList: this.tresherListByDungon()[dungonId] ?? [],
      tresherPlacements: this.tresherPlacementsByDungon()[dungonId] ?? [],
      monsterList,
      monsterPlacements,
      squareTexts: this.squareTextsByDungon()[dungonId] ?? [],
      floorTrapPlacements: this.floorTrapPlacementsByDungon()[dungonId] ?? [],
      obstaclePlacements: this.obstaclePlacementsByDungon()[dungonId] ?? [],
      playerHp: this.playerHp(),
      playerAE: this.playerAE(),
      turnPhase: this.turnPhase(),
      playerRow: preview?.centerRow ?? 0,
      playerColumn: preview?.centerColumn ?? 0,
      npcTradesPurchased: this.npcTradesPurchased(),
      itemPlacements: this.floorItemPlacementsByDungon()[dungonId] ?? [],
      potionPlacements: this.floorPotionPlacementsByDungon()[dungonId] ?? [],
      spellPlacements: this.floorSpellPlacementsByDungon()[dungonId] ?? [],
      floorItemList: this.floorItemListByDungon()[dungonId] ?? [],
      floorPotionList: this.floorPotionListByDungon()[dungonId] ?? [],
      floorSpellList: this.floorSpellListByDungon()[dungonId] ?? [],
      collectedFloorItems: this.collectedFloorItemsByDungon()[dungonId] ?? [],
      collectedFloorPotions: this.collectedFloorPotionsByDungon()[dungonId] ?? [],
      collectedFloorSpells: this.collectedFloorSpellsByDungon()[dungonId] ?? [],
    };
  }
}

const DEFAULT_CHEATER: Cheater = {
  name: 'Bob',
  rangeOfSight: 5,
  facingDir: 'right',
  inventory: {
    keys: [],
    treshers: [],
  },
};

const SIDE_RULES: SideRule[] = [
  {
    side: 'toTop',
    wallKey: 'wallTop',
    doorKey: 'doorTop',
    neighborRowOffset: -1,
    neighborColumnOffset: 0,
    oppositeSide: 'toBottom',
  },
  {
    side: 'toRight',
    wallKey: 'wallRight',
    doorKey: 'doorRight',
    neighborRowOffset: 0,
    neighborColumnOffset: 1,
    oppositeSide: 'toLeft',
  },
  {
    side: 'toBottom',
    wallKey: 'wallBottom',
    doorKey: 'doorBottom',
    neighborRowOffset: 1,
    neighborColumnOffset: 0,
    oppositeSide: 'toTop',
  },
  {
    side: 'toLeft',
    wallKey: 'wallLeft',
    doorKey: 'doorLeft',
    neighborRowOffset: 0,
    neighborColumnOffset: -1,
    oppositeSide: 'toRight',
  },
];

