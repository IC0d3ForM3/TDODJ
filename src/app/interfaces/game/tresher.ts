import { ArmorType, CoinType, PotionEffectTarget, TresherType } from './creator-types';

export interface Tresher {
  id: number;
  type: TresherType;
  name: string;
  description: string;
  worth: number;
  curseID: number | null;
  trapID: number | null;
  HP: number | null;
  damage: number | null;
  hands: number | null;
  range: number | null;
  ammoType: string | null;
  speedReduction: number | null;
  armorType: ArmorType | null;
  coinType: CoinType | null;
  effectNumber: number | null;
  effectTarget: PotionEffectTarget | null;
  effectDuration: number | null;
  spReward: number;
}
