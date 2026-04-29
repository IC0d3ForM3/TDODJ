-- Fix pcs table to match expected schema.
-- Adds missing columns and renames magicpower -> mp if needed.

ALTER TABLE pcs ADD COLUMN IF NOT EXISTS poisonresest INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pcs ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pcs' AND column_name = 'magicpower'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pcs' AND column_name = 'mp'
  ) THEN
    ALTER TABLE pcs RENAME COLUMN magicpower TO mp;
  END IF;
END $$;
