import { Door } from './door';
import { Wall } from './wall';

export interface Square {
  id: number;
  row: number;
  column: number;
  description: string;
  isTrapped: boolean;
  toTop: Door | Wall | null;
  toRight: Door | Wall | null;
  toBottom: Door | Wall | null;
  toLeft: Door | Wall | null;
}
