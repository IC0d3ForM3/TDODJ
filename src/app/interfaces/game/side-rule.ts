import { OpenBlockOptionKey, SquareSide } from './creator-types';

export interface SideRule {
  side: SquareSide;
  wallKey: OpenBlockOptionKey;
  doorKey: OpenBlockOptionKey;
  neighborRowOffset: number;
  neighborColumnOffset: number;
  oppositeSide: SquareSide;
}
