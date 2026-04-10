export interface Trap {
  name: string;
  description: string;
  damage: number;
  damageTo: 'HP' | 'Stamina' | 'Mind';
  curseId: number | null;
  toDetect: number;
  toDisarm: number;
}
