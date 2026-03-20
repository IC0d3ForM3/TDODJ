-- Adds minimum and maximum skill points requirements for dungeons.
-- These define the range of lifetime SP a PC must have to play this dungeon.

ALTER TABLE IF EXISTS dungons
  ADD COLUMN IF NOT EXISTS minsplifetime INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maxsplifetime INTEGER NOT NULL DEFAULT 1000000;

CREATE INDEX IF NOT EXISTS idx_dungons_sp_requirements ON dungons (minsplifetime, maxsplifetime);
