-- Seed sample monsters as public so all users can place them.
-- userguid is set to the first admin user found in the DB.
-- If no admin exists yet, replace the subquery with your own userguid.

INSERT INTO monsters (
  userguid,
  name,
  type,
  description,
  hp,
  movmenteconomy,
  ac,
  runat,
  numberofattacks,
  magic,
  spreward,
  ispublic
)
SELECT
  (SELECT key FROM users WHERE isadmin = TRUE ORDER BY id LIMIT 1),
  m.name, m.type, m.description,
  m.hp, m.movmenteconomy, m.ac,
  m.runat, m.numberofattacks, m.magic,
  m.spreward, TRUE
FROM (VALUES
  -- ── From your list ──────────────────────────────────────────────────────
  ('Little Blue Dragon', 'Beast',    'A young blue Dragon',         75,  5, 15, 0, 2, 10, 20),
  ('FurBit',             'Beast',    'A purple Rabbit person',      15,  6,  4, 0, 2,  0,  5),
  ('Stone Guard',        'Beast',    'A Stone Guard person',        50,  2, 20, 0, 1,  0, 15),
  ('Snake',              'Beast',    'A golden snake',               4,  2, 10, 0, 1,  0,  3),
  ('Ghost',              'Specter',  'A haunting ghost',            25,  4, 13, 0, 1,  5, 10),
  ('Ogre',               'Humanoid', 'A big brutish monster',       20,  5, 14, 0, 2,  0, 15),

  -- ── Additional monsters ─────────────────────────────────────────────────
  ('Goblin',             'Humanoid', 'A sneaky little goblin',       8,  5,  8, 0, 1,  0,  3),
  ('Goblin Shaman',      'Humanoid', 'A goblin who dabbles in magic',12, 4,  8, 0, 1,  4,  6),
  ('Skeleton',           'Undead',   'A reanimated skeleton warrior',10, 3, 11, 0, 1,  0,  4),
  ('Skeleton Archer',    'Undead',   'A skeleton with a bow',        8,  3, 10, 0, 1,  0,  4),
  ('Zombie',             'Undead',   'A shambling undead zombie',    18,  2,  8, 0, 1,  0,  5),
  ('Dire Wolf',          'Beast',    'A massive predatory wolf',    22,  7, 12, 5, 2,  0,  8),
  ('Giant Spider',       'Beast',    'A spider the size of a dog',  14,  5,  9, 0, 1,  0,  5),
  ('Troll',              'Humanoid', 'A regenerating cave troll',   40,  4, 13, 0, 2,  0, 18),
  ('Dark Elf Scout',     'Humanoid', 'A swift drow ranger',         18,  7, 14, 3, 2,  0, 12),
  ('Dark Elf Mage',      'Humanoid', 'A drow skilled in dark magic',14,  5, 12, 0, 1, 10, 16),
  ('Orc',                'Humanoid', 'A brutish orc warrior',       25,  4, 13, 0, 2,  0, 10),
  ('Ice Elemental',      'Elemental','A being of pure frozen energy',35, 3, 14, 0, 2, 6, 14),
  ('Fire Imp',           'Beast',    'A small mischievous fire fiend',6,  7,  9, 4, 1,  3,  4),
  ('Bandit',             'Humanoid', 'A human highwayman',          12,  5, 11, 3, 1,  0,  6)
) AS m(name, type, description, hp, movmenteconomy, ac, runat, numberofattacks, magic, spreward)
WHERE (SELECT key FROM users WHERE isadmin = TRUE ORDER BY id LIMIT 1) IS NOT NULL;
