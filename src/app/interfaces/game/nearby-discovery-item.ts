export interface NearbyDiscoveryItem {
  kind: 'Key' | 'Tresher' | 'Monster' | 'Text' | 'Item' | 'Potion' | 'Spell' | 'Obstacle';
  name: string;
  description: string;
  row: number;
  column: number;
}
