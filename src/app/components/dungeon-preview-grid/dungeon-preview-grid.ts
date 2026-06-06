import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  effect,
  input,
  output,
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
  FloorTrapPlacement,
  GridPreviewContext,
  ItemPlacement,
  MonsterPlacement,
  ObstaclePlacement,
  PortalPlacement,
  SpellPlacement,
  PotionPlacement,
  SquareSide,
  SquareText,
  StartPoint,
  TresherPlacement,
} from '../../interfaces/game';

const DEFAULT_CHEATER: Cheater = {
  name: 'Bob',
  rangeOfSight: 5,
  facingDir: 'right',
  inventory: { keys: [], treshers: [] },
};

@Component({
  selector: 'app-dungeon-preview-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './dungeon-preview-grid.html',
})
export class DungeonPreviewGridComponent {
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
  readonly portalPlacements = input<PortalPlacement[]>([]);
  readonly startPoint = input<StartPoint | null>(null);
  readonly squareTexts = input<SquareText[]>([]);
  readonly floorTrapPlacements = input<FloorTrapPlacement[]>([]);
  readonly obstaclePlacements = input<ObstaclePlacement[]>([]);
  readonly obstacleImagesBySquare = input<Map<string, HTMLImageElement | null>>(new Map());
  readonly itemPlacements = input<ItemPlacement[]>([]);
  readonly potionPlacements = input<PotionPlacement[]>([]);
  readonly spellPlacements = input<SpellPlacement[]>([]);
  /** Chebyshev range for combat targeting overlay (0 = no overlay). */
  readonly combatRange = input<number>(0);
  /** Row of the currently selected combat target (null = none). */
  readonly selectedTargetRow = input<number | null>(null);
  /** Column of the currently selected combat target (null = none). */
  readonly selectedTargetColumn = input<number | null>(null);

  /** Emitted when the player clicks a cell on the map. */
  readonly cellClicked = output<{ row: number; column: number }>();

  readonly cellSize = 18;
  readonly dimension = 10;

  get canvasWidth(): number {
    return this.cellSize * this.dimension;
  }

  get canvasHeight(): number {
    return this.cellSize * this.dimension;
  }

  constructor() {
    effect(() => {
      this.preview();
      this.cheater();
      this.squares();
      this.filledSquares();
      this.tresherPlacements();
      this.monsterPlacements();
      this.keyList();
      this.exits();
      this.portalPlacements();
      this.startPoint();
      this.squareTexts();
      this.floorTrapPlacements();
      this.obstaclePlacements();
      this.obstacleImagesBySquare();
      this.itemPlacements();
      this.potionPlacements();
      this.spellPlacements();
      this.combatRange();
      this.selectedTargetRow();
      this.selectedTargetColumn();
      untracked(() => this.drawCanvas());
    });
  }

