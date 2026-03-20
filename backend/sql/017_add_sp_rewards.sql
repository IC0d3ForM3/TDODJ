-- Adds SP reward fields for entities that award skill points.

ALTER TABLE IF EXISTS monsters
  ADD COLUMN IF NOT EXISTS spreward INTEGER NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS treshers
  ADD COLUMN IF NOT EXISTS spreward INTEGER NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS dungons
  ADD COLUMN IF NOT EXISTS spreward INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_monsters_spreward ON monsters (spreward);
CREATE INDEX IF NOT EXISTS idx_treshers_spreward ON treshers (spreward);
CREATE INDEX IF NOT EXISTS idx_dungons_spreward ON dungons (spreward);
