import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { Account } from '../../services/account';
import { DungeonFirstPersonComponent } from '../dungeon-first-person/dungeon-first-person';
import { DungeonPreviewGridComponent } from '../dungeon-preview-grid/dungeon-preview-grid';
import { Door } from '../../interfaces/door';
import { Square } from '../../interfaces/square';
import { Wall } from '../../interfaces/wall';
import { Key } from '../../interfaces/key';
import { API_BASE_URL } from '../../api-config';
import {
  AdjacentConnectionInfo,
  ArmorType,
  Cheater,
  CheaterInventory,
  CoinType,
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
  TresherType,
} from '../../interfaces/game';

interface GameSessionPayload {
  id: number;
  dungonid: number;
  name: string;
  dungenJson: unknown;
  lastupdated: string;
  pcTreshers?: unknown[];
  pcCurrentHP?: number | null;
  pcMaxHP?: number | null;
}

interface ImageRecordPayload {
  id: number;
  path: string;
}

type DiagonalFacingDirection = 'upRight' | 'downRight' | 'downLeft' | 'upLeft';
type DisplayFacingDirection = FacingDirection | DiagonalFacingDirection;
type DirectionPadDirection = DisplayFacingDirection | 'center';
type InfoPanelTab = 'nearby' | 'inventory';
type TurnPhase = 'player' | 'monsters' | 'gameover';

interface GameMonsterInstance {
  placementIndex: number;
  monsterId: number;
  row: number;
  column: number;
  roam: boolean;
  currentHp: number;
  isDead: boolean;
  remainingAE: number;
  attacksUsedThisTurn: number;
}

interface CombatLogEntry {
  text: string;
}

interface NearbyDoorInfo {
  door: Door;
  squareKey: string;
  side: SquareSide;
  neighborSquareKey: string;
  neighborSide: SquareSide;
  direction: string;
  canOpen: boolean;
  canUnlock: boolean;
  matchingKeyIndex: number | null;
}

