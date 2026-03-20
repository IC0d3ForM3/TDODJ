-- Creates the dungons table with constrained status values.
-- The dungons.key value is the creator user's key.

CREATE TABLE IF NOT EXISTS dungons (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key UUID NOT NULL,
  userkey UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled Dungon',
  description TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('inproces', 'published', 'pending', 'approved')),
  approvedby UUID,
  approveddate TIMESTAMPTZ,
  CONSTRAINT fk_dungons_userkey
    FOREIGN KEY (userkey)
    REFERENCES users (key)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_dungons_key
    FOREIGN KEY (key)
    REFERENCES users (key)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_dungons_approvedby
    FOREIGN KEY (approvedby)
    REFERENCES users (key)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT chk_dungons_key_matches_userkey
    CHECK (key = userkey),
  CONSTRAINT chk_dungons_approval_fields
    CHECK (
      (status = 'approved' AND approvedby IS NOT NULL AND approveddate IS NOT NULL)
      OR (status <> 'approved')
    )
);

ALTER TABLE IF EXISTS dungons ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE IF EXISTS dungons ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE IF EXISTS dungons ADD COLUMN IF NOT EXISTS intro TEXT;
ALTER TABLE IF EXISTS dungons ALTER COLUMN key DROP DEFAULT;
ALTER TABLE IF EXISTS dungons DROP CONSTRAINT IF EXISTS dungons_key_key;

UPDATE dungons
SET key = userkey
WHERE key IS DISTINCT FROM userkey;

ALTER TABLE IF EXISTS dungons DROP CONSTRAINT IF EXISTS fk_dungons_key;
ALTER TABLE IF EXISTS dungons
  ADD CONSTRAINT fk_dungons_key
  FOREIGN KEY (key)
  REFERENCES users (key)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

ALTER TABLE IF EXISTS dungons DROP CONSTRAINT IF EXISTS chk_dungons_key_matches_userkey;
ALTER TABLE IF EXISTS dungons
  ADD CONSTRAINT chk_dungons_key_matches_userkey
  CHECK (key = userkey);

UPDATE dungons
SET
  name = COALESCE(NULLIF(BTRIM(name), ''), 'Untitled Dungon'),
  description = COALESCE(description, ''),
  intro = COALESCE(intro, '')
WHERE name IS NULL OR BTRIM(name) = '' OR description IS NULL OR intro IS NULL;

ALTER TABLE IF EXISTS dungons ALTER COLUMN name SET DEFAULT 'Untitled Dungon';
ALTER TABLE IF EXISTS dungons ALTER COLUMN description SET DEFAULT '';
ALTER TABLE IF EXISTS dungons ALTER COLUMN intro SET DEFAULT '';
ALTER TABLE IF EXISTS dungons ALTER COLUMN name SET NOT NULL;
ALTER TABLE IF EXISTS dungons ALTER COLUMN description SET NOT NULL;
ALTER TABLE IF EXISTS dungons ALTER COLUMN intro SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dungons_userkey ON dungons (userkey);
CREATE INDEX IF NOT EXISTS idx_dungons_key ON dungons (key);
CREATE INDEX IF NOT EXISTS idx_dungons_status ON dungons (status);
