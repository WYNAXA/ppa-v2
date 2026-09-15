-- ── Auto-verify pending match results after 24 hours ────────────────────────
-- Requires pg_cron extension (enabled by default on Supabase Pro).
-- If not enabled: CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Function to auto-verify pending results older than 24 hours
CREATE OR REPLACE FUNCTION public.auto_verify_old_pending_results()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result record;
BEGIN
  FOR v_result IN
    SELECT id, match_id, team1_players, team2_players
    FROM match_results
    WHERE verification_status = 'pending'
      AND created_at < NOW() - INTERVAL '24 hours'
  LOOP
    UPDATE match_results
    SET verification_status = 'verified'
    WHERE id = v_result.id;

    -- Notify all players
    INSERT INTO notifications (user_id, type, title, message, related_id, read)
    SELECT
      unnest(v_result.team1_players || v_result.team2_players),
      'result_verified',
      'Match result auto-verified',
      'No disputes within 24 hours. ELO updated.',
      v_result.match_id,
      false;
  END LOOP;
END;
$$;

-- Schedule to run every hour
SELECT cron.schedule(
  'auto-verify-pending-results',
  '0 * * * *',
  $$SELECT public.auto_verify_old_pending_results();$$
);
