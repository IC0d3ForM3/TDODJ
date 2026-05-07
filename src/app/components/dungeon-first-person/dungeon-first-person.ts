import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  effect,
  input,
  untracked,
} from '@angular/core';
import { Door } from '../../interfaces/door';
import { Key } from '../../interfaces/key';
import { Square } from '../../interfaces/square';
import { Wall } from '../../interfaces/wall';
import {
  AdjacentConnectionInfo,
  Cheater,
  DungonExit,
  ExitTransitionType,
  FacingDirection,
  FirstPersonBlock,
  FirstPersonStep,
  FirstPersonView,
  FloorTrapPlacement,
  GridPreviewContext,
  ItemPlacement,
  MonsterPlacement,
  ObstaclePlacement,
  PathBlockType,
  SpellPlacement,
  PotionPlacement,
  SquareSide,
  SquareText,
  TresherPlacement,
} from '../../interfaces/game';

type MonsterImpactKind = 'blood' | 'fire' | 'ice' | 'lightning' | 'arcane' | 'mind';
type MonsterImpactState = { kind: MonsterImpactKind; color?: string | null; startedAt: number; expiresAt: number };

@Component({
  selector: 'app-dungeon-first-person',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './dungeon-first-person.html',
})
export class DungeonFirstPersonComponent {
  private _canvasRef: ElementRef<HTMLCanvasElement> | null = null;

  @ViewChild('canvas')
  set canvasEl(value: ElementRef<HTMLCanvasElement> | undefined) {
    this._canvasRef = value ?? null;
    untracked(() => this.drawCanvas());
  }

  readonly preview = input.required<GridPreviewContext>();
  readonly cheater = input.required<Cheater>();
  readonly squares = input.required<Record<string, Square>>();
  readonly filledSquares = input.required<Record<string, true>>();
  readonly tresherPlacements = input<TresherPlacement[]>([]);
  readonly monsterPlacements = input<MonsterPlacement[]>([]);
  readonly keyList = input<Key[]>([]);
  readonly exits = input<DungonExit[]>([]);
  readonly showMonsters = input<boolean>(true);
  readonly squareTexts = input<SquareText[]>([]);
  readonly monsterImagesBySquare = input<Map<string, HTMLImageElement | null>>(new Map());
  readonly floorTrapPlacements = input<FloorTrapPlacement[]>([]);
  readonly itemPlacements = input<ItemPlacement[]>([]);
  readonly potionPlacements = input<PotionPlacement[]>([]);
  readonly spellPlacements = input<SpellPlacement[]>([]);
  readonly obstaclePlacements = input<ObstaclePlacement[]>([]);
  readonly obstacleImagesBySquare = input<Map<string, HTMLImageElement | null>>(new Map());
  readonly bagImagesBySquare = input<Map<string, HTMLImageElement | null>>(new Map());
  readonly monsterImpactEffects = input<Record<string, MonsterImpactState>>({});
  readonly impactPulse = input<number>(0);
  readonly playerHp = input<number>(20);
  readonly playerMaxHp = input<number>(20);

  readonly canvasWidth = 330;
  readonly canvasHeight = 220;
  private readonly maxDepth = 8;
  private readonly doorImageCache = new Map<string, HTMLImageElement>();
  private readonly stairsUpImageCache = new Map<string, HTMLImageElement>();
  private readonly stairsUpSquareAssignment = new Map<string, 1 | 2 | 3>();
  private readonly stairsDownImageCache = new Map<string, HTMLImageElement>();
  private readonly stairsDownSquareAssignment = new Map<string, number>();
  private genericTresherImage: HTMLImageElement | null = null;
  private genericTresherImageLoading = false;

  constructor() {
    effect(() => {
      // Reading inputs registers reactive subscriptions so the canvas redraws on change.
      this.preview();
      this.cheater();
      this.squares();
      this.filledSquares();
      this.tresherPlacements();
      this.monsterPlacements();
      this.keyList();
      this.exits();
      this.showMonsters();
      this.squareTexts();
      this.monsterImagesBySquare();
      this.floorTrapPlacements();
      this.itemPlacements();
      this.potionPlacements();
      this.spellPlacements();
      this.obstaclePlacements();
      this.obstacleImagesBySquare();
      this.bagImagesBySquare();
      this.monsterImpactEffects();
      this.impactPulse();
      this.playerHp();
      this.playerMaxHp();
      untracked(() => this.drawCanvas());
    });
    this.loadDoorImages();
    this.loadStairsUpImages();
    this.loadStairsDownImages();
  }

