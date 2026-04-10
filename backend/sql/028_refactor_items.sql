-- Refactor items table:
-- 1. Add effectvalue (single effect value, replaces effectTo/effectTo2/damage/damage2)
-- 2. Widen type constraint to include 'pick' and 'light'
-- 3. Old complex fields kept for data safety but not used in new UI

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_type_check;
ALTER TABLE items ADD CONSTRAINT items_type_check
  CHECK (type IN ('weapon', 'armor', 'pick', 'light', 'other'));

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS effectvalue INTEGER NOT NULL DEFAULT 0;
