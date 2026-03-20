-- Adds dungeon publish visibility controls.
-- A published dungeon can be public, or shared to selected active friends.

ALTER TABLE IF EXISTS dungons
  ADD COLUMN IF NOT EXISTS ispublic BOOLEAN;

UPDATE dungons
SET ispublic = COALESCE(ispublic, TRUE)
WHERE ispublic IS NULL;

ALTER TABLE IF EXISTS dungons ALTER COLUMN ispublic SET DEFAULT TRUE;
ALTER TABLE IF EXISTS dungons ALTER COLUMN ispublic SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dungons_ispublic ON dungons (ispublic);

CREATE TABLE IF NOT EXISTS dungonfriends (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dungonid INTEGER NOT NULL,
  friendurid UUID NOT NULL,
  isactivefriend BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_dungonfriends_dungonid
    FOREIGN KEY (dungonid)
    REFERENCES dungons (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_dungonfriends_friendurid
    FOREIGN KEY (friendurid)
    REFERENCES users (key)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT uq_dungonfriends_dungonid_friendurid
    UNIQUE (dungonid, friendurid)
);

ALTER TABLE IF EXISTS dungonfriends
  ADD COLUMN IF NOT EXISTS friendurid UUID,
  ADD COLUMN IF NOT EXISTS isactivefriend BOOLEAN,
  ADD COLUMN IF NOT EXISTS dungonid INTEGER;

UPDATE dungonfriends
SET isactivefriend = COALESCE(isactivefriend, TRUE)
WHERE isactivefriend IS NULL;

ALTER TABLE IF EXISTS dungonfriends ALTER COLUMN dungonid SET NOT NULL;
ALTER TABLE IF EXISTS dungonfriends ALTER COLUMN friendurid SET NOT NULL;
ALTER TABLE IF EXISTS dungonfriends ALTER COLUMN isactivefriend SET DEFAULT TRUE;
ALTER TABLE IF EXISTS dungonfriends ALTER COLUMN isactivefriend SET NOT NULL;

ALTER TABLE IF EXISTS dungonfriends DROP CONSTRAINT IF EXISTS fk_dungonfriends_dungonid;
ALTER TABLE IF EXISTS dungonfriends
  ADD CONSTRAINT fk_dungonfriends_dungonid
  FOREIGN KEY (dungonid)
  REFERENCES dungons (id)
  ON UPDATE CASCADE
  ON DELETE CASCADE;

ALTER TABLE IF EXISTS dungonfriends DROP CONSTRAINT IF EXISTS fk_dungonfriends_friendurid;
ALTER TABLE IF EXISTS dungonfriends
  ADD CONSTRAINT fk_dungonfriends_friendurid
  FOREIGN KEY (friendurid)
  REFERENCES users (key)
  ON UPDATE CASCADE
  ON DELETE CASCADE;

ALTER TABLE IF EXISTS dungonfriends DROP CONSTRAINT IF EXISTS uq_dungonfriends_dungonid_friendurid;
ALTER TABLE IF EXISTS dungonfriends
  ADD CONSTRAINT uq_dungonfriends_dungonid_friendurid
  UNIQUE (dungonid, friendurid);

CREATE INDEX IF NOT EXISTS idx_dungonfriends_dungonid ON dungonfriends (dungonid);
CREATE INDEX IF NOT EXISTS idx_dungonfriends_friendurid ON dungonfriends (friendurid);
CREATE INDEX IF NOT EXISTS idx_dungonfriends_isactivefriend ON dungonfriends (isactivefriend);
