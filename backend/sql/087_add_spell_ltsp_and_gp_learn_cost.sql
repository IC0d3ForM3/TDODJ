-- Migration 087: split spell lifetime SP requirement and GP learn cost.
--
-- Existing meaning cleanup:
-- - minltsp: minimum lifetime SP required to learn/cast a spell
-- - costtolearn: SP cost to learn (already exists)
-- - learncostgp: GP cost to learn (new)

ALTER TABLE spells
  ADD COLUMN IF NOT EXISTS minltsp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS learncostgp integer NOT NULL DEFAULT 0;

-- Backfill minltsp from legacy sp where available.
UPDATE spells
SET minltsp = GREATEST(0, COALESCE(sp, 0))
WHERE minltsp = 0;
