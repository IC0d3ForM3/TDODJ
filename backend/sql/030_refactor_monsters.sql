-- Refactor monsters table:
-- 1. Add soundid
-- 2. Add magic (magic score/stat)

ALTER TABLE monsters
  ADD COLUMN IF NOT EXISTS soundid INTEGER NULL,
  ADD COLUMN IF NOT EXISTS magic INTEGER NOT NULL DEFAULT 0;
