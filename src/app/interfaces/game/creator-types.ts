export type DungonStatus = 'inproces' | 'published' | 'pending' | 'approved';

export type SquareSide = 'toTop' | 'toRight' | 'toBottom' | 'toLeft';
export type FacingDirection = 'up' | 'right' | 'down' | 'left';
export type PathBlockType = 'none' | 'wall' | 'openDoor' | 'closedDoor' | 'void';
export type TresherType = 'Weapon' | 'Armor' | 'Coins' | 'Potion' | 'OtherTresher';
export type PotionEffectTarget = 'Health' | 'AC' | 'AE';
export type ArmorType = 'head' | 'hand' | 'body' | 'arms' | 'legs';
export type CoinType = 'Gold' | 'Silver' | 'Copper' | 'Tin';

export type OpenBlockOptionKey =
  | 'wallTop'
  | 'wallBottom'
  | 'wallLeft'
  | 'wallRight'
  | 'doorTop'
  | 'doorBottom'
  | 'doorLeft'
  | 'doorRight';
