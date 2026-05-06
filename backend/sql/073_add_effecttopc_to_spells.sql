-- Add effectToPc field to spells table for self-cast spell effects
ALTER TABLE spells
  ADD COLUMN IF NOT EXISTS effecttopc VARCHAR(50) DEFAULT NULL;
