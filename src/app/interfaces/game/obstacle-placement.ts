export interface ObstaclePlacement {
  id: number;
  row: number;
  column: number;
  name: string;
  note: string;
  imageId: number | null;
  hp: number;
  isIndestructible: boolean;
  containsItemId: number | null;
  heightPercent: number;                        // 1–100 (100 = floor to ceiling)
  heightAnchor: 'floor' | 'ceiling';            // only matters if heightPercent < 100
  widthPercent: number;                         // 1–100 (100 = fills tile view)
  widthAnchor: 'center' | 'east' | 'west';      // only matters if widthPercent < 100
  color: string | null;                         // CSS color for fallback; null = white stone
  // runtime game state (mutable during play, persisted with save):
  currentHp?: number;
  isDestroyed?: boolean;
  itemTaken?: boolean;
}
