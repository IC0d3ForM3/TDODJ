-- Rename pcs.agility to pcs.dexterity (Dark Dungeons stat rework, Phase 1)
-- and add a new pcs.awareness column. Monsters already have `awareness`
-- (see 077_add_awareness_to_monsters.sql); PCs did not until now.
ALTER TABLE pcs RENAME COLUMN agility TO dexterity;
ALTER TABLE pcs ADD COLUMN IF NOT EXISTS awareness INTEGER NOT NULL DEFAULT 5;
