-- ── Item 5: confirm_match_result RPC — opposing-team gate ────────────────────
-- Only allows an opposing-team member to flip verification_status to 'verified'.
-- Called from MatchDetail voteMutation instead of a raw UPDATE.

CREATE OR REPLACE FUNCTION public.confirm_match_result(
  p_match_result_id uuid,
  p_voter_id        uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status          text;
  v_submitted_by    uuid;
  v_team1           uuid[];
  v_team2           uuid[];
  v_submitting_team uuid[];
  v_opposing_team   uuid[];
BEGIN
  -- Lock the row to prevent races
  SELECT verification_status, submitted_by, team1_players, team2_players
    INTO v_status, v_submitted_by, v_team1, v_team2
    FROM match_results
   WHERE id = p_match_result_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match result not found';
  END IF;

  IF v_status = 'verified' THEN
    -- Already verified — idempotent success
    RETURN;
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Result is %, not pending', v_status;
  END IF;

  -- Determine which team submitted and which is opposing
  IF v_submitted_by = ANY(v_team1) THEN
    v_submitting_team := v_team1;
    v_opposing_team   := v_team2;
  ELSE
    v_submitting_team := v_team2;
    v_opposing_team   := v_team1;
  END IF;

  -- Gate: voter must be on the OPPOSING team
  IF NOT (p_voter_id = ANY(v_opposing_team)) THEN
    RAISE EXCEPTION 'Only an opposing-team member can confirm this result';
  END IF;

  UPDATE match_results
     SET verification_status = 'verified',
         verified_at         = NOW()
   WHERE id = p_match_result_id;
END;
$$;

-- Grant execute to authenticated users (RLS on match_result_votes already
-- ensures auth.uid() = voter_id, so the voter identity is trusted).
GRANT EXECUTE ON FUNCTION public.confirm_match_result(uuid, uuid) TO authenticated;


-- ── Item 1: Configurable auto-verify window ─────────────────────────────────
-- Store the window in a lightweight config table; default 24 hours.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- Seed the default
INSERT INTO app_settings (key, value)
VALUES ('auto_verify_hours', '24')
ON CONFLICT (key) DO NOTHING;

-- Replace the auto-verify function to read the configurable window
CREATE OR REPLACE FUNCTION public.auto_verify_old_pending_results()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hours  int;
  v_result record;
BEGIN
  -- Read configurable window (fall back to 24h)
  SELECT COALESCE(value::int, 24)
    INTO v_hours
    FROM app_settings
   WHERE key = 'auto_verify_hours';

  IF v_hours IS NULL THEN
    v_hours := 24;
  END IF;

  FOR v_result IN
    SELECT id, match_id, team1_players, team2_players
    FROM match_results
    WHERE verification_status = 'pending'
      AND created_at < NOW() - make_interval(hours => v_hours)
  LOOP
    UPDATE match_results
    SET verification_status = 'verified',
        verified_at         = NOW()
    WHERE id = v_result.id;

    -- Notify all players
    INSERT INTO notifications (user_id, type, title, message, related_id, read)
    SELECT
      unnest(v_result.team1_players || v_result.team2_players),
      'result_verified',
      'Match result auto-verified',
      'No disputes within ' || v_hours || ' hours. ELO updated.',
      v_result.match_id,
      false;
  END LOOP;
END;
$$;

-- Ensure the cron job is scheduled (idempotent — unschedule first if exists)
SELECT cron.unschedule('auto-verify-pending-results');
SELECT cron.schedule(
  'auto-verify-pending-results',
  '0 * * * *',
  $$SELECT public.auto_verify_old_pending_results();$$
);
