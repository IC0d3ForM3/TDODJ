import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  input,
  signal,
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
  PortalPlacement,
  SquareSide,
  SquareText,
  StartPoint,
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
export class DungeonFirstPersonComponent implements OnDestroy {
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
  readonly portalPlacements = input<PortalPlacement[]>([]);
  readonly obstaclePlacements = input<ObstaclePlacement[]>([]);
  readonly obstacleImagesBySquare = input<Map<string, HTMLImageElement | null>>(new Map());
  readonly bagImagesBySquare = input<Map<string, HTMLImageElement | null>>(new Map());
  readonly monsterImpactEffects = input<Record<string, MonsterImpactState>>({});
  readonly impactPulse = input<number>(0);
  readonly playerHp = input<number>(20);
  readonly playerMaxHp = input<number>(20);
  readonly showSquareOutlines = input<boolean>(false);
  readonly debugRenderPass = input<number>(-1);
  readonly startPoint = input<StartPoint | null>(null);

  readonly canvasWidth = 330;
  readonly canvasHeight = 220;
  private readonly maxDepth = 8;
  private readonly doorImageCache = new Map<string, HTMLImageElement>();
  private readonly stairsUpImageCache = new Map<string, HTMLImageElement>();
  private readonly stairsUpSquareAssignment = new Map<string, 1 | 2 | 3>();
  private readonly stairsDownImageCache = new Map<string, HTMLImageElement>();
  private readonly stairsDownSquareAssignment = new Map<string, number>();
  private readonly shopImageCache = new Map<string, HTMLImageElement>();
  private readonly portalPulseTick = signal(0);
  private portalPulseTimer: ReturnType<typeof setInterval> | null = null;
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
      const portals = this.portalPlacements();
      this.obstaclePlacements();
      this.obstacleImagesBySquare();
      this.bagImagesBySquare();
      this.monsterImpactEffects();
      this.impactPulse();
      this.playerHp();
      this.playerMaxHp();
      this.showSquareOutlines();
      this.debugRenderPass();
      this.portalPulseTick();
      this.startPoint();
      this.syncPortalPulseTimer(portals);
      untracked(() => this.drawCanvas());
    });
    this.loadDoorImages();
    this.loadStairsUpImages();
    this.loadStairsDownImages();
  }

  ngOnDestroy(): void {
    if (this.portalPulseTimer !== null) {
      clearInterval(this.portalPulseTimer);
      this.portalPulseTimer = null;
    }
  }

  private drawCanvas(): void {
    const canvas = this._canvasRef?.nativeElement;
    const preview = this.preview();
    const cheater = this.cheater();
    const debugPass = this.debugRenderPass();
    const isDebug = debugPass >= 0;
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

    const magicPortalGlowBySquare = new Map<string, 'oneWay' | 'twoWay'>();
    for (const portal of this.portalPlacements()) {
      if (portal.look !== 'magicDoor') continue;
      if (portal.startRow !== null && portal.startColumn !== null) {
        magicPortalGlowBySquare.set(
          this.getSquareKey(portal.startRow, portal.startColumn),
          portal.isTwoWay === false ? 'oneWay' : 'twoWay'
        );
      }
      if (portal.isTwoWay !== false && portal.endRow !== null && portal.endColumn !== null) {
        magicPortalGlowBySquare.set(this.getSquareKey(portal.endRow, portal.endColumn), 'twoWay');
      }
    }

    if (visibleFirstPersonView.steps.length === 0) {
      context.fillStyle = '#d1d6de';
      context.font = '13px sans-serif';
      context.fillText('No first-person view for this tile.', 16, height / 2);
      return;
    }

    const maxFrameDepth = Math.max(2, Math.min(12, visibleFirstPersonView.steps.length + 0.85));
    const frameAtDepth = (depth: number): { left: number; right: number; top: number; bottom: number } => {
      const ratio = Math.min(1, depth / maxFrameDepth);
      const marginX = ratio * (width * 0.41);
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

    if (isDebug && debugPass < 1) return;

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

      // Side floor extensions: fill corner areas below the frame on each side.
      const leftFloorExt = [
        { x: 0, y: nearFrame.bottom },
        { x: nearFrame.left, y: nearFrame.bottom },
        { x: farFrame.left, y: farFrame.bottom },
        { x: 0, y: farFrame.bottom },
      ];
      const rightFloorExt = [
        { x: nearFrame.right, y: nearFrame.bottom },
        { x: width, y: nearFrame.bottom },
        { x: width, y: farFrame.bottom },
        { x: farFrame.right, y: farFrame.bottom },
      ];
      context.fillStyle = floorGradient;
      context.beginPath();
      context.moveTo(0, nearFrame.bottom);
      context.lineTo(nearFrame.left, nearFrame.bottom);
      context.lineTo(farFrame.left, farFrame.bottom);
      context.lineTo(0, farFrame.bottom);
      context.closePath();
      context.fill();
      this.drawSurfaceTextureInPolygon(
        context,
        leftFloorExt,
        nearFrame.left * 3 + nearFrame.bottom * 5 + farFrame.right * 7 + depth * 29 + 31,
        depth,
        'floor'
      );
      context.fillStyle = floorGradient;
      context.beginPath();
      context.moveTo(nearFrame.right, nearFrame.bottom);
      context.lineTo(width, nearFrame.bottom);
      context.lineTo(width, farFrame.bottom);
      context.lineTo(farFrame.right, farFrame.bottom);
      context.closePath();
      context.fill();
      this.drawSurfaceTextureInPolygon(
        context,
        rightFloorExt,
        nearFrame.right * 3 + nearFrame.bottom * 5 + farFrame.left * 7 + depth * 29 + 37,
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

      // Side ceiling extensions: fill corner areas above the frame on each side.
      const leftCeilingExt = [
        { x: 0, y: nearFrame.top },
        { x: nearFrame.left, y: nearFrame.top },
        { x: farFrame.left, y: farFrame.top },
        { x: 0, y: farFrame.top },
      ];
      const rightCeilingExt = [
        { x: nearFrame.right, y: nearFrame.top },
        { x: width, y: nearFrame.top },
        { x: width, y: farFrame.top },
        { x: farFrame.right, y: farFrame.top },
      ];
      context.fillStyle = ceilingGradient;
      context.beginPath();
      context.moveTo(0, nearFrame.top);
      context.lineTo(nearFrame.left, nearFrame.top);
      context.lineTo(farFrame.left, farFrame.top);
      context.lineTo(0, farFrame.top);
      context.closePath();
      context.fill();
      this.drawSurfaceTextureInPolygon(
        context,
        leftCeilingExt,
        nearFrame.right * 11 + nearFrame.top * 13 + farFrame.left * 17 + depth * 31 + 41,
        depth,
        'ceiling'
      );
      context.fillStyle = ceilingGradient;
      context.beginPath();
      context.moveTo(nearFrame.right, nearFrame.top);
      context.lineTo(width, nearFrame.top);
      context.lineTo(width, farFrame.top);
      context.lineTo(farFrame.right, farFrame.top);
      context.closePath();
      context.fill();
      this.drawSurfaceTextureInPolygon(
        context,
        rightCeilingExt,
        nearFrame.left * 11 + nearFrame.top * 13 + farFrame.right * 17 + depth * 31 + 47,
        depth,
        'ceiling'
      );
    }

    if (isDebug && debugPass < 2) return;

    const endFrame = frameAtDepth(visibleFirstPersonView.steps.length);
    const endStep = visibleFirstPersonView.steps[visibleFirstPersonView.steps.length - 1] ?? null;
    const canExtendEndWall = visibleFirstPersonView.endBlock.type === 'wall' && endStep !== null;
    const leftEndHasVisibleBackSurface =
      canExtendEndWall &&
      endStep.leftOpeningBackBlock !== null &&
      endStep.leftOpeningBackBlock.type !== 'none' &&
      endStep.leftOpeningBackBlock.type !== 'void' &&
      this.canSeeOpeningBackWallAtDepth(
        visibleFirstPersonView.steps,
        visibleFirstPersonView.steps.length - 1,
        'left'
      );
    const rightEndHasVisibleBackSurface =
      canExtendEndWall &&
      endStep.rightOpeningBackBlock !== null &&
      endStep.rightOpeningBackBlock.type !== 'none' &&
      endStep.rightOpeningBackBlock.type !== 'void' &&
      this.canSeeOpeningBackWallAtDepth(
        visibleFirstPersonView.steps,
        visibleFirstPersonView.steps.length - 1,
        'right'
      );
    const endWallExtension = canExtendEndWall
      ? Math.max(2, (endFrame.right - endFrame.left) * 0.18)
      : 0;
    const extendedEndLeft =
      leftEndHasVisibleBackSurface
        ? 0
        : canExtendEndWall
        ? Math.max(0, endFrame.left - endWallExtension)
        : endFrame.left;
    const extendedEndRight =
      rightEndHasVisibleBackSurface
        ? width
        : canExtendEndWall
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

    if (isDebug && debugPass < 3) return;

    // Render per-depth from far to near so nearer rows naturally occlude farther rows.
    const showMonsters = this.showMonsters();
    const monsterImages = this.monsterImagesBySquare();
    const monsterImpactEffects = this.monsterImpactEffects();
    const detectedTraps = this.floorTrapPlacements();
    const trapSquaresByType = new Map<string, Set<string>>();
    for (const fp of detectedTraps) {
      if (fp.isDisarmed) continue;
      if (!(fp.isDetected || fp.isTriggered)) continue;
      const trapType = (fp.trap.trapType ?? fp.trap.name ?? 'Pit').toLowerCase();
      const squareKey = this.getSquareKey(fp.row, fp.column);
      const set = trapSquaresByType.get(trapType) ?? new Set<string>();
      set.add(squareKey);
      trapSquaresByType.set(trapType, set);
    }

    for (const segment of farToNearSegments) {
      const { depth, step, nearFrame, farFrame } = segment;

      if (!isDebug || debugPass >= 3) {
        const leftOpeningBackBlock = step.leftOpeningBackBlock;
        const rightOpeningBackBlock = step.rightOpeningBackBlock;
        const canSeeLeftOpeningBackWall = this.canSeeOpeningBackWallAtDepth(
          visibleFirstPersonView.steps,
          depth,
          'left'
        );
        const canSeeRightOpeningBackWall = this.canSeeOpeningBackWallAtDepth(
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
            true
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
            true
          );
        }
      }

      if (!isDebug || debugPass >= 4) {
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

      if (isDebug && debugPass < 5) continue;

      const squareKey = this.getSquareKey(step.row, step.column);
      const tresherCount = tresherCountBySquare.get(squareKey) ?? 0;
      const bagImage = bagImagesBySquare.get(squareKey) ?? null;

      const magicPortalMode = magicPortalGlowBySquare.get(squareKey);
      if (magicPortalMode) {
        this.drawFirstPersonMagicPortalGlow(
          context,
          nearFrame,
          farFrame,
          this.portalPulseTick(),
          depth,
          magicPortalMode
        );
      }

      const typeMatches = (needle: string) => [...trapSquaresByType.entries()].some(([type, keys]) => type.includes(needle) && keys.has(squareKey));
      if (typeMatches('pit') && !typeMatches('spiked pit')) {
        this.drawFirstPersonPitTrap(context, nearFrame, farFrame);
      }
      if (typeMatches('spiked pit')) {
        this.drawFirstPersonSpikedPitTrap(context, nearFrame, farFrame);
      }
      if (typeMatches('floor glue')) {
        this.drawFirstPersonFloorGlueTrap(context, nearFrame, farFrame);
      }
      if (typeMatches('drop net')) {
        this.drawFirstPersonDropNetTrap(context, nearFrame, farFrame);
      }
      if (typeMatches('dart')) {
        this.drawFirstPersonDartTrap(context, nearFrame, farFrame);
      }
      if (typeMatches('gas cloud')) {
        this.drawFirstPersonGasCloudTrap(context, nearFrame, farFrame);
      }
      if (typeMatches('wall spikes')) {
        this.drawFirstPersonWallSpikesTrap(context, nearFrame, farFrame);
      }

      if (bagSquareKeys.has(squareKey) && !obstacleItemSquareKeys.has(squareKey)) {
        this.drawFirstPersonFloorBag(context, nearFrame, farFrame, bagImage);
      } else if (tresherCount > 0) {
        this.drawFirstPersonFloorCoinStack(context, nearFrame, farFrame, tresherCount);
      }

      if (step.hasKey) {
        this.drawFirstPersonFloorKey(context, nearFrame, farFrame);
      }

      if (step.exitTransitionType) {
        this.drawFirstPersonFloorExit(context, nearFrame, farFrame, step.exitTransitionType, squareKey);
      }

      // Portals can be visible in side slots even when not in the center square.
      if (step.visibleMonsterSlots.length > 0) {
        const portalLateralRange = Math.max(
          1,
          ...step.visibleMonsterSlots.map((s) => Math.abs(s.lateralOffset))
        );
        for (const slot of step.visibleMonsterSlots) {
          if (slot.lateralOffset === 0) continue;
          const sidePortalMode = magicPortalGlowBySquare.get(slot.squareKey);
          if (!sidePortalMode) continue;
          this.drawFirstPersonMagicPortalGlow(
            context,
            nearFrame,
            farFrame,
            this.portalPulseTick(),
            depth,
            sidePortalMode,
            slot.lateralOffset,
            portalLateralRange
          );
        }
      }

      if (isDebug && debugPass < 6) continue;

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
              depth
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
              depth
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

      if (isDebug && debugPass < 7) continue;

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

    if (this.showSquareOutlines()) {
      context.save();
      context.strokeStyle = 'rgba(80, 200, 255, 0.6)';
      context.lineWidth = 1;
      context.setLineDash([3, 3]);

      for (const segment of farToNearSegments) {
        const { step, nearFrame, farFrame } = segment;

        // Center (forward) tile floor
        context.beginPath();
        context.moveTo(nearFrame.left, nearFrame.bottom);
        context.lineTo(nearFrame.right, nearFrame.bottom);
        context.lineTo(farFrame.right, farFrame.bottom);
        context.lineTo(farFrame.left, farFrame.bottom);
        context.closePath();
        context.stroke();

        // Left side tile floor (only when open — not wall/door)
        if (step.leftBlock.type === 'none') {
          context.beginPath();
          context.moveTo(0, nearFrame.bottom);
          context.lineTo(nearFrame.left, nearFrame.bottom);
          context.lineTo(farFrame.left, farFrame.bottom);
          context.lineTo(0, farFrame.bottom);
          context.closePath();
          context.stroke();
        }

        // Right side tile floor (only when open)
        if (step.rightBlock.type === 'none') {
          context.beginPath();
          context.moveTo(nearFrame.right, nearFrame.bottom);
          context.lineTo(width, nearFrame.bottom);
          context.lineTo(width, farFrame.bottom);
          context.lineTo(farFrame.right, farFrame.bottom);
          context.closePath();
          context.stroke();
        }
      }

      context.restore();
    }

    // Debug overlay: when stepping through passes, show slot info per depth
    if (isDebug) {
      context.save();

      // Top bar: obstacle map keys
      const obsMapKeys = [...obstacleImageBySquare.keys()];
      context.fillStyle = 'rgba(0,0,0,0.85)';
      context.fillRect(0, 0, width, 15);
      context.font = 'bold 10px monospace';
      context.fillStyle = obsMapKeys.length === 0 ? '#f55' : '#ff0';
      context.fillText(`MAP(${obsMapKeys.length}):${obsMapKeys.length === 0 ? ' EMPTY' : ' ' + obsMapKeys.join(' ')}`, 2, 11);

      context.font = 'bold 9px monospace';
      for (const segment of depthSegments) {
        const { depth, step, nearFrame } = segment;
        const cx = (nearFrame.left + nearFrame.right) / 2;
        const cy = (nearFrame.top + nearFrame.bottom) / 2;
        const slots = step.visibleMonsterSlots;
        const sides = slots.filter(s => s.lateralOffset !== 0);
        const centerKey = this.getSquareKey(step.row, step.column);
        const centerMatch = obstacleImageBySquare.has(centerKey);
        const matchingSlots = slots.filter(s => obstacleImageBySquare.has(s.squareKey));
        const hasMatch = matchingSlots.length > 0;
        const lines = [
          `d${depth}[${step.row},${step.column}] L:${step.leftBlock.type[0]} R:${step.rightBlock.type[0]}`,
          `ctr=${centerKey}${centerMatch ? 'OK' : 'NO'} obs:${matchingSlots.length}/${slots.length}`,
          ...sides.map(s => `${s.lateralOffset > 0 ? 'R' : 'L'}${Math.abs(s.lateralOffset)}=${s.squareKey}${obstacleImageBySquare.has(s.squareKey) ? 'OK' : 'NO'}`),
        ];
        context.fillStyle = hasMatch ? 'rgba(0,100,0,0.85)' : 'rgba(0,0,0,0.75)';
        context.fillRect(cx - 54, cy - lines.length * 6, 108, lines.length * 11 + 4);
        context.fillStyle = hasMatch ? '#0f0' : (centerMatch ? '#fa0' : '#0ff');
        lines.forEach((line, i) => {
          context.fillText(line, cx - 52, cy - lines.length * 6 + i * 11 + 9);
        });
      }
      context.restore();
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
    // Start from index 1 (player's own side at index 0 does not gate forward-lateral sight —
    // you can look through a side opening at depth D without needing an opening at depth 0).
    for (let index = 1; index <= depth; index += 1) {
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

  private canSeeOpeningBackWallAtDepth(
    steps: FirstPersonStep[],
    depth: number,
    side: 'left' | 'right'
  ): boolean {
    if (this.hasClearSideSightToDepth(steps, depth, side)) {
      return true;
    }

    if (depth <= 0) {
      return false;
    }

    const previousStep = steps[depth - 1];
    const currentStep = steps[depth];
    if (!previousStep || !currentStep) {
      return false;
    }

    const previousBlock = side === 'left' ? previousStep.leftBlock : previousStep.rightBlock;
    const currentBlock = side === 'left' ? currentStep.leftBlock : currentStep.rightBlock;

    // Intersection/corner peek rule: if a side changes from blocked to open at this depth,
    // allow rendering the opening back wall even though earlier depths were blocked.
    return !this.isSideSightTransparent(previousBlock) && this.isSideSightTransparent(currentBlock);
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
      for (let distance = 1; distance <= Math.max(1, depth); distance += 1) {
        const nextRow = currentRow + offset.rowOffset;
        const nextColumn = currentColumn + offset.columnOffset;

        // Use one-sided check (only FROM square's wall) — consistent with how
        // leftBlock/rightBlock are computed via getLateralBlockType. The destination
        // square's own facing wall should not block sight to an obstacle inside it.
        const outboundBlock = this.getLateralBlockType(
          currentRow, currentColumn, offset.rowOffset, offset.columnOffset
        );
        if (!this.isSideSightTransparent(outboundBlock)) {
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
      this.drawBrickPatternInPolygon(context, points, textureSeed + 131, wallDepth, true);
    } else if (block.type === 'closedDoor' || block.type === 'openDoor') {
      const textureSeed = nearFrame.top * 13 + nearFrame.left * 7 + (side === 'left' ? 23 : 31);
      this.drawWoodGrainInPolygon(context, points, textureSeed, wallDepth);
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
    const seamOverlap = 2.2;
    const portalNearX =
      side === 'left' ? nearFrame.left - seamOverlap : nearFrame.right + seamOverlap;
    const canvasWidth = nearFrame.left + nearFrame.right;
    const panelInnerX =
      side === 'left' ? farFrame.left : farFrame.right;
    const panelOuterX =
      side === 'left' ? 0 : canvasWidth;
    const panelLeft = Math.min(panelInnerX, panelOuterX);
    const panelRight = Math.max(panelInnerX, panelOuterX);
    const wallTop = farFrame.top;
    const wallBottom = farFrame.bottom;

    const backWallPoints = [
      { x: panelLeft, y: wallTop },
      { x: panelRight, y: wallTop },
      { x: panelRight, y: wallBottom },
      { x: panelLeft, y: wallBottom },
    ];

    const connectorPoints = [
      { x: portalNearX, y: wallTop },
      { x: panelInnerX, y: wallTop },
      { x: panelInnerX, y: wallBottom },
      { x: portalNearX, y: wallBottom },
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

    context.strokeStyle = '#d7b07a';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, midTop + 2);
    context.lineTo(x, midBottom - 2);
    context.stroke();

    if (doorType === 'openDoor') {
      const swing = side === 'left' ? 6 : -6;
      context.strokeStyle = '#f0c88f';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x, midTop + 4);
      context.lineTo(x + swing, midTop + 9);
      context.stroke();
    }
  }

  private drawWoodGrainInPolygon(
    context: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    seed: number,
    depth: number
  ): void {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) return;

    context.save();
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      context.lineTo(points[i].x, points[i].y);
    }
    context.closePath();
    context.clip();

    const normalizedDepth = Math.max(0, depth);
    const lineCount = Math.max(6, Math.floor(height / 9));
    const grainAlpha = Math.max(0.16, 0.30 - normalizedDepth * 0.015);
    context.lineWidth = 1;
    for (let i = 0; i < lineCount; i += 1) {
      const y = top + (i / lineCount) * height;
      const wobble = (this.getSeededNoise(seed, i * 3 + 1) - 0.5) * 2.2;
      const tone = 68 + Math.floor(this.getSeededNoise(seed, i * 3 + 2) * 36);
      context.strokeStyle = `rgba(${tone + 15}, ${tone}, ${Math.max(20, tone - 25)}, ${grainAlpha})`;
      context.beginPath();
      context.moveTo(left - 1, y + wobble);
      context.lineTo(right + 1, y - wobble * 0.4);
      context.stroke();
    }

    const knotCount = Math.max(1, Math.floor((width * height) / 14000));
    for (let i = 0; i < knotCount; i += 1) {
      const cx = left + this.getSeededNoise(seed + 101, i * 4 + 1) * width;
      const cy = top + this.getSeededNoise(seed + 101, i * 4 + 2) * height;
      const rx = 2 + this.getSeededNoise(seed + 101, i * 4 + 3) * 4;
      const ry = rx * (0.6 + this.getSeededNoise(seed + 101, i * 4 + 4) * 0.5);
      context.strokeStyle = `rgba(64, 42, 24, ${grainAlpha})`;
      context.beginPath();
      context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      context.stroke();
    }

    context.restore();
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

  private drawFirstPersonSpikedPitTrap(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number }
  ): void {
    this.drawFirstPersonPitTrap(context, nearFrame, farFrame);
    const midLeft = (nearFrame.left + farFrame.left) / 2;
    const midRight = (nearFrame.right + farFrame.right) / 2;
    const midFloor = (nearFrame.bottom + farFrame.bottom) / 2;
    const cx = (midLeft + midRight) / 2;
    const cy = midFloor - 1;
    context.save();
    context.strokeStyle = '#c0392b';
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(cx - 6, cy + 1);
    context.lineTo(cx - 3, cy - 3);
    context.lineTo(cx, cy + 1);
    context.lineTo(cx + 3, cy - 3);
    context.lineTo(cx + 6, cy + 1);
    context.stroke();
    context.restore();
  }

  private drawFirstPersonFloorGlueTrap(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number }
  ): void {
    const midLeft = (nearFrame.left + farFrame.left) / 2;
    const midRight = (nearFrame.right + farFrame.right) / 2;
    const midFloor = (nearFrame.bottom + farFrame.bottom) / 2;
    context.save();
    context.fillStyle = 'rgba(70, 180, 70, 0.75)';
    context.beginPath();
    context.ellipse((midLeft + midRight) / 2, midFloor - 1, (midRight - midLeft) * 0.24, 4, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  private drawFirstPersonDropNetTrap(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number }
  ): void {
    const midLeft = (nearFrame.left + farFrame.left) / 2;
    const midRight = (nearFrame.right + farFrame.right) / 2;
    const midTop = (nearFrame.top + farFrame.top) / 2;
    const midBottom = (nearFrame.bottom + farFrame.bottom) / 2;
    context.save();
    context.strokeStyle = '#c9b58a';
    context.lineWidth = 1;
    context.strokeRect(midLeft + 6, midTop + 2, (midRight - midLeft) - 12, (midBottom - midTop) - 4);
    context.strokeRect(midLeft + 8, midTop + 4, (midRight - midLeft) - 16, (midBottom - midTop) - 8);
    context.restore();
  }

  private drawFirstPersonDartTrap(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number }
  ): void {
    const midLeft = (nearFrame.left + farFrame.left) / 2;
    const midRight = (nearFrame.right + farFrame.right) / 2;
    const midBottom = (nearFrame.bottom + farFrame.bottom) / 2;
    const centerX = (midLeft + midRight) / 2;
    context.save();
    context.strokeStyle = '#d35400';
    context.lineWidth = 1.1;
    context.beginPath();
    context.moveTo(centerX - 3, midBottom - 2);
    context.lineTo(centerX, midBottom - 8);
    context.lineTo(centerX + 3, midBottom - 2);
    context.stroke();
    context.restore();
  }

  private drawFirstPersonGasCloudTrap(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number }
  ): void {
    const midLeft = (nearFrame.left + farFrame.left) / 2;
    const midRight = (nearFrame.right + farFrame.right) / 2;
    const midTop = (nearFrame.top + farFrame.top) / 2;
    const midBottom = (nearFrame.bottom + farFrame.bottom) / 2;
    const cx = (midLeft + midRight) / 2;
    const cy = (midTop + midBottom) / 2 - 1;
    context.save();
    context.fillStyle = 'rgba(108, 75, 217, 0.35)';
    context.beginPath();
    context.arc(cx - 3, cy, 4, 0, Math.PI * 2);
    context.arc(cx + 3, cy - 1, 5, 0, Math.PI * 2);
    context.arc(cx + 1, cy + 2, 4, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  private drawFirstPersonWallSpikesTrap(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number }
  ): void {
    const midLeft = (nearFrame.left + farFrame.left) / 2;
    const midRight = (nearFrame.right + farFrame.right) / 2;
    const midTop = (nearFrame.top + farFrame.top) / 2;
    context.save();
    context.strokeStyle = '#6c3483';
    context.lineWidth = 1;
    const x = (midLeft + midRight) / 2;
    context.beginPath();
    context.moveTo(x - 5, midTop + 4);
    context.lineTo(x - 2, midTop + 1);
    context.lineTo(x + 1, midTop + 4);
    context.lineTo(x + 4, midTop + 1);
    context.lineTo(x + 7, midTop + 4);
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
    const sideInset = lateralOffset === 0 ? 0.12 : 0.02;
    const minCenterX = midLeft + tileWidth * sideInset;
    const maxCenterX = midRight - tileWidth * sideInset;
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
      if (obs?.requiredKeyId !== null && obs?.requiredKeyId !== undefined) {
        this.drawObstacleKeyhole(context, sx, sy, slabW, sh, depth);
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
      if (obs?.requiredKeyId !== null && obs?.requiredKeyId !== undefined) {
        this.drawObstacleKeyhole(context, edgeX - drawWidth / 2, drawY, drawWidth, drawHeight, depth);
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
      if (obs?.requiredKeyId !== null && obs?.requiredKeyId !== undefined) {
        this.drawObstacleKeyhole(context, x, y, w, h, depth);
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

    if (this.isYeOldMagiceShop(obs)) {
      this.drawFirstPersonShopObstacle(
        context,
        nearFrame,
        farFrame,
        lateralOffset,
        lateralRange,
        fogAlpha,
        obs
      );
      return;
    }

    // ── Square shape: wall-like block face ─────────────────────────────────────
    if (shape === 'square') {
      const isCenter = lateralOffset === 0;
      const frameW = nearFrame.right - nearFrame.left;
      const frameH = nearFrame.bottom - nearFrame.top;
      const sh = Math.max(4, frameH * heightPct);
      const sy = heightAnchor === 'ceiling' ? nearFrame.top : nearFrame.bottom - sh;
      const projectXToFar = (x: number): number => {
        const nearSpan = Math.max(1, nearFrame.right - nearFrame.left);
        const t = (x - nearFrame.left) / nearSpan;
        return farFrame.left + t * (farFrame.right - farFrame.left);
      };
      const projectYToFar = (y: number): number => {
        const nearSpan = Math.max(1, nearFrame.bottom - nearFrame.top);
        const t = (y - nearFrame.top) / nearSpan;
        return farFrame.top + t * (farFrame.bottom - farFrame.top);
      };

      let sx = 0;
      let sw = 0;
      if (isCenter) {
        sw = Math.max(4, frameW * widthPct);
        sx = nearFrame.left + (frameW - sw) / 2;
      } else if (lateralOffset < 0) {
        // Left side tile: anchor to center's left edge so it meets center cleanly.
        const sideW = Math.max(0, nearFrame.left);
        sw = Math.max(4, sideW * widthPct);
        sx = nearFrame.left - sw;
      } else {
        // Right side tile: anchor to center's right edge so it meets center cleanly.
        const sideW = Math.max(0, this.canvasWidth - nearFrame.right);
        sw = Math.max(4, sideW * widthPct);
        sx = nearFrame.right;
      }

      if (widthPct >= 1) {
        const fx1 = sx;
        const fx2 = sx + sw;
        const fy1 = sy;
        const fy2 = sy + sh;
        const bx1 = projectXToFar(fx1);
        const bx2 = projectXToFar(fx2);
        const by1 = projectYToFar(fy1);
        const by2 = projectYToFar(fy2);

        const topFill = color ?? 'rgba(205,205,205,0.95)';
        const sideFill = color ?? 'rgba(145,145,145,0.95)';

        // Top face
        context.beginPath();
        context.moveTo(fx1, fy1);
        context.lineTo(fx2, fy1);
        context.lineTo(bx2, by1);
        context.lineTo(bx1, by1);
        context.closePath();
        context.fillStyle = topFill;
        context.fill();

        // Side face: lateral cubes should show their inner face toward the center corridor.
        const drawRightSide = lateralOffset < 0 || (lateralOffset === 0 && widthAnchor !== 'west');
        context.beginPath();
        if (drawRightSide) {
          context.moveTo(fx2, fy1);
          context.lineTo(fx2, fy2);
          context.lineTo(bx2, by2);
          context.lineTo(bx2, by1);
        } else {
          context.moveTo(fx1, fy1);
          context.lineTo(fx1, fy2);
          context.lineTo(bx1, by2);
          context.lineTo(bx1, by1);
        }
        context.closePath();
        context.fillStyle = sideFill;
        context.fill();
      }

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

      if (fogAlpha > 0) {
        context.fillStyle = `rgba(0, 0, 0, ${fogAlpha})`;
        context.fillRect(sx, sy, sw, sh);
      }
      if (obs?.requiredKeyId !== null && obs?.requiredKeyId !== undefined) {
        this.drawObstacleKeyhole(context, sx, sy, sw, sh, depth);
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
      this.drawPillarDepthOverlay(context, drawX, drawY, drawWidth, drawHeight, 0.58);
      if (fogAlpha > 0) {
        context.fillStyle = `rgba(0, 0, 0, ${fogAlpha})`;
        context.fillRect(drawX, drawY, drawWidth, drawHeight);
      }
      if (obs?.requiredKeyId !== null && obs?.requiredKeyId !== undefined) {
        this.drawObstacleKeyhole(context, drawX, drawY, drawWidth, drawHeight, depth);
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
    this.drawPillarDepthOverlay(context, x, y, w, h, 0.66);
    if (fogAlpha > 0) {
      context.fillStyle = `rgba(0, 0, 0, ${fogAlpha})`;
      context.fillRect(x, y, w, h);
    }
    if (obs?.requiredKeyId !== null && obs?.requiredKeyId !== undefined) {
      this.drawObstacleKeyhole(context, x, y, w, h, depth);
    }
  }

  private drawObstacleKeyhole(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number,
  ): void {
    if (width <= 4 || height <= 6) {
      return;
    }

    const fogFactor = Math.max(0.38, 1 - Math.min(0.55, depth * 0.12));
    const centerX = x + width / 2;
    const centerY = y + height * 0.45;
    const headRadius = Math.max(2, Math.min(width, height) * 0.09);
    const shaftWidth = Math.max(1.6, headRadius * 0.82);
    const shaftHeight = Math.max(2.4, headRadius * 1.8);

    context.save();

    context.fillStyle = `rgba(255, 255, 255, ${0.8 * fogFactor})`;
    context.beginPath();
    context.arc(centerX, centerY, headRadius, 0, Math.PI * 2);
    context.fill();
    context.fillRect(centerX - shaftWidth / 2, centerY + headRadius * 0.25, shaftWidth, shaftHeight);

    context.fillStyle = `rgba(20, 20, 20, ${0.92 * fogFactor})`;
    context.beginPath();
    context.arc(centerX, centerY, headRadius * 0.58, 0, Math.PI * 2);
    context.fill();
    context.fillRect(centerX - shaftWidth * 0.26, centerY + headRadius * 0.38, shaftWidth * 0.52, shaftHeight * 0.82);

    context.restore();
  }

  private isYeOldMagiceShop(obs: ObstaclePlacement | undefined): boolean {
    return (obs?.name ?? '').trim().toLowerCase() === 'ye old magice shop';
  }

  private drawFirstPersonShopObstacle(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    lateralOffset: number,
    lateralRange: number,
    fogAlpha: number,
    obs?: ObstaclePlacement
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
    const minCenterX = midLeft + tileWidth * 0.08;
    const maxCenterX = midRight - tileWidth * 0.08;
    const centerX = Math.max(minCenterX, Math.min(maxCenterX, centeredX));
    const lateralScale = 1 - Math.min(0.28, Math.abs(normalizedOffset) * 0.2);

    const maxWidth = Math.max(20, tileWidth * 0.84 * lateralScale);
    const maxHeight = Math.max(20, tileHeight * 0.9 * lateralScale);

    const frontFacing = this.getShopFrontFacingDirection(obs);
    const showFront = this.isPlayerViewingShopFront(obs, frontFacing);
    const sideVariant = this.getShopSideVariantForView(obs, lateralOffset, frontFacing);
    const image = this.getShopObstacleImage(showFront ? 'front' : sideVariant);

    let drawWidth = maxWidth;
    let drawHeight = maxHeight;
    if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
      const ar = image.naturalWidth / image.naturalHeight;
      drawWidth = drawHeight * ar;
      if (drawWidth > maxWidth) { drawWidth = maxWidth; drawHeight = drawWidth / ar; }
    }

    const drawX = centerX - drawWidth / 2;
    const drawY = midBottom - drawHeight;

    if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    } else {
      context.fillStyle = '#6f4b2e';
      context.fillRect(drawX, drawY, drawWidth, drawHeight);
      context.strokeStyle = '#2b1b10';
      context.lineWidth = 1.5;
      context.strokeRect(drawX, drawY, drawWidth, drawHeight);
      context.fillStyle = '#f6e3b0';
      context.font = `bold ${Math.max(8, Math.floor(drawHeight * 0.12))}px serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('SHOP', drawX + drawWidth / 2, drawY + drawHeight * 0.52);
    }

    if (fogAlpha > 0) {
      context.fillStyle = `rgba(0, 0, 0, ${fogAlpha})`;
      context.fillRect(drawX, drawY, drawWidth, drawHeight);
    }
  }

  private getShopFrontFacingDirection(obs: ObstaclePlacement | undefined): FacingDirection | null {
    if (!obs) return null;
    const square = this.squares()[this.getSquareKey(obs.row, obs.column)];
    if (!square) return null;

    const candidates: FacingDirection[] = [];
    // Shop front points away from the wall it is anchored to.
    if (this.isWallConnection(square.toRight)) candidates.push('left');
    if (this.isWallConnection(square.toLeft)) candidates.push('right');
    if (this.isWallConnection(square.toTop)) candidates.push('down');
    if (this.isWallConnection(square.toBottom)) candidates.push('up');
    return candidates[0] ?? null;
  }

  private isPlayerViewingShopFront(
    obs: ObstaclePlacement | undefined,
    frontFacing: FacingDirection | null
  ): boolean {
    if (!obs || !frontFacing) return false;

    const preview = this.preview();
    const cheater = this.cheater();
    const dRow = preview.centerRow - obs.row;
    const dCol = preview.centerColumn - obs.column;

    let shopToPlayer: FacingDirection | null = null;
    if (dRow === 0 && dCol !== 0) shopToPlayer = dCol > 0 ? 'right' : 'left';
    else if (dCol === 0 && dRow !== 0) shopToPlayer = dRow > 0 ? 'down' : 'up';
    if (!shopToPlayer) return false;

    return (
      shopToPlayer === frontFacing &&
      cheater.facingDir === this.getOppositeFacingDirection(frontFacing)
    );
  }

  private getShopSideVariantForView(
    obs: ObstaclePlacement | undefined,
    lateralOffset: number,
    frontFacing: FacingDirection | null
  ): 'left' | 'right' {
    if (lateralOffset < 0) return 'right';
    if (lateralOffset > 0) return 'left';

    if (!obs || !frontFacing) return 'left';
    const preview = this.preview();
    const dRow = preview.centerRow - obs.row;
    const dCol = preview.centerColumn - obs.column;
    if (dRow === 0 && dCol === 0) return 'left';

    const sideByFront: Record<FacingDirection, { left: FacingDirection; right: FacingDirection }> = {
      up: { left: 'left', right: 'right' },
      right: { left: 'up', right: 'down' },
      down: { left: 'right', right: 'left' },
      left: { left: 'down', right: 'up' },
    };
    const sideMap = sideByFront[frontFacing];

    let playerDir: FacingDirection;
    if (Math.abs(dCol) >= Math.abs(dRow)) {
      playerDir = dCol >= 0 ? 'right' : 'left';
    } else {
      playerDir = dRow >= 0 ? 'down' : 'up';
    }

    return playerDir === sideMap.left ? 'left' : 'right';
  }

  private getOppositeFacingDirection(direction: FacingDirection): FacingDirection {
    if (direction === 'up') return 'down';
    if (direction === 'down') return 'up';
    if (direction === 'left') return 'right';
    return 'left';
  }

  private getShopObstacleImage(variant: 'front' | 'left' | 'right'): HTMLImageElement | null {
    const candidatePaths: Record<'front' | 'left' | 'right', string[]> = {
      front: ['/images/front of shop.png', '/images/front%20of%20shop.png'],
      left: ['/images/Left of shop.png', '/images/left of shop.png', '/images/Left%20of%20shop.png'],
      right: ['/images/Righ of shop.png', '/images/Right of shop.png', '/images/Righ%20of%20shop.png'],
    };

    for (const path of candidatePaths[variant]) {
      let image = this.shopImageCache.get(path) ?? null;
      if (!image) {
        image = new Image();
        image.src = path;
        image.onload = () => this.drawCanvas();
        this.shopImageCache.set(path, image);
      }
      if (image.complete && image.naturalWidth > 0) {
        return image;
      }
    }

    return null;
  }

  private drawPillarDepthOverlay(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    intensity: number
  ): void {
    if (w <= 0 || h <= 0) return;

    const capH = Math.max(2, Math.min(h * 0.18, w * 0.24));
    const topCx = x + w / 2;
    const topCy = y + capH * 0.9;
    const botCx = x + w / 2;
    const botCy = y + h - capH * 0.7;
    const rx = w * 0.5;
    const ry = capH * 0.6;

    context.save();

    // Side shading: darker edges, slight center highlight.
    const sideGrad = context.createLinearGradient(x, 0, x + w, 0);
    sideGrad.addColorStop(0, `rgba(0,0,0,${0.28 * intensity})`);
    sideGrad.addColorStop(0.2, `rgba(0,0,0,${0.14 * intensity})`);
    sideGrad.addColorStop(0.5, `rgba(255,255,255,${0.12 * intensity})`);
    sideGrad.addColorStop(0.8, `rgba(0,0,0,${0.16 * intensity})`);
    sideGrad.addColorStop(1, `rgba(0,0,0,${0.3 * intensity})`);
    context.fillStyle = sideGrad;
    context.fillRect(x, y, w, h);

    // Top rounded cap highlight.
    const topGrad = context.createRadialGradient(
      topCx,
      topCy - ry * 0.3,
      Math.max(1, rx * 0.1),
      topCx,
      topCy,
      Math.max(2, rx)
    );
    topGrad.addColorStop(0, `rgba(255,255,255,${0.34 * intensity})`);
    topGrad.addColorStop(0.7, `rgba(255,255,255,${0.1 * intensity})`);
    topGrad.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = topGrad;
    context.beginPath();
    context.ellipse(topCx, topCy, rx, ry, 0, Math.PI, Math.PI * 2);
    context.fill();

    // Bottom rounded cap shadow.
    const botGrad = context.createRadialGradient(
      botCx,
      botCy,
      Math.max(1, rx * 0.1),
      botCx,
      botCy,
      Math.max(2, rx)
    );
    botGrad.addColorStop(0, `rgba(0,0,0,${0.26 * intensity})`);
    botGrad.addColorStop(0.75, `rgba(0,0,0,${0.08 * intensity})`);
    botGrad.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = botGrad;
    context.beginPath();
    context.ellipse(botCx, botCy, rx, ry, 0, 0, Math.PI);
    context.fill();

    // Crisp edge cue for cylindrical silhouette.
    context.strokeStyle = `rgba(255,255,255,${0.14 * intensity})`;
    context.lineWidth = 1;
    context.beginPath();
    context.ellipse(topCx, topCy, rx * 0.9, ry * 0.78, 0, Math.PI, Math.PI * 2);
    context.stroke();

    context.restore();
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
    const minVisibleX = midLeft + tileWidth * 0.08;
    const maxVisibleX = midRight - tileWidth * 0.08;
    if (centeredX < minVisibleX || centeredX > maxVisibleX) {
      return;
    }
    const centerX = Math.max(minVisibleX, Math.min(maxVisibleX, centeredX));

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

  private drawFirstPersonMagicPortalGlow(
    context: CanvasRenderingContext2D,
    nearFrame: { left: number; right: number; top: number; bottom: number },
    farFrame: { left: number; right: number; top: number; bottom: number },
    pulseTick: number,
    depth: number,
    mode: 'oneWay' | 'twoWay',
    lateralOffset: number = 0,
    lateralRange: number = 1
  ): void {
    const midLeft = (nearFrame.left + farFrame.left) / 2;
    const midRight = (nearFrame.right + farFrame.right) / 2;
    const tileWidth = Math.max(6, midRight - midLeft);
    const normalizedOffset =
      lateralRange <= 0 ? 0 : lateralOffset / Math.max(1, lateralRange);
    const centeredX = (midLeft + midRight) / 2 + normalizedOffset * tileWidth * 0.75;
    // For side portals allow the glow center to cross into the adjacent tile area.
    const isSidePortal = lateralOffset !== 0;
    const minCenterX = isSidePortal ? midLeft - tileWidth * 0.4 : midLeft + tileWidth * 0.08;
    const maxCenterX = isSidePortal ? midRight + tileWidth * 0.4 : midRight - tileWidth * 0.08;
    const centerX = Math.max(minCenterX, Math.min(maxCenterX, centeredX));
    const lateralScale = 1 - Math.min(0.3, Math.abs(normalizedOffset) * 0.25);
    const midTop = (nearFrame.top + farFrame.top) / 2;
    const midBottom = (nearFrame.bottom + farFrame.bottom) / 2;
    const topY = midTop + (midBottom - midTop) * 0.06;
    const bottomY = midBottom - (midBottom - midTop) * 0.04;
    const centerY = (topY + bottomY) / 2;
    const columnH = Math.max(8, (bottomY - topY) * lateralScale);
    const radius = Math.max(4, tileWidth * 0.22 * lateralScale);
    const pulse = (Math.sin(pulseTick * 0.22 + depth * 0.6) + 1) / 2;
    const fogFactor = 1 - Math.min(0.62, depth * 0.11);
    const isOneWay = mode === 'oneWay';

    context.save();

    const outerA = isOneWay ? 'rgba(255, 30, 30,' : 'rgba(201, 118, 255,';
    const midA = isOneWay ? 'rgba(225, 28, 28,' : 'rgba(154, 71, 227,';
    const endA = isOneWay ? 'rgba(120, 10, 10, 0)' : 'rgba(107, 39, 160, 0)';

    // Tall vertical aura that fills most of the square height.
    const auraGrad = context.createLinearGradient(centerX, topY, centerX, bottomY);
    auraGrad.addColorStop(0, `${outerA} ${0.22 * fogFactor})`);
    auraGrad.addColorStop(0.5, `${midA} ${0.38 * fogFactor})`);
    auraGrad.addColorStop(1, `${outerA} ${0.24 * fogFactor})`);
    context.fillStyle = auraGrad;
    context.beginPath();
    context.ellipse(centerX, centerY, radius * 1.45, columnH * 0.5, 0, 0, Math.PI * 2);
    context.fill();

    const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 2.8);
    glow.addColorStop(0, `${outerA} ${0.42 * fogFactor})`);
    glow.addColorStop(0.45, `${midA} ${0.30 * fogFactor})`);
    glow.addColorStop(1, endA);
    context.fillStyle = glow;
    context.beginPath();
    context.ellipse(centerX, centerY, radius * 1.95, radius * 0.94, 0, 0, Math.PI * 2);
    context.fill();

    const core = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 0.95);
    core.addColorStop(0, isOneWay ? `rgba(255, 235, 235, ${0.82 * fogFactor})` : `rgba(248, 224, 255, ${0.8 * fogFactor})`);
    core.addColorStop(0.4, isOneWay ? `rgba(255, 84, 84, ${0.62 * fogFactor})` : `rgba(186, 110, 255, ${0.58 * fogFactor})`);
    core.addColorStop(1, isOneWay ? `rgba(148, 22, 22, ${0.24 * fogFactor})` : `rgba(126, 56, 191, ${0.2 * fogFactor})`);
    context.fillStyle = core;
    context.beginPath();
    context.ellipse(centerX, centerY, radius * 1.02, radius * 0.46, 0, 0, Math.PI * 2);
    context.fill();

    const glitterCount = 10;
    for (let i = 0; i < glitterCount; i += 1) {
      const theta = (pulseTick * 0.11 + i * 0.78);
      const orbit = radius * (0.2 + (i % 4) * 0.22 + pulse * 0.28);
      const gx = centerX + Math.cos(theta + i * 0.37) * orbit;
      const gy = centerY + Math.sin(theta * 1.17 + i * 0.19) * columnH * 0.42;
      const r = (i % 3 === 0 ? 1.7 : 1.2) * (0.75 + pulse * 0.4);
      context.fillStyle = i % 2 === 0
        ? `rgba(255, 232, 116, ${0.9 * fogFactor})`
        : `rgba(255, 200, 72, ${0.78 * fogFactor})`;
      context.beginPath();
      context.arc(gx, gy, r, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();
  }

  private syncPortalPulseTimer(portals: PortalPlacement[]): void {
    const hasMagicDoor = portals.some((portal) => portal.look === 'magicDoor');
    const hasStartPointGlow = this.startPoint() !== null;
    
    if (!hasMagicDoor && !hasStartPointGlow) {
      if (this.portalPulseTimer !== null) {
        clearInterval(this.portalPulseTimer);
        this.portalPulseTimer = null;
      }
      return;
    }

    if (this.portalPulseTimer === null) {
      this.portalPulseTimer = setInterval(() => {
        this.portalPulseTick.update((value) => (value + 1) % 100000);
      }, 85);
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
      img.src = key === 'open' ? '/images/dooropen1.png' : '/images/doorclose1.png';
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

    const img = this.doorImageCache.get(block.type === 'openDoor' ? 'open' : 'closed') ?? null;

    context.save();
    context.globalAlpha = isPortal ? 0.84 : 1;

    // Draw a dark wall ring around the door opening so doors are embedded in stone,
    // not in a colored panel.
    const wallRingColor = '#1a1a1a';
    context.fillStyle = wallRingColor;
    // Top band
    context.fillRect(frame.left, frame.top, frameWidth, Math.max(0, doorTop - frame.top));
    // Bottom band
    context.fillRect(frame.left, doorBottom, frameWidth, Math.max(0, frame.bottom - doorBottom));
    // Left band
    context.fillRect(frame.left, doorTop, Math.max(0, doorLeft - frame.left), Math.max(0, doorH));
    // Right band
    context.fillRect(doorRight, doorTop, Math.max(0, frame.right - doorRight), Math.max(0, doorH));

    // Add subtle stone texture to the ring.
    const ringSeed = Math.floor(frame.left * 11 + frame.top * 17 + frameWidth * 7 + frameHeight * 5);
    // Top
    this.drawStoneTextureInRect(
      context,
      frame.left,
      frame.top,
      frameWidth,
      Math.max(0, doorTop - frame.top),
      ringSeed + 13,
      { toneMin: 58, toneRange: 34, alphaMultiplier: 0.58 }
    );
    // Bottom
    this.drawStoneTextureInRect(
      context,
      frame.left,
      doorBottom,
      frameWidth,
      Math.max(0, frame.bottom - doorBottom),
      ringSeed + 29,
      { toneMin: 58, toneRange: 34, alphaMultiplier: 0.58 }
    );
    // Left
    this.drawStoneTextureInRect(
      context,
      frame.left,
      doorTop,
      Math.max(0, doorLeft - frame.left),
      Math.max(0, doorH),
      ringSeed + 47,
      { toneMin: 58, toneRange: 34, alphaMultiplier: 0.58 }
    );
    // Right
    this.drawStoneTextureInRect(
      context,
      doorRight,
      doorTop,
      Math.max(0, frame.right - doorRight),
      Math.max(0, doorH),
      ringSeed + 61,
      { toneMin: 58, toneRange: 34, alphaMultiplier: 0.58 }
    );

    // Light brick lines to blend with surrounding walls.
    context.strokeStyle = 'rgba(195, 205, 220, 0.14)';
    context.lineWidth = 1;
    context.strokeRect(frame.left + 0.5, frame.top + 0.5, Math.max(0, frameWidth - 1), Math.max(0, frameHeight - 1));

    if (img) {
      context.drawImage(img, doorLeft, doorTop, doorW, doorH);
    } else {
      context.fillStyle = block.type === 'openDoor' ? '#9aa7b3' : '#b33030';
      context.fillRect(doorLeft, doorTop, doorW, doorH);
      context.strokeStyle = block.type === 'openDoor' ? '#d7e1ea' : '#f0b0b0';
      context.lineWidth = Math.max(1, Math.min(2, doorW * 0.04));
      context.strokeRect(doorLeft, doorTop, doorW, doorH);
      if (block.type === 'closedDoor') {
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
    if (block === 'closedDoor') return '#4e3522';
    if (block === 'openDoor') return '#5b3f28';
    if (block === 'wall') return this.getFirstPersonFrontColor('wall');
    return '#1b1d21';
  }

  private getFirstPersonFrontColor(block: PathBlockType): string {
    if (block === 'closedDoor') return '#5a3f2c';
    if (block === 'openDoor') return '#694b33';
    if (block === 'wall') return '#d6d9df';
    return '#191b1f';
  }

  private getFirstPersonOpeningBackWallColor(block: PathBlockType, wallDepth: number): string {
    if (block === 'wall') {
      const normalizedDepth = Math.max(0, wallDepth);
      const darkenAmount = Math.min(0.86, normalizedDepth * 0.085);
      return this.darkenHexColor(this.getFirstPersonFrontColor('wall'), darkenAmount);
    }
    if (block === 'closedDoor') return '#462f1f';
    if (block === 'openDoor') return '#503825';
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
    wallDepth: number,
    sidePerspective = false
  ): void {
    if (points.length < 3) {
      return;
    }

    if (points.length === 4) {
      this.drawBrickPatternInQuad(context, points, seed, wallDepth, sidePerspective);
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

  private drawBrickPatternInQuad(
    context: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    seed: number,
    wallDepth: number,
    sidePerspective: boolean
  ): void {
    context.save();
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      context.lineTo(points[pointIndex].x, points[pointIndex].y);
    }
    context.closePath();
    context.clip();

    if (sidePerspective) {
      this.drawSideWallBricks(context, points, seed, wallDepth);
    } else {
      this.drawBilinearBricks(context, points, seed, wallDepth);
    }

    context.restore();
  }

  private drawSideWallBricks(
    context: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    seed: number,
    wallDepth: number
  ): void {
    const nearX = points[0].x;
    const farX = points[1].x;
    const nearTop = points[0].y;
    const nearBottom = points[3].y;
    const topProjectionOffset = points[1].y - points[0].y;
    const bottomProjectionOffset = points[2].y - points[3].y;

    const nearHeight = nearBottom - nearTop;
    const farHeight = points[2].y - points[1].y;
    const averageHeight = Math.max(1, (nearHeight + farHeight) * 0.5);
    const stripWidth = Math.abs(farX - nearX);
    if (stripWidth <= 0.001) {
      return;
    }

    const normalizedDepth = Math.max(0, wallDepth);
    const brickHeight = Math.max(4, Math.min(12, averageHeight * 0.18));
    const brickWidth = Math.max(8, brickHeight * 1.9);
    const rowCount = Math.max(1, Math.ceil(averageHeight / brickHeight));
    const midSwitchRow = Math.floor(rowCount / 2);
    const topHalfEndRow = Math.floor((rowCount - 1) / 2);
    const bottomHalfStartRow = Math.ceil((rowCount + 1) / 2);
    const mortarAlpha = Math.max(0.45, 0.62 - normalizedDepth * 0.018);
    const tintAlpha = Math.max(0.16, 0.34 - normalizedDepth * 0.015);

    const uToX = (u: number): number => nearX + u * (farX - nearX);
    const getProjectionOffsetForRow = (rowIndex: number): number => (
      rowIndex < midSwitchRow ? topProjectionOffset : bottomProjectionOffset
    );
    const rowY = (nearY: number, u: number, rowIndex: number): number => (
      nearY + u * getProjectionOffsetForRow(rowIndex)
    );
    const nearMidY = nearTop + nearHeight * 0.5;
    const farMidY = points[1].y + farHeight * 0.5;
    const midpointYAtU = (u: number): number => nearMidY + u * (farMidY - nearMidY);
    const clipSegmentToRowHalf = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      rowIndex: number
    ): { x0: number; y0: number; x1: number; y1: number } | null => {
      const isTopHalf = rowIndex < midSwitchRow;
      const xSpan = farX - nearX;
      const toU = (x: number): number => {
        if (Math.abs(xSpan) <= 0.000001) {
          return 0;
        }
        const raw = (x - nearX) / xSpan;
        return Math.max(0, Math.min(1, raw));
      };

      const u0 = toU(x0);
      const u1 = toU(x1);
      const delta0 = y0 - midpointYAtU(u0);
      const delta1 = y1 - midpointYAtU(u1);
      const inside0 = isTopHalf ? delta0 <= 0 : delta0 >= 0;
      const inside1 = isTopHalf ? delta1 <= 0 : delta1 >= 0;

      if (inside0 && inside1) {
        return { x0, y0, x1, y1 };
      }

      if (!inside0 && !inside1) {
        return null;
      }

      const denominator = delta0 - delta1;
      const rawT = Math.abs(denominator) <= 0.000001 ? 0.5 : delta0 / denominator;
      const t = Math.max(0, Math.min(1, rawT));
      const midX = x0 + (x1 - x0) * t;
      const midY = y0 + (y1 - y0) * t;

      return inside0
        ? { x0, y0, x1: midX, y1: midY }
        : { x0: midX, y0: midY, x1, y1 };
    };

    for (let row = 0; row < rowCount; row += 1) {
      const nearRowTop = nearTop + (row / rowCount) * nearHeight;
      const nearRowBottom = nearTop + ((row + 1) / rowCount) * nearHeight;

      const staggerBase = row % 2 === 0 ? 0 : brickWidth * 0.5;
      const staggerNoise = (this.getSeededNoise(seed, row * 5 + 1) - 0.5) * brickWidth * 0.2;
      let brickColumn = 0;

      for (let brickStart = -brickWidth + staggerBase + staggerNoise; brickStart < stripWidth; brickStart += brickWidth) {
        const visibleLeft = Math.max(0, brickStart);
        const visibleRight = Math.min(stripWidth, brickStart + brickWidth);
        if (visibleRight - visibleLeft <= 1) {
          brickColumn += 1;
          continue;
        }

        const u0 = visibleLeft / stripWidth;
        const u1 = visibleRight / stripWidth;

        const x0 = uToX(u0);
        const x1 = uToX(u1);
        const topY0 = rowY(nearRowTop, u0, row);
        const topY1 = rowY(nearRowTop, u1, row);
        const bottomY0 = rowY(nearRowBottom, u0, row);
        const bottomY1 = rowY(nearRowBottom, u1, row);

        const toneNoise = this.getSeededNoise(seed + row * 19 + brickColumn * 31, 2);
        const tone = 132 + Math.floor(toneNoise * 34);
        const alpha = tintAlpha * (0.7 + toneNoise * 0.6);
        context.fillStyle = `rgba(${tone}, ${tone}, ${tone}, ${alpha})`;

        context.beginPath();
        context.moveTo(x0, topY0);
        context.lineTo(x1, topY1);
        context.lineTo(x1, bottomY1);
        context.lineTo(x0, bottomY0);
        context.closePath();
        context.fill();

        brickColumn += 1;
      }
    }

    context.strokeStyle = `rgba(80, 88, 102, ${mortarAlpha})`;
    context.lineWidth = 1.5;
    context.beginPath();

    for (let row = 1; row < rowCount; row += 1) {
      if (row === topHalfEndRow || row === bottomHalfStartRow) {
        continue;
      }
      const nearY = nearTop + (row / rowCount) * nearHeight;
      const projectionOffset = getProjectionOffsetForRow(row);
      const clipped = clipSegmentToRowHalf(
        nearX,
        nearY,
        farX,
        nearY + projectionOffset,
        row
      );
      if (!clipped) {
        continue;
      }
      context.moveTo(clipped.x0, clipped.y0);
      context.lineTo(clipped.x1, clipped.y1);
    }

    for (let row = 0; row < rowCount; row += 1) {
      const nearRowTop = nearTop + (row / rowCount) * nearHeight;
      const nearRowBottom = nearTop + ((row + 1) / rowCount) * nearHeight;

      const staggerBase = row % 2 === 0 ? 0 : brickWidth * 0.5;
      const staggerNoise = (this.getSeededNoise(seed, row * 5 + 1) - 0.5) * brickWidth * 0.2;

      for (let brickX = staggerBase + staggerNoise; brickX < stripWidth; brickX += brickWidth) {
        const u = brickX / stripWidth;
        const x = uToX(u);
        const clipped = clipSegmentToRowHalf(
          x,
          rowY(nearRowTop, u, row),
          x,
          rowY(nearRowBottom, u, row),
          row
        );
        if (!clipped) {
          continue;
        }
        context.moveTo(clipped.x0, clipped.y0);
        context.lineTo(clipped.x1, clipped.y1);
      }
    }

    context.stroke();
  }

  private drawBilinearBricks(
    context: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    seed: number,
    wallDepth: number
  ): void {
    const normalizedDepth = Math.max(0, wallDepth);
    const leftEdgeLength = Math.hypot(points[3].x - points[0].x, points[3].y - points[0].y);
    const rightEdgeLength = Math.hypot(points[2].x - points[1].x, points[2].y - points[1].y);
    const averageHeight = Math.max(1, (leftEdgeLength + rightEdgeLength) * 0.5);

    const brickHeight = Math.max(4, Math.min(12, averageHeight * 0.18));
    const brickWidth = Math.max(8, brickHeight * 1.9);
    const mortarAlpha = Math.max(0.08, 0.2 - normalizedDepth * 0.012);
    const tintAlpha = Math.max(0.05, 0.16 - normalizedDepth * 0.01);

    const rowCount = Math.max(1, Math.ceil(averageHeight / brickHeight));
    const spanLength = Math.max(
      1,
      Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
      Math.hypot(points[2].x - points[3].x, points[2].y - points[3].y)
    );

    const interpolate = (
      topLeft: { x: number; y: number },
      topRight: { x: number; y: number },
      bottomRight: { x: number; y: number },
      bottomLeft: { x: number; y: number },
      u: number,
      v: number
    ): { x: number; y: number } => {
      const oneMinusU = 1 - u;
      const oneMinusV = 1 - v;
      return {
        x:
          topLeft.x * oneMinusU * oneMinusV +
          topRight.x * u * oneMinusV +
          bottomRight.x * u * v +
          bottomLeft.x * oneMinusU * v,
        y:
          topLeft.y * oneMinusU * oneMinusV +
          topRight.y * u * oneMinusV +
          bottomRight.y * u * v +
          bottomLeft.y * oneMinusU * v,
      };
    };

    for (let row = 0; row < rowCount; row += 1) {
      const v0 = row / rowCount;
      const v1 = (row + 1) / rowCount;
      const staggerBase = row % 2 === 0 ? 0 : brickWidth * 0.5;
      const staggerNoise = (this.getSeededNoise(seed, row * 5 + 1) - 0.5) * brickWidth * 0.2;
      let brickColumn = 0;

      for (let brickStart = -brickWidth + staggerBase + staggerNoise; brickStart < spanLength; brickStart += brickWidth) {
        const visibleLeft = Math.max(0, brickStart);
        const visibleRight = Math.min(spanLength, brickStart + brickWidth);
        if (visibleRight - visibleLeft <= 1) {
          brickColumn += 1;
          continue;
        }

        const u0 = visibleLeft / spanLength;
        const u1 = visibleRight / spanLength;
        const p0 = interpolate(points[0], points[1], points[2], points[3], u0, v0);
        const p1 = interpolate(points[0], points[1], points[2], points[3], u1, v0);
        const p2 = interpolate(points[0], points[1], points[2], points[3], u1, v1);
        const p3 = interpolate(points[0], points[1], points[2], points[3], u0, v1);

        const toneNoise = this.getSeededNoise(seed + row * 19 + brickColumn * 31, 2);
        const tone = 132 + Math.floor(toneNoise * 34);
        const alpha = tintAlpha * (0.7 + toneNoise * 0.6);
        context.fillStyle = `rgba(${tone}, ${tone}, ${tone}, ${alpha})`;
        context.beginPath();
        context.moveTo(p0.x, p0.y);
        context.lineTo(p1.x, p1.y);
        context.lineTo(p2.x, p2.y);
        context.lineTo(p3.x, p3.y);
        context.closePath();
        context.fill();

        brickColumn += 1;
      }
    }

    context.strokeStyle = `rgba(74, 80, 92, ${mortarAlpha})`;
    context.lineWidth = 1;
    context.beginPath();

    for (let row = 1; row < rowCount; row += 1) {
      const v = row / rowCount;
      const start = interpolate(points[0], points[1], points[2], points[3], 0, v);
      const end = interpolate(points[0], points[1], points[2], points[3], 1, v);
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
    }

    for (let row = 0; row < rowCount; row += 1) {
      const v0 = row / rowCount;
      const v1 = (row + 1) / rowCount;
      const staggerBase = row % 2 === 0 ? 0 : brickWidth * 0.5;
      const staggerNoise = (this.getSeededNoise(seed, row * 5 + 1) - 0.5) * brickWidth * 0.2;

      for (let brickX = staggerBase + staggerNoise; brickX < spanLength; brickX += brickWidth) {
        const u = brickX / spanLength;
        const start = interpolate(points[0], points[1], points[2], points[3], u, v0);
        const end = interpolate(points[0], points[1], points[2], points[3], u, v1);
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
      }
    }

    context.stroke();
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
