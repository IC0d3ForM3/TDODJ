export type DungonStatus = 'inproces' | 'published' | 'pending' | 'approved';

export type SquareSide = 'toTop' | 'toRight' | 'toBottom' | 'toLeft';
export type FacingDirection = 'up' | 'right' | 'down' | 'left';
export type PathBlockType = 'none' | 'wall' | 'openDoor' | 'closedDoor' | 'void';

export type OpenBlockOptionKey =
  | 'wallTop'
  | 'wallBottom'
  | 'wallLeft'
  | 'wallRight'
  | 'doorTop'
  | 'doorBottom'
  | 'doorLeft'
  | 'doorRight';
