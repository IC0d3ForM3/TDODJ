// Add isMainGame to DungonRecord and UpsertDungonPayload
export interface DungonRecord {
  // ...existing fields...
  ismaingame: boolean;
}

export interface UpsertDungonPayload {
  // ...existing fields...
  ismaingame?: boolean;
}
