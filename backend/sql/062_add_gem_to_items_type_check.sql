-- Add 'gem' type (and also backfill ring/necklace which were missing from the constraint)
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_type_check;
ALTER TABLE items ADD CONSTRAINT items_type_check
  CHECK (type IN ('weapon', 'armor', 'pick', 'light', 'ring', 'necklace', 'gem', 'other'));
