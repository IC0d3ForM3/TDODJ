export interface NearbyDiscoveryItem {
  kind: 'Key' | 'Tresher' | 'Monster' | 'Text';
  name: string;
  description: string;
  row: number;
  column: number;
}
