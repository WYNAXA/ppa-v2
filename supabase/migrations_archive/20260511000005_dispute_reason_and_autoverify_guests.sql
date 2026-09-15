-- ── Add dispute_reason column to match_result_votes ──────────────────────────
ALTER TABLE match_result_votes
ADD COLUMN IF NOT EXISTS dispute_reason text;

-- ── Fix auto-verify to filter guest UUIDs ───────────────────────────────────
-- Guest player UUIDs don't exist in profiles/auth.users, causing FK violation
-- on notifications.user_id when auto-verify tries to notify them.

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

    -- Notify only real users (filter out guest UUIDs via profiles join)
    INSERT INTO notifications (user_id, type, title, message, related_id, read)
    SELECT
      p.id,
      'result_verified',
      'Match result auto-verified',
      'No disputes within 24 hours. ELO updated.',
      v_result.match_id,
      false
    FROM profiles p
    WHERE p.id = ANY(v_result.team1_players || v_result.team2_players);
  END LOOP;
END;
$$;
