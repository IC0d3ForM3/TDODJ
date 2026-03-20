-- Add Potion type and potion-specific columns to treshers table.

-- Widen the type CHECK constraint to include 'Potion'.
ALTER TABLE treshers DROP CONSTRAINT IF EXISTS treshers_type_check;
ALTER TABLE treshers ADD CONSTRAINT treshers_type_check
  CHECK (type IN ('Weapon', 'Armor', 'Coins', 'Potion', 'OtherTresher'));

-- effectnumber: the +/- value the potion applies (can be negative).
ALTER TABLE treshers ADD COLUMN IF NOT EXISTS effectnumber INTEGER;

-- effecttarget: what the potion affects (Health, AC, or AE).
ALTER TABLE treshers ADD COLUMN IF NOT EXISTS effecttarget TEXT
  CHECK (effecttarget IS NULL OR effecttarget IN ('Health', 'AC', 'AE'));

-- effectduration: how many turns the effect lasts (for AC/AE potions).
ALTER TABLE treshers ADD COLUMN IF NOT EXISTS effectduration INTEGER;
