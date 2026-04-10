export type PortalLook = 'starUp' | 'starDown' | 'magicDoor';

export interface PortalPlacement {
  id: number;
  name: string;
  description: string;
  look: PortalLook;
  startRow: number | null;
  startColumn: number | null;
  endRow: number | null;
  endColumn: number | null;
}
