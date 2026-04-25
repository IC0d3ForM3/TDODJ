import { Trap } from './trap';

export interface Tresher {
  id: number;
  type?: string;
  name: string;
  description: string;
  gold: number;
  silver: number;
  copper: number;
  zinc: number;
  item1Id: number | null;
  item2Id: number | null;
  item3Id: number | null;
  item4Id: number | null;
  spell1Id: number | null;
  spell2Id: number | null;
  spell3Id: number | null;
  spell4Id: number | null;
  curse1Id: number | null;
  curse2Id: number | null;
  potion1Id: number | null;
  potion2Id: number | null;
  potion3Id: number | null;
  imageId: number | null;
  soundId: number | null;
  spReward: number;
  trap: Trap | null;
  isquest?: boolean;
}