  private drawCanvas(): void {
    const canvas = this._canvasRef?.nativeElement;
    const preview = this.preview();
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
    context.fillStyle = '#000000';
    context.fillRect(0, 0, width, height);

    const filledSquares = this.filledSquares();
    const visibleSquareKeys = this.getVisibleSquareKeysForPreview(preview);

    // Draw visible squares as white; non-visible stay black (background)
    context.fillStyle = '#ffffff';
    for (let previewRow = 0; previewRow < this.dimension; previewRow += 1) {
      for (let previewColumn = 0; previewColumn < this.dimension; previewColumn += 1) {
        const sourceRow = preview.startRow + previewRow;
        const sourceColumn = preview.startColumn + previewColumn;
        const sourceSquareKey = this.getSquareKey(sourceRow, sourceColumn);
        if (!filledSquares[sourceSquareKey] || !visibleSquareKeys.has(sourceSquareKey)) continue;
        context.fillRect(
          previewColumn * this.cellSize,
          previewRow * this.cellSize,
          this.cellSize,
          this.cellSize
        );
      }
    }

    context.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    context.lineWidth = 1;
    context.beginPath();
    for (let column = 0; column <= this.dimension; column += 1) {
      const x = column * this.cellSize + 0.5;
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    for (let row = 0; row <= this.dimension; row += 1) {
      const y = row * this.cellSize + 0.5;
      context.moveTo(0, y);
      context.lineTo(width, y);
    }
    context.stroke();

    const squares = Object.values(this.squares());
    if (squares.length > 0) {
      // Draw thin black lines where there are walls, on visible squares only
      context.strokeStyle = '#000000';
      context.lineWidth = 2;
      context.beginPath();
      for (const square of squares) {
        const sourceSquareKey = this.getSquareKey(square.row, square.column);
        if (!visibleSquareKeys.has(sourceSquareKey)) continue;
        const previewRow = square.row - preview.startRow;
        const previewColumn = square.column - preview.startColumn;
        if (previewRow < 0 || previewColumn < 0 || previewRow >= this.dimension || previewColumn >= this.dimension) continue;
        const left = previewColumn * this.cellSize;
        const top = previewRow * this.cellSize;
        const right = left + this.cellSize;
        const bottom = top + this.cellSize;
        if (this.isWallConnection(square.toTop)) { context.moveTo(left, top); context.lineTo(right, top); }
        if (this.isWallConnection(square.toRight)) { context.moveTo(right, top); context.lineTo(right, bottom); }
        if (this.isWallConnection(square.toBottom)) { context.moveTo(left, bottom); context.lineTo(right, bottom); }
        if (this.isWallConnection(square.toLeft)) { context.moveTo(left, top); context.lineTo(left, bottom); }
      }
      context.stroke();

      context.strokeStyle = '#20d646';
      context.lineWidth = 2;
      context.beginPath();
      for (const square of squares) {
        const sourceSquareKey = this.getSquareKey(square.row, square.column);
        if (!visibleSquareKeys.has(sourceSquareKey)) continue;
        const previewRow = square.row - preview.startRow;
        const previewColumn = square.column - preview.startColumn;
        if (previewRow < 0 || previewColumn < 0 || previewRow >= this.dimension || previewColumn >= this.dimension) continue;
        const left = previewColumn * this.cellSize;
        const top = previewRow * this.cellSize;
        const right = left + this.cellSize;
        const bottom = top + this.cellSize;
        if (this.isDoorConnection(square.toTop) && square.toTop.state !== 'open' && (!square.toTop.isHidden || square.toTop.isFound)) { context.moveTo(left, top); context.lineTo(right, top); }
        if (this.isDoorConnection(square.toRight) && square.toRight.state !== 'open' && (!square.toRight.isHidden || square.toRight.isFound)) { context.moveTo(right, top); context.lineTo(right, bottom); }
        if (this.isDoorConnection(square.toBottom) && square.toBottom.state !== 'open' && (!square.toBottom.isHidden || square.toBottom.isFound)) { context.moveTo(left, bottom); context.lineTo(right, bottom); }
        if (this.isDoorConnection(square.toLeft) && square.toLeft.state !== 'open' && (!square.toLeft.isHidden || square.toLeft.isFound)) { context.moveTo(left, top); context.lineTo(left, bottom); }
      }
      context.stroke();
    }

    context.fillStyle = '#2e84ff';
    for (const key of this.keyList()) {
      if (key.rownId === null || key.columnId === null) continue;
      if (!visibleSquareKeys.has(this.getSquareKey(key.rownId, key.columnId))) continue;
      const previewRow = key.rownId - preview.startRow;
      const previewColumn = key.columnId - preview.startColumn;
      if (previewRow < 0 || previewColumn < 0 || previewRow >= this.dimension || previewColumn >= this.dimension) continue;
      const centerX = previewColumn * this.cellSize + this.cellSize / 2;
      const centerY = previewRow * this.cellSize + this.cellSize / 2;
      context.beginPath();
      context.arc(centerX, centerY, 3, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#dbe8ff';
      context.lineWidth = 1;
      context.stroke();
    }

    for (const placement of this.tresherPlacements()) {
      const squareKey = this.getSquareKey(placement.row, placement.column);
      if (!visibleSquareKeys.has(squareKey)) continue;
      const previewRow = placement.row - preview.startRow;
      const previewColumn = placement.column - preview.startColumn;
      if (previewRow < 0 || previewColumn < 0 || previewRow >= this.dimension || previewColumn >= this.dimension) continue;
      const centerX = previewColumn * this.cellSize + this.cellSize / 2;
      const centerY = previewRow * this.cellSize + this.cellSize / 2;
      this.drawTresherCoinMarker(context, centerX, centerY, 3.5);
    }

    if (this.combatRange() > 0) {
      const range = this.combatRange();
      const pRow = preview.centerRow;
      const pCol = preview.centerColumn;
      context.save();
      context.globalAlpha = 0.15;
      context.fillStyle = '#ffff00';
      for (let pr = 0; pr < this.dimension; pr++) {
        for (let pc = 0; pc < this.dimension; pc++) {
          const sr = preview.startRow + pr;
          const sc = preview.startColumn + pc;
          if (!visibleSquareKeys.has(this.getSquareKey(sr, sc))) continue;
          if (sr === pRow && sc === pCol) continue;
          const dr = Math.abs(sr - pRow);
          const dc = Math.abs(sc - pCol);
          if (dr <= range && dc <= range)
            context.fillRect(pc * this.cellSize, pr * this.cellSize, this.cellSize, this.cellSize);
        }
      }
      context.restore();
    }

    for (const placement of this.monsterPlacements()) {
      const squareKey = this.getSquareKey(placement.row, placement.column);
      if (!visibleSquareKeys.has(squareKey)) continue;
      const previewRow = placement.row - preview.startRow;
      const previewColumn = placement.column - preview.startColumn;
      if (previewRow < 0 || previewColumn < 0 || previewRow >= this.dimension || previewColumn >= this.dimension) continue;
      const centerX = previewColumn * this.cellSize + this.cellSize / 2;
      const centerY = previewRow * this.cellSize + this.cellSize / 2;
      this.drawMonsterMarker(context, centerX, centerY, 3.5);
    }

    for (const placement of this.itemPlacements()) {
      const squareKey = this.getSquareKey(placement.row, placement.column);
      if (!visibleSquareKeys.has(squareKey)) continue;
      const previewRow = placement.row - preview.startRow;
      const previewColumn = placement.column - preview.startColumn;
      if (previewRow < 0 || previewColumn < 0 || previewRow >= this.dimension || previewColumn >= this.dimension) continue;
      const centerX = previewColumn * this.cellSize + this.cellSize / 2;
      const centerY = previewRow * this.cellSize + this.cellSize / 2;
      this.drawItemMarker(context, centerX, centerY, 3.5);
    }

    for (const placement of this.potionPlacements()) {
      const squareKey = this.getSquareKey(placement.row, placement.column);
      if (!visibleSquareKeys.has(squareKey)) continue;
      const previewRow = placement.row - preview.startRow;
      const previewColumn = placement.column - preview.startColumn;
      if (previewRow < 0 || previewColumn < 0 || previewRow >= this.dimension || previewColumn >= this.dimension) continue;
      const centerX = previewColumn * this.cellSize + this.cellSize / 2;
      const centerY = previewRow * this.cellSize + this.cellSize / 2;
      this.drawItemMarker(context, centerX, centerY, 3.5);
    }

    for (const placement of this.spellPlacements()) {
      const squareKey = this.getSquareKey(placement.row, placement.column);
      if (!visibleSquareKeys.has(squareKey)) continue;
      const previewRow = placement.row - preview.startRow;
      const previewColumn = placement.column - preview.startColumn;
      if (previewRow < 0 || previewColumn < 0 || previewRow >= this.dimension || previewColumn >= this.dimension) continue;
      const centerX = previewColumn * this.cellSize + this.cellSize / 2;
      const centerY = previewRow * this.cellSize + this.cellSize / 2;
      this.drawItemMarker(context, centerX, centerY, 3.5);
    }

    for (const exit of this.exits()) {
      const exitSquareKey = this.getSquareKey(exit.row, exit.column);
      if (!visibleSquareKeys.has(exitSquareKey)) continue;
      const previewRow = exit.row - preview.startRow;
      const previewColumn = exit.column - preview.startColumn;
      if (previewRow < 0 || previewColumn < 0 || previewRow >= this.dimension || previewColumn >= this.dimension) continue;
      const centerX = previewColumn * this.cellSize + this.cellSize / 2;
      const centerY = previewRow * this.cellSize + this.cellSize / 2;
      this.drawExitMarker(context, centerX, centerY, this.cellSize * 0.48, exit.transitionType);
    }

    for (const portal of this.portalPlacements()) {
      if (portal.look !== 'magicDoor') continue;

      const portalPoints: Array<{ row: number; column: number; mode: 'oneWay' | 'twoWay' }> = [];
      if (portal.startRow !== null && portal.startColumn !== null) {
        portalPoints.push({
          row: portal.startRow,
          column: portal.startColumn,
          mode: portal.isTwoWay === false ? 'oneWay' : 'twoWay',
        });
      }
      if (portal.isTwoWay !== false && portal.endRow !== null && portal.endColumn !== null) {
        portalPoints.push({
          row: portal.endRow,
          column: portal.endColumn,
          mode: 'twoWay',
        });
      }

      for (const point of portalPoints) {
        const portalSquareKey = this.getSquareKey(point.row, point.column);
        if (!visibleSquareKeys.has(portalSquareKey)) continue;
        const previewRow = point.row - preview.startRow;
        const previewColumn = point.column - preview.startColumn;
        if (previewRow < 0 || previewColumn < 0 || previewRow >= this.dimension || previewColumn >= this.dimension) continue;
        const centerX = previewColumn * this.cellSize + this.cellSize / 2;
        const centerY = previewRow * this.cellSize + this.cellSize / 2;
        context.fillStyle = point.mode === 'oneWay' ? '#ff3b30' : '#b56dff';
        context.beginPath();
        context.arc(centerX, centerY, 2.6, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = point.mode === 'oneWay' ? '#ffd8d5' : '#ecd8ff';
        context.lineWidth = 0.9;
        context.stroke();
      }
    }

    const startpoint = this.startPoint();
    if (startpoint && visibleSquareKeys.has(this.getSquareKey(startpoint.row, startpoint.col))) {
      const previewRow = startpoint.row - preview.startRow;
      const previewColumn = startpoint.col - preview.startColumn;
      if (previewRow >= 0 && previewColumn >= 0 && previewRow < this.dimension && previewColumn < this.dimension) {
        const centerX = previewColumn * this.cellSize + this.cellSize / 2;
        const centerY = previewRow * this.cellSize + this.cellSize / 2;
        context.fillStyle = '#ff3b30';
        context.beginPath();
        context.arc(centerX, centerY, 4, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#ffd6d3';
        context.lineWidth = 1;
        context.stroke();
      }
    }

    for (const st of this.squareTexts()) {
      if (!visibleSquareKeys.has(this.getSquareKey(st.row, st.column))) continue;
      const previewRow = st.row - preview.startRow;
      const previewColumn = st.column - preview.startColumn;
      if (previewRow >= 0 && previewColumn >= 0 && previewRow < this.dimension && previewColumn < this.dimension) {
        this.drawSquareTextWallGlow(
          context,
          previewColumn * this.cellSize,
          previewRow * this.cellSize,
          this.cellSize,
          st.wallSide ?? null
        );
        const centerX = previewColumn * this.cellSize + this.cellSize / 2;
        const centerY = previewRow * this.cellSize + this.cellSize / 2;
        context.fillStyle = st.wallSide ? '#d18cff' : '#e17055';
        context.font = 'bold 9px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('T', centerX, centerY);
      }
    }

    // Draw obstacle markers (image thumbnail or unfilled circle)
    const obstacleImages = this.obstacleImagesBySquare();
    for (const obs of this.obstaclePlacements()) {
      if (obs.isDestroyed) continue;
      const obsSquareKey = this.getSquareKey(obs.row, obs.column);
      if (!visibleSquareKeys.has(obsSquareKey)) continue;
      const previewRow = obs.row - preview.startRow;
      const previewColumn = obs.column - preview.startColumn;
      if (previewRow >= 0 && previewColumn >= 0 && previewRow < this.dimension && previewColumn < this.dimension) {
        const centerX = previewColumn * this.cellSize + this.cellSize / 2;
        const centerY = previewRow * this.cellSize + this.cellSize / 2;
        const obsImg = obstacleImages.get(obsSquareKey) ?? null;
        if (obsImg && obsImg.naturalWidth > 0) {
          const imgSize = this.cellSize - 2;
          context.drawImage(obsImg, previewColumn * this.cellSize + 1, previewRow * this.cellSize + 1, imgSize, imgSize);
        } else {
          const radius = this.cellSize * 0.32;
          context.strokeStyle = '#a0856a';
          context.lineWidth = 1.5;
          context.beginPath();
          context.arc(centerX, centerY, radius, 0, Math.PI * 2);
          context.stroke();
        }

        if (obs.requiredKeyId !== null && obs.requiredKeyId !== undefined) {
          const keyholeRadius = Math.max(2, this.cellSize * 0.11);
          const keyholeCenterY = centerY - this.cellSize * 0.08;
          const shaftWidth = Math.max(2, this.cellSize * 0.12);
          const shaftHeight = Math.max(3, this.cellSize * 0.16);

          context.fillStyle = 'rgba(255,255,255,0.78)';
          context.beginPath();
          context.arc(centerX, keyholeCenterY, keyholeRadius, 0, Math.PI * 2);
          context.fill();
          context.fillRect(
            centerX - shaftWidth / 2,
            keyholeCenterY + keyholeRadius * 0.35,
            shaftWidth,
            shaftHeight
          );

          context.fillStyle = '#1f1f1f';
          context.beginPath();
          context.arc(centerX, keyholeCenterY, keyholeRadius * 0.52, 0, Math.PI * 2);
          context.fill();
          context.fillRect(
            centerX - shaftWidth * 0.25,
            keyholeCenterY + keyholeRadius * 0.45,
            shaftWidth * 0.5,
            shaftHeight * 0.85
          );
        }
      }
    }

    // Draw type-aware markers for detected or triggered floor traps
    for (const fp of this.floorTrapPlacements()) {
      if (fp.isDisarmed) continue;
      if (!(fp.isDetected || fp.isTriggered)) continue;
      if (!visibleSquareKeys.has(this.getSquareKey(fp.row, fp.column))) continue;
      const previewRow = fp.row - preview.startRow;
      const previewColumn = fp.column - preview.startColumn;
      if (previewRow >= 0 && previewColumn >= 0 && previewRow < this.dimension && previewColumn < this.dimension) {
        const centerX = previewColumn * this.cellSize + this.cellSize / 2;
        const centerY = previewRow * this.cellSize + this.cellSize / 2;
        const trapType = (fp.trap.trapType ?? fp.trap.name ?? '').toLowerCase();
        context.save();
        if (trapType.includes('pit') && !trapType.includes('spiked')) {
          context.fillStyle = fp.isTriggered ? '#111' : '#222';
          context.beginPath();
          context.ellipse(centerX, centerY, 4, 3, 0, 0, Math.PI * 2);
          context.fill();
          context.strokeStyle = '#000';
          context.stroke();
        } else if (trapType.includes('spiked pit')) {
          context.fillStyle = fp.isTriggered ? '#1a1a1a' : '#2a1e1e';
          context.beginPath();
          context.ellipse(centerX, centerY, 4, 3, 0, 0, Math.PI * 2);
          context.fill();
          context.strokeStyle = '#c0392b';
          context.beginPath();
          context.moveTo(centerX - 4, centerY - 1);
          context.lineTo(centerX - 1, centerY - 4);
          context.lineTo(centerX + 1, centerY - 4);
          context.lineTo(centerX + 4, centerY - 1);
          context.stroke();
        } else if (trapType.includes('glue')) {
          context.fillStyle = '#4caf50';
          context.fillRect(centerX - 4, centerY - 3, 8, 6);
        } else if (trapType.includes('net')) {
          context.strokeStyle = '#d9c7a0';
          context.lineWidth = 1;
          context.strokeRect(centerX - 4, centerY - 3, 8, 6);
          context.beginPath();
          context.moveTo(centerX - 4, centerY - 3);
          context.lineTo(centerX + 4, centerY + 3);
          context.moveTo(centerX + 4, centerY - 3);
          context.lineTo(centerX - 4, centerY + 3);
          context.stroke();
        } else if (trapType.includes('dart') || trapType.includes('gas') || trapType.includes('wall spikes')) {
          context.fillStyle = trapType.includes('gas') ? '#6c4bd9' : '#f5f5f5';
          context.beginPath();
          context.arc(centerX, centerY, 3, 0, Math.PI * 2);
          context.fill();
          context.strokeStyle = trapType.includes('wall spikes') ? '#7a3db8' : '#7f8c8d';
          context.stroke();
        } else {
          context.fillStyle = '#ffcc00';
          context.font = 'bold 8px sans-serif';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText('t', centerX + 4, centerY + 4);
        }
        context.restore();
      }
    }

    const cheater = this.cheater();
    const centerPreviewRow = preview.centerRow - preview.startRow;
    const centerPreviewColumn = preview.centerColumn - preview.startColumn;
    if (
      centerPreviewRow >= 0 &&
      centerPreviewColumn >= 0 &&
      centerPreviewRow < this.dimension &&
      centerPreviewColumn < this.dimension
    ) {
      this.drawFacingArrow(
        context,
        centerPreviewColumn * this.cellSize,
        centerPreviewRow * this.cellSize,
        this.cellSize,
        cheater.facingDir
      );
    }

    const selRow = this.selectedTargetRow();
    const selCol = this.selectedTargetColumn();
    if (selRow !== null && selCol !== null) {
      const pr = selRow - preview.startRow;
      const pc = selCol - preview.startColumn;
      if (pr >= 0 && pc >= 0 && pr < this.dimension && pc < this.dimension &&
          visibleSquareKeys.has(this.getSquareKey(selRow, selCol))) {
        context.strokeStyle = '#ff9500';
        context.lineWidth = 2.5;
        context.setLineDash([3, 2]);
        context.strokeRect(pc * this.cellSize + 1.5, pr * this.cellSize + 1.5, this.cellSize - 3, this.cellSize - 3);
        context.setLineDash([]);
      }
    }
  }

  handleCanvasClick(event: MouseEvent): void {
    const canvas = this._canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const scaleX = this.canvasWidth / rect.width;
    const scaleY = this.canvasHeight / rect.height;
    const cellX = Math.floor(x * scaleX / this.cellSize);
    const cellY = Math.floor(y * scaleY / this.cellSize);
    const preview = this.preview();
    const row = preview.startRow + cellY;
    const col = preview.startColumn + cellX;
    if (cellX >= 0 && cellX < this.dimension && cellY >= 0 && cellY < this.dimension) {
      // Log square data for debugging
      const squareKey = this.getSquareKey(row, col);
      const squareData = this.squares()[squareKey];
      const isFilled = this.filledSquares()[squareKey] ?? false;
      const monsters = this.monsterPlacements().filter(m => m.row === row && m.column === col);
      const treshers = this.tresherPlacements().filter(t => t.row === row && t.column === col);
      const startPoint = this.startPoint();
      const isStartPoint = startPoint ? startPoint.row === row && startPoint.col === col : false;
      const items = this.itemPlacements().filter(i => i.row === row && i.column === col);
      const potions = this.potionPlacements().filter(p => p.row === row && p.column === col);
      const spells = this.spellPlacements().filter(s => s.row === row && s.column === col);
      const obstacles = this.obstaclePlacements().filter(o => o.row === row && o.column === col);
      const traps = this.floorTrapPlacements().filter(t => t.row === row && t.column === col);
      const keys = this.keyList().filter(k => k.rownId === row && k.columnId === col);
      const portals = this.portalPlacements().filter(p =>
        (p.startRow === row && p.startColumn === col) ||
        (p.isTwoWay !== false && p.endRow === row && p.endColumn === col)
      );
      
      const payload = {
        row,
        column: col,
        squareKey,
        isFilled,
        squareData,
        isStartPoint,
        startPoint: isStartPoint ? startPoint : null,
        monsters: monsters.length > 0 ? monsters : null,
        treshers: treshers.length > 0 ? treshers : null,
        items: items.length > 0 ? items : null,
        potions: potions.length > 0 ? potions : null,
        spells: spells.length > 0 ? spells : null,
        obstacles: obstacles.length > 0 ? obstacles : null,
        traps: traps.length > 0 ? traps : null,
        keys: keys.length > 0 ? keys : null,
        portals: portals.length > 0 ? portals : null,
      };
      const isLocalhost = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
      if (isLocalhost) {
        (window as any).__tdodjLastPreviewSquareClick = payload;
      }
      console.warn('[TDODJ][PreviewGrid] Square clicked', payload);
      
      this.cellClicked.emit({ row, column: col });
    }
  }

  private getVisibleSquareKeysForPreview(preview: GridPreviewContext): Set<string> {
    const visibleSquareKeys = new Set<string>();
    const filledSquares = this.filledSquares();
    const cheater = this.cheater();
    const range =
      typeof cheater.rangeOfSight === 'number' && Number.isFinite(cheater.rangeOfSight)
        ? Math.max(0, cheater.rangeOfSight)
        : DEFAULT_CHEATER.rangeOfSight;

    const sourceSquareKey = this.getSquareKey(preview.centerRow, preview.centerColumn);
    if (filledSquares[sourceSquareKey]) {
      visibleSquareKeys.add(sourceSquareKey);
    }

    // Phase 1: strict ray cast — diagonal corners are blocked if EITHER direction is walled.
    for (let previewRow = 0; previewRow < this.dimension; previewRow += 1) {
      for (let previewColumn = 0; previewColumn < this.dimension; previewColumn += 1) {
        const sourceRow = preview.startRow + previewRow;
        const sourceColumn = preview.startColumn + previewColumn;
        const squareKey = this.getSquareKey(sourceRow, sourceColumn);
        if (!filledSquares[squareKey]) continue;
        if (!this.isWithinSightRange(preview.centerRow, preview.centerColumn, sourceRow, sourceColumn, range)) continue;
        if (!this.hasLineOfSight(preview.centerRow, preview.centerColumn, sourceRow, sourceColumn)) continue;
        visibleSquareKeys.add(squareKey);
      }
    }

    // Phase 2: expand one step through open passages from each directly-visible cell.
    // This reveals cells immediately beyond an open doorway without diagonal corner-peeking.
    const cardinalDirs: Array<{ dRow: number; dCol: number }> = [
      { dRow: -1, dCol: 0 }, { dRow: 1, dCol: 0 },
      { dRow: 0, dCol: -1 }, { dRow: 0, dCol: 1 },
    ];
    for (const key of [...visibleSquareKeys]) {
      const [row, col] = key.split(':').map(Number);
      for (const { dRow, dCol } of cardinalDirs) {
        const adjRow = row + dRow;
        const adjCol = col + dCol;
        const adjKey = this.getSquareKey(adjRow, adjCol);
        if (visibleSquareKeys.has(adjKey)) continue;
        if (!filledSquares[adjKey]) continue;
        if (!this.isWithinSightRange(preview.centerRow, preview.centerColumn, adjRow, adjCol, range)) continue;
        if (this.isSightBlockedBetweenAdjacentSquares(row, col, adjRow, adjCol)) continue;
        visibleSquareKeys.add(adjKey);
      }
    }

    return visibleSquareKeys;
  }

  private isWithinSightRange(fromRow: number, fromColumn: number, toRow: number, toColumn: number, range: number): boolean {
    return Math.hypot(toRow - fromRow, toColumn - fromColumn) <= range;
  }

  private hasLineOfSight(fromRow: number, fromColumn: number, toRow: number, toColumn: number): boolean {
    if (fromRow === toRow && fromColumn === toColumn) return true;
    const squares = this.squares();
    if (!squares[this.getSquareKey(fromRow, fromColumn)]) return false;
    if (!squares[this.getSquareKey(toRow, toColumn)]) return false;

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
    let tMaxX = stepX === 0 ? Number.POSITIVE_INFINITY : (stepX > 0 ? currentColumn + 1 - startX : startX - currentColumn) / absoluteDeltaX;
    let tMaxY = stepY === 0 ? Number.POSITIVE_INFINITY : (stepY > 0 ? currentRow + 1 - startY : startY - currentRow) / absoluteDeltaY;
    const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY : 1 / absoluteDeltaX;
    const tDeltaY = stepY === 0 ? Number.POSITIVE_INFINITY : 1 / absoluteDeltaY;
    const epsilon = 0.0000001;
    let guard = 0;
    const maxSteps = 50 * 50 + 5;

    while ((currentRow !== toRow || currentColumn !== toColumn) && guard < maxSteps) {
      guard += 1;
      if (tMaxX < tMaxY - epsilon) {
        const nextColumn = currentColumn + stepX;
        if (this.isSightBlockedBetweenAdjacentSquares(currentRow, currentColumn, currentRow, nextColumn)) return false;
        currentColumn = nextColumn;
        tMaxX += tDeltaX;
        continue;
      }
      if (tMaxY < tMaxX - epsilon) {
        const nextRow = currentRow + stepY;
        if (this.isSightBlockedBetweenAdjacentSquares(currentRow, currentColumn, nextRow, currentColumn)) return false;
        currentRow = nextRow;
        tMaxY += tDeltaY;
        continue;
      }
      // Diagonal corner: the ray hits the exact corner of 4 cells.
      // Block if ANY of the 4 inner boundaries of the corner cells is walled off.
      const nextColumn = currentColumn + stepX;
      const nextRow = currentRow + stepY;
      const blockedToHorizontal = stepX !== 0 && this.isSightBlockedBetweenAdjacentSquares(currentRow, currentColumn, currentRow, nextColumn);
      const blockedToVertical = stepY !== 0 && this.isSightBlockedBetweenAdjacentSquares(currentRow, currentColumn, nextRow, currentColumn);
      // Also check walls approaching the destination from the two intermediate cells.
      const blockedDestFromH = stepX !== 0 && stepY !== 0 && this.isSightBlockedBetweenAdjacentSquares(currentRow, nextColumn, nextRow, nextColumn);
      const blockedDestFromV = stepX !== 0 && stepY !== 0 && this.isSightBlockedBetweenAdjacentSquares(nextRow, currentColumn, nextRow, nextColumn);
      if (blockedToHorizontal || blockedToVertical || blockedDestFromH || blockedDestFromV) return false;
      currentColumn = nextColumn;
      currentRow = nextRow;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    }

    return currentRow === toRow && currentColumn === toColumn;
  }

  private isSightBlockedBetweenAdjacentSquares(
    fromRow: number, fromColumn: number, toRow: number, toColumn: number
  ): boolean {
    const rowDelta = toRow - fromRow;
    const columnDelta = toColumn - fromColumn;
    if (Math.abs(rowDelta) + Math.abs(columnDelta) !== 1) return true;
    const squares = this.squares();
    const fromSquare = squares[this.getSquareKey(fromRow, fromColumn)];
    const toSquare = squares[this.getSquareKey(toRow, toColumn)];
    if (!fromSquare || !toSquare) return true;
    let fromSide: SquareSide;
    let toSide: SquareSide;
    if (rowDelta === -1) { fromSide = 'toTop'; toSide = 'toBottom'; }
    else if (rowDelta === 1) { fromSide = 'toBottom'; toSide = 'toTop'; }
    else if (columnDelta === -1) { fromSide = 'toLeft'; toSide = 'toRight'; }
    else { fromSide = 'toRight'; toSide = 'toLeft'; }
    return this.isSightBlockingConnection(fromSquare[fromSide]) || this.isSightBlockingConnection(toSquare[toSide]);
  }

  private isSightBlockingConnection(connection: Door | Wall | null): boolean {
    if (this.isWallConnection(connection)) return true;
    if (this.isDoorConnection(connection)) return connection.state !== 'open';
    return false;
  }

  private drawFacingArrow(
    context: CanvasRenderingContext2D,
    left: number,
    top: number,
    size: number,
    direction: FacingDirection
  ): void {
    const centerX = left + size / 2;
    const centerY = top + size / 2;
    const tipOffset = size * 0.34;
    const baseOffset = size * 0.14;
    const wingOffset = size * 0.2;
    let tipX = centerX, tipY = centerY, wingAX = centerX, wingAY = centerY, wingBX = centerX, wingBY = centerY;

    if (direction === 'up') {
      tipY = centerY - tipOffset; wingAX = centerX - wingOffset; wingAY = centerY + baseOffset; wingBX = centerX + wingOffset; wingBY = centerY + baseOffset;
    } else if (direction === 'right') {
      tipX = centerX + tipOffset; wingAX = centerX - baseOffset; wingAY = centerY - wingOffset; wingBX = centerX - baseOffset; wingBY = centerY + wingOffset;
    } else if (direction === 'down') {
      tipY = centerY + tipOffset; wingAX = centerX - wingOffset; wingAY = centerY - baseOffset; wingBX = centerX + wingOffset; wingBY = centerY - baseOffset;
    } else {
      tipX = centerX - tipOffset; wingAX = centerX + baseOffset; wingAY = centerY - wingOffset; wingBX = centerX + baseOffset; wingBY = centerY + wingOffset;
    }

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

  private drawSquareTextWallGlow(
    context: CanvasRenderingContext2D,
    left: number,
    top: number,
    size: number,
    wallSide: SquareSide | null
  ): void {
    if (!wallSide) {
      return;
    }

    const right = left + size;
    const bottom = top + size;

    context.save();
    context.strokeStyle = 'rgba(205, 144, 255, 0.98)';
    context.shadowColor = 'rgba(154, 78, 255, 0.95)';
    context.shadowBlur = 10;
    context.lineWidth = 3;
    context.beginPath();

    if (wallSide === 'toTop') {
      context.moveTo(left + 2, top + 1.5);
      context.lineTo(right - 2, top + 1.5);
    } else if (wallSide === 'toRight') {
      context.moveTo(right - 1.5, top + 2);
      context.lineTo(right - 1.5, bottom - 2);
    } else if (wallSide === 'toBottom') {
      context.moveTo(left + 2, bottom - 1.5);
      context.lineTo(right - 2, bottom - 1.5);
    } else {
      context.moveTo(left + 1.5, top + 2);
      context.lineTo(left + 1.5, bottom - 2);
    }

    context.stroke();
    context.restore();
  }

  private drawTresherCoinMarker(context: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number): void {
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

  private drawMonsterMarker(context: CanvasRenderingContext2D, centerX: number, centerY: number, size: number): void {
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

  private drawItemMarker(context: CanvasRenderingContext2D, centerX: number, centerY: number, size: number): void {
    const s = Math.max(2, size);
    context.fillStyle = '#4fc3f7';
    context.beginPath();
    context.moveTo(centerX, centerY - s);
    context.lineTo(centerX + s, centerY);
    context.lineTo(centerX, centerY + s);
    context.lineTo(centerX - s, centerY);
    context.closePath();
    context.fill();
    context.strokeStyle = '#b3e5fc';
    context.lineWidth = 1;
    context.stroke();
  }

  private drawExitMarker(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    markerSize: number,
    transitionType: ExitTransitionType
  ): void {
    const halfSize = Math.max(3, markerSize);
    if (transitionType === 'open') {
      context.fillStyle = '#45d483';
      context.beginPath();
      context.arc(centerX, centerY, halfSize * 0.36, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#e4fff0';
      context.lineWidth = 1;
      context.stroke();
      return;
    }
    const left = centerX - halfSize;
    const top = centerY - halfSize;
    const sideLength = halfSize * 2;
    context.fillStyle = transitionType === 'stairsUp' ? 'rgba(221, 76, 76, 0.38)' : 'rgba(189, 36, 36, 0.42)';
    context.fillRect(left, top, sideLength, sideLength);
    context.strokeStyle = transitionType === 'stairsUp' ? '#ffd7d7' : '#ffcdcd';
    context.lineWidth = 1;
    context.strokeRect(left + 0.5, top + 0.5, Math.max(0, sideLength - 1), Math.max(0, sideLength - 1));
    context.strokeStyle = transitionType === 'stairsUp' ? '#ff8f8f' : '#ff6262';
    context.lineWidth = 1.4;
    context.beginPath();
    const stepCount = 4;
    for (let index = 0; index < stepCount; index += 1) {
      const ratio = (index + 1) / (stepCount + 1);
      const inset = ratio * (sideLength * 0.18);
      const y = transitionType === 'stairsUp' ? top + sideLength - ratio * sideLength : top + ratio * sideLength;
      context.moveTo(left + inset, y);
      context.lineTo(left + sideLength - inset, y);
    }
    context.stroke();
  }

  private getMovementConnectionInfoBetweenAdjacentSquares(
    fromRow: number, fromColumn: number, toRow: number, toColumn: number
  ): AdjacentConnectionInfo {
    const rowDelta = toRow - fromRow;
    const columnDelta = toColumn - fromColumn;
    if (Math.abs(rowDelta) + Math.abs(columnDelta) !== 1) return { type: 'void', door: null };
    const squares = this.squares();
    const fromSquare = squares[this.getSquareKey(fromRow, fromColumn)];
    if (!fromSquare) return { type: 'void', door: null };
    let fromSide: SquareSide;
    let toSide: SquareSide;
    if (rowDelta === -1) { fromSide = 'toTop'; toSide = 'toBottom'; }
    else if (rowDelta === 1) { fromSide = 'toBottom'; toSide = 'toTop'; }
    else if (columnDelta === -1) { fromSide = 'toLeft'; toSide = 'toRight'; }
    else { fromSide = 'toRight'; toSide = 'toLeft'; }
    const fromConnection = fromSquare[fromSide];
    if (this.isWallConnection(fromConnection)) return { type: 'wall', door: null };
    if (this.isDoorConnection(fromConnection)) return { type: fromConnection.state === 'closed' ? 'closedDoor' : 'openDoor', door: fromConnection };
    const toSquare = squares[this.getSquareKey(toRow, toColumn)];
    if (!toSquare) return { type: 'void', door: null };
    const toConnection = toSquare[toSide];
    if (this.isWallConnection(toConnection)) return { type: 'wall', door: null };
    if (this.isDoorConnection(toConnection)) return { type: toConnection.state === 'closed' ? 'closedDoor' : 'openDoor', door: toConnection };
    return { type: 'none', door: null };
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
