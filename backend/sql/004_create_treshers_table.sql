-- Creates user-owned treshers that can optionally be marked public.
-- Only admin users should be allowed to set ispublic = true via the API layer.

CREATE TABLE IF NOT EXISTS treshers (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userguid UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Weapon', 'Armor', 'Coins', 'OtherTresher')),
  name TEXT NOT NULL DEFAULT 'Unnamed Tresher',
  description TEXT NOT NULL DEFAULT '',
  worth INTEGER NOT NULL DEFAULT 0 CHECK (worth >= 0),
  curseid INTEGER,
  trapid INTEGER,
  hp INTEGER,
  damage INTEGER,
  hands INTEGER,
  "range" INTEGER,
  ammotype TEXT,
  speedreduction INTEGER,
  armortype TEXT CHECK (
    armortype IS NULL OR armortype IN ('head', 'hand', 'body', 'arms', 'legs')
  ),
  cointype TEXT CHECK (
    cointype IS NULL OR cointype IN ('Gold', 'Silver', 'Copper', 'Tin')
  ),
  ispublic BOOLEAN NOT NULL DEFAULT FALSE,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_treshers_userguid
    FOREIGN KEY (userguid)
    REFERENCES users (key)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_treshers_userguid ON treshers (userguid);
CREATE INDEX IF NOT EXISTS idx_treshers_ispublic ON treshers (ispublic);
CREATE INDEX IF NOT EXISTS idx_treshers_updatedat ON treshers (updatedat DESC);
