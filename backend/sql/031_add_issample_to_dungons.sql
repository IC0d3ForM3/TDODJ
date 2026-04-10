-- Migration: Add issample flag to dungons table
-- Admins can mark a dungon as a sample game that any user can play as a demo/tutorial.

ALTER TABLE dungons ADD COLUMN IF NOT EXISTS issample BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_dungons_issample ON dungons (issample) WHERE issample = TRUE;
