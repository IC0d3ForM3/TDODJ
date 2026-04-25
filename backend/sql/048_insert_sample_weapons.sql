-- Seed weapon items. ispublic = TRUE, owned by first admin user.
-- range is melee squares (1=adjacent, 2=reach, 3-5=ranged)
-- effectvalue = +to hit bonus
-- damage = divisor for d12 (1=d12, 2=d6, 3=d4, 4=d3) — lower is more damaging

INSERT INTO items (userguid, name, description, type, range, value, weight, effectvalue, damage, ispublic, istwohanded)
SELECT
  key,
  w.name, w.description, 'weapon', w.range, w.value, w.weight, w.effectvalue, w.damage, TRUE, w.istwohanded
FROM (VALUES
  -- One-handed melee
  ('Rusty Dagger',        'A dull, notched blade. Better than nothing.',                         '1', 2,  1,  0, 3, FALSE),
  ('Dagger',              'A sharp, reliable boot knife.',                                        '1', 5,  1,  1, 3, FALSE),
  ('Short Sword',         'A dependable one-handed sword.',                                       '1', 10, 3,  1, 2, FALSE),
  ('Long Sword',          'A balanced sword with good reach.',                                    '1', 18, 4,  2, 2, FALSE),
  ('Hand Axe',            'A hatchet easy to swing in tight corridors.',                          '1', 8,  4,  1, 2, FALSE),
  ('Mace',                'A heavy blunt weapon that ignores light armor.',                       '1', 10, 5,  0, 2, FALSE),
  ('Rapier',              'A slender thrusting sword. High accuracy, lighter hits.',              '1', 14, 2,  3, 3, FALSE),
  ('Silver Dagger',       'Silver-forged blade. Effective against magic creatures.',              '1', 25, 1,  2, 3, FALSE),
  ('Magic Wand',          'A conduit for raw arcane force.',                                      '3', 30, 1,  3, 3, FALSE),
  ('Enchanted Short Sword','A glowing blade inscribed with runes of striking.',                   '1', 45, 3,  3, 2, FALSE),
  -- Two-handed melee
  ('Quarter Staff',       'A wooden staff. Quick and easy to handle.',                            '1', 4,  5,  1, 2, TRUE),
  ('Battle Axe',          'A brutal cleaving axe requiring both hands.',                          '1', 15, 7,  1, 1, TRUE),
  ('Great Sword',         'A massive blade. Slow to swing but devastating.',                      '1', 22, 8,  2, 1, TRUE),
  ('War Hammer',          'A crushing maul that shatters shields and bones.',                     '1', 20, 9,  0, 1, TRUE),
  ('Halberd',             'A pole axe with reach. Can strike adjacent or one square away.',       '2', 18, 7,  1, 1, TRUE),
  -- Ranged
  ('Throwing Knife',      'Balanced for throwing. Can be used in melee too.',                     '2', 6,  1,  1, 3, FALSE),
  ('Short Bow',           'A nimble bow for quick shots at moderate range.',                      '3', 12, 2,  1, 3, TRUE),
  ('Long Bow',            'A powerful bow with excellent range.',                                 '5', 20, 3,  2, 2, TRUE),
  ('Crossbow',            'Heavy and slow to reload, but punishing at range.',                    '4', 22, 4,  2, 2, TRUE),
  -- Magical
  ('Staff of Striking',   'A wizard''s battle staff crackling with arcane energy.',               '2', 50, 4,  3, 2, TRUE),
  ('Cursed Blade',        'A dark sword with uncanny accuracy. Something feels wrong.',           '1', 35, 3,  4, 1, FALSE)
) AS w(name, description, range, value, weight, effectvalue, damage, istwohanded)
CROSS JOIN (SELECT key FROM users WHERE isadmin = TRUE ORDER BY id LIMIT 1) AS admin_user;
