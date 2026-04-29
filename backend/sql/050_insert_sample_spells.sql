-- Sample spells (owned by first admin user, ispublic = TRUE)
-- effecton options: 'HP', 'Defense', 'Stamina', 'Mind', 'Sneak', 'Magic', 'Sight', 'Action Economy'

INSERT INTO spells (
  userguid, name, description, range, effecton, effecton2,
  lastfor, damage, effectamount2, value, sp,
  successtestvalue, magiccost, costtolearn, ispublic
)
SELECT
  u.key,
  s.name, s.description, s.range, s.effecton, COALESCE(s.effecton2, ''),
  s.lastfor, s.damage, s.effectamount2, s.value, s.sp,
  s.successtestvalue, s.magiccost, s.costtolearn, TRUE
FROM (VALUES
  -- Healing & Restoration
  ('Mend Wounds',      'Heal a small amount of HP on touch.',                               1,  'HP',              NULL,          0,  3,  0,  5,  1,  0,   1,  3),
  ('Healing Word',     'A spoken prayer knits wounds shut from nearby.',                    2,  'HP',              NULL,          0,  5,  0,  10, 2,  0,   2,  6),
  ('Greater Heal',     'Powerful healing that restores significant HP.',                    1,  'HP',              NULL,          0,  10, 0,  20, 3,  0,   3,  12),
  ('Restore Stamina',  'Refresh the target''s physical endurance.',                         1,  'Stamina',         NULL,          0,  4,  0,  8,  2,  0,   2,  6),
  ('Clear Mind',       'Ease mental fatigue, restoring Mind points.',                       1,  'Mind',            NULL,          0,  4,  0,  8,  2,  0,   2,  6),

  -- Buffs
  ('Shield of Faith',  'Temporarily bolsters the target''s Defense.',                       1,  'Defense',         NULL,          3,  2,  0,  10, 2,  0,   2,  8),
  ('Cat''s Grace',     'Grants supernatural agility, boosting Sneak.',                      1,  'Sneak',           NULL,          3,  2,  0,  10, 2,  0,   2,  8),
  ('Arcane Surge',     'Amplifies the target''s magical reserves.',                         0,  'Magic',           NULL,          3,  3,  0,  12, 2,  0,   2,  10),
  ('Eagle Eye',        'Sharpens sight to supernatural clarity.',                           0,  'Sight',           NULL,          4,  3,  0,  10, 2,  0,   2,  8),
  ('Haste',            'Target acts with blinding speed, gaining extra action economy.',    1,  'Action Economy',  NULL,          2,  1,  0,  15, 3,  0,   3,  15),

  -- Damage
  ('Frost Bolt',       'Launch a shard of magical ice at a target.',                        4,  'HP',              NULL,          0,  -4, 0,  8,  2,  8,   2,  8),
  ('Fire Lance',       'A searing lance of flame scorches the enemy.',                      3,  'HP',              NULL,          0,  -6, 0,  15, 3,  10,  3,  12),
  ('Lightning Arc',    'A crackling bolt of lightning from the caster''s hand.',            3,  'HP',              NULL,          0,  -5, 0,  12, 2,  9,   2,  10),
  ('Mind Spike',       'A psychic lance assaults the target''s mind.',                      3,  'Mind',            NULL,          0,  -4, 0,  10, 2,  8,   2,  10),
  ('Dark Drain',       'Drain stamina from an enemy to fuel the caster.',                   2,  'Stamina',         NULL,          0,  -3, 0,  10, 2,  8,   2,  10),

  -- Debuffs
  ('Blind',            'Cloud the enemy''s sight temporarily.',                             3,  'Sight',           NULL,          2,  -3, 0,  15, 3,  9,   3,  12),
  ('Slow',             'Reduce the target''s action economy for a few rounds.',             3,  'Action Economy',  NULL,          2,  -1, 0,  15, 3,  10,  3,  15),
  ('Weaken',           'Sap the enemy''s defense for several rounds.',                      2,  'Defense',         NULL,          3,  -2, 0,  12, 2,  9,   2,  10),

  -- Dual-effect
  ('Vampiric Touch',   'Drain enemy HP and restore your own.',                              1,  'HP',              'HP',          0,  -5, 3,  18, 3,  10,  3,  18),
  ('Storm Bolt',       'Shock an enemy and dazzle their sight with arcane lightning.',      3,  'HP',              'Sight',       1,  -4, -2, 20, 3,  9,   3,  20)
) AS s(name, description, range, effecton, effecton2, lastfor, damage, effectamount2, value, sp, successtestvalue, magiccost, costtolearn)
CROSS JOIN (SELECT key FROM users WHERE isadmin = TRUE ORDER BY id LIMIT 1) AS u
WHERE NOT EXISTS (SELECT 1 FROM spells WHERE name = s.name AND ispublic = TRUE);
