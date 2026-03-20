ALTER TABLE monsters
ADD COLUMN IF NOT EXISTS keyids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_monsters_keyids ON monsters USING GIN (keyids);
