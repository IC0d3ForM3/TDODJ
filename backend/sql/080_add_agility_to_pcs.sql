-- Adds agility stat to PCs.
-- Agility affects sneak attacks (Thieph) and ranged to-hit rolls.
-- Default 3 matches the standard human baseline movement AE.
ALTER TABLE IF EXISTS pcs
  ADD COLUMN IF NOT EXISTS agility INTEGER NOT NULL DEFAULT 3 CHECK (agility >= 0);
