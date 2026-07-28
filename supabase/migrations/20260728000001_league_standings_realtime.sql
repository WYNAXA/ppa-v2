-- Add league_standings to the supabase_realtime publication.
--
-- Audit finding (2026-07-28, M6): two client realtime subscriptions depend on
-- this table but it was never added to the publication (20260511000006 added
-- the others), so they never fire:
--   - src/pages/LeagueDetail.tsx  (live standings tab)
--   - src/pages/TournamentMode.tsx (entire live update — subscribes only here)
--
-- Guarded so re-running / pushing over a DB where it already exists is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'league_standings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.league_standings;
  END IF;
END $$;
