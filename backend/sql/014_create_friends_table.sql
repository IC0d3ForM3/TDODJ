-- Creates active user friend links using user key UUIDs.

CREATE TABLE IF NOT EXISTS friends (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userurid UUID NOT NULL,
  friendurid UUID NOT NULL,
  isactivefriend BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_friends_userurid
    FOREIGN KEY (userurid)
    REFERENCES users (key)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_friends_friendurid
    FOREIGN KEY (friendurid)
    REFERENCES users (key)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT chk_friends_not_self
    CHECK (userurid <> friendurid),
  CONSTRAINT uq_friends_userurid_friendurid
    UNIQUE (userurid, friendurid)
);

ALTER TABLE IF EXISTS friends
  ADD COLUMN IF NOT EXISTS userurid UUID,
  ADD COLUMN IF NOT EXISTS friendurid UUID,
  ADD COLUMN IF NOT EXISTS isactivefriend BOOLEAN;

UPDATE friends
SET isactivefriend = COALESCE(isactivefriend, TRUE)
WHERE isactivefriend IS NULL;

ALTER TABLE IF EXISTS friends ALTER COLUMN userurid SET NOT NULL;
ALTER TABLE IF EXISTS friends ALTER COLUMN friendurid SET NOT NULL;
ALTER TABLE IF EXISTS friends ALTER COLUMN isactivefriend SET DEFAULT TRUE;
ALTER TABLE IF EXISTS friends ALTER COLUMN isactivefriend SET NOT NULL;

ALTER TABLE IF EXISTS friends DROP CONSTRAINT IF EXISTS fk_friends_userurid;
ALTER TABLE IF EXISTS friends
  ADD CONSTRAINT fk_friends_userurid
  FOREIGN KEY (userurid)
  REFERENCES users (key)
  ON UPDATE CASCADE
  ON DELETE CASCADE;

ALTER TABLE IF EXISTS friends DROP CONSTRAINT IF EXISTS fk_friends_friendurid;
ALTER TABLE IF EXISTS friends
  ADD CONSTRAINT fk_friends_friendurid
  FOREIGN KEY (friendurid)
  REFERENCES users (key)
  ON UPDATE CASCADE
  ON DELETE CASCADE;

ALTER TABLE IF EXISTS friends DROP CONSTRAINT IF EXISTS chk_friends_not_self;
ALTER TABLE IF EXISTS friends
  ADD CONSTRAINT chk_friends_not_self
  CHECK (userurid <> friendurid);

ALTER TABLE IF EXISTS friends DROP CONSTRAINT IF EXISTS uq_friends_userurid_friendurid;
ALTER TABLE IF EXISTS friends
  ADD CONSTRAINT uq_friends_userurid_friendurid
  UNIQUE (userurid, friendurid);

CREATE INDEX IF NOT EXISTS idx_friends_userurid ON friends (userurid);
CREATE INDEX IF NOT EXISTS idx_friends_friendurid ON friends (friendurid);
CREATE INDEX IF NOT EXISTS idx_friends_isactivefriend ON friends (isactivefriend);
