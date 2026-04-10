import { Key } from '../key';
import { Square } from '../square';
import { Cheater } from './cheater';
import { StartPoint } from './start-point';
import { Tresher } from './tresher';
import { TresherPlacement } from './tresher-placement';
import { DungonExit } from './dungon-exit';
import { Monster } from './monster';
import { MonsterPlacement } from './monster-placement';
import { SquareText } from './square-text';
import { FloorTrapPlacement } from './floor-trap-placement';
import { PortalPlacement } from './portal-placement';

export interface DungonJsonPayload {
  filledSquares: Record<string, true>;
  squares: Record<string, Square>;
  keyList: Key[];
  cheater: Cheater;
  startpoint: StartPoint | null;
  tresherList: Tresher[];
  tresherPlacements: TresherPlacement[];
  monsterList?: Monster[];
  monsterPlacements?: MonsterPlacement[];
  exits?: DungonExit[];
  exitList?: DungonExit[];
  tresherPlacementList?: TresherPlacement[];
  trasherPlacements?: TresherPlacement[];
  monsters?: Monster[];
  monsterPlacementList?: MonsterPlacement[];
  squareTexts?: SquareText[];
  floorTrapPlacements?: FloorTrapPlacement[];
  portalPlacements?: PortalPlacement[];
}
