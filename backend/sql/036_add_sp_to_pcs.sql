-- Adds lifetime skill points counter to PCs.
ALTER TABLE IF EXISTS pcs
  ADD COLUMN IF NOT EXISTS sp INTEGER NOT NULL DEFAULT 0 CHECK (sp >= 0);