interface DirectionPadButton {
  direction: DirectionPadDirection;
  label: string;
  ariaLabel: string;
}

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [DungeonFirstPersonComponent, DungeonPreviewGridComponent],
  templateUrl: './game.html',
  styleUrl: './game.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Game implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly account = inject(Account);

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
  readonly previewActionMessage = signal<string | null>(null);
  readonly visualFacingByDungon = signal<Record<number, DisplayFacingDirection>>({});
  readonly activeInfoPanelTab = signal<InfoPanelTab>('nearby');
  readonly equippedTresherIndexesByDungon = signal<Record<number, number[]>>({});

  readonly gridPreviewContext = signal<GridPreviewContext | null>(null);
  readonly cheaterByDungon = signal<Record<number, Cheater>>({});
  readonly startPointByDungon = signal<Record<number, StartPoint | null>>({});
  readonly tresherListByDungon = signal<Record<number, Tresher[]>>({});
  readonly tresherPlacementsByDungon = signal<Record<number, TresherPlacement[]>>({});
  readonly monsterListByDungon = signal<Record<number, Monster[]>>({});
  readonly monsterPlacementsByDungon = signal<Record<number, MonsterPlacement[]>>({});
  readonly filledSquaresByDungon = signal<Record<number, Record<string, true>>>({});
  readonly squaresByDungon = signal<Record<number, Record<string, Square>>>({});
  readonly squareTextsByDungon = signal<Record<number, SquareText[]>>({});

  private readonly monsterImageCache = new Map<number, HTMLImageElement>();

  readonly turnPhase = signal<TurnPhase>('player');
  readonly playerAE = signal(0);
  readonly playerMaxAE = 5;
  readonly playerHp = signal(20);
  readonly playerMaxHp = signal(20);
  readonly playerBaseAC = 10;
  readonly monsterInstances = signal<GameMonsterInstance[]>([]);
  readonly combatLog = signal<CombatLogEntry[]>([]);
  readonly currentGameId = signal<number | null>(null);
  readonly pcInventoryInitializedByDungon = signal<Record<number, boolean>>({});

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

  previewMonsterImagesBySquareForView(): Map<string, HTMLImageElement | null> {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return new Map<string, HTMLImageElement | null>();
    }

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
      inventoryContext.inventory.treshers.length > 0
    );
  }

  isTresherEquipable(tresher: Tresher): boolean {
    return this.getHandsRequiredForEquip(tresher) > 0 || tresher.armorType !== null;
  }

  isHealingPotion(tresher: Tresher): boolean {
    return this.getHealingPotionAmount(tresher) > 0;
  }

  canUseHealingPotion(tresher: Tresher): boolean {
    return (
      this.isHealingPotion(tresher) &&
      this.turnPhase() === 'player' &&
      this.playerHp() > 0 &&
      this.playerHp() < this.playerMaxHp()
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
      this.previewActionMessage.set(`${tresherName} unequipped.`);
      return;
    }

    if (!this.isTresherEquipable(selectedTresher)) {
      this.previewActionMessage.set(`${tresherName} cannot be equipped.`);
      return;
    }

    const equippedTreshers = equippedIndexes
      .map((equippedIndex) => inventory.treshers[equippedIndex])
      .filter((item): item is Tresher => item !== undefined);

    if (
      selectedTresher.armorType !== null &&
      equippedTreshers.some((item) => item.armorType === selectedTresher.armorType)
    ) {
      this.previewActionMessage.set(
        `Only one ${selectedTresher.armorType} armor item can be equipped at a time.`
      );
      return;
    }

    const selectedHands = this.getHandsRequiredForEquip(selectedTresher);
    const usedHands = equippedTreshers.reduce(
      (sum, item) => sum + this.getHandsRequiredForEquip(item),
      0
    );
    if (usedHands + selectedHands > this.maxEquippableHands) {
      this.previewActionMessage.set(
        `Cannot equip ${tresherName}. Hands used would be ${usedHands + selectedHands} of ${this.maxEquippableHands}.`
      );
      return;
    }

    this.setEquippedTresherIndexesForDungon(dungonId, [...equippedIndexes, index]);
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

    if (!this.isHealingPotion(potion)) {
      this.previewActionMessage.set(`${potionName} cannot restore health.`);
      return;
    }

    const currentHp = this.playerHp();
    const maxHp = this.playerMaxHp();
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

    return equippedIndexes.reduce((sum, equippedIndex) => {
      const equippedItem = inventoryContext.inventory.treshers[equippedIndex];
      if (!equippedItem) {
        return sum;
      }

      return sum + this.getHandsRequiredForEquip(equippedItem);
    }, 0);
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

    const armorTypes = equippedIndexes
      .map((equippedIndex) => inventoryContext.inventory.treshers[equippedIndex]?.armorType)
      .filter((armorType): armorType is ArmorType => armorType !== null && armorType !== undefined);

    if (armorTypes.length === 0) {
      return 'None';
    }

    return armorTypes.join(', ');
  }

  getInventoryTresherMeta(tresher: Tresher): string {
    const parts: string[] = [];
    const handCount = this.getHandsRequiredForEquip(tresher);
    if (handCount > 0) {
      parts.push(`Hands: ${handCount}`);
    }

    if (tresher.armorType !== null) {
      parts.push(`Armor Slot: ${tresher.armorType}`);
    }

    const healingAmount = this.getHealingPotionAmount(tresher);
    if (healingAmount > 0) {
      parts.push(`Heals ${healingAmount} HP`);
    }

    if (parts.length === 0) {
      return 'Not equipable';
    }

    return parts.join(' | ');
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
    for (const inst of liveInstances) {
      if (!isRelevantSquare(inst.row, inst.column)) {
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

    for (const st of this.squareTextsByDungon()[preview.dungonId] ?? []) {
      if (st.row === currentRow && st.column === currentColumn) {
        items.push({
          kind: 'Text',
          name: 'Message',
          description: st.text,
          row: st.row,
          column: st.column,
        });
      }
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
      if (seenDoorIds.has(connection.id)) {
        continue;
      }
      seenDoorIds.add(connection.id);

      const neighborKey = this.getSquareKey(row + check.dr, col + check.dc);
      const canOpen = !connection.isLocked && connection.state === 'closed';
      let canUnlock = false;
      let matchingKeyIndex: number | null = null;

      if (connection.isLocked && connection.state === 'closed' && connection.keyLock) {
        const keyIdx = inventoryKeys.findIndex(
          (k) => k.doorId === connection.id || k.id === connection.keyLock!.id
        );
        if (keyIdx !== -1) {
          canUnlock = true;
          matchingKeyIndex = keyIdx;
        }
      }

      doors.push({
        door: connection,
        squareKey,
        side: check.side,
        neighborSquareKey: neighborKey,
        neighborSide: check.neighborSide,
        direction: check.label,
        canOpen,
        canUnlock,
        matchingKeyIndex,
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

  hasCurrentSquarePickupItems(): boolean {
    return this.currentSquareItemsForPreview().length > 0;
  }

  canTakeSomeFromCurrentSquare(): boolean {
    const current = this.getCurrentPreviewSquareContext();
    if (!current) {
      return false;
    }

    return this.getTresherPlacementsAtSquare(current.dungonId, current.row, current.column).length > 1;
  }

  lookForTrapsAtCurrentSquare(): void {
    const current = this.getCurrentPreviewSquareContext();
    if (!current) {
      return;
    }

    const treshers = this.getTreshersAtSquare(current.dungonId, current.row, current.column);
    if (treshers.length === 0) {
      this.previewActionMessage.set('No treshers here to inspect for traps.');
      return;
    }

    const trappedTreshers = treshers.filter(
      (tresher) => tresher.trapID !== null || tresher.curseID !== null
    ).length;

    if (trappedTreshers === 0) {
      this.previewActionMessage.set('No trap signs found on current treshers.');
      return;
    }

    this.previewActionMessage.set(
      `Possible trap signs on ${trappedTreshers} tresher${trappedTreshers === 1 ? '' : 's'}.`
    );
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

    if (keysAtSquare.length === 0 && tresherPlacements.length === 0) {
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
    }

    const totalItemCount = keysAtSquare.length + tresherPlacements.length;
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

    const remainingCount = tresherPlacements.length - 1;
    this.previewActionMessage.set(
      `Took 1 tresher. ${remainingCount} tresher${remainingCount === 1 ? '' : 's'} remain here.`
    );
    this.drawPreviewGridCanvas();
  }

  private loadGame(): void {
    const gameId = Number.parseInt(this.route.snapshot.paramMap.get('gameId') ?? '', 10);
    if (!Number.isInteger(gameId) || gameId <= 0) {
      this.gameLoadError.set('Invalid game id.');
      return;
    }

    const userKey = this.account.getKey();
    if (!userKey) {
      this.gameLoadError.set('Please log in to load a game.');
      return;
    }

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
          this.loadDungonJsonState(game.dungonid, game.dungenJson);
          this.seedPcTreshersIntoInventory(game.dungonid, game.pcTreshers);
          this.setInitialPreviewContext(game.dungonid);
          this.loadMonsterImages(game.dungonid);
          this.initializeCombatState(game.dungonid);
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
              this.drawFirstPersonViewCanvas();
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

  private getEquippedTresherIndexesForDungon(
    dungonId: number,
    itemCount: number
  ): number[] {
    const seen = new Set<number>();
    const equippedIndexes = this.equippedTresherIndexesByDungon()[dungonId] ?? [];
    const sanitizedIndexes: number[] = [];

    for (const rawIndex of equippedIndexes) {
      if (!Number.isInteger(rawIndex)) {
        continue;
      }

      if (rawIndex < 0 || rawIndex >= itemCount || seen.has(rawIndex)) {
        continue;
      }

      seen.add(rawIndex);
      sanitizedIndexes.push(rawIndex);
    }

    return sanitizedIndexes;
  }

  private setEquippedTresherIndexesForDungon(dungonId: number, indexes: number[]): void {
    this.equippedTresherIndexesByDungon.update((allIndexes) => ({
      ...allIndexes,
      [dungonId]: indexes,
    }));
  }

  private getHandsRequiredForEquip(tresher: Tresher): number {
    if (typeof tresher.hands !== 'number' || !Number.isFinite(tresher.hands)) {
      return 0;
    }

    return Math.max(0, Math.floor(tresher.hands));
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
    const existingCheater = this.cheaterByDungon()[dungonId] ?? { ...DEFAULT_CHEATER };
    const existingInventory = this.normalizeCheaterInventory(existingCheater.inventory);

    const inventoryKeys = keys.map((key) => ({
      ...key,
      rownId: null,
      columnId: null,
    }));

    this.cheaterByDungon.update((allCheaters) => ({
      ...allCheaters,
      [dungonId]: {
        ...existingCheater,
        inventory: {
          keys: [...existingInventory.keys, ...inventoryKeys],
          treshers: [...existingInventory.treshers, ...treshers.map((tresher) => ({ ...tresher }))],
        },
      },
    }));

    this.setPcInventoryInitialized(dungonId, true);
  }

  private seedPcTreshersIntoInventory(dungonId: number, rawPcTreshers: unknown[] | undefined): void {
    if (this.pcInventoryInitializedByDungon()[dungonId]) {
      return;
    }

    if (!Array.isArray(rawPcTreshers) || rawPcTreshers.length === 0) {
      this.setPcInventoryInitialized(dungonId, true);
      return;
    }

    const existingCheater = this.cheaterByDungon()[dungonId] ?? { ...DEFAULT_CHEATER };
    const existingInventory = this.normalizeCheaterInventory(existingCheater.inventory);
    const existingIds = new Set(existingInventory.treshers.map((t) => t.id));

    const newTreshers = rawPcTreshers
      .map((item) => this.parseTresherItem(item))
      .filter((item): item is Tresher => item !== null && !existingIds.has(item.id));

    if (newTreshers.length === 0) {
      this.setPcInventoryInitialized(dungonId, true);
      return;
    }

    this.cheaterByDungon.update((allCheaters) => ({
      ...allCheaters,
      [dungonId]: {
        ...existingCheater,
        inventory: {
          keys: existingInventory.keys,
          treshers: [...newTreshers, ...existingInventory.treshers],
        },
      },
    }));

    this.setPcInventoryInitialized(dungonId, true);
  }

  private removeInventoryTresherAtIndex(dungonId: number, index: number): void {
    const existingCheater = this.cheaterByDungon()[dungonId] ?? { ...DEFAULT_CHEATER };
    const existingInventory = this.normalizeCheaterInventory(existingCheater.inventory);
    if (index < 0 || index >= existingInventory.treshers.length) {
      return;
    }

    const updatedTreshers = existingInventory.treshers.filter((_, itemIndex) => itemIndex !== index);
    const updatedEquippedIndexes = this.getEquippedTresherIndexesForDungon(
      dungonId,
      existingInventory.treshers.length
    )
      .filter((equippedIndex) => equippedIndex !== index)
      .map((equippedIndex) => (equippedIndex > index ? equippedIndex - 1 : equippedIndex));

    this.cheaterByDungon.update((allCheaters) => ({
      ...allCheaters,
      [dungonId]: {
        ...existingCheater,
        inventory: {
          keys: existingInventory.keys,
          treshers: updatedTreshers,
        },
      },
    }));

    this.setEquippedTresherIndexesForDungon(dungonId, updatedEquippedIndexes);
    this.setPcInventoryInitialized(dungonId, true);
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

        if (this.isDoorConnection(square.toTop)) {
          context.moveTo(left, top);
          context.lineTo(right, top);
        }

        if (this.isDoorConnection(square.toRight)) {
          context.moveTo(right, top);
          context.lineTo(right, bottom);
        }

        if (this.isDoorConnection(square.toBottom)) {
          context.moveTo(left, bottom);
          context.lineTo(right, bottom);
        }

        if (this.isDoorConnection(square.toLeft)) {
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
      this.drawMonsterMarker(context, centerX, centerY, 3.5);
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
    for (const placement of tresherPlacements) {
      const squareKey = this.getSquareKey(placement.row, placement.column);
      const existingCount = tresherCountBySquare.get(squareKey) ?? 0;
      tresherCountBySquare.set(squareKey, existingCount + 1);
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
      const tresherCount = tresherCountBySquare.get(squareKey) ?? 0;
      if (tresherCount > 0) {
        this.drawFirstPersonFloorCoinStack(context, nearFrame, farFrame, tresherCount);
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
      Math.min(this.firstPersonMaxDepth, Math.floor(Math.max(1, cheater.rangeOfSite + 1)))
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

    if (block.type === 'openDoor' || block.type === 'closedDoor') {
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

  private drawFirstPersonFloorCoinStack(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    tresherCount: number
  ): void {
    const midLeft = (nearFrame.left + farFrame.left) / 2;
    const midRight = (nearFrame.right + farFrame.right) / 2;
    const tileWidth = midRight - midLeft;
    const centerX = (midLeft + midRight) / 2 + tileWidth * 0.14;
    const floorY = (nearFrame.bottom + farFrame.bottom) / 2 + tileWidth * 0.04;
    const baseSize = Math.max(2.2, Math.min(8, tileWidth * 0.1));
    const stackSize = Math.max(1, Math.min(4, Math.floor(tresherCount)));
    const offsets = [
      { x: -baseSize * 0.78, y: baseSize * 0.22, radius: baseSize * 0.72 },
      { x: baseSize * 0.7, y: baseSize * 0.22, radius: baseSize * 0.72 },
      { x: 0, y: -baseSize * 0.18, radius: baseSize * 0.86 },
      { x: 0, y: -baseSize * 0.82, radius: baseSize * 0.63 },
    ];

    for (let index = 0; index < stackSize; index += 1) {
      const offset = offsets[index];
      this.drawTresherCoinMarker(
        context,
        centerX + offset.x,
        floorY + offset.y,
        Math.max(2, offset.radius)
      );
    }
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
  ): Array<{ squareKey: string; lateralOffset: number }> {
    const squares = this.squaresByDungon()[dungonId] ?? {};
    const filledSquares = this.filledSquaresByDungon()[dungonId] ?? {};
    const visibleSlots = [{ squareKey: this.getSquareKey(row, column), lateralOffset: 0 }];

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

  private toFirstPersonBlock(type: PathBlockType, door: Door | null): FirstPersonBlock {
    return {
      type,
      hasKeyhole: Boolean(door?.keyLock),
    };
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

    const frameWidth = frame.right - frame.left;
    const frameHeight = frame.bottom - frame.top;
    const insetX = Math.max(2, frameWidth * 0.1);
    const insetY = Math.max(2, frameHeight * 0.08);
    const doorLeft = frame.left + insetX;
    const doorRight = frame.right - insetX;
    const doorTop = frame.top + insetY;
    const doorBottom = frame.bottom - insetY;

    context.save();
    context.globalAlpha = isPortal ? 0.84 : 1;

    context.fillStyle = '#b33030';
    context.fillRect(doorLeft, doorTop, doorRight - doorLeft, doorBottom - doorTop);

    context.strokeStyle = '#f0b0b0';
    context.lineWidth = Math.max(1, Math.min(2, (doorRight - doorLeft) * 0.04));
    context.strokeRect(doorLeft, doorTop, doorRight - doorLeft, doorBottom - doorTop);

    if (block.type === 'openDoor') {
      const openingWidth = Math.max(3, (doorRight - doorLeft) * 0.35);
      const openingLeft = doorRight - openingWidth - Math.max(2, (doorRight - doorLeft) * 0.06);
      context.fillStyle = '#0c0f14';
      context.fillRect(openingLeft, doorTop + 2, openingWidth, Math.max(2, doorBottom - doorTop - 4));
    } else if (block.hasKeyhole) {
      const keyholeX = doorRight - Math.max(4, (doorRight - doorLeft) * 0.28);
      const keyholeY = doorTop + (doorBottom - doorTop) * 0.64;
      const keyholeRadius = Math.max(1.2, (doorRight - doorLeft) * 0.03);
      context.fillStyle = '#1f1111';
      context.beginPath();
      context.arc(keyholeX, keyholeY, keyholeRadius, 0, Math.PI * 2);
      context.fill();
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
    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const range =
      typeof cheater.rangeOfSite === 'number' && Number.isFinite(cheater.rangeOfSite)
        ? Math.max(0, cheater.rangeOfSite)
        : DEFAULT_CHEATER.rangeOfSite;

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
    const cornerPeekDistance = 1;
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

      if (blockedToHorizontal && blockedToVertical) {
        return false;
      }

      if (blockedToHorizontal || blockedToVertical) {
        const cornerDistanceFromSource = Math.max(
          Math.abs(currentRow - fromRow),
          Math.abs(currentColumn - fromColumn)
        );

        if (cornerDistanceFromSource > cornerPeekDistance) {
          return false;
        }
      }

      currentColumn = nextColumn;
      currentRow = nextRow;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    }

    return currentRow === toRow && currentColumn === toColumn;
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
    return this.isWallConnection(connection) || this.isDoorConnection(connection);
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

    const moveCost = isDiagonalStep ? 2 : 1;
    if (this.turnPhase() === 'player' && this.playerAE() < moveCost) {
      return;
    }

    if (this.turnPhase() === 'player') {
      this.playerAE.update((ae) => ae - moveCost);
    }

    const halfDimension = Math.floor(this.previewGridDimension / 2);
    this.gridPreviewContext.set({
      ...preview,
      centerRow: nextRow,
      centerColumn: nextColumn,
      startRow: nextRow - halfDimension,
      startColumn: nextColumn - halfDimension,
    });

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
      return {
        type: toConnection.state === 'closed' ? 'closedDoor' : 'openDoor',
        door: toConnection,
      };
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
      [dungonId]: parsed.cheater,
    }));

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

    this.setPcInventoryInitialized(dungonId, parsed.pcInventoryInitialized);

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
    pcInventoryInitialized: boolean;
    savedPlayerHp: number | null;
    savedPlayerAE: number | null;
    savedTurnPhase: TurnPhase | null;
    savedPlayerRow: number | null;
    savedPlayerColumn: number | null;
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
        pcInventoryInitialized: false,
        savedPlayerHp: null,
        savedPlayerAE: null,
        savedTurnPhase: null,
        savedPlayerRow: null,
        savedPlayerColumn: null,
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

    const inventory = this.parseCheaterInventory(sourceCheater);
    const cheater: Cheater = {
      name:
        typeof sourceCheater.name === 'string' && sourceCheater.name.trim()
          ? sourceCheater.name
          : DEFAULT_CHEATER.name,
      rangeOfSite:
        typeof sourceCheater.rangeOfSite === 'number' && Number.isFinite(sourceCheater.rangeOfSite)
          ? sourceCheater.rangeOfSite
          : DEFAULT_CHEATER.rangeOfSite,
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
      .map((item) => this.parseTresherItem(item))
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
      .map((item) => this.parseTresherPlacementItem(item))
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
      pcInventoryInitialized,
      savedPlayerHp: savedPlayerHpRaw,
      savedPlayerAE: savedPlayerAERaw,
      savedTurnPhase: savedTurnPhase,
      savedPlayerRow: savedPlayerRow !== null ? Math.floor(savedPlayerRow) : null,
      savedPlayerColumn: savedPlayerColumn !== null ? Math.floor(savedPlayerColumn) : null,
    };
  }

  private parseTresherItem(item: unknown): Tresher | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const source = item as Partial<Tresher> & {
      trapId?: unknown;
      curseId?: unknown;
      hp?: unknown;
    };
    const parsedId = this.toFiniteNumber(source.id);
    if (parsedId === null) {
      return null;
    }

    const trapSourceValue = source.trapID !== undefined ? source.trapID : source.trapId;
    const curseSourceValue = source.curseID !== undefined ? source.curseID : source.curseId;
    const hpSourceValue = source.HP !== undefined ? source.HP : source.hp;

    const type = this.normalizeTresherType(source.type);
    const tresher: Tresher = {
      id: Math.max(0, Math.floor(parsedId)),
      type,
      name: typeof source.name === 'string' && source.name.trim() ? source.name : 'Unnamed Tresher',
      description: typeof source.description === 'string' ? source.description : '',
      worth: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.worth), 0)),
      trapID: this.normalizeNullableNumber(this.toFiniteNumber(trapSourceValue)),
      curseID: this.normalizeNullableNumber(this.toFiniteNumber(curseSourceValue)),
      HP: null,
      damage: null,
      hands: null,
      range: null,
      ammoType: null,
      speedReduction: null,
      armorType: null,
      coinType: null,
      effectNumber: null,
      effectTarget: null,
      effectDuration: null,
    };

    if (type === 'Weapon') {
      tresher.HP = this.normalizeNumber(this.toFiniteNumber(hpSourceValue), 10);
      tresher.damage = Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.damage), 0));
      tresher.hands = Math.max(1, this.normalizeNumber(this.toFiniteNumber(source.hands), 1));
      tresher.range = Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.range), 0));
      tresher.ammoType =
        typeof source.ammoType === 'string' && source.ammoType.trim() ? source.ammoType : null;
    } else if (type === 'Armor') {
      tresher.HP = this.normalizeNumber(this.toFiniteNumber(hpSourceValue), 10);
      tresher.hands = Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.hands), 0));
      tresher.speedReduction = this.normalizeNumber(this.toFiniteNumber(source.speedReduction), 0);
      tresher.armorType = this.normalizeArmorType(source.armorType);
    } else if (type === 'Coins') {
      tresher.coinType = this.normalizeCoinType(source.coinType);
    } else if (type === 'Potion') {
      tresher.effectNumber = this.normalizeNumber(this.toFiniteNumber(source.effectNumber), 0);
      const rawTarget = typeof source.effectTarget === 'string' ? source.effectTarget : '';
      tresher.effectTarget = (rawTarget === 'Health' || rawTarget === 'AC' || rawTarget === 'AE') ? rawTarget : 'Health';
      if (tresher.effectTarget === 'AC' || tresher.effectTarget === 'AE') {
        tresher.effectDuration = Math.max(1, this.normalizeNumber(this.toFiniteNumber(source.effectDuration), 1));
      }
    } else {
      tresher.HP = this.normalizeNumber(this.toFiniteNumber(hpSourceValue), 10);
    }

    return tresher;
  }

  private parseTresherPlacementItem(item: unknown): TresherPlacement | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const source = item as Partial<TresherPlacement> & {
      trasherId?: unknown;
      tresherID?: unknown;
      rownId?: unknown;
      columnId?: unknown;
      col?: unknown;
    };

    const tresherIdRaw =
      source.tresherId !== undefined
        ? source.tresherId
        : source.tresherID !== undefined
          ? source.tresherID
          : source.trasherId;
    const rowRaw = source.row !== undefined ? source.row : source.rownId;
    const columnRaw =
      source.column !== undefined
        ? source.column
        : source.columnId !== undefined
          ? source.columnId
          : source.col;

    const tresherId = this.toFiniteNumber(tresherIdRaw);
    const row = this.toFiniteNumber(rowRaw);
    const column = this.toFiniteNumber(columnRaw);
    if (tresherId === null || row === null || column === null) {
      return null;
    }

    return {
      tresherId: Math.max(0, Math.floor(tresherId)),
      row: Math.floor(row),
      column: Math.floor(column),
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
          description: typeof source.description === 'string' ? source.description : '',
          damage: Math.max(0, this.normalizeNumber(this.toFiniteNumber(source.damage), 0)),
          plusToHit: Math.max(
            0,
            this.normalizeNumber(this.toFiniteNumber(source.plusToHit ?? source.plus_to_hit), 0)
          ),
        };
      })
      .filter((item): item is MonsterAttack => item !== null);
  }

  private parseCheaterInventory(
    sourceCheater: Partial<Cheater> & {
      inventory?: unknown;
      inventoryKeys?: unknown[];
      inventoryTreshers?: unknown[];
    }
  ): CheaterInventory {
    const sourceInventory =
      sourceCheater.inventory && typeof sourceCheater.inventory === 'object'
        ? (sourceCheater.inventory as Partial<CheaterInventory> & {
            tresherList?: unknown[];
            tresherInventory?: unknown[];
          })
        : null;

    const sourceInventoryKeys = Array.isArray(sourceInventory?.keys)
      ? sourceInventory.keys
      : Array.isArray(sourceCheater.inventoryKeys)
        ? sourceCheater.inventoryKeys
        : [];

    const sourceInventoryTreshers = Array.isArray(sourceInventory?.treshers)
      ? sourceInventory.treshers
      : Array.isArray(sourceInventory?.tresherList)
        ? sourceInventory.tresherList
        : Array.isArray(sourceInventory?.tresherInventory)
          ? sourceInventory.tresherInventory
          : Array.isArray(sourceCheater.inventoryTreshers)
            ? sourceCheater.inventoryTreshers
            : [];

    const keys = sourceInventoryKeys
      .map((item) => this.parseInventoryKeyItem(item))
      .filter((item): item is Key => item !== null);

    const treshers = sourceInventoryTreshers
      .map((item) => this.parseTresherItem(item))
      .filter((item): item is Tresher => item !== null);

    return {
      keys,
      treshers,
    };
  }

  private parseInventoryKeyItem(item: unknown): Key | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const sourceKey = item as Partial<Key> & {
      row?: unknown;
      column?: unknown;
    };
    const parsedId = this.toFiniteNumber(sourceKey.id);
    if (parsedId === null) {
      return null;
    }

    const rowValue = sourceKey.rownId !== undefined ? sourceKey.rownId : sourceKey.row;
    const columnValue = sourceKey.columnId !== undefined ? sourceKey.columnId : sourceKey.column;

    return {
      id: Math.max(0, Math.floor(parsedId)),
      name: typeof sourceKey.name === 'string' ? sourceKey.name : '',
      description: typeof sourceKey.description === 'string' ? sourceKey.description : '',
      doorId: this.normalizeNullableNumber(this.toFiniteNumber(sourceKey.doorId)),
      rownId: this.normalizeNullableNumber(this.toFiniteNumber(rowValue)),
      columnId: this.normalizeNullableNumber(this.toFiniteNumber(columnValue)),
    };
  }

  private normalizeCheaterInventory(
    inventory: CheaterInventory | null | undefined
  ): CheaterInventory {
    return {
      keys: Array.isArray(inventory?.keys)
        ? inventory.keys.map((key) => ({ ...key }))
        : [],
      treshers: Array.isArray(inventory?.treshers)
        ? inventory.treshers.map((tresher) => ({ ...tresher }))
        : [],
    };
  }

  private getHealingPotionAmount(tresher: Tresher): number {
    if (tresher.type !== 'Potion' || tresher.effectTarget !== 'Health') {
      return 0;
    }

    if (typeof tresher.effectNumber !== 'number' || !Number.isFinite(tresher.effectNumber)) {
      return 0;
    }

    return Math.max(0, Math.floor(tresher.effectNumber));
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
    this.pcInventoryInitializedByDungon.update((allStates) => ({
      ...allStates,
      [dungonId]: isInitialized,
    }));
  }

  private normalizeTresherType(value: unknown): TresherType {
    return value === 'Weapon' || value === 'Armor' || value === 'Coins' || value === 'Potion' || value === 'OtherTresher'
      ? value
      : 'OtherTresher';
  }

  private normalizeArmorType(value: unknown): ArmorType | null {
    return value === 'head' ||
      value === 'hand' ||
      value === 'body' ||
      value === 'arms' ||
      value === 'legs'
      ? value
      : null;
  }

  private normalizeCoinType(value: unknown): CoinType | null {
    return value === 'Gold' || value === 'Silver' || value === 'Copper' || value === 'Tin'
      ? value
      : null;
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
      };
    });
    this.monsterInstances.set(instances);

    if (hasSavedCombat) {
      this.playerHp.set(
        this.resolvePlayerCurrentHp(saved.playerHp ?? this.playerStartingHp, this.playerMaxHp())
      );
      const restoredAE = saved.playerAE ?? this.playerMaxAE;
      this.turnPhase.set(saved.turnPhase!);
      this.playerAE.set(
        saved.turnPhase === 'player' && restoredAE <= 0 ? this.playerMaxAE : restoredAE
      );
    } else {
      this.playerHp.set(this.playerStartingHp);
      this.playerAE.set(this.playerMaxAE);
      this.turnPhase.set('player');
    }

    this.combatLog.set([]);
    this.addCombatLog('Your turn. AE: ' + this.playerAE());
    this.savedCombatState = { playerHp: null, playerAE: null, turnPhase: null, playerRow: null, playerColumn: null };
  }

  private addCombatLog(text: string): void {
    this.combatLog.update((log) => [...log.slice(-49), { text }]);
  }

  private getPlayerAC(): number {
    const preview = this.gridPreviewContext();
    if (!preview) {
      return this.playerBaseAC;
    }
    const equippedIndexes = this.equippedTresherIndexesByDungon()[preview.dungonId] ?? [];
    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const inventory = cheater.inventory?.treshers ?? [];
    let armorCount = 0;
    for (const idx of equippedIndexes) {
      if (inventory[idx]?.armorType) {
        armorCount += 1;
      }
    }
    return this.playerBaseAC + armorCount;
  }

  endPlayerTurnEarly(): void {
    if (this.turnPhase() !== 'player') {
      return;
    }
    this.playerAE.set(0);
    this.addCombatLog('You end your turn early.');
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

    const adjacentMonster = this.findAdjacentLiveMonster(preview.centerRow, preview.centerColumn);
    if (!adjacentMonster) {
      this.addCombatLog('No monster adjacent to attack.');
      return;
    }

    this.playerAE.update((ae) => ae - 1);
    const template = this.getMonstersByIdForDungon(preview.dungonId).get(adjacentMonster.monsterId);
    const monsterAC = template?.ac ?? 10;

    const equippedIndexes = this.equippedTresherIndexesByDungon()[preview.dungonId] ?? [];
    const cheater = this.cheaterByDungon()[preview.dungonId] ?? DEFAULT_CHEATER;
    const inventory = cheater.inventory?.treshers ?? [];
    let weaponDamage = 1;
    let weaponToHit = 0;
    for (const idx of equippedIndexes) {
      const tresher = inventory[idx];
      if (tresher && tresher.damage !== null && tresher.damage > 0) {
        weaponDamage = Math.max(weaponDamage, tresher.damage);
        weaponToHit += (tresher.range ?? 0);
      }
    }

    const hitRoll = this.rollCombat(weaponToHit);
    if (hitRoll >= monsterAC) {
      const damage = weaponDamage <= 1 ? 1 : this.randomInt(1, weaponDamage);
      adjacentMonster.currentHp -= damage;
      this.addCombatLog(
        `You hit ${template?.name ?? 'monster'} for ${damage} dmg! (rolled ${hitRoll} vs AC ${monsterAC})`
      );
      if (adjacentMonster.currentHp <= 0) {
        adjacentMonster.isDead = true;
        adjacentMonster.currentHp = 0;
        this.addCombatLog(`${template?.name ?? 'Monster'} is dead!`);
        this.dropMonsterLoot(preview.dungonId, adjacentMonster, template ?? null);
      }
      this.monsterInstances.update((arr) => [...arr]);
    } else {
      this.addCombatLog(
        `You miss ${template?.name ?? 'monster'}. (rolled ${hitRoll} vs AC ${monsterAC})`
      );
    }

    this.drawPreviewGridCanvas();

    if (this.playerAE() <= 0) {
      this.startMonsterTurns();
    }
  }

  private rollCombat(plusToHit: number): number {
    let total = this.randomInt(1, 12);
    for (let i = 0; i < Math.abs(plusToHit); i++) {
      total += this.randomInt(1, 6);
    }
    return total;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
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

    const tresherIds = template.tresherIds ?? [];
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

    const keyIds = template.keyIds ?? [];
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

    if (droppedNames.length > 0) {
      this.addCombatLog(`${template.name} dropped: ${droppedNames.join(', ')}`);
    }
  }

  private findAdjacentLiveMonster(row: number, col: number): GameMonsterInstance | null {
    const instances = this.monsterInstances();
    for (const monster of instances) {
      if (monster.isDead) {
        continue;
      }
      const dr = Math.abs(monster.row - row);
      const dc = Math.abs(monster.column - col);
      if (dr <= 1 && dc <= 1 && (dr + dc) > 0) {
        return monster;
      }
    }
    return null;
  }

  private isAdjacentTo(r1: number, c1: number, r2: number, c2: number): boolean {
    const dr = Math.abs(r1 - r2);
    const dc = Math.abs(c1 - c2);
    return dr <= 1 && dc <= 1 && (dr + dc) > 0;
  }

  private startMonsterTurns(): void {
    this.turnPhase.set('monsters');
    this.addCombatLog('--- Monster turns ---');

    const preview = this.gridPreviewContext();
    if (!preview) {
      this.endMonsterTurns();
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

    this.processMonsterRound(preview.dungonId);
  }

  private processMonsterRound(dungonId: number): void {
    const instances = this.monsterInstances();
    const anyHasAE = instances.some((m) => !m.isDead && m.remainingAE > 0);
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

    for (const monster of instances) {
      if (monster.isDead || monster.remainingAE <= 0) {
        continue;
      }

      const template = monstersById.get(monster.monsterId);
      if (!template) {
        monster.remainingAE = 0;
        continue;
      }

      const maxAttacks = template.numberOfAttacks;
      const isAdjacent = this.isAdjacentTo(monster.row, monster.column, playerRow, playerCol);
      const shouldFlee = monster.currentHp <= template.runAt && template.runAt > 0;

      if (shouldFlee) {
        this.monsterTryFlee(monster, dungonId, playerRow, playerCol);
      } else if (isAdjacent && monster.attacksUsedThisTurn < maxAttacks) {
        this.monsterAttackPlayer(monster, template, dungonId);
      } else if (!isAdjacent && this.isMonsterWithinRangeOfPlayer(monster, playerRow, playerCol, 5, dungonId)) {
        this.monsterMoveToward(monster, dungonId, playerRow, playerCol);
      } else if (monster.roam) {
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
    _dungonId: number
  ): void {
    monster.remainingAE -= 1;
    monster.attacksUsedThisTurn += 1;

    const attack = template.attacks[monster.attacksUsedThisTurn - 1] ?? template.attacks[0];
    const plusToHit = attack?.plusToHit ?? 0;
    const maxDamage = attack?.damage ?? 1;

    const hitRoll = this.rollCombat(plusToHit);
    const playerAC = this.getPlayerAC();

    if (hitRoll >= playerAC) {
      const damage = maxDamage <= 1 ? 1 : this.randomInt(1, maxDamage);
      this.playerHp.update((hp) => Math.max(0, hp - damage));
      this.addCombatLog(
        `${template.name} hits you for ${damage} dmg! (rolled ${hitRoll} vs AC ${playerAC})`
      );

      if (this.playerHp() <= 0) {
        this.turnPhase.set('gameover');
        this.addCombatLog('You have been slain. Game Over!');
      }
    } else {
      this.addCombatLog(
        `${template.name} misses you. (rolled ${hitRoll} vs AC ${playerAC})`
      );
    }
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
      monster.remainingAE -= isDiag ? 2 : 1;
      monster.row += bestDir.rowOffset;
      monster.column += bestDir.columnOffset;
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
      monster.remainingAE -= isDiag ? 2 : 1;
      monster.row += bestDir.rowOffset;
      monster.column += bestDir.columnOffset;
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
        monster.remainingAE -= isDiag ? 2 : 1;
        monster.row = nr;
        monster.column = nc;
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
      this.playerAE.set(this.playerMaxAE);
      this.turnPhase.set('player');
      this.addCombatLog('Your turn. AE: ' + this.playerMaxAE);
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
    if (!gameId || !preview || !userKey) {
      return;
    }

    const dungenJson = this.buildDungenJsonForSave(preview.dungonId);
    this.http
      .put(`${API_BASE_URL}/games/${gameId}/save`, {
        userkey: userKey,
        dungenJson,
      })
      .subscribe();
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
    }));

    return {
      filledSquares: this.filledSquaresByDungon()[dungonId] ?? {},
      squares: this.squaresByDungon()[dungonId] ?? {},
      keyList: this.keyList,
      cheater: this.cheaterByDungon()[dungonId] ?? DEFAULT_CHEATER,
      pcInventoryInitialized: this.pcInventoryInitializedByDungon()[dungonId] ?? false,
      startpoint: this.startPointByDungon()[dungonId] ?? null,
      tresherList: this.tresherListByDungon()[dungonId] ?? [],
      tresherPlacements: this.tresherPlacementsByDungon()[dungonId] ?? [],
      monsterList,
      monsterPlacements,
      squareTexts: this.squareTextsByDungon()[dungonId] ?? [],
      playerHp: this.playerHp(),
      playerAE: this.playerAE(),
      turnPhase: this.turnPhase(),
      playerRow: preview?.centerRow ?? 0,
      playerColumn: preview?.centerColumn ?? 0,
    };
  }
}

const DEFAULT_CHEATER: Cheater = {
  name: 'Bob',
  rangeOfSite: 5,
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
