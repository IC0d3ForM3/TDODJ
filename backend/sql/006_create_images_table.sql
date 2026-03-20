-- Creates user-owned image records that reference files under /public/images.
-- Only admin users should be allowed to set ispublic = true via API logic.

CREATE TABLE IF NOT EXISTS images (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userguid UUID NOT NULL,
  path TEXT NOT NULL,
  ispublic BOOLEAN NOT NULL DEFAULT FALSE,
  isactive BOOLEAN NOT NULL DEFAULT TRUE,
  name TEXT NOT NULL DEFAULT 'Unnamed Image',
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_images_userguid
    FOREIGN KEY (userguid)
    REFERENCES users (key)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_images_userguid ON images (userguid);
CREATE INDEX IF NOT EXISTS idx_images_ispublic ON images (ispublic);
CREATE INDEX IF NOT EXISTS idx_images_isactive ON images (isactive);
CREATE INDEX IF NOT EXISTS idx_images_updatedat ON images (updatedat DESC);
