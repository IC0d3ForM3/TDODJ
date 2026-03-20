-- Migration: Add ismaingame flag to dungons table
ALTER TABLE dungons ADD COLUMN IF NOT EXISTS ismaingame BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure only one MainGame exists
CREATE UNIQUE INDEX IF NOT EXISTS uq_dungons_ismaingame_true ON dungons (ismaingame) WHERE ismaingame = TRUE;