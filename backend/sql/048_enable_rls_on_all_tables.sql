-- Enable Row Level Security on all public tables.
-- The Express backend connects via the service role (postgres), which bypasses
-- RLS, so this has no effect on the app. It closes off direct PostgREST/anon
-- access to every table, which is the desired behaviour.

ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dungons        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treshers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monsters       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.images         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pcs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friends        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spells         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.potions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sounds         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_invites ENABLE ROW LEVEL SECURITY;
