DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pcs' AND column_name = 'movmenteconomy'
  ) THEN
    ALTER TABLE pcs RENAME COLUMN movmenteconomy TO actioneconomy;
  END IF;
END $$;
ALTER TABLE pcs ADD COLUMN IF NOT EXISTS mind INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pcs ADD COLUMN IF NOT EXISTS stamina INTEGER NOT NULL DEFAULT 0;
