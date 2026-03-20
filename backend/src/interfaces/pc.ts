// Add isMainGame to PC and PC creation payload
export interface PCRecord {
  // ...existing fields...
  maingameid?: number | null;
}

export interface UpsertPCPayload {
  // ...existing fields...
  maingameid?: number | null;
}
