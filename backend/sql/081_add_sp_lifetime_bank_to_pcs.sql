-- Splits the single 'sp' column into two:
--   sp_lifetime  = running career total, never decreases (used for dungeon access gates)
--   sp_bank      = spendable pool at the shop (can be spent on upgrades)
--
-- The old 'sp' column already functioned as the spendable bank, so existing
-- values seed sp_bank directly.  sp_lifetime also starts at the same value
-- because we cannot retroactively know what was previously spent.

ALTER TABLE IF EXISTS pcs RENAME COLUMN sp TO sp_lifetime;

ALTER TABLE IF EXISTS pcs
  ADD COLUMN IF NOT EXISTS sp_bank INTEGER NOT NULL DEFAULT 0 CHECK (sp_bank >= 0);

-- Seed sp_bank = sp_lifetime for all existing rows
UPDATE pcs SET sp_bank = sp_lifetime;
