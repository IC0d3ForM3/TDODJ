-- Add starter class items: Shield (for Fighter) and Lock picks (for Thief).
-- These are seeded as public items owned by the first admin user.

INSERT INTO items (userguid, name, description, type, range, value, weight, effectvalue, damage, ispublic, istwohanded, effecton)
SELECT u.key, 'Shield', 'A sturdy buckler strapped to the forearm. Deflects blows and bolsters your defense.', 'armor', '0', 8, 5, 2, 0, TRUE, FALSE, 'AC'
FROM (SELECT key FROM users WHERE isadmin = TRUE ORDER BY id LIMIT 1) u
WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Shield' AND ispublic = TRUE);

INSERT INTO items (userguid, name, description, type, range, value, weight, effectvalue, damage, ispublic, istwohanded, effecton)
SELECT u.key, 'Lock picks', 'A slim set of picks for working stubborn locks. Handy in tight spots.', 'tool', '0', 5, 1, 0, 0, TRUE, FALSE, ''
FROM (SELECT key FROM users WHERE isadmin = TRUE ORDER BY id LIMIT 1) u
WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Lock picks' AND ispublic = TRUE);
