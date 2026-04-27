CREATE TABLE IF NOT EXISTS contact_requests (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  problem     TEXT NOT NULL,
  username    TEXT,
  message     TEXT NOT NULL,
  createdat   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  isread      BOOLEAN NOT NULL DEFAULT FALSE,
  isresponded BOOLEAN NOT NULL DEFAULT FALSE
);
