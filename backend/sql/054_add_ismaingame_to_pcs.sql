-- Migration: Add ismaingame flag to pcs table.
-- A main-game PC can only be used in main-game dungeons and vice versa.

ALTER TABLE pcs ADD COLUMN IF NOT EXISTS ismaingame BOOLEAN NOT NULL DEFAULT FALSE;
