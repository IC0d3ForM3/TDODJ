DO $$
BEGIN
  IF to_regclass('public.items') IS NULL THEN
    RAISE EXCEPTION 'Table public.items does not exist. Run the base item-table migration first, such as 023_create_items_table.sql, or apply clean_schema.sql on a fresh database.';
  END IF;
END $$;

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS effecttopc TEXT,
  ADD COLUMN IF NOT EXISTS effecttopcvalue INTEGER NOT NULL DEFAULT 0;
