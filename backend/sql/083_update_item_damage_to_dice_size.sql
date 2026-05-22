-- Migration 083: Convert item damage column from legacy values to standard dice sizes.
--
-- Old system stored either:
--   a) a divisor (2=1d6, 3=1d4, 4=1d3, 6=1d2) for manually created items, OR
--   b) the average of the imported D&D 5e damage dice (1d4→3, 1d6→4, 1d8→5, 1d10→6, 1d12→7)
--
-- New system stores the dice side count directly: 4=d4, 6=d6, 8=d8, 10=d10, 12=d12.
-- Combat formula changes from: randomInt(1, ceil(12/damage))
--                           to: randomInt(1, damage)

UPDATE items
SET damage = CASE damage
  WHEN 0 THEN 0   -- non-weapon, stays 0
  WHEN 1 THEN 4   -- very weak → d4
  WHEN 2 THEN 4   -- weak (old divisor=2=1d6 or avg≤2) → d4
  WHEN 3 THEN 6   -- old divisor=3=1d4 or avg(1d4)≈3 → d6
  WHEN 4 THEN 6   -- old divisor=4=1d3 or avg(1d6)≈4 → d6
  WHEN 5 THEN 8   -- avg(1d8)≈5 → d8
  WHEN 6 THEN 10  -- avg(1d10)≈6 → d10
  WHEN 7 THEN 12  -- avg(1d12)≈7 → d12
  ELSE 6          -- fallback to d6
END
WHERE damage < 8;
