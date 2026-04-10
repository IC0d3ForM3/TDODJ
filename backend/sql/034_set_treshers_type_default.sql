-- The original treshers table had a NOT NULL type column from the type-based
-- item design. Migration 029 redesigned treshers as treasure bags but left
-- the column without a default. Set a default so inserts don't require it.
ALTER TABLE treshers ALTER COLUMN type SET DEFAULT 'OtherTresher';

-- Backfill any existing rows that may have a null type (shouldn't exist, but safe)
UPDATE treshers SET type = 'OtherTresher' WHERE type IS NULL;
