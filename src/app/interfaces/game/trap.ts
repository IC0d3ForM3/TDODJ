export type TrapType =
  | 'Pit'
  | 'Spiked Pit'
  | 'Ceiling Spikes'
  | 'Floor Glue'
  | 'Drop Net'
  | 'Dart'
  | 'Gas Cloud'
  | 'Wall Spikes';

export type TrapSourceObjectType = 'floor' | 'wall' | 'door' | 'item' | 'tresher' | 'obstacle';
export type TrapSourceSide = 'north' | 'east' | 'south' | 'west';

export interface TrapCrossingRequirement {
  itemId: number;
  itemName: string;
}

export interface Trap {
  name: string;
  description: string;
  damage: number;
  damageTo: 'HP' | 'Stamina' | 'Mind' | 'AE' | 'ROS';
  curseId: number | null;
  toDetect: number;
  toDisarm: number;
  trapType?: TrapType;
  isHiddenUntilFoundOrTriggered?: boolean;
  crossingRequirements?: TrapCrossingRequirement[];
  sourceObjectType?: TrapSourceObjectType | null;
  sourceSide?: TrapSourceSide | null;
  secondaryEffectTo?: 'Stamina' | 'Mind' | 'AE' | 'ROS' | null;
  secondaryEffectAmount?: number;
  secondaryEffectDuration?: number;
}
