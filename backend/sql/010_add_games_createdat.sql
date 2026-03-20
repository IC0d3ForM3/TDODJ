-- Adds a createdat timestamp column to games so we can show when a game was first started.

ALTER TABLE IF EXISTS games
  ADD COLUMN IF NOT EXISTS createdat TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill existing rows: set createdat = lastupdated for games that already exist.
UPDATE games SET createdat = lastupdated WHERE createdat = NOW();
