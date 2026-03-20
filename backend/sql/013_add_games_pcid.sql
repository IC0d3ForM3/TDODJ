-- Adds a pcid column to games so each game session is linked to a player character.

ALTER TABLE IF EXISTS games
  ADD COLUMN IF NOT EXISTS pcid INTEGER DEFAULT NULL;

-- Add foreign key only if the pcs table exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pcs') THEN
    BEGIN
      ALTER TABLE games
        ADD CONSTRAINT fk_games_pcid
        FOREIGN KEY (pcid) REFERENCES pcs (id)
        ON UPDATE CASCADE ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

-- Replace the old unique constraint (dungonid, userkey) with (dungonid, userkey, pcid)
-- so a user can start the same dungon with different PCs.
ALTER TABLE IF EXISTS games
  DROP CONSTRAINT IF EXISTS uq_games_dungonid_userkey;

ALTER TABLE IF EXISTS games
  ADD CONSTRAINT uq_games_dungonid_userkey_pcid
  UNIQUE NULLS NOT DISTINCT (dungonid, userkey, pcid);
