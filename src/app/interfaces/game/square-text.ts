import { SquareSide } from './creator-types';

export interface SquareText {
  id: number;
  row: number;
  column: number;
  text: string;
  wallSide?: SquareSide | null;
}

export function normalizeSquareTextWallSide(value: unknown): SquareSide | null {
  return value === 'toTop' || value === 'toRight' || value === 'toBottom' || value === 'toLeft'
    ? value
    : null;
}
