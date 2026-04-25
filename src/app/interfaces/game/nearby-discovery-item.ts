export interface NearbyDiscoveryItem {
  kind: 'Key' | 'Tresher' | 'Monster' | 'Text' | 'Item' | 'Potion' | 'Obstacle';
  name: string;
  description: string;
  row: number;
  column: number;
}
