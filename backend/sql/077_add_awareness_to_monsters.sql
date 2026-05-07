-- Add awareness stat to monsters (used for Sneek checks by the player)
-- Default 5 represents average alertness

ALTER TABLE monsters ADD COLUMN IF NOT EXISTS awareness INTEGER NOT NULL DEFAULT 5;

-- Ensure all existing rows have the default value
UPDATE monsters SET awareness = 5 WHERE awareness IS NULL;
