-- Add uses column to items table.
-- NULL means unlimited uses; a positive integer limits how many times it can be used.
ALTER TABLE items ADD COLUMN IF NOT EXISTS uses INTEGER NULL;
