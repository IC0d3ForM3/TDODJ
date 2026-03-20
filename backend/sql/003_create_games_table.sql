-- Creates per-user game instances from published dungons.
-- Each user can have one game row per source dungon.

CREATE TABLE IF NOT EXISTS games (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dungonid INTEGER NOT NULL,
  userkey UUID NOT NULL,
  createguidid UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled Dungon',
  description TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  "dungenJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  inventory JSONB NOT NULL DEFAULT '{}'::jsonb,
  monsters JSONB NOT NULL DEFAULT '{}'::jsonb,
  lastupdated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_games_dungonid
    FOREIGN KEY (dungonid)
    REFERENCES dungons (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_games_userkey
    FOREIGN KEY (userkey)
    REFERENCES users (key)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_games_createguidid
    FOREIGN KEY (createguidid)
    REFERENCES users (key)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT uq_games_dungonid_userkey
    UNIQUE (dungonid, userkey)
);

ALTER TABLE IF EXISTS games
  ADD COLUMN IF NOT EXISTS dungonid INTEGER,
  ADD COLUMN IF NOT EXISTS userkey UUID,
  ADD COLUMN IF NOT EXISTS createguidid UUID,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS intro TEXT,
  ADD COLUMN IF NOT EXISTS "dungenJson" JSONB,
  ADD COLUMN IF NOT EXISTS inventory JSONB,
  ADD COLUMN IF NOT EXISTS monsters JSONB,
  ADD COLUMN IF NOT EXISTS lastupdated TIMESTAMPTZ;

UPDATE games
SET
  name = COALESCE(NULLIF(BTRIM(name), ''), 'Untitled Dungon'),
  description = COALESCE(description, ''),
  intro = COALESCE(intro, ''),
  "dungenJson" = COALESCE("dungenJson", '{}'::jsonb),
  inventory = COALESCE(inventory, '{}'::jsonb),
  monsters = COALESCE(monsters, '{}'::jsonb),
  lastupdated = COALESCE(lastupdated, NOW())
WHERE
  name IS NULL OR BTRIM(name) = '' OR
  description IS NULL OR
  intro IS NULL OR
  "dungenJson" IS NULL OR
  inventory IS NULL OR
  monsters IS NULL OR
  lastupdated IS NULL;

ALTER TABLE IF EXISTS games ALTER COLUMN name SET DEFAULT 'Untitled Dungon';
ALTER TABLE IF EXISTS games ALTER COLUMN description SET DEFAULT '';
ALTER TABLE IF EXISTS games ALTER COLUMN intro SET DEFAULT '';
ALTER TABLE IF EXISTS games ALTER COLUMN "dungenJson" SET DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS games ALTER COLUMN inventory SET DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS games ALTER COLUMN monsters SET DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS games ALTER COLUMN lastupdated SET DEFAULT NOW();

ALTER TABLE IF EXISTS games ALTER COLUMN dungonid SET NOT NULL;
ALTER TABLE IF EXISTS games ALTER COLUMN userkey SET NOT NULL;
ALTER TABLE IF EXISTS games ALTER COLUMN createguidid SET NOT NULL;
ALTER TABLE IF EXISTS games ALTER COLUMN name SET NOT NULL;
ALTER TABLE IF EXISTS games ALTER COLUMN description SET NOT NULL;
ALTER TABLE IF EXISTS games ALTER COLUMN intro SET NOT NULL;
ALTER TABLE IF EXISTS games ALTER COLUMN "dungenJson" SET NOT NULL;
ALTER TABLE IF EXISTS games ALTER COLUMN inventory SET NOT NULL;
ALTER TABLE IF EXISTS games ALTER COLUMN monsters SET NOT NULL;
ALTER TABLE IF EXISTS games ALTER COLUMN lastupdated SET NOT NULL;

ALTER TABLE IF EXISTS games DROP CONSTRAINT IF EXISTS uq_games_dungonid_userkey;
ALTER TABLE IF EXISTS games
  ADD CONSTRAINT uq_games_dungonid_userkey UNIQUE (dungonid, userkey);

ALTER TABLE IF EXISTS games DROP CONSTRAINT IF EXISTS fk_games_dungonid;
ALTER TABLE IF EXISTS games
  ADD CONSTRAINT fk_games_dungonid
  FOREIGN KEY (dungonid)
  REFERENCES dungons (id)
  ON UPDATE CASCADE
  ON DELETE CASCADE;

ALTER TABLE IF EXISTS games DROP CONSTRAINT IF EXISTS fk_games_userkey;
ALTER TABLE IF EXISTS games
  ADD CONSTRAINT fk_games_userkey
  FOREIGN KEY (userkey)
  REFERENCES users (key)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

ALTER TABLE IF EXISTS games DROP CONSTRAINT IF EXISTS fk_games_createguidid;
ALTER TABLE IF EXISTS games
  ADD CONSTRAINT fk_games_createguidid
  FOREIGN KEY (createguidid)
  REFERENCES users (key)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_games_userkey ON games (userkey);
CREATE INDEX IF NOT EXISTS idx_games_dungonid ON games (dungonid);
CREATE INDEX IF NOT EXISTS idx_games_lastupdated ON games (lastupdated DESC);
