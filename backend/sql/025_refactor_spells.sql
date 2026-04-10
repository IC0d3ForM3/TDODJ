-- Refactor spells table:
-- 1. Change range from VARCHAR to INTEGER
-- 2. Add effecton2 (2nd effect on)
-- 3. Add effectamount2 (second effect amount, can be negative)
-- 4. Add value, sp (skill points), successtestvalue
-- 5. Rename 'Site' → 'Sight' in stored data

-- Change range to integer (drop default first to allow type change, then re-add)
ALTER TABLE spells
  ALTER COLUMN range DROP DEFAULT;

ALTER TABLE spells
  ALTER COLUMN range TYPE INTEGER USING (
    CASE WHEN range ~ '^[0-9]+$' THEN range::INTEGER ELSE 0 END
  );

ALTER TABLE spells
  ALTER COLUMN range SET DEFAULT 0;

ALTER TABLE spells
  ADD COLUMN IF NOT EXISTS effecton2 VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS effectamount2 INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS value INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sp INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS successtestvalue INTEGER NOT NULL DEFAULT 0;

-- Fix 'Site' → 'Sight' in stored effecton / effectto values
UPDATE spells SET effecton = 'Sight' WHERE effecton = 'Site';
UPDATE spells SET effectto = 'Sight' WHERE effectto = 'Site';
