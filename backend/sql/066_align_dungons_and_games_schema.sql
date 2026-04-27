-- 066: Align dungons and games tables with the codebase schema
-- The clean_schema.sql diverged from the original migrations.
-- This migration adds all missing columns the backend code relies on.

-- ── dungons ──────────────────────────────────────────────────────────────────
-- Add key (creator user UUID, mirrors userkey)
ALTER TABLE dungons ADD COLUMN IF NOT EXISTS key UUID;
UPDATE dungons SET key = userguid WHERE key IS NULL;
ALTER TABLE dungons ALTER COLUMN key SET NOT NULL;

-- Add userkey (code uses userkey, DB has userguid)
ALTER TABLE dungons ADD COLUMN IF NOT EXISTS userkey UUID;
UPDATE dungons SET userkey = userguid WHERE userkey IS NULL;
ALTER TABLE dungons ALTER COLUMN userkey SET NOT NULL;

-- Add status (derived from ispublished + isapproved booleans)
ALTER TABLE dungons ADD COLUMN IF NOT EXISTS status TEXT;
UPDATE dungons SET status =
  CASE
    WHEN isapproved = TRUE THEN 'approved'
    WHEN ispublished = TRUE THEN 'published'
    ELSE 'inproces'
  END
WHERE status IS NULL;
ALTER TABLE dungons ALTER COLUMN status SET NOT NULL;
ALTER TABLE dungons ALTER COLUMN status SET DEFAULT 'inproces';

-- Add approvedby / approveddate
ALTER TABLE dungons ADD COLUMN IF NOT EXISTS approvedby UUID DEFAULT NULL;
ALTER TABLE dungons ADD COLUMN IF NOT EXISTS approveddate TIMESTAMPTZ DEFAULT NULL;

-- Add dungenJson (code uses this name; DB has dungonjson)
ALTER TABLE dungons ADD COLUMN IF NOT EXISTS "dungenJson" JSONB;
UPDATE dungons SET "dungenJson" = dungonjson WHERE "dungenJson" IS NULL;
ALTER TABLE dungons ALTER COLUMN "dungenJson" SET NOT NULL;
ALTER TABLE dungons ALTER COLUMN "dungenJson" SET DEFAULT '{}'::jsonb;

-- Add inventory and monsters columns to dungons (used in startGameFromPublishedDungon)
ALTER TABLE dungons ADD COLUMN IF NOT EXISTS inventory JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE dungons ADD COLUMN IF NOT EXISTS monsters  JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ── games ────────────────────────────────────────────────────────────────────
-- Add all missing columns the code SELECTs / INSERTs
ALTER TABLE games ADD COLUMN IF NOT EXISTS createguidid UUID DEFAULT NULL;
ALTER TABLE games ADD COLUMN IF NOT EXISTS name         TEXT NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN IF NOT EXISTS description  TEXT NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN IF NOT EXISTS intro        TEXT NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN IF NOT EXISTS "dungenJson" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE games ADD COLUMN IF NOT EXISTS inventory    JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE games ADD COLUMN IF NOT EXISTS monsters     JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Add unique constraint needed by ON CONFLICT in startGameFromPublishedDungon
ALTER TABLE games DROP CONSTRAINT IF EXISTS uq_games_dungonid_userkey;
ALTER TABLE games ADD CONSTRAINT uq_games_dungonid_userkey UNIQUE (dungonid, userkey);
