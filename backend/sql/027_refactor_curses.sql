-- Refactor curses table:
-- 1. Add damage2 (second damage value)
-- 2. Fix 'Site' → 'Sight' in stored data

ALTER TABLE curses
  ADD COLUMN IF NOT EXISTS damage2 INTEGER NOT NULL DEFAULT 0;

-- Fix 'Site' → 'Sight' in stored effectto values
UPDATE curses SET effectto = 'Sight' WHERE effectto = 'Site';
UPDATE curses SET effectto2 = 'Sight' WHERE effectto2 = 'Site';
