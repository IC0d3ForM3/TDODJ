-- Add potion reference slots to treshers table
ALTER TABLE treshers
  ADD COLUMN IF NOT EXISTS potion1id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS potion2id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS potion3id INTEGER NULL;
