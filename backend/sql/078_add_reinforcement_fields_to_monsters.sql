ALTER TABLE monsters
  ADD COLUMN IF NOT EXISTS reinforcementcount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reinforcementmonstername TEXT;