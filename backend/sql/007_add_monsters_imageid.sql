-- Adds optional image reference to monsters.
-- A monster image can reference an image row by id.

ALTER TABLE monsters
ADD COLUMN IF NOT EXISTS imageid INTEGER NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_monsters_imageid'
  ) THEN
    ALTER TABLE monsters
    ADD CONSTRAINT fk_monsters_imageid
      FOREIGN KEY (imageid)
      REFERENCES images (id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_monsters_imageid ON monsters (imageid);
