-- Migration 086: Add spell and potion dice metadata fields.
--
-- Spells:
--   effectDiceCount/effectDiceSides represent Effect 1 as XdY.
--   effectAmount2DiceCount/effectAmount2DiceSides represent Effect 2 as XdY.
--
-- Potions:
--   effectAmountMin + effectAmountDiceCount/effectAmountDiceSides represent Effect 1 as min + XdY.
--   effectAmount2Min + effectAmount2DiceCount/effectAmount2DiceSides represent Effect 2 as min + XdY.
--
-- Existing numeric effect values are preserved by converting legacy values into a default 1dN roll,
-- with min set to 0.

ALTER TABLE spells
  ADD COLUMN IF NOT EXISTS effectdicecount integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS effectdicesides integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effectamount2dicecount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effectamount2dicesides integer NOT NULL DEFAULT 0;

UPDATE spells
SET
  effectdicecount = CASE WHEN GREATEST(0, COALESCE(damage, 0)) > 0 THEN 1 ELSE 0 END,
  effectdicesides = GREATEST(0, COALESCE(damage, 0)),
  effectamount2dicecount = CASE WHEN GREATEST(0, COALESCE(effectamount2, 0)) > 0 THEN 1 ELSE 0 END,
  effectamount2dicesides = GREATEST(0, COALESCE(effectamount2, 0));

ALTER TABLE potions
  ADD COLUMN IF NOT EXISTS effectnumbermin integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effectnumberdicecount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effectnumberdicesides integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effectamount2min integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effectamount2dicecount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effectamount2dicesides integer NOT NULL DEFAULT 0;

UPDATE potions
SET
  effectnumbermin = 0,
  effectnumberdicecount = CASE WHEN GREATEST(0, COALESCE(effectnumber, 0)) > 0 THEN 1 ELSE 0 END,
  effectnumberdicesides = GREATEST(0, COALESCE(effectnumber, 0)),
  effectamount2min = 0,
  effectamount2dicecount = CASE WHEN GREATEST(0, COALESCE(effectamount2, 0)) > 0 THEN 1 ELSE 0 END,
  effectamount2dicesides = GREATEST(0, COALESCE(effectamount2, 0));
