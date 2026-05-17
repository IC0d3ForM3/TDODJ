ALTER TABLE images ADD COLUMN IF NOT EXISTS assettype TEXT NOT NULL DEFAULT 'Other';
UPDATE images SET assettype = 'Other' WHERE assettype IS NULL;
