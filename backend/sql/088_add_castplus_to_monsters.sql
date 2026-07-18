-- Add Cast+ stat for monsters.
-- Used by monster spell casting: Cast+ adds to spell to-hit, and floor(Cast+/2) adds to spell damage.

ALTER TABLE monsters
ADD COLUMN IF NOT EXISTS castplus INTEGER NOT NULL DEFAULT 0;
