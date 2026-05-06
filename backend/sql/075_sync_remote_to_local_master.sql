-- 075: Sync remote schema to local master
-- Generated from compare-local-remote-schema output.

-- games: align with local-master defaults/nullability from 066_align_dungons_and_games_schema.sql
ALTER TABLE games
  ALTER COLUMN createguidid DROP NOT NULL,
  ALTER COLUMN name SET DEFAULT '',
  ALTER COLUMN monsters SET DEFAULT '[]'::jsonb;

-- items: align with 070_add_weapon_effect_fields_to_items.sql + 071_add_effect_to_pc_fields_to_items.sql
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS weaponeffecttype VARCHAR(50) NOT NULL DEFAULT 'Blood',
  ADD COLUMN IF NOT EXISTS weaponeffectcolor VARCHAR(7) NOT NULL DEFAULT '#cc0000',
  ADD COLUMN IF NOT EXISTS effecttopc TEXT,
  ADD COLUMN IF NOT EXISTS effecttopcvalue INTEGER NOT NULL DEFAULT 0;

UPDATE items
SET weaponeffecttype = 'Blood'
WHERE weaponeffecttype IS NULL OR TRIM(weaponeffecttype) = '';

UPDATE items
SET weaponeffectcolor = '#cc0000'
WHERE weaponeffectcolor IS NULL OR TRIM(weaponeffectcolor) = '';

-- spells: align with 067, 069, 073, 074 migrations
ALTER TABLE spells
  ADD COLUMN IF NOT EXISTS numberoftargets INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS effecttype VARCHAR(50) NOT NULL DEFAULT 'Other',
  ADD COLUMN IF NOT EXISTS effectcolor VARCHAR(20) NOT NULL DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS effecttopc VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS effectonpc1 BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS effectonpc2 BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS range1 INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS range2 INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lastfor1 INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lastfor2 INTEGER NOT NULL DEFAULT 0;

UPDATE spells
SET
  range1 = COALESCE(range, 0),
  range2 = COALESCE(range, 0),
  lastfor1 = COALESCE(lastfor, 0),
  lastfor2 = COALESCE(lastfor, 0),
  effectonpc1 = CASE WHEN COALESCE(range, 0) = 0 THEN TRUE ELSE effectonpc1 END,
  effectonpc2 = CASE WHEN COALESCE(range, 0) = 0 THEN TRUE ELSE effectonpc2 END
WHERE
  range1 = 0
  AND range2 = 0
  AND lastfor1 = 0
  AND lastfor2 = 0
  AND effectonpc1 = FALSE
  AND effectonpc2 = FALSE;

-- pcs: local schema uses "mp" (068_fix_pcs_local_schema.sql); remove remote-only legacy field
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pcs'
      AND column_name = 'magicpower'
  ) THEN
    ALTER TABLE pcs DROP COLUMN magicpower;
  END IF;
END $$;

-- treshers: remove remote-only columns to match local master exactly
ALTER TABLE treshers
  DROP COLUMN IF EXISTS effectduration,
  DROP COLUMN IF EXISTS effectnumber,
  DROP COLUMN IF EXISTS effecttarget;
