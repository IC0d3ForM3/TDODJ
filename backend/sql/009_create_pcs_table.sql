-- Creates player characters (PCs) owned by a user.

CREATE TABLE IF NOT EXISTS pcs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userguid UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Unnamed PC',
  species TEXT NOT NULL DEFAULT 'Human',
  type TEXT NOT NULL DEFAULT 'Figher',
  imageid INTEGER NULL,
  maxhp INTEGER NOT NULL DEFAULT 10 CHECK (maxhp >= 1),
  currenthp INTEGER NOT NULL DEFAULT 10 CHECK (currenthp >= 0),
  ac INTEGER NOT NULL DEFAULT 10 CHECK (ac >= 0),
  movmenteconomy INTEGER NOT NULL DEFAULT 0 CHECK (movmenteconomy >= 0),
  poisonresest INTEGER NOT NULL DEFAULT 0,
  mp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  strength INTEGER NOT NULL DEFAULT 0,
  rangeofview INTEGER NOT NULL DEFAULT 5 CHECK (rangeofview >= 0),
  primarytresherid INTEGER NULL,
  weapontresherid INTEGER NULL,
  tresherids JSONB NOT NULL DEFAULT '[]'::jsonb,
  headarmortresherid INTEGER NULL,
  bodyarmortresherid INTEGER NULL,
  leftarmarmortresherid INTEGER NULL,
  rightarmarmortresherid INTEGER NULL,
  leftlegarmortresherid INTEGER NULL,
  rightlegarmortresherid INTEGER NULL,
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_pcs_userguid
    FOREIGN KEY (userguid)
    REFERENCES users (key)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_pcs_imageid
    FOREIGN KEY (imageid)
    REFERENCES images (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_pcs_primarytresherid
    FOREIGN KEY (primarytresherid)
    REFERENCES treshers (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_pcs_weapontresherid
    FOREIGN KEY (weapontresherid)
    REFERENCES treshers (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_pcs_headarmortresherid
    FOREIGN KEY (headarmortresherid)
    REFERENCES treshers (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_pcs_bodyarmortresherid
    FOREIGN KEY (bodyarmortresherid)
    REFERENCES treshers (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_pcs_leftarmarmortresherid
    FOREIGN KEY (leftarmarmortresherid)
    REFERENCES treshers (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_pcs_rightarmarmortresherid
    FOREIGN KEY (rightarmarmortresherid)
    REFERENCES treshers (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_pcs_leftlegarmortresherid
    FOREIGN KEY (leftlegarmortresherid)
    REFERENCES treshers (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_pcs_rightlegarmortresherid
    FOREIGN KEY (rightlegarmortresherid)
    REFERENCES treshers (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pcs_userguid ON pcs (userguid);
CREATE INDEX IF NOT EXISTS idx_pcs_updatedat ON pcs (updatedat DESC);
CREATE INDEX IF NOT EXISTS idx_pcs_tresherids_gin ON pcs USING GIN (tresherids);