  private drawCanvas(): void {
    const canvas = this._canvasRef?.nativeElement;
    const preview = this.preview();
    const cheater = this.cheater();
    if (!canvas) {
      return;
    }

    const width = this.canvasWidth;
    const height = this.canvasHeight;
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

    const wallColor = this.getFirstPersonFrontColor('wall');
    const darkerSurfaceColor = this.darkenHexColor(wallColor, 0.58);

    context.fillStyle = darkerSurfaceColor;
    context.fillRect(0, 0, width, height / 2);
    this.drawStoneTextureInRect(
      context,
      0,
      0,
      width,
      height / 2,
      width * 3 + height * 5 + preview.centerRow * 17 + preview.centerColumn * 23,
      { toneMin: 64, toneRange: 46, alphaMultiplier: 0.82 }
    );

    context.fillStyle = darkerSurfaceColor;
    context.fillRect(0, height / 2, width, height / 2);
    this.drawStoneTextureInRect(
      context,
      0,
      height / 2,
      width,
      height / 2,
      width * 7 + height * 11 + preview.centerRow * 29 + preview.centerColumn * 13,
      { toneMin: 64, toneRange: 46, alphaMultiplier: 0.82 }
    );

    const visibleFirstPersonView = this.getFirstPersonView(preview, cheater);
    const currentTextWallGlow = this.getCurrentSquareTextWallGlowTarget(preview, cheater.facingDir);
    const tresherPlacements = this.tresherPlacements();
    const tresherCountBySquare = new Map<string, number>();
    const bagSquareKeys = new Set<string>();
    for (const placement of tresherPlacements) {
      const squareKey = this.getSquareKey(placement.row, placement.column);
      tresherCountBySquare.set(squareKey, (tresherCountBySquare.get(squareKey) ?? 0) + 1);
      bagSquareKeys.add(squareKey);
    }
    for (const placement of this.itemPlacements()) {
      bagSquareKeys.add(this.getSquareKey(placement.row, placement.column));
    }
    for (const placement of this.potionPlacements()) {
      bagSquareKeys.add(this.getSquareKey(placement.row, placement.column));
    }
    for (const placement of this.spellPlacements()) {
      bagSquareKeys.add(this.getSquareKey(placement.row, placement.column));
    }

    const monsterPlacements = this.monsterPlacements();
    const monsterSquareKeys = new Set<string>();
    for (const placement of monsterPlacements) {
      monsterSquareKeys.add(this.getSquareKey(placement.row, placement.column));
    }

    const obstacleImagesBySquare = this.obstacleImagesBySquare();
    const obstacleImageBySquare = new Map<string, HTMLImageElement | null>();
    const obstacleBySquare = new Map<string, ObstaclePlacement>();
    for (const obs of this.obstaclePlacements()) {
      if (obs.isDestroyed) continue;
      const key = this.getSquareKey(obs.row, obs.column);
      obstacleImageBySquare.set(key, obstacleImagesBySquare.get(key) ?? null);
      obstacleBySquare.set(key, obs);
      if (obs.containsItemId !== null && !obs.itemTaken) {
        bagSquareKeys.add(key);
      }
    }

    const bagImagesBySquare = this.bagImagesBySquare();

    // Squares that have both a bag item (item/potion/spell) and an obstacle.
    // These are drawn on top of (or inside) the obstacle instead of on the floor.
    const obstacleItemSquareKeys = new Set<string>();
    for (const key of bagSquareKeys) {
      if (obstacleBySquare.has(key)) {
        obstacleItemSquareKeys.add(key);
      }
    }

    if (visibleFirstPersonView.steps.length === 0) {
      context.fillStyle = '#d1d6de';
      context.font = '13px sans-serif';
      context.fillText('No first-person view for this tile.', 16, height / 2);
      return;
    }

    const maxFrameDepth = Math.max(2, Math.min(12, visibleFirstPersonView.steps.length + 2));
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

    const depthSegments = visibleFirstPersonView.steps.map((step, depth) => ({
      depth,
      step,
      nearFrame: frameAtDepth(depth),
      farFrame: frameAtDepth(depth + 1),
    }));
    const farToNearSegments = [...depthSegments].reverse();

    // Pass 1: paint floor and ceiling perspective bands first.
    for (const segment of farToNearSegments) {
      const { depth, nearFrame, farFrame } = segment;
      const depthAlpha = Math.max(0.06, 0.24 - depth * 0.03);
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
      floorGradient.addColorStop(0, `rgba(74, 66, 57, ${Math.min(0.72, depthAlpha + 0.04)})`);
      floorGradient.addColorStop(1, `rgba(104, 93, 79, ${Math.min(0.78, depthAlpha + 0.1)})`);
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
      ceilingGradient.addColorStop(0, `rgba(55, 60, 72, ${Math.min(0.72, depthAlpha + 0.09)})`);
      ceilingGradient.addColorStop(1, `rgba(86, 92, 108, ${Math.min(0.76, depthAlpha + 0.05)})`);
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

    const endFrame = frameAtDepth(visibleFirstPersonView.steps.length);
    const endStep = visibleFirstPersonView.steps[visibleFirstPersonView.steps.length - 1] ?? null;
    const canExtendEndWall = visibleFirstPersonView.endBlock.type === 'wall' && endStep !== null;
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
    const shouldHighlightEndWall =
      currentTextWallGlow === 'front' && visibleFirstPersonView.steps.length === 1;
    const endFillColor =
      visibleFirstPersonView.endBlock.type === 'none'
        ? '#000000'
        : visibleFirstPersonView.endBlock.type === 'wall'
          ? this.getFirstPersonWallPanelColor(visibleFirstPersonView.steps.length)
          : this.getFirstPersonFrontColor(visibleFirstPersonView.endBlock.type);
    context.fillStyle = endFillColor;
    context.fillRect(
      extendedEndLeft,
      endFrame.top,
      endWallWidth,
      endFrame.bottom - endFrame.top
    );

    if (visibleFirstPersonView.endBlock.type !== 'none') {
      context.strokeStyle = 'rgba(250, 250, 250, 0.26)';
      context.lineWidth = 1;
      context.strokeRect(
        extendedEndLeft,
        endFrame.top,
        endWallWidth,
        endFrame.bottom - endFrame.top
      );

      if (visibleFirstPersonView.endBlock.type === 'wall') {
        const endWallSeed =
          extendedEndLeft * 7 + endFrame.top * 13 + visibleFirstPersonView.steps.length * 19;
        this.drawStoneTextureInRect(
          context,
          extendedEndLeft,
          endFrame.top,
          endWallWidth,
          endFrame.bottom - endFrame.top,
          endWallSeed,
          this.getStoneTextureOptionsForWallDepth(visibleFirstPersonView.steps.length)
        );
        this.drawBrickPatternInRect(
          context,
          extendedEndLeft,
          endFrame.top,
          endWallWidth,
          endFrame.bottom - endFrame.top,
          endWallSeed + 179,
          visibleFirstPersonView.steps.length
        );

        if (shouldHighlightEndWall) {
          this.drawWallGlowRect(
            context,
            extendedEndLeft,
            endFrame.top,
            endWallWidth,
            endFrame.bottom - endFrame.top
          );
          const runeSeed = Math.floor(extendedEndLeft * 3 + endFrame.top * 7 + endWallWidth * 11);
          this.drawRunicInscription(
            context,
            extendedEndLeft,
            endFrame.top,
            endWallWidth,
            endFrame.bottom - endFrame.top,
            runeSeed
          );
        }
      }

      if (
        visibleFirstPersonView.endBlock.type === 'openDoor' ||
        visibleFirstPersonView.endBlock.type === 'closedDoor'
      ) {
        this.drawFirstPersonDoorFace(
          context,
          endFrame,
          visibleFirstPersonView.endBlock,
          false,
          shouldHighlightEndWall
        );
      }
    }

    // Pass 2: draw walls, side surfaces, and portals.

    for (const segment of farToNearSegments) {
      const { depth, step, nearFrame, farFrame } = segment;
      const isFarthestVisibleLayer = depth === visibleFirstPersonView.steps.length - 1;

      const leftOpeningBackBlock = step.leftOpeningBackBlock;
      const rightOpeningBackBlock = step.rightOpeningBackBlock;
      const canSeeLeftOpeningBackWall = this.hasClearSideSightToDepth(
        visibleFirstPersonView.steps,
        depth,
        'left'
      );
      const canSeeRightOpeningBackWall = this.hasClearSideSightToDepth(
        visibleFirstPersonView.steps,
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

      this.drawFirstPersonSideSurface(
        context,
        nearFrame,
        farFrame,
        'left',
        step.leftBlock,
        depth,
        depth === 0 && currentTextWallGlow === 'left'
      );
      this.drawFirstPersonSideSurface(
        context,
        nearFrame,
        farFrame,
        'right',
        step.rightBlock,
        depth,
        depth === 0 && currentTextWallGlow === 'right'
      );

      if (step.forwardDoor && step.forwardDoor.type === 'openDoor') {
        this.drawFirstPersonDoorFace(
          context,
          farFrame,
          step.forwardDoor,
          true,
          depth === 0 && currentTextWallGlow === 'front'
        );
      }
    }

    // Pass 3: draw floor markers and monsters last so they stay visible.
    const showMonsters = this.showMonsters();
    const monsterImages = this.monsterImagesBySquare();
    const monsterImpactEffects = this.monsterImpactEffects();
    const detectedTraps = this.floorTrapPlacements();
    const pitTrapSquareKeys = new Set(
      detectedTraps
        .filter(fp => !fp.isTriggered && !fp.isDisarmed && fp.trap.name.toLowerCase().includes('pit'))
        .map(fp => this.getSquareKey(fp.row, fp.column))
    );

    for (const segment of farToNearSegments) {
      const { step, nearFrame, farFrame } = segment;
      const squareKey = this.getSquareKey(step.row, step.column);
      const tresherCount = tresherCountBySquare.get(squareKey) ?? 0;
      const bagImage = bagImagesBySquare.get(squareKey) ?? null;
      if (pitTrapSquareKeys.has(squareKey)) {
        this.drawFirstPersonPitTrap(context, nearFrame, farFrame);
      }

      if (bagSquareKeys.has(squareKey) && !obstacleItemSquareKeys.has(squareKey)) {
        this.drawFirstPersonFloorBag(context, nearFrame, farFrame, bagImage);
      } else if (tresherCount > 0) {
        this.drawFirstPersonFloorCoinStack(context, nearFrame, farFrame, tresherCount);
      }

      if (step.visibleMonsterSlots.length > 0) {
        const visibleObstacleSlots = [...step.visibleMonsterSlots].sort(
          (a, b) => Math.abs(b.lateralOffset) - Math.abs(a.lateralOffset)
        );
        const obstacleLateralRange = Math.max(
          1,
          ...visibleObstacleSlots.map((s) => Math.abs(s.lateralOffset))
        );
        for (const slot of visibleObstacleSlots) {
          if (!obstacleImageBySquare.has(slot.squareKey)) continue;
          const obsImage = obstacleImageBySquare.get(slot.squareKey) ?? null;
          const obsPlacement = obstacleBySquare.get(slot.squareKey);
          if (slot.isPeek) {
            this.drawFirstPersonPeekObstacle(
              context,
              width,
              nearFrame,
              farFrame,
              obsImage,
              slot.lateralOffset < 0 ? 'left' : 'right',
              obsPlacement,
              segment.depth
            );
          } else {
            this.drawFirstPersonObstacle(
              context,
              nearFrame,
              farFrame,
              obsImage,
              slot.lateralOffset,
              obstacleLateralRange,
              obsPlacement,
              segment.depth
            );
            if (obstacleItemSquareKeys.has(slot.squareKey)) {
              this.drawItemOnObstacle(
                context,
                nearFrame,
                farFrame,
                obsPlacement,
                slot.lateralOffset,
                obstacleLateralRange,
                bagImagesBySquare.get(slot.squareKey) ?? null
              );
            }
          }
        }
      }

      if (step.hasKey) {
        this.drawFirstPersonFloorKey(context, nearFrame, farFrame);
      }

      if (step.exitTransitionType) {
        this.drawFirstPersonFloorExit(context, nearFrame, farFrame, step.exitTransitionType, squareKey);
      }

      if (showMonsters && step.visibleMonsterSlots.length > 0) {
        const visibleMonsterSlots = [...step.visibleMonsterSlots].sort(
          (leftSlot, rightSlot) =>
            Math.abs(rightSlot.lateralOffset) - Math.abs(leftSlot.lateralOffset)
        );
        const lateralRange = Math.max(
          1,
          ...visibleMonsterSlots.map((slot) => Math.abs(slot.lateralOffset))
        );

        for (const slot of visibleMonsterSlots) {
          if (!monsterSquareKeys.has(slot.squareKey)) {
            continue;
          }

          const image = monsterImages.get(slot.squareKey) ?? null;
          if (slot.isPeek) {
            this.drawFirstPersonPeekMonster(
              context,
              width,
              nearFrame,
              farFrame,
              image,
              slot.lateralOffset < 0 ? 'left' : 'right',
              monsterImpactEffects[slot.squareKey] ?? null
            );
          } else {
            this.drawFirstPersonMonster(
              context,
              nearFrame,
              farFrame,
              image,
              slot.lateralOffset,
              lateralRange,
              monsterImpactEffects[slot.squareKey] ?? null
            );
          }
        }
      }
    }

    this.drawCompass(context, cheater.facingDir);
    this.drawHealthHeart(context, width);
  }

  private drawHealthHeart(context: CanvasRenderingContext2D, width: number): void {
    const hp = this.playerHp();
    const maxHp = this.playerMaxHp();
    const hpRatio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 1;
    const hW = 34;
    const hH = 32;
    const hCx = width - hW / 2 - 8;
    const hTop = 6;

    const buildHeartPath = () => {
      context.beginPath();
      context.moveTo(hCx, hTop + hH * 0.3);
      // Left bump
      context.bezierCurveTo(hCx, hTop, hCx - hW / 2, hTop, hCx - hW / 2, hTop + hH * 0.3);
      // Left side down to tip
      context.bezierCurveTo(hCx - hW / 2, hTop + hH * 0.7, hCx, hTop + hH * 0.9, hCx, hTop + hH);
      // Tip up right side
      context.bezierCurveTo(hCx, hTop + hH * 0.9, hCx + hW / 2, hTop + hH * 0.7, hCx + hW / 2, hTop + hH * 0.3);
      // Right bump back to cleft
      context.bezierCurveTo(hCx + hW / 2, hTop, hCx, hTop, hCx, hTop + hH * 0.3);
      context.closePath();
    };

    // Dark empty background
    context.save();
    buildHeartPath();
    context.fillStyle = '#3d0a0a';
    context.fill();
    context.restore();

    // HP fill from bottom up, clipped to heart shape
    context.save();
    buildHeartPath();
    context.clip();
    const fillColor = hpRatio <= 0.25 ? '#ff2020' : hpRatio <= 0.5 ? '#e05010' : '#cc1616';
    context.fillStyle = fillColor;
    const fillH = hH * hpRatio;
    context.fillRect(hCx - hW / 2 - 1, hTop + hH - fillH, hW + 2, fillH + 2);
    context.restore();

    // Outline
    context.save();
    buildHeartPath();
    context.strokeStyle = '#ff7070';
    context.lineWidth = 1.5;
    context.stroke();
    context.restore();
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
    steps: FirstPersonStep[],
    depth: number,
    row: number,
    column: number,
    leftOffset: { rowOffset: number; columnOffset: number },
    rightOffset: { rowOffset: number; columnOffset: number }
  ): Array<{ squareKey: string; lateralOffset: number }> {
    const squares = this.squares();
    const filledSquares = this.filledSquares();
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

  private getFirstPersonView(preview: GridPreviewContext, cheater: Cheater): FirstPersonView {
    const squares = this.squares();
    const filledSquares = this.filledSquares();
    const startSquareKey = this.getSquareKey(preview.centerRow, preview.centerColumn);
    if (!squares[startSquareKey] || !filledSquares[startSquareKey]) {
      return { steps: [], endBlock: this.toFirstPersonBlock('void', null) };
    }

    const forward = this.getMovementDeltaForFacingDirection(cheater.facingDir);
    const leftOffset = { rowOffset: -forward.columnOffset, columnOffset: forward.rowOffset };
    const rightOffset = { rowOffset: forward.columnOffset, columnOffset: -forward.rowOffset };

    const keyPositions = new Set(
      this.keyList()
        .filter((key) => key.rownId !== null && key.columnId !== null)
        .map((key) => this.getSquareKey(key.rownId ?? -1, key.columnId ?? -1))
    );

    const exitTransitionsBySquare = new Map<string, ExitTransitionType>();
    for (const exit of this.exits()) {
      exitTransitionsBySquare.set(this.getSquareKey(exit.row, exit.column), exit.transitionType);
    }

    const steps: FirstPersonStep[] = [];
    const addStep = (row: number, column: number): void => {
      const squareKey = this.getSquareKey(row, column);
      const leftBlock = this.getLateralBlockType(row, column, leftOffset.rowOffset, leftOffset.columnOffset);
      const rightBlock = this.getLateralBlockType(row, column, rightOffset.rowOffset, rightOffset.columnOffset);
      steps.push({
        row,
        column,
        leftBlock,
        rightBlock,
        leftOpeningBackBlock:
          leftBlock.type === 'none'
            ? this.getSideOpeningBackBlock(row, column, leftOffset.rowOffset, leftOffset.columnOffset, forward.rowOffset, forward.columnOffset)
            : null,
        rightOpeningBackBlock:
          rightBlock.type === 'none'
            ? this.getSideOpeningBackBlock(row, column, rightOffset.rowOffset, rightOffset.columnOffset, forward.rowOffset, forward.columnOffset)
            : null,
        forwardDoor: null,
        visibleMonsterSlots: [],
        hasKey: keyPositions.has(squareKey),
        exitTransitionType: exitTransitionsBySquare.get(squareKey) ?? null,
      });
    };

    let currentRow = preview.centerRow;
    let currentColumn = preview.centerColumn;
    addStep(currentRow, currentColumn);

    const maxDepth = Math.max(
      1,
      Math.min(this.maxDepth, Math.floor(Math.max(1, cheater.rangeOfSight + 1)))
    );
    let endBlock: FirstPersonBlock = this.toFirstPersonBlock('none', null);

    for (let depth = 0; depth < maxDepth; depth += 1) {
      const nextRow = currentRow + forward.rowOffset;
      const nextColumn = currentColumn + forward.columnOffset;
      const forwardConnection = this.getMovementConnectionInfoBetweenAdjacentSquares(
        currentRow, currentColumn, nextRow, nextColumn
      );

      if (forwardConnection.type === 'openDoor' || forwardConnection.type === 'closedDoor') {
        steps[steps.length - 1] = {
          ...steps[steps.length - 1],
          forwardDoor: this.toFirstPersonBlock(forwardConnection.type, forwardConnection.door),
        };
      }

      if (forwardConnection.type === 'wall' || forwardConnection.type === 'closedDoor') {
        endBlock = this.toFirstPersonBlock(forwardConnection.type, forwardConnection.door, forwardConnection.wall ?? null);
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
          steps,
          depth,
          step.row,
          step.column,
          leftOffset,
          rightOffset
        ),
      };
    }

    return { steps, endBlock };
  }

  private drawFirstPersonSideSurface(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    side: 'left' | 'right',
    block: FirstPersonBlock,
    wallDepth: number,
    highlight = false
  ): void {
    if (block.type === 'none' || block.type === 'void') {
      return;
    }

    const seamPad = block.type === 'wall' ? 1.4 : 1;
    const verticalPad = block.type === 'wall' ? 0.8 : 0.5;    const points =
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
      this.drawStoneTextureInPolygon(
        context,
        points,
        textureSeed,
        this.getStoneTextureOptionsForWallDepth(wallDepth)
      );
      this.drawBrickPatternInPolygon(context, points, textureSeed + 131, wallDepth);
    }

    if (highlight) {
      this.drawWallGlowPolygon(context, points);
      // Derive a bounding box from the trapezoid for the runic inscription
      const minX = Math.min(...points.map((p) => p.x));
      const maxX = Math.max(...points.map((p) => p.x));
      const minY = Math.min(...points.map((p) => p.y));
      const maxY = Math.max(...points.map((p) => p.y));
      const runeSeed = Math.floor(nearFrame.left * 5 + nearFrame.top * 11 + (side === 'left' ? 17 : 29));
      this.drawRunicInscription(context, minX, minY, maxX - minX, maxY - minY, runeSeed);
    }

    if (block.type === 'closedDoor') {
      this.drawFirstPersonSideDoorMarker(context, nearFrame, farFrame, side, 'closedDoor');
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
      const textureOptions = this.getStoneTextureOptionsForWallDepth(wallDepth + 1);
      const connectorSeed =
        nearFrame.left * 3 + farFrame.top * 7 + wallDepth * 19 + (side === 'left' ? 41 : 73);
      const backWallSeed =
        nearFrame.top * 5 + farFrame.right * 11 + wallDepth * 23 + (side === 'left' ? 59 : 97);
      if (drawConnector) {
        this.drawStoneTextureInPolygon(
          context,
          connectorPoints,
          connectorSeed,
          textureOptions
        );
        this.drawBrickPatternInPolygon(context, connectorPoints, connectorSeed + 211, wallDepth + 1);
      }
      this.drawStoneTextureInPolygon(
        context,
        backWallPoints,
        backWallSeed,
        textureOptions
      );
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

    if (block.type === 'closedDoor') {
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
    const x = side === 'left'
      ? (nearFrame.left + farFrame.left) / 2
      : (nearFrame.right + farFrame.right) / 2;

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

  private drawFirstPersonPitTrap(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number }
  ): void {
    // Draw a dark ellipse on the floor to look like a pit / black hole
    const midLeft = (nearFrame.left + farFrame.left) / 2;
    const midRight = (nearFrame.right + farFrame.right) / 2;
    const midFloor = (nearFrame.bottom + farFrame.bottom) / 2;
    const cellW = midRight - midLeft;
    const rx = Math.max(4, cellW * 0.38);
    const ry = Math.max(2, rx * 0.32);
    const cx = (midLeft + midRight) / 2;
    const cy = midFloor - ry * 0.5;

    // dark pit fill
    const pitGrad = context.createRadialGradient(cx, cy, 0, cx, cy, rx);
    pitGrad.addColorStop(0, 'rgba(0,0,0,0.95)');
    pitGrad.addColorStop(0.7, 'rgba(10,10,10,0.85)');
    pitGrad.addColorStop(1, 'rgba(30,20,10,0.3)');
    context.save();
    context.beginPath();
    context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    context.fillStyle = pitGrad;
    context.fill();
    // faint dark‐brown rim
    context.strokeStyle = 'rgba(80,50,20,0.7)';
    context.lineWidth = 1.5;
    context.stroke();
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

    context.beginPath();
    context.moveTo(centerX + size * 0.32, floorY - size * 0.2);
    context.lineTo(centerX + size * 0.32, floorY + size * 0.12);
    context.moveTo(centerX + size * 0.46, floorY - size * 0.2);
    context.lineTo(centerX + size * 0.46, floorY + size * 0.05);
    context.stroke();
  }

  private drawFirstPersonMonster(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    image: HTMLImageElement | null,
    lateralOffset: number,
    lateralRange: number,
    impact: MonsterImpactState | null
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
      this.drawMonsterImpactEffect(
        context,
        centerX,
        drawY + drawHeight * 0.56,
        drawWidth,
        drawHeight,
        impact
      );
      return;
    }

    const centerY = midTop + tileHeight * 0.55;
    const size = Math.max(4, Math.min(tileWidth, tileHeight) * 0.25 * scale);
    this.drawMonsterImpactEffect(context, centerX, centerY, size * 2.1, size * 2.1, impact);
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
    side: 'left' | 'right',
    impact: MonsterImpactState | null
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
      this.drawMonsterImpactEffect(context, edgeX, midBottom - drawHeight * 0.45, drawWidth, drawHeight, impact);
    } else {
      const centerY = midTop + tileHeight * 0.55;
      const size = Math.max(4, Math.min(tileWidth, tileHeight) * 0.25);
      this.drawMonsterImpactEffect(context, edgeX, centerY, size * 2.1, size * 2.1, impact);
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

  private drawMonsterImpactEffect(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    impact: MonsterImpactState | null
  ): void {
    if (!impact) return;
    const now = Date.now();
    if (now > impact.expiresAt) return;

    const life = Math.max(0, Math.min(1, (now - impact.startedAt) / Math.max(1, impact.expiresAt - impact.startedAt)));
    const fade = 1 - life;
    const pulse = (Math.sin(this.impactPulse() * 0.72) + 1) / 2;
    const radius = Math.max(width, height) * (0.46 + pulse * 0.14);
    const accentColor = impact.color || this.getDefaultImpactColor(impact.kind);

    if (impact.kind === 'blood') {
      context.save();
      context.globalAlpha = 0.92 * fade;
      context.shadowColor = accentColor;
      context.shadowBlur = 14 + pulse * 12;
      const grad = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.02);
      grad.addColorStop(0, 'rgba(255, 168, 168, 0.22)');
      grad.addColorStop(0.5, 'rgba(198, 29, 45, 0.28)');
      grad.addColorStop(1, 'rgba(115, 0, 12, 0)');
      context.fillStyle = grad;
      context.beginPath();
      context.arc(centerX, centerY, radius * 0.92, 0, Math.PI * 2);
      context.fill();

      const dripCount = 4;
      const dripTop = centerY - height * 0.28;
      const spread = width * 0.22;
      for (let i = 0; i < dripCount; i += 1) {
        const x = centerX + ((i - 1.5) / 1.5) * spread + (i % 2 === 0 ? -1 : 1) * pulse * 4;
        const length = height * (0.16 + i * 0.035 + life * 0.12);
        const radiusPx = Math.max(3, Math.min(width, height) * (0.045 + (i % 2) * 0.01));
        context.strokeStyle = accentColor;
        context.lineWidth = Math.max(2.8, radiusPx * 0.9);
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(x, dripTop - radiusPx * 0.4);
        context.quadraticCurveTo(x + (i % 2 === 0 ? -5 : 5), dripTop + length * 0.42, x, dripTop + length);
        context.stroke();

        context.fillStyle = accentColor;
        context.beginPath();
        context.arc(x, dripTop + length + radiusPx * 0.45, radiusPx, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = `rgba(255, 235, 235, ${0.28 * fade})`;
        context.lineWidth = 1.1;
        context.beginPath();
        context.arc(x - radiusPx * 0.22, dripTop + length + radiusPx * 0.2, radiusPx * 0.32, Math.PI * 1.05, Math.PI * 1.75);
        context.stroke();
      }
      context.restore();
      return;
    }

    if (impact.kind === 'fire') {
      context.save();
      context.globalAlpha = 0.88 * fade;
      context.shadowColor = accentColor;
      context.shadowBlur = 16 + pulse * 16;
      const grad = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
      grad.addColorStop(0, 'rgba(255, 212, 120, 0.85)');
      grad.addColorStop(0.5, 'rgba(255, 88, 36, 0.72)');
      grad.addColorStop(1, 'rgba(255, 40, 20, 0)');
      context.fillStyle = grad;
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.fill();

      const flameCount = 5;
      const flameBottom = centerY + height * 0.16;
      for (let i = 0; i < flameCount; i += 1) {
        const offset = ((i - 2) / 2) * width * 0.17;
        const flameHeight = height * (0.28 + (i % 2) * 0.07 + pulse * 0.06);
        const flameWidth = width * (0.12 + (i % 3) * 0.02);
        context.beginPath();
        context.moveTo(centerX + offset, flameBottom);
        context.quadraticCurveTo(
          centerX + offset - flameWidth * 0.95,
          flameBottom - flameHeight * 0.42,
          centerX + offset,
          flameBottom - flameHeight
        );
        context.quadraticCurveTo(
          centerX + offset + flameWidth * 0.95,
          flameBottom - flameHeight * 0.38,
          centerX + offset,
          flameBottom
        );
        context.fillStyle = i % 2 === 0 ? 'rgba(255, 130, 34, 0.82)' : 'rgba(255, 204, 96, 0.74)';
        context.fill();
      }
      context.restore();
      return;
    }

    if (impact.kind === 'lightning') {
      context.save();
      context.globalAlpha = 0.94 * fade;
      context.shadowColor = accentColor;
      context.shadowBlur = 16 + pulse * 18;
      const grad = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.06);
      grad.addColorStop(0, 'rgba(230, 248, 255, 0.56)');
      grad.addColorStop(0.45, 'rgba(145, 232, 255, 0.28)');
      grad.addColorStop(1, 'rgba(80, 180, 255, 0)');
      context.fillStyle = grad;
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.fill();

      const arcs = 7;
      for (let i = 0; i < arcs; i += 1) {
        const base = (Math.PI * 2 * i) / arcs + pulse * 1.15;
        const sx = centerX + Math.cos(base) * radius * 0.36;
        const sy = centerY + Math.sin(base) * radius * 0.32;
        const ex = centerX + Math.cos(base + 0.62) * radius * 0.92;
        const ey = centerY + Math.sin(base + 0.62) * radius * 0.86;
        this.drawLightningSegment(context, sx, sy, ex, ey, fade, pulse, accentColor);
      }

      for (let i = 0; i < 10; i += 1) {
        const sparkAngle = pulse * 2.4 + i * 0.63;
        const sparkRadius = radius * (0.25 + (i % 4) * 0.12);
        const sparkX = centerX + Math.cos(sparkAngle) * sparkRadius;
        const sparkY = centerY + Math.sin(sparkAngle) * sparkRadius;
        context.fillStyle = i % 2 === 0 ? '#ffffff' : accentColor;
        context.beginPath();
        context.arc(sparkX, sparkY, 1.6 + (i % 3) * 0.45, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
      return;
    }

    if (impact.kind === 'ice') {
      context.save();
      context.globalAlpha = 0.9 * fade;
      context.shadowColor = accentColor;
      context.shadowBlur = 16 + pulse * 15;
      const grad = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.08);
      grad.addColorStop(0, 'rgba(180, 240, 255, 0.76)');
      grad.addColorStop(0.55, 'rgba(90, 180, 255, 0.62)');
      grad.addColorStop(1, 'rgba(60, 130, 255, 0)');
      context.fillStyle = grad;
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.fill();

      const fallOffset = life * height * 0.22;
      const flakes = 8;
      for (let i = 0; i < flakes; i += 1) {
        const drift = Math.sin(pulse * 2.2 + i * 0.8) * 6;
        const fx = centerX + ((i - (flakes - 1) / 2) / ((flakes - 1) / 2)) * width * 0.32 + drift;
        const fy = centerY - height * 0.4 + (i % 4) * height * 0.12 + fallOffset;
        this.drawSnowflake(context, fx, fy, Math.max(4, width * 0.045), fade);
      }
      context.restore();
      return;
    }

    if (impact.kind === 'mind') {
      context.save();
      context.globalAlpha = 0.9 * fade;
      context.shadowColor = '#44dd77';
      context.shadowBlur = 15 + pulse * 14;
      const grad = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.05);
      grad.addColorStop(0, 'rgba(198, 255, 210, 0.76)');
      grad.addColorStop(0.55, 'rgba(90, 225, 135, 0.62)');
      grad.addColorStop(1, 'rgba(35, 170, 85, 0)');
      context.fillStyle = grad;
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.fill();

      // Psychic ripples that pulse outward.
      const rings = 3;
      for (let i = 0; i < rings; i += 1) {
        const ringScale = 0.45 + i * 0.18 + pulse * 0.05;
        context.beginPath();
        context.arc(centerX, centerY, radius * ringScale, 0, Math.PI * 2);
        context.strokeStyle = `rgba(120, 245, 160, ${0.7 - i * 0.18})`;
        context.lineWidth = 1.6;
        context.stroke();
      }
      context.restore();
      return;
    }

    context.save();
    context.globalAlpha = 0.6 * fade;
    context.shadowColor = accentColor;
    context.shadowBlur = 8 + pulse * 8;
    context.strokeStyle = accentColor;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(centerX, centerY, radius * 0.9, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  private getDefaultImpactColor(kind: MonsterImpactKind): string {
    if (kind === 'blood') return '#c61d2d';
    if (kind === 'fire') return '#ff5b2a';
    if (kind === 'lightning') return '#8de8ff';
    if (kind === 'ice') return '#71d6ff';
    if (kind === 'mind') return '#44dd77';
    return '#f0d169';
  }

  private drawSnowflake(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number,
    fade: number
  ): void {
    context.save();
    context.strokeStyle = `rgba(235, 250, 255, ${0.82 * fade})`;
    context.lineWidth = 1.2;
    for (let i = 0; i < 3; i += 1) {
      const angle = (Math.PI / 3) * i;
      const dx = Math.cos(angle) * size * 0.5;
      const dy = Math.sin(angle) * size * 0.5;
      context.beginPath();
      context.moveTo(centerX - dx, centerY - dy);
      context.lineTo(centerX + dx, centerY + dy);
      context.stroke();
    }
    context.restore();
  }

  private drawLightningSegment(
    context: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    fade: number,
    pulse: number,
    color: string
  ): void {
    const segments = 7;
    const dx = (x2 - x1) / segments;
    const dy = (y2 - y1) / segments;

    context.beginPath();
    context.moveTo(x1, y1);
    for (let i = 1; i < segments; i += 1) {
      const jitter = (i % 2 === 0 ? -1 : 1) * (4 + pulse * 2.5);
      context.lineTo(x1 + dx * i + jitter, y1 + dy * i - jitter * 0.45);
    }
    context.lineTo(x2, y2);
    context.strokeStyle = color;
    context.lineWidth = 2.3;
    context.stroke();
  }

  private drawFirstPersonPeekObstacle(
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    image: HTMLImageElement | null,
    side: 'left' | 'right',
    obs?: ObstaclePlacement,
    depth: number = 0
  ): void {
    const midLeft = (nearFrame.left + farFrame.left) / 2;
    const midRight = (nearFrame.right + farFrame.right) / 2;
    const midTop = (nearFrame.top + farFrame.top) / 2;
    const midBottom = (nearFrame.bottom + farFrame.bottom) / 2;
    const tileWidth = midRight - midLeft;
    const tileHeight = midBottom - midTop;
    const edgeX = side === 'left' ? nearFrame.left : nearFrame.right;

    const heightPct = Math.max(1, Math.min(100, obs?.heightPercent ?? 100)) / 100;
    const heightAnchor = obs?.heightAnchor ?? 'floor';
    const widthPct = Math.max(1, Math.min(100, obs?.widthPercent ?? 100)) / 100;
    const color = obs?.color ?? null;
    const fogAlpha = Math.min(0.72, depth * 0.16);
    const shape = obs?.shape ?? 'circle';

    context.save();
    context.beginPath();
    if (side === 'left') {
      context.rect(nearFrame.left, 0, canvasWidth - nearFrame.left, context.canvas.height);
    } else {
      context.rect(0, 0, nearFrame.right, context.canvas.height);
    }
    context.clip();
    context.globalAlpha = 0.8;

    if (shape === 'square') {
      // side-face of a square box: show a slab anchored to the edge
      const frameH = nearFrame.bottom - nearFrame.top;
      const sh = Math.max(4, frameH * heightPct);
      const sy = heightAnchor === 'ceiling' ? nearFrame.top : nearFrame.bottom - sh;
      // side face width is proportional to widthPct scaled to a slab depth
      const slabW = Math.max(5, tileWidth * 0.30 * widthPct);
      const sx = side === 'left' ? nearFrame.left - slabW / 2 : nearFrame.right - slabW / 2;

      if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
        context.drawImage(image, sx, sy, slabW, sh);
      } else if (color) {
        context.fillStyle = color;
        context.fillRect(sx, sy, slabW, sh);
        context.strokeStyle = 'rgba(0,0,0,0.4)';
        context.lineWidth = 1;
        context.strokeRect(sx, sy, slabW, sh);
      } else {
        const grad = context.createLinearGradient(sx, 0, sx + slabW, 0);
        grad.addColorStop(0, '#7a7a7a');
        grad.addColorStop(0.5, '#d0d0d0');
        grad.addColorStop(1, '#7a7a7a');
        context.fillStyle = grad;
        context.fillRect(sx, sy, slabW, sh);
        this.drawStoneTextureInRect(context, sx, sy, slabW, sh, Math.floor(sx * 7 + sy * 13));
        context.strokeStyle = 'rgba(0,0,0,0.3)';
        context.lineWidth = 1;
        context.strokeRect(sx, sy, slabW, sh);
      }
      if (fogAlpha > 0) {
        context.globalAlpha = fogAlpha;
        context.fillStyle = '#000';
        context.fillRect(sx, sy, slabW, sh);
        context.globalAlpha = 0.8;
      }
    } else if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
      const maxWidth = tileWidth * 0.72 * widthPct;
      const maxHeight = tileHeight * heightPct;
      const aspectRatio = image.naturalWidth / image.naturalHeight;
      let drawHeight = maxHeight;
      let drawWidth = drawHeight * aspectRatio;
      if (drawWidth > maxWidth) {
        drawWidth = maxWidth;
        drawHeight = drawWidth / aspectRatio;
      }
      if (heightPct === 1) drawHeight = maxHeight;
      if (widthPct === 1) drawWidth = maxWidth;
      drawWidth = Math.max(8, drawWidth);
      drawHeight = Math.max(8, drawHeight);
      const drawY = heightAnchor === 'ceiling' ? midTop : midBottom - drawHeight;
      context.drawImage(image, edgeX - drawWidth / 2, drawY, drawWidth, drawHeight);
      if (fogAlpha > 0) {
        context.globalAlpha = fogAlpha;
        context.fillStyle = '#000';
        context.fillRect(edgeX - drawWidth / 2, drawY, drawWidth, drawHeight);
        context.globalAlpha = 0.8;
      }
    } else {
      const w = Math.max(6, tileWidth * 0.22 * widthPct);
      const h = Math.max(10, tileHeight * heightPct);
      const x = edgeX - w / 2;
      const y = heightAnchor === 'ceiling' ? midTop : midBottom - h;
      if (color) {
        context.fillStyle = color;
        context.fillRect(x, y, w, h);
        context.strokeStyle = 'rgba(0,0,0,0.35)';
        context.lineWidth = 1;
        context.strokeRect(x, y, w, h);
      } else {
        const grad = context.createLinearGradient(x, 0, x + w, 0);
        grad.addColorStop(0, '#888');
        grad.addColorStop(0.25, '#eee');
        grad.addColorStop(0.5, '#fff');
        grad.addColorStop(0.75, '#ddd');
        grad.addColorStop(1, '#999');
        context.fillStyle = grad;
        context.fillRect(x, y, w, h);
        context.strokeStyle = 'rgba(0,0,0,0.35)';
        context.lineWidth = 1;
        context.strokeRect(x, y, w, h);
      }
      if (fogAlpha > 0) {
        context.globalAlpha = fogAlpha;
        context.fillStyle = '#000';
        context.fillRect(x, y, w, h);
        context.globalAlpha = 0.8;
      }
    }

    context.globalAlpha = 1;
    context.restore();
  }

  private drawFirstPersonObstacle(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    image: HTMLImageElement | null,
    lateralOffset: number = 0,
    lateralRange: number = 1,
    obs?: ObstaclePlacement,
    depth: number = 0
  ): void {
    const midLeft = (nearFrame.left + farFrame.left) / 2;
    const midRight = (nearFrame.right + farFrame.right) / 2;
    const midTop = (nearFrame.top + farFrame.top) / 2;
    const midBottom = (nearFrame.bottom + farFrame.bottom) / 2;
    const tileWidth = midRight - midLeft;
    const tileHeight = midBottom - midTop;
    const normalizedOffset =
      lateralRange <= 0 ? 0 : lateralOffset / (Math.max(1, lateralRange) + 0.65);
    const centeredX = (midLeft + midRight) / 2 + normalizedOffset * tileWidth * 0.82;
    const minCenterX = midLeft + tileWidth * 0.12;
    const maxCenterX = midRight - tileWidth * 0.12;
    const centerX = Math.max(minCenterX, Math.min(maxCenterX, centeredX));
    const lateralScale = 1 - Math.min(0.32, Math.abs(normalizedOffset) * 0.22);

    const heightPct = Math.max(1, Math.min(100, obs?.heightPercent ?? 100)) / 100;
    const heightAnchor = obs?.heightAnchor ?? 'floor';
    const widthPct = Math.max(1, Math.min(100, obs?.widthPercent ?? 100)) / 100;
    const widthAnchor = obs?.widthAnchor ?? 'center';
    const color = obs?.color ?? null;
    const fogAlpha = Math.min(0.72, depth * 0.16);
    const shape = obs?.shape ?? 'circle';

    // ── Square shape: flat face box fills the tile front ──────────────────────
    // Side squares (lateralOffset != 0) have no correct lateral face calculation;
    // the peek path handles corner visibility, so skip here to avoid painting
    // the full nearFrame width across the front view.
    if (shape === 'square') {
      if (lateralOffset !== 0) return;
      const frameW = nearFrame.right - nearFrame.left;
      const frameH = nearFrame.bottom - nearFrame.top;
      const sw = Math.max(4, frameW * widthPct);
      const sx = nearFrame.left + (frameW - sw) / 2;
      const sh = Math.max(4, frameH * heightPct);
      const sy = heightAnchor === 'ceiling' ? nearFrame.top : nearFrame.bottom - sh;

      if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
        context.drawImage(image, sx, sy, sw, sh);
      } else if (color) {
        context.fillStyle = color;
        context.fillRect(sx, sy, sw, sh);
        context.strokeStyle = 'rgba(0,0,0,0.4)';
        context.lineWidth = 1.5;
        context.strokeRect(sx, sy, sw, sh);
      } else {
        // stone wall face gradient
        const grad = context.createLinearGradient(sx, 0, sx + sw, 0);
        grad.addColorStop(0, '#7a7a7a');
        grad.addColorStop(0.05, '#c8c8c8');
        grad.addColorStop(0.5, '#e8e8e8');
        grad.addColorStop(0.95, '#c0c0c0');
        grad.addColorStop(1, '#7a7a7a');
        context.fillStyle = grad;
        context.fillRect(sx, sy, sw, sh);
        this.drawStoneTextureInRect(context, sx, sy, sw, sh, Math.floor(sx * 7 + sy * 13));
        context.strokeStyle = 'rgba(0,0,0,0.3)';
        context.lineWidth = 1;
        context.strokeRect(sx, sy, sw, sh);
      }

      // For 100% fill on a straight-ahead obstacle: cover the floor/ceiling
      // trapezoids and far face so adjacent 100% obstacles touch with no gap.
      // Only applies when lateralOffset === 0 — side obstacles must not extend
      // across the full view width.
      if (widthPct >= 1 && heightPct >= 1 && lateralOffset === 0) {
        if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
          context.fillStyle = '#c0c0c0';
        } else if (!color) {
          context.fillStyle = '#c8c8c8';
        }
        // floor trapezoid
        context.beginPath();
        context.moveTo(nearFrame.left, nearFrame.bottom);
        context.lineTo(nearFrame.right, nearFrame.bottom);
        context.lineTo(farFrame.right, farFrame.bottom);
        context.lineTo(farFrame.left, farFrame.bottom);
        context.closePath();
        context.fill();
        // ceiling trapezoid
        context.beginPath();
        context.moveTo(nearFrame.left, nearFrame.top);
        context.lineTo(nearFrame.right, nearFrame.top);
        context.lineTo(farFrame.right, farFrame.top);
        context.lineTo(farFrame.left, farFrame.top);
        context.closePath();
        context.fill();
        // far face
        context.fillRect(farFrame.left, farFrame.top,
          farFrame.right - farFrame.left, farFrame.bottom - farFrame.top);

        if (fogAlpha > 0) {
          context.fillStyle = `rgba(0, 0, 0, ${fogAlpha})`;
          context.beginPath();
          context.moveTo(nearFrame.left, nearFrame.bottom);
          context.lineTo(nearFrame.right, nearFrame.bottom);
          context.lineTo(farFrame.right, farFrame.bottom);
          context.lineTo(farFrame.left, farFrame.bottom);
          context.closePath();
          context.fill();
          context.beginPath();
          context.moveTo(nearFrame.left, nearFrame.top);
          context.lineTo(nearFrame.right, nearFrame.top);
          context.lineTo(farFrame.right, farFrame.top);
          context.lineTo(farFrame.left, farFrame.top);
          context.closePath();
          context.fill();
          context.fillRect(farFrame.left, farFrame.top,
            farFrame.right - farFrame.left, farFrame.bottom - farFrame.top);
        }
      }

      if (fogAlpha > 0) {
        context.fillStyle = `rgba(0, 0, 0, ${fogAlpha})`;
        context.fillRect(sx, sy, sw, sh);
      }
      return;
    }

    // ── Circle shape (default): pillar / column ───────────────────────────────
    if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
      const baseWidth = tileWidth * 0.72 * lateralScale;
      const maxWidth = baseWidth * widthPct;
      const maxHeight = tileHeight * lateralScale * heightPct;
      const aspectRatio = image.naturalWidth / image.naturalHeight;
      let drawHeight = maxHeight;
      let drawWidth = drawHeight * aspectRatio;
      if (drawWidth > maxWidth) {
        drawWidth = maxWidth;
        drawHeight = drawWidth / aspectRatio;
      }
      if (heightPct === 1) drawHeight = maxHeight;
      if (widthPct === 1) drawWidth = maxWidth;
      drawWidth = Math.max(8, drawWidth);
      drawHeight = Math.max(8, drawHeight);
      const halfSlack = (baseWidth - drawWidth) / 2;
      const drawX = widthAnchor === 'east'
        ? centerX - drawWidth / 2 + halfSlack
        : widthAnchor === 'west'
          ? centerX - drawWidth / 2 - halfSlack
          : centerX - drawWidth / 2;
      const drawY = heightAnchor === 'ceiling' ? midTop : midBottom - drawHeight;
      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      if (fogAlpha > 0) {
        context.fillStyle = `rgba(0, 0, 0, ${fogAlpha})`;
        context.fillRect(drawX, drawY, drawWidth, drawHeight);
      }
      return;
    }

