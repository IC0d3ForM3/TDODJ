ALTER TABLE sounds ADD COLUMN IF NOT EXISTS assettype TEXT NOT NULL DEFAULT 'Other';
UPDATE sounds SET assettype = 'Other' WHERE assettype IS NULL;
