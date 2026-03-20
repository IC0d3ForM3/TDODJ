-- Adds optional SP reward field for doors.

ALTER TABLE IF EXISTS dungons
  ADD COLUMN IF NOT EXISTS doorsprreward JSONB DEFAULT NULL;

-- Indexes for storing door SP rewards by door ID in JSON format
-- Structure: { "doorId": spValue, ... }
