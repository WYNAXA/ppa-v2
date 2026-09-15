-- ── Fix B: auto-verify must not treat a historical roster as a live user list ──
--
-- ROOT CAUSE (with evidence):
--   supabase/migrations/20260520220001_delete_user_rpc.sql removes a deleted
--   user from matches.player_ids and matches.confirmed_players (lines 245, 253,
--   262) and nulls match_results.submitted_by / verified_by / disputed_by
--   (lines 177, 183, 189) — but deliberately never touches
--   match_results.team1_players / team2_players. That is correct: a match
--   roster is a historical fact and must not be rewritten when someone deletes
--   their account. process-elo already assumes this and carries an explicit
--   ghost-player guard.
--
--   public.auto_verify_old_pending_results() does NOT. It unnests the roster
--   straight into notifications.user_id, which is FK'd to auth.users
--   ON DELETE CASCADE. Player e91a7425-31fd-4935-8db6-69a1f4c1188f was deleted
--   while sitting in the roster of match_result 7bca18e9 (2026-08-11 16:02).
--   From 2026-08-12 17:00 the hourly job has thrown:
--     ERROR: insert or update on table "notifications" violates foreign key
--            constraint "notifications_user_id_fkey"
--   The whole function is one transaction, so one bad row aborts the entire
--   loop. 665 consecutive failures. NO pending result has auto-verified since.
--   That is why 7 results are still 'pending' weeks after they were played.
--
-- FIX CLASS: (a) root-cause.
--   Not (b) a workaround: the deletion RPC is left alone because preserving the
--   roster is the correct behaviour, and the recipient list — which was always
--   the thing that was wrong — is corrected at source.
--   Not (c) cosmetic, and explicitly NOT an exception handler. Wrapping the
--   loop in BEGIN/EXCEPTION would swallow the symptom and hide the next
--   variant of this bug. The recipient set is made correct instead.
--
-- BLAST RADIUS:
--   18 functions in this database insert into notifications from a player
--   array. Only auto_verify_old_pending_results is currently failing; several
--   others (e.g. send_match_result_prompts) already filter through profiles,
--   which is the same guarantee this helper formalises. This migration
--   introduces the shared helper and fixes the one broken caller. The other 17
--   are listed in the PR description for a follow-up audit and are NOT silently
--   assumed safe.
--
-- WHY profiles IS A SUFFICIENT GUARD:
--   Verified on 2026-09-09 against production:
--     SELECT count(*) FROM profiles p
--     WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);  -- 0
--   profiles is a strict subset of auth.users, so anything that survives this
--   filter satisfies notifications_user_id_fkey.

-- ── Shared helper: the single definition of "who can receive a notification" ──
CREATE OR REPLACE FUNCTION public.notifiable_players(p_player_ids uuid[])
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(ARRAY_AGG(p.id), '{}'::uuid[])
  FROM profiles p
  WHERE p.id = ANY(p_player_ids);
$$;

COMMENT ON FUNCTION public.notifiable_players(uuid[]) IS
  'Filters a historical match roster down to players who still have an account. '
  'Rosters intentionally retain deleted users (see delete_user RPC); '
  'notifications.user_id is FK''d to auth.users and cannot. Use this helper for '
  'every notification insert driven by a player array.';

-- ── Rewrite auto-verify to use it ───────────────────────────────────────────
-- Unchanged from the live version except the recipient list. No exception
-- handling is added: if this ever raises again, the cron job must fail loudly.
CREATE OR REPLACE FUNCTION public.auto_verify_old_pending_results()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  LOOP
    UPDATE match_results
    SET verification_status = 'verified',
        verified_at         = NOW()
    WHERE id = v_result.id;

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
$$;