    // Fallback: thin column
    const baseW = tileWidth * 0.22 * lateralScale;
    const w = Math.max(6, baseW * widthPct);
    const h = Math.max(10, tileHeight * lateralScale * heightPct);
    const halfSlack = (baseW - w) / 2;
    const x = widthAnchor === 'east'
      ? centerX - w / 2 + halfSlack
      : widthAnchor === 'west'
        ? centerX - w / 2 - halfSlack
        : centerX - w / 2;
    const y = heightAnchor === 'ceiling' ? midTop : midBottom - h;
    if (color) {
      context.fillStyle = color;
      context.fillRect(x, y, w, h);
      context.strokeStyle = 'rgba(0,0,0,0.35)';
      context.lineWidth = 1;
      context.strokeRect(x, y, w, h);
    } else {
      const grad = context.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, '#888');
      grad.addColorStop(0.25, '#eee');
      grad.addColorStop(0.5, '#fff');
      grad.addColorStop(0.75, '#ddd');
      grad.addColorStop(1, '#999');
      context.fillStyle = grad;
      context.fillRect(x, y, w, h);
      context.strokeStyle = 'rgba(0,0,0,0.35)';
      context.lineWidth = 1;
      context.strokeRect(x, y, w, h);
    }
    if (fogAlpha > 0) {
      context.fillStyle = `rgba(0, 0, 0, ${fogAlpha})`;
      context.fillRect(x, y, w, h);
    }
  }

  private drawFirstPersonFloorBag(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    bagImage: HTMLImageElement | null
  ): void {
    const midLeft = (nearFrame.left + farFrame.left) / 2;
    const midRight = (nearFrame.right + farFrame.right) / 2;
    const centerX = (midLeft + midRight) / 2;
    const floorY = (nearFrame.bottom + farFrame.bottom) / 2;
    const height = 30;
    const bottom = floorY - 1;
    this.drawLootImage(context, centerX, bottom, height, bagImage);
  }

  private drawItemOnObstacle(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    obs: ObstaclePlacement | undefined,
    lateralOffset: number,
    lateralRange: number,
    bagImage: HTMLImageElement | null
  ): void {
    const midLeft = (nearFrame.left + farFrame.left) / 2;
    const midRight = (nearFrame.right + farFrame.right) / 2;
    const midTop = (nearFrame.top + farFrame.top) / 2;
    const midBottom = (nearFrame.bottom + farFrame.bottom) / 2;
    const tileWidth = midRight - midLeft;
    const tileHeight = midBottom - midTop;

    const normalizedOffset = lateralRange <= 0 ? 0 : lateralOffset / (Math.max(1, lateralRange) + 0.65);
    const centeredX = (midLeft + midRight) / 2 + normalizedOffset * tileWidth * 0.82;
    const centerX = Math.max(midLeft + tileWidth * 0.12, Math.min(midRight - tileWidth * 0.12, centeredX));

    const heightPct = Math.max(1, Math.min(100, obs?.heightPercent ?? 100)) / 100;
    const heightAnchor = obs?.heightAnchor ?? 'floor';

    // Obstacle extents in the mid-frame plane
    const obsDrawH = tileHeight * heightPct;
    const obsTopY = heightAnchor === 'ceiling' ? midTop : midBottom - obsDrawH;

    const bagH = 30;

    // Placement rules:
    // - ceiling anchor → always in the middle of the obstacle
    // - floor anchor, >= 80% tall → middle of obstacle
    // - floor anchor, < 80% tall → on top of obstacle
    let bagCenterY: number;
    if (heightAnchor === 'ceiling' || heightPct >= 0.8) {
      bagCenterY = obsTopY + obsDrawH / 2;
    } else {
      bagCenterY = obsTopY - bagH / 2 - 1;
    }

    const bagBottom = bagCenterY + bagH / 2;
    this.drawLootImage(context, centerX, bagBottom, bagH, bagImage);
  }

  private drawLootImage(
    context: CanvasRenderingContext2D,
    centerX: number,
    bottomY: number,
    height: number,
    preferredImage: HTMLImageElement | null
  ): void {
    const image = preferredImage ?? this.getGenericTresherImage();
    if (!image || !image.complete || image.naturalHeight <= 0) {
      return;
    }

    const aspect = image.naturalWidth / image.naturalHeight;
    const drawHeight = Math.max(8, height);
    const drawWidth = Math.max(8, drawHeight * (Number.isFinite(aspect) && aspect > 0 ? aspect : 1));
    const left = centerX - drawWidth / 2;
    const top = bottomY - drawHeight;
    context.drawImage(image, left, top, drawWidth, drawHeight);
  }

  private getGenericTresherImage(): HTMLImageElement | null {
    if (this.genericTresherImage) {
      return this.genericTresherImage;
    }

    if (this.genericTresherImageLoading) {
      return null;
    }

    this.genericTresherImageLoading = true;
    const img = new Image();
    img.onload = () => {
      this.genericTresherImage = img;
      this.genericTresherImageLoading = false;
      this.drawCanvas();
    };
    img.onerror = () => {
      this.genericTresherImageLoading = false;
    };
    img.src = '/images/genericTresher.png';
    return null;
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
      this.drawTresherCoinMarker(context, centerX + offset.x, floorY + offset.y, Math.max(2, offset.radius));
    }
  }

  private drawFirstPersonFloorExit(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    transitionType: ExitTransitionType,
    squareKey = ''
  ): void {
    const nearWidth = nearFrame.right - nearFrame.left;
    const farWidth = farFrame.right - farFrame.left;
    const frontInset = nearWidth * 0.08;
    const backInset = farWidth * 0.14;
    const frontLeft = nearFrame.left + frontInset;
    const frontRight = nearFrame.right - frontInset;
    const backLeft = farFrame.left + backInset;
    const backRight = farFrame.right - backInset;
    const frontY = nearFrame.bottom - nearWidth * 0.025;
    const backBaseY = farFrame.bottom + farWidth * 0.02;
    const depthSize = Math.max(6, frontY - backBaseY);

    if (transitionType === 'open') {
      const centerX = (frontLeft + frontRight + backLeft + backRight) / 4;
      const centerY = (frontY + backBaseY) / 2;
      const radius = Math.max(3, Math.min(11, nearWidth * 0.1));
      context.fillStyle = '#45d483';
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#e4fff0';
      context.lineWidth = 1;
      context.stroke();
      return;
    }

    if (transitionType === 'stairsUp') {
      if (squareKey && !this.stairsUpSquareAssignment.has(squareKey)) {
        this.stairsUpSquareAssignment.set(squareKey, (Math.floor(Math.random() * 3) + 1) as 1 | 2 | 3);
      }
      const assignedIdx = squareKey ? (this.stairsUpSquareAssignment.get(squareKey) ?? 1) : 1;
      const stairImg = this.stairsUpImageCache.get(`stup${assignedIdx}`) ?? null;
      if (stairImg) {
        const midLeft = nearFrame.left * 0.65 + farFrame.left * 0.35;
        const midRight = nearFrame.right * 0.65 + farFrame.right * 0.35;
        const midTop = nearFrame.top * 0.65 + farFrame.top * 0.35;
        const midBottom = nearFrame.bottom * 0.65 + farFrame.bottom * 0.35;
        const drawW = Math.max(8, (midRight - midLeft) * 0.9);
        const drawH = Math.max(8, (midBottom - midTop) * 0.92);
        const drawX = (midLeft + midRight) / 2 - drawW / 2;
        const drawY = midBottom - drawH;
        context.drawImage(stairImg, drawX, drawY, drawW, drawH);
        return;
      }
    }

    if (transitionType === 'stairsDown') {
      if (squareKey && !this.stairsDownSquareAssignment.has(squareKey)) {
        this.stairsDownSquareAssignment.set(squareKey, 1);
      }
      const assignedIdx = squareKey ? (this.stairsDownSquareAssignment.get(squareKey) ?? 1) : 1;
      const stairImg = this.stairsDownImageCache.get(`stdown${assignedIdx}`) ?? null;
      if (stairImg) {
        const midLeft = nearFrame.left * 0.65 + farFrame.left * 0.35;
        const midRight = nearFrame.right * 0.65 + farFrame.right * 0.35;
        const midTop = nearFrame.top * 0.65 + farFrame.top * 0.35;
        const midBottom = nearFrame.bottom * 0.65 + farFrame.bottom * 0.35;
        const drawW = Math.max(8, (midRight - midLeft) * 0.9);
        const drawH = Math.max(8, (midBottom - midTop) * 0.92);
        const drawX = (midLeft + midRight) / 2 - drawW / 2;
        const drawY = midBottom - drawH;
        context.drawImage(stairImg, drawX, drawY, drawW, drawH);
        return;
      }
    }

    const slopeFrontY = transitionType === 'stairsUp' ? frontY : frontY - depthSize * 0.1;
    const slopeBackY =
      transitionType === 'stairsUp' ? backBaseY - depthSize * 0.58 : frontY + depthSize * 0.62;
    const stepCount = 6;
    const ratioAt = (index: number): number => {
      const baseRatio = index / stepCount;
      return transitionType === 'stairsUp' ? Math.pow(baseRatio, 1.3) : Math.pow(baseRatio, 0.7);
    };

    for (let index = 0; index < stepCount; index += 1) {
      const startRatio = ratioAt(index);
      const endRatio = ratioAt(index + 1);
      const startLeftX = frontLeft + (backLeft - frontLeft) * startRatio;
      const startRightX = frontRight + (backRight - frontRight) * startRatio;
      const endLeftX = frontLeft + (backLeft - frontLeft) * endRatio;
      const endRightX = frontRight + (backRight - frontRight) * endRatio;
      const startY = slopeFrontY + (slopeBackY - slopeFrontY) * startRatio;
      const endY = slopeFrontY + (slopeBackY - slopeFrontY) * endRatio;
      const treadTint = index % 2 === 0 ? 0.36 : 0.5;
      context.fillStyle =
        transitionType === 'stairsUp'
          ? `rgba(255, 96, 96, ${treadTint})`
          : `rgba(170, 34, 34, ${treadTint})`;
      context.beginPath();
      context.moveTo(startLeftX, startY);
      context.lineTo(startRightX, startY);
      context.lineTo(endRightX, endY);
      context.lineTo(endLeftX, endY);
      context.closePath();
      context.fill();

      context.strokeStyle = transitionType === 'stairsUp' ? '#ffd6d6' : '#ffb5b5';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(startLeftX, startY);
      context.lineTo(startRightX, startY);
      context.stroke();
    }

    context.strokeStyle = transitionType === 'stairsUp' ? '#ffd9d9' : '#ffc1c1';
    context.lineWidth = 1.1;
    context.beginPath();
    context.moveTo(frontLeft, slopeFrontY);
    context.lineTo(frontRight, slopeFrontY);
    context.lineTo(backRight, slopeBackY);
    context.lineTo(backLeft, slopeBackY);
    context.closePath();
    context.stroke();

    context.strokeStyle = transitionType === 'stairsUp' ? '#ff9f9f' : '#ff7777';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(frontLeft, slopeFrontY);
    context.lineTo(backLeft, slopeBackY);
    context.moveTo(frontRight, slopeFrontY);
    context.lineTo(backRight, slopeBackY);
    context.stroke();

    const arrowStartX = (frontLeft + frontRight) / 2;
    const arrowStartY = slopeFrontY + (transitionType === 'stairsUp' ? -nearWidth * 0.015 : nearWidth * 0.015);
    const arrowTipX = (backLeft + backRight) / 2;
    const arrowTipY = slopeBackY + (transitionType === 'stairsUp' ? -farWidth * 0.02 : farWidth * 0.02);
    const arrowVectorX = arrowTipX - arrowStartX;
    const arrowVectorY = arrowTipY - arrowStartY;
    const arrowLength = Math.hypot(arrowVectorX, arrowVectorY) || 1;
    const normX = arrowVectorX / arrowLength;
    const normY = arrowVectorY / arrowLength;
    const perpendicularX = -normY;
    const perpendicularY = normX;
    const arrowHeadSize = Math.max(3, nearWidth * 0.05);

    context.strokeStyle = '#ffd7d7';
    context.lineWidth = 1.25;
    context.beginPath();
    context.moveTo(arrowStartX, arrowStartY);
    context.lineTo(arrowTipX, arrowTipY);
    context.stroke();

    context.fillStyle = '#ffd7d7';
    context.beginPath();
    context.moveTo(arrowTipX, arrowTipY);
    context.lineTo(arrowTipX - normX * arrowHeadSize + perpendicularX * (arrowHeadSize * 0.55), arrowTipY - normY * arrowHeadSize + perpendicularY * (arrowHeadSize * 0.55));
    context.lineTo(arrowTipX - normX * arrowHeadSize - perpendicularX * (arrowHeadSize * 0.55), arrowTipY - normY * arrowHeadSize - perpendicularY * (arrowHeadSize * 0.55));
    context.closePath();
    context.fill();
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
    context.fillStyle = 'rgba(255, 248, 210, 0.45)';
    context.beginPath();
    context.arc(centerX - clampedRadius * 0.25, centerY - clampedRadius * 0.25, clampedRadius * 0.38, 0, Math.PI * 2);
    context.fill();
  }

  private loadDoorImages(): void {
    for (const key of ['open', 'closed'] as const) {
      if (this.doorImageCache.has(key)) continue;
      const img = new Image();
      img.onload = () => {
        this.doorImageCache.set(key, img);
        this.drawCanvas();
      };
      img.src = key === 'open' ? '/images/dooropen.jpg' : '/images/doorclosed.jpg';
    }
  }

  private loadStairsUpImages(): void {
    for (let i = 1; i <= 3; i++) {
      const key = `stup${i}`;
      if (this.stairsUpImageCache.has(key)) continue;
      const img = new Image();
      img.onload = () => {
        this.stairsUpImageCache.set(key, img);
        this.drawCanvas();
      };
      img.src = `/images/${key}.jpg`;
    }
  }

  private loadStairsDownImages(): void {
    for (let i = 1; i <= 1; i++) {
      const key = `stdown${i}`;
      if (this.stairsDownImageCache.has(key)) continue;
      const img = new Image();
      img.onload = () => {
        this.stairsDownImageCache.set(key, img);
        this.drawCanvas();
      };
      img.src = `/images/${key}.jpg`;
    }
  }

  private drawFirstPersonDoorFace(
    context: CanvasRenderingContext2D,
    frame: { left: number; right: number; top: number; bottom: number },
    block: FirstPersonBlock,
    isPortal: boolean,
    highlight = false
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
      {
        const centerX = (doorLeft + doorRight) / 2;
        context.strokeStyle = '#f5c1c1';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(centerX, doorTop + 1);
        context.lineTo(centerX, doorBottom - 1);
        context.stroke();
        const handleX = doorRight - Math.max(3, doorW * 0.18);
        const handleY = doorTop + doorH * 0.52;
        context.fillStyle = '#f7dddd';
        context.beginPath();
        context.arc(handleX, handleY, Math.max(1.2, doorW * 0.025), 0, Math.PI * 2);
        context.fill();
        if (block.hasKeyhole) {
          const keyholeX = doorRight - Math.max(4, doorW * 0.28);
          const keyholeY = doorTop + doorH * 0.64;
          const keyholeRadius = Math.max(1.2, doorW * 0.03);
          context.fillStyle = '#1f1111';
          context.beginPath();
          context.arc(keyholeX, keyholeY, keyholeRadius, 0, Math.PI * 2);
          context.fill();
          context.fillRect(keyholeX - keyholeRadius * 0.45, keyholeY, keyholeRadius * 0.9, Math.max(2, keyholeRadius * 2.2));
        }
      }
    }
    context.restore();

    if (highlight) {
      this.drawWallGlowRect(context, doorLeft, doorTop, doorW, doorH);
    }
  }

  private drawFirstPersonDestructibleWallFace(
    context: CanvasRenderingContext2D,
    frame: { left: number; right: number; top: number; bottom: number },
    isPortal: boolean,
    highlight = false
  ): void {
    const frameWidth = frame.right - frame.left;
    const frameHeight = frame.bottom - frame.top;
    const insetX = Math.max(2, frameWidth * 0.1);
    const insetY = Math.max(2, frameHeight * 0.08);
    const panelLeft = frame.left + insetX;
    const panelRight = frame.right - insetX;
    const panelTop = frame.top + insetY;
    const panelBottom = frame.bottom - insetY;
    const panelW = panelRight - panelLeft;
    const panelH = panelBottom - panelTop;

    context.save();
    context.globalAlpha = isPortal ? 0.84 : 1;

    context.fillStyle = '#555555';
    context.fillRect(panelLeft, panelTop, panelW, panelH);
    context.strokeStyle = '#888888';
    context.lineWidth = Math.max(1, Math.min(2, panelW * 0.04));
    context.strokeRect(panelLeft, panelTop, panelW, panelH);
    {
      const centerX = (panelLeft + panelRight) / 2;
      context.strokeStyle = '#6a6a6a';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(centerX, panelTop + 1);
      context.lineTo(centerX, panelBottom - 1);
      context.stroke();
    }

    context.restore();

    if (highlight) {
      this.drawWallGlowRect(context, panelLeft, panelTop, panelW, panelH);
    }
  }

  private getCurrentSquareTextWallGlowTarget(
    preview: GridPreviewContext,
    facingDir: FacingDirection
  ): 'front' | 'left' | 'right' | null {
    const wallSide =
      this.squareTexts().find(
        (squareText) => squareText.row === preview.centerRow && squareText.column === preview.centerColumn
      )?.wallSide ?? null;

    if (!wallSide) {
      return null;
    }

    const orderedSides: SquareSide[] = ['toTop', 'toRight', 'toBottom', 'toLeft'];
    const frontSideByFacing: Record<FacingDirection, SquareSide> = {
      up: 'toTop',
      right: 'toRight',
      down: 'toBottom',
      left: 'toLeft',
    };
    const frontIndex = orderedSides.indexOf(frontSideByFacing[facingDir]);
    const wallIndex = orderedSides.indexOf(wallSide);
    const relativeOffset = (wallIndex - frontIndex + orderedSides.length) % orderedSides.length;

    if (relativeOffset === 0) {
      return 'front';
    }

    if (relativeOffset === 1) {
      return 'right';
    }

    if (relativeOffset === 3) {
      return 'left';
    }

    return null;
  }

  private drawWallGlowRect(
    context: CanvasRenderingContext2D,
    left: number,
    top: number,
    width: number,
    height: number
  ): void {
    if (width <= 0 || height <= 0) {
      return;
    }

    context.save();
    context.shadowColor = 'rgba(154, 78, 255, 0.96)';
    context.shadowBlur = Math.max(10, Math.min(24, Math.min(width, height) * 0.24));
    context.fillStyle = 'rgba(163, 88, 255, 0.18)';
    context.strokeStyle = 'rgba(227, 196, 255, 0.96)';
    context.lineWidth = 2;
    context.fillRect(left, top, width, height);
    context.strokeRect(left, top, width, height);
    context.restore();
  }

  private drawWallGlowPolygon(
    context: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>
  ): void {
    if (points.length < 3) {
      return;
    }

    context.save();
    context.shadowColor = 'rgba(154, 78, 255, 0.94)';
    context.shadowBlur = 18;
    context.fillStyle = 'rgba(163, 88, 255, 0.14)';
    context.strokeStyle = 'rgba(227, 196, 255, 0.92)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
  }

  private drawRunicInscription(
    context: CanvasRenderingContext2D,
    left: number,
    top: number,
    width: number,
    height: number,
    seed: number
  ): void {
    if (width < 20 || height < 20) return;

    // Runic / Elvish-looking glyphs drawn as decorative wall inscriptions
    const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟᛣᛥᛦᚸᚻᛋᛝᛠᚳᚴᚵᚶᚷᚸ';
    const rng = (n: number): number => {
      const x = Math.sin(seed * 9301 + n * 49297 + 233) * 46839.5453;
      return x - Math.floor(x);
    };

    const padding = Math.max(6, Math.min(width, height) * 0.10);
    const availW = width - padding * 2;
    const availH = height - padding * 2;
    const fontSize = Math.max(7, Math.min(16, availW * 0.065));
    const lineHeight = fontSize * 1.65;
    const charWidth = fontSize * 0.68;
    const charsPerLine = Math.max(1, Math.floor(availW / charWidth));
    const numLines = Math.max(1, Math.floor(availH / lineHeight));

    context.save();
    context.font = `${fontSize}px serif`;
    context.textBaseline = 'alphabetic';
    context.shadowColor = 'rgba(255, 190, 60, 0.75)';
    context.shadowBlur = 5;
    context.fillStyle = 'rgba(255, 215, 110, 0.82)';

    let counter = 0;
    for (let line = 0; line < numLines; line++) {
      const lineLen = Math.max(2, Math.floor(charsPerLine * (0.65 + rng(counter++) * 0.35)));
      const y = top + padding + (line + 0.9) * lineHeight;
      let x = left + padding;
      for (let c = 0; c < lineLen; c++) {
        const gi = Math.floor(rng(counter++) * glyphs.length);
        const char = glyphs[gi] ?? glyphs[0];
        context.fillText(char, x, y);
        x += charWidth * (0.85 + rng(counter++) * 0.30);
        if (x > left + width - padding) break;
      }
    }

    context.restore();
  }

  private getLateralBlockType(
    row: number,
    column: number,
    rowOffset: number,
    columnOffset: number
  ): FirstPersonBlock {
    const squares = this.squares();
    const filledSquares = this.filledSquares();
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
      return this.toFirstPersonBlock('wall', null, connection);
    }
    if (this.isDoorConnection(connection)) {
      if (connection.isHidden && !connection.isFound) {
        return this.toFirstPersonBlock('wall', null);
      }
      return this.toFirstPersonBlock(connection.state === 'closed' ? 'closedDoor' : 'openDoor', connection);
    }
    const neighborSquareKey = this.getSquareKey(row + rowOffset, column + columnOffset);
    if (!filledSquares[neighborSquareKey] || !squares[neighborSquareKey]) {
      return this.toFirstPersonBlock('void', null);
    }
    return this.toFirstPersonBlock('none', null);
  }

  private getSideOpeningBackBlock(
    row: number,
    column: number,
    sideRowOffset: number,
    sideColumnOffset: number,
    forwardRowOffset: number,
    forwardColumnOffset: number
  ): FirstPersonBlock | null {
    const sideRow = row + sideRowOffset;
    const sideColumn = column + sideColumnOffset;
    const sideForwardConnection = this.getMovementConnectionInfoBetweenAdjacentSquares(
      sideRow, sideColumn, sideRow + forwardRowOffset, sideColumn + forwardColumnOffset
    );
    if (sideForwardConnection.type === 'none') {
      return null;
    }
    return this.toFirstPersonBlock(sideForwardConnection.type, sideForwardConnection.door, sideForwardConnection.wall ?? null);
  }

  private getMovementConnectionInfoBetweenAdjacentSquares(
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
    const squares = this.squares();
    const fromSquare = squares[this.getSquareKey(fromRow, fromColumn)];
    if (!fromSquare) {
      return { type: 'void', door: null };
    }
    let fromSide: SquareSide;
    let toSide: SquareSide;
    if (rowDelta === -1) { fromSide = 'toTop'; toSide = 'toBottom'; }
    else if (rowDelta === 1) { fromSide = 'toBottom'; toSide = 'toTop'; }
    else if (columnDelta === -1) { fromSide = 'toLeft'; toSide = 'toRight'; }
    else { fromSide = 'toRight'; toSide = 'toLeft'; }

    const fromConnection = fromSquare[fromSide];
    if (this.isWallConnection(fromConnection)) {
      return { type: 'wall', door: null, wall: fromConnection };
    }
    if (this.isDoorConnection(fromConnection)) {
      if (fromConnection.isHidden && !fromConnection.isFound) {
        return { type: 'wall', door: null };
      }
      return { type: fromConnection.state === 'closed' ? 'closedDoor' : 'openDoor', door: fromConnection };
    }
    const toSquare = squares[this.getSquareKey(toRow, toColumn)];
    if (!toSquare) {
      return { type: 'void', door: null };
    }
    const toConnection = toSquare[toSide];
    if (this.isWallConnection(toConnection)) {
      return { type: 'wall', door: null, wall: toConnection };
    }
    if (this.isDoorConnection(toConnection)) {
      if (toConnection.isHidden && !toConnection.isFound) {
        return { type: 'wall', door: null };
      }
      return { type: toConnection.state === 'closed' ? 'closedDoor' : 'openDoor', door: toConnection };
    }
    return { type: 'none', door: null };
  }

  private getSquareSideFromOffset(rowOffset: number, columnOffset: number): SquareSide | null {
    if (rowOffset === -1 && columnOffset === 0) return 'toTop';
    if (rowOffset === 1 && columnOffset === 0) return 'toBottom';
    if (rowOffset === 0 && columnOffset === -1) return 'toLeft';
    if (rowOffset === 0 && columnOffset === 1) return 'toRight';
    return null;
  }

  private getMovementDeltaForFacingDirection(direction: FacingDirection): { rowOffset: number; columnOffset: number } {
    if (direction === 'up') return { rowOffset: -1, columnOffset: 0 };
    if (direction === 'right') return { rowOffset: 0, columnOffset: 1 };
    if (direction === 'down') return { rowOffset: 1, columnOffset: 0 };
    return { rowOffset: 0, columnOffset: -1 };
  }

  private drawCompass(context: CanvasRenderingContext2D, facingDir: FacingDirection): void {
    const cx = 38;
    const cy = 38;
    const radius = 22;
    const dirMap: Record<FacingDirection, { label: string; angle: number }> = {
      up:    { label: 'N', angle: -Math.PI / 2 },
      right: { label: 'E', angle: 0 },
      down:  { label: 'S', angle: Math.PI / 2 },
      left:  { label: 'W', angle: Math.PI },
    };
    const facing = dirMap[facingDir];
    const arrowAngle = facing.angle;

    context.save();

    // Background circle
    context.beginPath();
    context.arc(cx, cy, radius + 5, 0, Math.PI * 2);
    context.fillStyle = 'rgba(0, 0, 0, 0.50)';
    context.fill();
    context.strokeStyle = 'rgba(190, 175, 145, 0.55)';
    context.lineWidth = 1;
    context.stroke();

    // Cardinal labels
    const cardinals: { label: string; angle: number }[] = [
      { label: 'N', angle: -Math.PI / 2 },
      { label: 'E', angle: 0 },
      { label: 'S', angle: Math.PI / 2 },
      { label: 'W', angle: Math.PI },
    ];
    context.font = 'bold 9px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const c of cardinals) {
      const lx = cx + Math.cos(c.angle) * (radius - 1);
      const ly = cy + Math.sin(c.angle) * (radius - 1);
      context.fillStyle = c.label === facing.label ? '#f8c84a' : 'rgba(210, 200, 180, 0.85)';
      context.fillText(c.label, lx, ly);
    }

    // Arrow pointing in the facing direction
    const arrowLen = radius * 0.52;
    const arrowTipX = cx + Math.cos(arrowAngle) * arrowLen;
    const arrowTipY = cy + Math.sin(arrowAngle) * arrowLen;
    const arrowBaseX = cx - Math.cos(arrowAngle) * (arrowLen * 0.45);
    const arrowBaseY = cy - Math.sin(arrowAngle) * (arrowLen * 0.45);
    const perpX = Math.sin(arrowAngle) * 4.5;
    const perpY = -Math.cos(arrowAngle) * 4.5;
    context.beginPath();
    context.moveTo(arrowTipX, arrowTipY);
    context.lineTo(arrowBaseX + perpX, arrowBaseY + perpY);
    context.lineTo(arrowBaseX - perpX, arrowBaseY - perpY);
    context.closePath();
    context.fillStyle = '#f8c84a';
    context.fill();

    context.restore();
  }

  private getFirstPersonSideColor(block: PathBlockType): string {
    if (block === 'closedDoor') return '#8f2525';
    if (block === 'openDoor') return '#ab2f2f';
    if (block === 'wall') return this.getFirstPersonFrontColor('wall');
    return '#1b1d21';
  }

  private getFirstPersonFrontColor(block: PathBlockType): string {
    if (block === 'closedDoor') return '#9d2727';
    if (block === 'openDoor') return '#b13131';
    if (block === 'wall') return '#d6d9df';
    return '#191b1f';
  }

  private getFirstPersonOpeningBackWallColor(block: PathBlockType, wallDepth: number): string {
    if (block === 'wall') {
      const normalizedDepth = Math.max(0, wallDepth);
      const darkenAmount = Math.min(0.86, normalizedDepth * 0.085);
      return this.darkenHexColor(this.getFirstPersonFrontColor('wall'), darkenAmount);
    }
    if (block === 'closedDoor') return '#6f1e1e';
    if (block === 'openDoor') return '#7f2525';
    return '#14171b';
  }

  private getFirstPersonWallPanelColor(depth: number): string {
    const normalizedDepth = Math.max(0, Math.floor(depth));
    return this.darkenHexColor(this.getFirstPersonFrontColor('wall'), Math.min(0.9, normalizedDepth * 0.1));
  }

  private getStoneTextureOptionsForWallDepth(depth: number): {
    densityMultiplier: number;
    crackDensityMultiplier: number;
    alphaMultiplier: number;
    crackAlpha: number;
    toneMin: number;
    toneRange: number;
  } {
    const normalizedDepth = Math.max(0, Math.floor(depth));
    return {
      densityMultiplier: 1,
      crackDensityMultiplier: 1,
      alphaMultiplier: Math.max(0.42, 1 - normalizedDepth * 0.08),
      crackAlpha: Math.max(0.08, 0.24 - normalizedDepth * 0.02),
      toneMin: Math.max(48, 160 - normalizedDepth * 12),
      toneRange: Math.max(24, 70 - normalizedDepth * 4),
    };
  }

  private drawStoneTextureInPolygon(
    context: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    seed: number,
    options?: {
      densityMultiplier?: number;
      crackDensityMultiplier?: number;
      alphaMultiplier?: number;
      crackAlpha?: number;
      toneMin?: number;
      toneRange?: number;
    }
  ): void {
    if (points.length < 3) return;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);
    context.save();
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      context.lineTo(points[i].x, points[i].y);
    }
    context.closePath();
    context.clip();
    this.drawStoneTextureInRect(context, left, top, right - left, bottom - top, seed, options);
    context.restore();
  }

  private drawStoneTextureInRect(
    context: CanvasRenderingContext2D,
    left: number,
    top: number,
    width: number,
    height: number,
    seed: number,
    options?: {
      densityMultiplier?: number;
      crackDensityMultiplier?: number;
      alphaMultiplier?: number;
      crackAlpha?: number;
      toneMin?: number;
      toneRange?: number;
    }
  ): void {
    if (width <= 0 || height <= 0) return;
    const densityMultiplier = options?.densityMultiplier ?? 1;
    const crackDensityMultiplier = options?.crackDensityMultiplier ?? 1;
    const alphaMultiplier = options?.alphaMultiplier ?? 1;
    const crackAlpha = options?.crackAlpha ?? 0.24;
    const toneMin = options?.toneMin ?? 160;
    const toneRange = options?.toneRange ?? 70;
    const area = width * height;
    const dotCount = Math.max(5, Math.floor((area / 85) * densityMultiplier));
    for (let index = 0; index < dotCount; index += 1) {
      const x = left + this.getSeededNoise(seed, index * 5 + 1) * width;
      const y = top + this.getSeededNoise(seed, index * 5 + 2) * height;
      const radius = 0.45 + this.getSeededNoise(seed, index * 5 + 3) * 0.95;
      const tone = toneMin + Math.floor(this.getSeededNoise(seed, index * 5 + 4) * toneRange);
      const alpha = (0.12 + this.getSeededNoise(seed, index * 5 + 5) * 0.2) * alphaMultiplier;
      context.fillStyle = `rgba(${tone}, ${tone}, ${tone}, ${alpha})`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
    const crackCount = Math.max(1, Math.floor((area / 1200) * crackDensityMultiplier));
    for (let index = 0; index < crackCount; index += 1) {
      const startX = left + this.getSeededNoise(seed + 31, index * 7 + 1) * width;
      const startY = top + this.getSeededNoise(seed + 31, index * 7 + 2) * height;
      const length = 6 + this.getSeededNoise(seed + 31, index * 7 + 3) * 12;
      const angle = this.getSeededNoise(seed + 31, index * 7 + 4) * Math.PI * 2;
      context.strokeStyle = `rgba(92, 97, 108, ${crackAlpha})`;
      context.lineWidth = 1;
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

    // Stone tile grid lines
    const tileSize = surface === 'floor' ? 18 : 22;
    const gridAlpha = Math.max(0.06, 0.22 - normalizedDepth * 0.018);
    context.strokeStyle =
      surface === 'floor'
        ? `rgba(40, 32, 24, ${gridAlpha})`
        : `rgba(50, 54, 68, ${gridAlpha})`;
    context.lineWidth = 0.7;
    const colCount = Math.ceil(width / tileSize) + 1;
    const rowCount = Math.ceil(height / tileSize) + 1;
    for (let col = 0; col <= colCount; col += 1) {
      const lx = left + (col / colCount) * width;
      context.beginPath();
      context.moveTo(lx, top);
      context.lineTo(lx, top + height);
      context.stroke();
    }
    for (let row = 0; row <= rowCount; row += 1) {
      const ly = top + (row / rowCount) * height;
      context.beginPath();
      context.moveTo(left, ly);
      context.lineTo(left + width, ly);
      context.stroke();
    }

    // Grain dots
    const dotCount = Math.max(8, Math.floor(area / (surface === 'floor' ? 70 : 85)));
    const alphaBase = Math.max(0.07, 0.20 - normalizedDepth * 0.012);
    const toneBase = surface === 'floor' ? 122 : 134;
    const toneRange = surface === 'floor' ? 30 : 24;

    for (let index = 0; index < dotCount; index += 1) {
      const x = left + this.getSeededNoise(seed, index * 6 + 1) * width;
      const y = top + this.getSeededNoise(seed, index * 6 + 2) * height;
      const radius = 0.5 + this.getSeededNoise(seed, index * 6 + 3) * 1.4;
      const tone = toneBase + Math.floor(this.getSeededNoise(seed, index * 6 + 4) * toneRange);
      const alpha = alphaBase * (0.55 + this.getSeededNoise(seed, index * 6 + 5) * 0.9);

      context.fillStyle = `rgba(${tone}, ${tone}, ${tone}, ${alpha})`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }

    // Short scratches / grain streaks
    const streakCount = Math.max(3, Math.floor(area / 900));
    const streakAlpha = Math.max(0.07, 0.22 - normalizedDepth * 0.012);
    context.strokeStyle =
      surface === 'floor'
        ? `rgba(74, 62, 50, ${streakAlpha})`
        : `rgba(82, 88, 104, ${streakAlpha})`;
    context.lineWidth = 1;

    for (let index = 0; index < streakCount; index += 1) {
      const startX = left + this.getSeededNoise(seed + 41, index * 7 + 1) * width;
      const startY = top + this.getSeededNoise(seed + 41, index * 7 + 2) * height;
      const length = 6 + this.getSeededNoise(seed + 41, index * 7 + 3) * 14;
      const angle = this.getSeededNoise(seed + 41, index * 7 + 4) * Math.PI * 2;
      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(startX + Math.cos(angle) * length, startY + Math.sin(angle) * length);
      context.stroke();
    }

    // Longer jagged cracks
    const crackCount = Math.max(2, Math.floor(area / 2400));
    const crackAlpha = Math.max(0.06, 0.16 - normalizedDepth * 0.013);
    context.strokeStyle =
      surface === 'floor'
        ? `rgba(45, 36, 26, ${crackAlpha})`
        : `rgba(52, 57, 73, ${crackAlpha})`;
    context.lineWidth = 0.9;

    for (let index = 0; index < crackCount; index += 1) {
      const startX = left + this.getSeededNoise(seed + 97, index * 9 + 1) * width;
      const startY = top + this.getSeededNoise(seed + 97, index * 9 + 2) * height;
      const segCount = 2 + Math.floor(this.getSeededNoise(seed + 97, index * 9 + 3) * 3);
      context.beginPath();
      context.moveTo(startX, startY);
      let cx = startX;
      let cy = startY;
      for (let seg = 0; seg < segCount; seg += 1) {
        const angle = this.getSeededNoise(seed + 97, index * 9 + 4 + seg) * Math.PI * 2;
        const len = 8 + this.getSeededNoise(seed + 97, index * 9 + 5 + seg) * 18;
        cx += Math.cos(angle) * len;
        cy += Math.sin(angle) * len;
        context.lineTo(cx, cy);
      }
      context.stroke();
    }
  }

  private getSeededNoise(seed: number, step: number): number {
    const value = Math.sin(seed * 12.9898 + step * 78.233) * 43758.5453123;
    return value - Math.floor(value);
  }

  private darkenHexColor(hexColor: string, amount: number): string {
    const normalized = hexColor.startsWith('#') ? hexColor.slice(1) : hexColor;
    if (normalized.length !== 6) return hexColor;
    const parseChannel = (startIndex: number): number => {
      const channel = Number.parseInt(normalized.slice(startIndex, startIndex + 2), 16);
      if (Number.isNaN(channel)) return 0;
      return Math.max(0, Math.min(255, Math.floor(channel * (1 - amount))));
    };
    return `#${parseChannel(0).toString(16).padStart(2, '0')}${parseChannel(2).toString(16).padStart(2, '0')}${parseChannel(4).toString(16).padStart(2, '0')}`;
  }

  private toFirstPersonBlock(type: PathBlockType, door: Door | null, wall: Wall | null = null): FirstPersonBlock {
    const isDestructible = wall?.isDestructible === true;
    return { type, hasKeyhole: Boolean(door?.keyLock), isDestructible };
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
}
