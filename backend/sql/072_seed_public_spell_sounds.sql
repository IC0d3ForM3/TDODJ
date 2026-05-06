DO $$
DECLARE
  owner_key UUID;
BEGIN
  IF to_regclass('public.sounds') IS NULL THEN
    RAISE EXCEPTION 'Table public.sounds does not exist. Run 032_create_sounds_table.sql first.';
  END IF;

  SELECT u.key
  INTO owner_key
  FROM public.users u
  ORDER BY
    CASE WHEN u.isadmin THEN 0 ELSE 1 END,
    u.id
  LIMIT 1;

  IF owner_key IS NULL THEN
    RAISE EXCEPTION 'Cannot seed default sounds because no users exist yet.';
  END IF;

  INSERT INTO public.sounds (userguid, path, ispublic, isactive, name)
  SELECT owner_key, src.path, TRUE, TRUE, src.name
  FROM (
    VALUES
      ('/sounds/sfx-burning-crackle-01.wav', 'Burning Crackle 01'),
      ('/sounds/sfx-burning-crackle-02.wav', 'Burning Crackle 02'),
      ('/sounds/sfx-shocking-zap-01.wav', 'Shocking Zap 01'),
      ('/sounds/sfx-lightning-strike-01.wav', 'Lightning Strike 01'),
      ('/sounds/sfx-glowing-magic-default-01.wav', 'Glowing Magic Default 01')
  ) AS src(path, name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.sounds s
    WHERE s.path = src.path
  );
END $$;
