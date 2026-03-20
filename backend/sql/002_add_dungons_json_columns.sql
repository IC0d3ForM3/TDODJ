-- Adds JSON storage columns to dungons.
-- dungenJson uses quoted camelCase to match the requested column name.

ALTER TABLE IF EXISTS dungons
  ADD COLUMN IF NOT EXISTS "dungenJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS inventory JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS monsters JSONB NOT NULL DEFAULT '{}'::jsonb;
