-- ── Auto-cancel matches with no result 24h after match_time ──────────────────
-- Runs hourly via pg_cron. Only cancels matches that have no match_results row.
-- Notifies all real-user participants (skips guest UUIDs via profiles join).

CREATE OR REPLACE FUNCTION public.check_overdue_matches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_match record;
  v_deadline timestamptz;
BEGIN
  FOR v_match IN
    SELECT m.id, m.match_date, m.match_time, m.player_ids
    FROM matches m
    WHERE m.status IN ('scheduled', 'pending', 'confirmed', 'open')
      AND NOT EXISTS (SELECT 1 FROM match_results mr WHERE mr.match_id = m.id)
  LOOP
    v_deadline := (v_match.match_date::timestamp +
      COALESCE(v_match.match_time::time, '00:00:00'::time) +
      INTERVAL '24 hours');

    IF v_deadline < NOW() THEN
      UPDATE matches SET status = 'cancelled' WHERE id = v_match.id;

      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      SELECT p.id, 'match_auto_cancelled', 'Match auto-cancelled',
             'No result entered within 24 hours of match time.',
             v_match.id, false
      FROM profiles p
      WHERE p.id = ANY(v_match.player_ids);
    END IF;
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'auto-cancel-overdue-matches',
  '0 * * * *',
  $$SELECT public.check_overdue_matches();$$
);
