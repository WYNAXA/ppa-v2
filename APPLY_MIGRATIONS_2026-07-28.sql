-- ════════════════════════════════════════════════════════════════════════════
-- APPLY the 3 audit migrations to production — paste into Supabase Dashboard →
-- SQL Editor and Run.  (Do NOT use `supabase db push`: 119 local migrations are
-- out of sync with the remote history, so a push would try to re-apply all of
-- them and fail on "already exists".)
--
-- All three blocks are idempotent — safe to run more than once.
-- Run the PRE-FLIGHT first; if it reports the poll function missing, skip
-- block 2 until the base function exists.
-- ════════════════════════════════════════════════════════════════════════════

-- ── PRE-FLIGHT (read-only) — confirm prerequisites exist in prod ────────────
select 'close_expired_polls fn exists' as check, count(*) as n from pg_proc where proname = 'close_expired_polls'
union all select 'league_standings table exists', count(*) from information_schema.tables where table_schema='public' and table_name='league_standings'
union all select 'league_standings already in realtime pub', count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='league_standings'
union all select 'delete_match_cascade fn exists', count(*) from pg_proc where proname='delete_match_cascade'
union all select 'ranking_changes table exists', count(*) from information_schema.tables where table_schema='public' and table_name='ranking_changes'
union all select 'pg_cron extension', count(*) from pg_extension where extname='pg_cron';

-- ── BLOCK 1 — league_standings realtime publication (20260728000001) ────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='league_standings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.league_standings;
    RAISE NOTICE 'league_standings added to supabase_realtime';
  ELSE
    RAISE NOTICE 'league_standings already in publication — no change';
  END IF;
END $$;

-- ── BLOCK 2 — close-expired-polls hourly cron (20260728000002) ──────────────
-- ONLY run this if the PRE-FLIGHT showed close_expired_polls fn exists = 1.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='close_expired_polls') THEN
    RAISE EXCEPTION 'close_expired_polls() does not exist — apply migration 20260723000002 first, then re-run this block';
  END IF;
  BEGIN PERFORM cron.unschedule('close-expired-polls'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('close-expired-polls', '5 * * * *', $cron$SELECT public.close_expired_polls();$cron$);
  RAISE NOTICE 'close-expired-polls cron scheduled (hourly at :05)';
END $$;

-- ── BLOCK 3 — delete_match_cascade reverses ELO (20260728000003) ────────────
CREATE OR REPLACE FUNCTION public.delete_match_cascade(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM matches m
    LEFT JOIN groups g ON g.id = m.group_id
    LEFT JOIN group_members gm ON gm.group_id = g.id
      AND gm.user_id = auth.uid() AND gm.role = 'admin' AND gm.status = 'approved'
    WHERE m.id = p_match_id AND (g.admin_id = auth.uid() OR gm.user_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Not authorized to delete this match';
  END IF;

  UPDATE profiles p
  SET internal_ranking = GREATEST(0, LEAST(3000, p.internal_ranking - agg.total_change)),
      matches_played   = GREATEST(0, p.matches_played - agg.cnt),
      is_provisional   = GREATEST(0, p.matches_played - agg.cnt) < 10
  FROM (
    SELECT rh.user_id, COALESCE(SUM(rh.rating_change),0)::int AS total_change, COUNT(*)::int AS cnt
    FROM rating_history rh
    JOIN match_results mr ON mr.id = rh.match_result_id
    WHERE mr.match_id = p_match_id
    GROUP BY rh.user_id
  ) agg
  WHERE p.id = agg.user_id;

  DELETE FROM rating_history WHERE match_result_id IN (SELECT id FROM match_results WHERE match_id = p_match_id);
  DELETE FROM ranking_changes WHERE match_id = p_match_id;
  DELETE FROM match_result_votes WHERE match_result_id IN (SELECT id FROM match_results WHERE match_id = p_match_id);
  DELETE FROM match_peer_votes WHERE match_id = p_match_id;
  DELETE FROM match_results WHERE match_id = p_match_id;
  DELETE FROM travel_requests WHERE match_id = p_match_id;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='match_comments') THEN
    EXECUTE 'DELETE FROM match_comments WHERE match_id = $1' USING p_match_id;
  END IF;
  DELETE FROM notifications WHERE related_id = p_match_id::text;
  DELETE FROM matches WHERE id = p_match_id;
END;
$$;

-- ── POST-CHECK (read-only) — confirm all three applied ──────────────────────
select 'league_standings in pub' as check, count(*) as n from pg_publication_tables where pubname='supabase_realtime' and tablename='league_standings'
union all select 'close-expired-polls cron', count(*) from cron.job where jobname='close-expired-polls'
union all select 'delete_match_cascade reverses elo (src contains rating_change)',
  (case when exists (select 1 from pg_proc where proname='delete_match_cascade' and prosrc ilike '%rating_change%') then 1 else 0 end);
