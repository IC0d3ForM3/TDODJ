-- Migration: Allow multiple Main Game dungons.
-- Previously a unique index enforced only one ismaingame=TRUE row.
-- The main game can now have multiple dungons (different levels/chapters).
-- The ismaingame flag still means "part of the main game narrative" and
-- is admin-only to set, but there is no longer a global cap of one.

DROP INDEX IF EXISTS uq_dungons_ismaingame_true;
