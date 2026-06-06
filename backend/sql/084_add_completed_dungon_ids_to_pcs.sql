ALTER TABLE IF EXISTS pcs
  ADD COLUMN IF NOT EXISTS completed_dungon_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_pcs_completed_dungon_ids_gin
  ON pcs USING GIN (completed_dungon_ids);
