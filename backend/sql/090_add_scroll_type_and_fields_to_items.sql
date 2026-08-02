-- Add 'scroll' item type: a single-use (or limited-use) item that casts a
-- referenced spell. scrollspellid points at the spells table; magiccost is
-- the MP cost paid by the reader (independent of the spell's own magicCost,
-- so scrolls can be cheaper/pricier than learning the spell outright).
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_type_check;
ALTER TABLE items ADD CONSTRAINT items_type_check
  CHECK (type IN ('weapon', 'armor', 'pick', 'light', 'ring', 'necklace', 'gem', 'scroll', 'other'));

ALTER TABLE items ADD COLUMN IF NOT EXISTS scrollspellid INTEGER NULL REFERENCES spells(id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN IF NOT EXISTS magiccost INTEGER NOT NULL DEFAULT 1;
