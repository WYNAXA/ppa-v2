-- ── Fix: auto-verify must process pending results in chronological order ────
--
-- ROOT CAUSE:
--   public.auto_verify_old_pending_results() selects pending results with no
--   ORDER BY:
--       FOR v_result IN
--         SELECT id, match_id, team1_players, team2_players
--         FROM match_results
--         WHERE verification_status = 'pending' AND created_at < ...
--   Each UPDATE fires dispatch_match_result_to_elo, and ELO is path-dependent:
--   applying an 8 Sep result before an 11 Aug result yields different ratings
--   than true chronological order. With a heap-order scan the sequence is
--   arbitrary. This never mattered while the job crashed on every run; it
--   matters the moment a backlog drains.
--
-- FIX CLASS: (a) root-cause for the ordering defect.
--   The loop now drains oldest-first, using the same ordering key that
--   rebuild-ratings uses to replay history:
--       COALESCE(verified_at, created_at), created_at, id
--   so the incremental path and the deterministic rebuild agree on what
--   "chronological" means.
--
-- KNOWN RESIDUAL, stated rather than hidden:
--   dispatch_match_result_to_elo posts via net.http_post, which is asynchronous.
--   Ordering the loop makes dispatch order deterministic but does not guarantee
--   completion order. If two or more results verify in the SAME tick, their ELO
--   can still land out of order. This is bounded and self-correcting:
--   rebuild-ratings replays from verified_at (tie-broken by created_at, id) and
--   restores the true sequence. After any large backlog flush, run a rebuild.
--   Closing the residual properly means moving ELO application into the database
--   so it happens in-transaction and in-order; that is a larger change and is
--   deliberately not smuggled in here.
--
-- BLAST RADIUS: this function has exactly one caller, cron job 15
--   ('auto-verify-pending-results', hourly). No signature change, no new
--   dependency. The notifiable_players() recipient filter added earlier today
--   is preserved verbatim.

CREATE OR REPLACE FUNCTION public.auto_verify_old_pending_results()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_hours      int;
  v_result     record;
  v_recipients uuid[];
BEGIN
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
    ORDER BY COALESCE(verified_at, created_at) ASC, created_at ASC, id ASC
  LOOP
    UPDATE match_results
    SET verification_status = 'verified',
        verified_at         = NOW()
    WHERE id = v_result.id;

    -- Rosters intentionally retain deleted users; notifications.user_id is
    -- FK-constrained to auth.users and cannot. See notifiable_players().
    v_recipients := public.notifiable_players(
                      v_result.team1_players || v_result.team2_players
                    );

    IF array_length(v_recipients, 1) > 0 THEN
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      SELECT
        unnest(v_recipients),
        'result_verified',
        'Match result auto-verified',
        'No disputes within ' || v_hours || ' hours. ELO updated.',
        v_result.match_id,
        false;
    END IF;
  END LOOP;
END;
$fn$;
