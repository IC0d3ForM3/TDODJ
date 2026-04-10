-- Creates user-owned sound records that reference files under /public/sounds.
-- Only admin users should be allowed to set ispublic = true via API logic.

CREATE TABLE IF NOT EXISTS sounds (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userguid UUID NOT NULL,
  path TEXT NOT NULL,
  ispublic BOOLEAN NOT NULL DEFAULT FALSE,
  isactive BOOLEAN NOT NULL DEFAULT TRUE,
  name TEXT NOT NULL DEFAULT 'Unnamed Sound',
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_sounds_userguid
    FOREIGN KEY (userguid)
    REFERENCES users (key)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sounds_userguid ON sounds (userguid);
CREATE INDEX IF NOT EXISTS idx_sounds_ispublic ON sounds (ispublic);
CREATE INDEX IF NOT EXISTS idx_sounds_isactive ON sounds (isactive);
CREATE INDEX IF NOT EXISTS idx_sounds_updatedat ON sounds (updatedat DESC);
