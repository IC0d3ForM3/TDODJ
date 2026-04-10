-- Major tresher redesign:
-- Tresher changes from type-based item (Weapon/Armor/Coins/Potion)
-- to a treasure bag containing: coins + item refs + spell refs + curse refs

-- Add new coin columns
ALTER TABLE treshers
  ADD COLUMN IF NOT EXISTS gold INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS silver INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS copper INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zinc INTEGER NOT NULL DEFAULT 0;

-- Add item reference slots (1-4)
ALTER TABLE treshers
  ADD COLUMN IF NOT EXISTS item1id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS item2id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS item3id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS item4id INTEGER NULL;

-- Add spell reference slots (1-4)
ALTER TABLE treshers
  ADD COLUMN IF NOT EXISTS spell1id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS spell2id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS spell3id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS spell4id INTEGER NULL;

-- Add curse reference slots (1-2)
ALTER TABLE treshers
  ADD COLUMN IF NOT EXISTS curse1id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS curse2id INTEGER NULL;

-- Note: Old type-specific columns (type, worth, curseid, trapid, hp, damage, hands,
-- range, ammotype, speedreduction, armortype, cointype, effectnumber, effecttarget,
-- effectduration) are kept nullable for backward safety but no longer used in new UI.
