export type ExitDestinationType = 'outside' | 'dungon';
export type ExitTransitionType = 'open' | 'stairsUp' | 'stairsDown';

export interface DungonExit {
  id: number;
  row: number;
  column: number;
  destinationType: ExitDestinationType;
  destinationDungonId: number | null;
  transitionType: ExitTransitionType;
}
