-- Sample potions (owned by first admin user, ispublic = TRUE)
-- effectto options: 'HP', 'AC', 'Stamina', 'Mind', '# of attacks #OA', 'Magic', 'Sight', 'Action Economy'
-- effecttime = lastFor (rounds; 0 = instant one-time)
-- effectnumber = effectAmount (primary)
-- effectamount2 = secondary effect amount (for dual-effect potions)

INSERT INTO potions (
  userguid, name, description,
  effectto, effectto2,
  effecttime, effectnumber, effectamount2,
  value, ispublic
)
SELECT
  u.key,
  p.name, p.description,
  p.effectto, p.effectto2,
  p.effecttime, p.effectnumber, p.effectamount2,
  p.value, TRUE
FROM (VALUES
  -- Single-effect: Healing
  ('Minor Healing Potion',   'A small flask of red liquid. Restores a little HP.',               'HP',               NULL,               0, 4,  0,  5),
  ('Healing Potion',         'A reliable restorative brew. Basic adventuring supply.',            'HP',               NULL,               0, 8,  0,  10),
  ('Greater Healing Potion', 'A thick crimson draught. Seals serious wounds.',                   'HP',               NULL,               0, 15, 0,  20),
  ('Potion of Regeneration', 'Slowly mends wounds over several rounds.',                         'HP',               NULL,               4, 2,  0,  14),

  -- Single-effect: Defense
  ('Potion of Iron Skin',    'Your skin hardens briefly. +AC for a few rounds.',                 'AC',               NULL,               3, 2,  0,  15),
  ('Shield Elixir',          'A shimmering draft that bolsters your natural defenses.',           'AC',               NULL,               4, 1,  0,  12),

  -- Single-effect: Stamina / Mind / Magic
  ('Stamina Tonic',          'Restores physical endurance instantly.',                            'Stamina',          NULL,               0, 5,  0,  10),
  ('Mind Elixir',            'Clears the mind and sharpens focus instantly.',                    'Mind',             NULL,               0, 5,  0,  10),
  ('Arcane Infusion',        'Temporarily amplifies magical reserves.',                          'Magic',            NULL,               3, 3,  0,  16),

  -- Single-effect: Combat
  ('Potion of Speed',        'Grants a burst of extra action economy for two rounds.',           'Action Economy',   NULL,               2, 1,  0,  18),
  ('Battle Frenzy',          'Unleashes aggression. Extra attack opportunity for 3 rounds.',     '# of attacks #OA', NULL,               3, 1,  0,  20),
  ('Potion of True Sight',   'Eyes glow gold. Dramatically increases sight range.',              'Sight',            NULL,               4, 3,  0,  12),

  -- Dual-effect
  ('Warrior''s Draft',       'Restores HP and briefly hardens your skin.',                       'HP',               'AC',               2, 6,  1,  22),
  ('Combat Elixir',          'Grants extra action economy AND an extra attack opportunity.',     'Action Economy',   '# of attacks #OA', 2, 1,  1,  30),
  ('Shadow Brew',            'Sharpens eyes and speeds up your strikes.',                        'Sight',            '# of attacks #OA', 3, 2,  1,  25),
  ('Berserker''s Potion',    'Grants two extra attacks but slowly drains HP each round.',        '# of attacks #OA', 'HP',               3, 2,  -2, 22),
  ('Ironheart Tincture',     'Restores stamina and reinforces your armor for several rounds.',   'Stamina',          'AC',               3, 4,  1,  24)
) AS p(name, description, effectto, effectto2, effecttime, effectnumber, effectamount2, value)
CROSS JOIN (SELECT key FROM users WHERE isadmin = TRUE ORDER BY id LIMIT 1) AS u;
