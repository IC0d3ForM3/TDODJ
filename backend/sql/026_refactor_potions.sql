-- Refactor potions table:
-- 1. Add effectto2 (2nd effect target)
-- 2. Add effectamount2 (second effect amount, can be negative)
-- 3. Allow effectnumber to be negative (no DB constraint needed — controlled at app layer)
-- Note: effecttime stays as-is (used as lastFor) and effectnumber stays as-is (used as effectAmount)
-- 4. Fix 'Site' → 'Sight' in stored data

ALTER TABLE potions
  ADD COLUMN IF NOT EXISTS effectto2 VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS effectamount2 INTEGER NOT NULL DEFAULT 0;

-- Fix 'Site' → 'Sight' in stored effectto values
UPDATE potions SET effectto = 'Sight' WHERE effectto = 'Site';
UPDATE potions SET effectto2 = 'Sight' WHERE effectto2 = 'Site';
