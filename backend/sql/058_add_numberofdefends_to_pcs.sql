-- Adds number of defends per turn to player characters (default 1).
ALTER TABLE pcs
  ADD COLUMN IF NOT EXISTS numberofdefends INTEGER NOT NULL DEFAULT 1 CHECK (numberofdefends >= 1);
