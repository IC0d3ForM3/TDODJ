ALTER TABLE items
  ADD COLUMN IF NOT EXISTS weaponeffecttype VARCHAR(50) NOT NULL DEFAULT 'Blood',
  ADD COLUMN IF NOT EXISTS weaponeffectcolor VARCHAR(7) NOT NULL DEFAULT '#cc0000';

UPDATE items
SET weaponeffecttype = 'Blood'
WHERE weaponeffecttype IS NULL OR TRIM(weaponeffecttype) = '';

UPDATE items
SET weaponeffectcolor = '#cc0000'
WHERE weaponeffectcolor IS NULL OR TRIM(weaponeffectcolor) = '';
