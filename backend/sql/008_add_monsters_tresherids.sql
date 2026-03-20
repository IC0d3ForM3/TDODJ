-- Adds optional tresher id list to monsters.
-- Stores selected tresher IDs as jsonb array.

ALTER TABLE monsters
ADD COLUMN IF NOT EXISTS tresherids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_monsters_tresherids_gin ON monsters USING GIN (tresherids);
