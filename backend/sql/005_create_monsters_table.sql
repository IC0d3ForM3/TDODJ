-- Creates user-owned monsters that can optionally be marked public.
-- Only admin users should be allowed to set ispublic = true via API logic.

CREATE TABLE IF NOT EXISTS monsters (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userguid UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Unnamed Monster',
  type TEXT NOT NULL DEFAULT 'Unknown',
  description TEXT NOT NULL DEFAULT '',
  hp INTEGER NOT NULL DEFAULT 1 CHECK (hp >= 0),
  movmenteconomy INTEGER NOT NULL DEFAULT 0 CHECK (movmenteconomy >= 0),
  ac INTEGER NOT NULL DEFAULT 10 CHECK (ac >= 0),
  runat INTEGER NOT NULL DEFAULT 0 CHECK (runat >= 0),
  numberofattacks INTEGER NOT NULL DEFAULT 0 CHECK (numberofattacks >= 0),
  attacks JSONB NOT NULL DEFAULT '[]'::jsonb,
  ispublic BOOLEAN NOT NULL DEFAULT FALSE,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_monsters_userguid
    FOREIGN KEY (userguid)
    REFERENCES users (key)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_monsters_userguid ON monsters (userguid);
CREATE INDEX IF NOT EXISTS idx_monsters_ispublic ON monsters (ispublic);
CREATE INDEX IF NOT EXISTS idx_monsters_updatedat ON monsters (updatedat DESC);
