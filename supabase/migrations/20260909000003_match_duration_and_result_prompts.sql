-- ── Fix A2: restore the "how did your match go?" prompt ────────────────────
--
-- ROOT CAUSE (with evidence):
--   cron job 7 (push-match-result-prompt, every 15 min) has failed 8,131
--   consecutive times since 2026-06-16 17:00:
--     ERROR: column m.match_duration_mins does not exist
--
--   The committed version of this function
--   (supabase/migrations/20260512000002_push_notification_crons.sql, line 37)
--   hardcodes "90 minutes after match time" and never mentions that column.
--   The LIVE function selects m.match_duration_mins. So the live function is an
--   uncommitted out-of-band edit made on 2026-06-16 that introduced a reference
--   to a column which was never added to matches. Repo and live have disagreed
--   ever since, and the cron has been dead the whole time — which is the real
--   reason so many matches never get a result submitted at all.
--
-- FIX CLASS: (a) root-cause.
--   The code's intent (per-match duration) is right; the schema was missing.
--   We add the column rather than reverting to a hardcoded 90, because match
--   length genuinely varies (60/90/120 min court slots) and a fixed 90 sends
--   the prompt at the wrong time for every non-90 booking.
--
--   The column is named duration_minutes to match bookings.duration_minutes,
--   NOT the drifted match_duration_mins. bookings is the authoritative source
--   once the booking-model migration completes, so the function reads
--   COALESCE(matches.duration_minutes, bookings.duration_minutes, 90) — the
--   override, then the real booking, then the last-resort default.
--
-- REPO/LIVE AGREEMENT: after this migration the committed function text and the
--   deployed function text are identical. The 2026-06-16 out-of-band edit is
--   superseded here rather than left as invisible drift.
--
-- BLAST RADIUS: send_match_result_prompts is called from exactly one place,
--   cron job 7. matches.duration_minutes is additive and nullable, so no
--   existing INSERT, view, or client query changes behaviour. Only 1 of 410
--   matches currently has a linked booking, so in practice the default still
--   applies today; the join is there so this stops being a guess as Phase 3
--   lands.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

COMMENT ON COLUMN public.matches.duration_minutes IS
  'Optional per-match override for scheduled length in minutes. When null, the '
  'linked booking''s duration_minutes is used, falling back to 90.';

CREATE OR REPLACE FUNCTION public.send_match_result_prompts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_match        record;
  v_match_time   timestamptz;
  v_user_ids     uuid[];
  v_duration_mins int;
BEGIN
  FOR v_match IN
    SELECT m.id,
           m.match_date,
           m.match_time,
           m.player_ids,
           COALESCE(m.duration_minutes, b.duration_minutes, 90) AS duration_minutes
    FROM matches m
    LEFT JOIN bookings b ON b.match_id = m.id
    WHERE m.status IN ('scheduled', 'confirmed')
      AND m.push_result_prompt_sent IS NOT TRUE
      AND NOT EXISTS (SELECT 1 FROM match_results mr WHERE mr.match_id = m.id)
  LOOP
    v_match_time := (v_match.match_date::timestamp
      + COALESCE(v_match.match_time::time, '00:00:00'::time)) AT TIME ZONE 'Europe/London';

    v_duration_mins := v_match.duration_minutes;

    IF v_match_time + (v_duration_mins || ' minutes')::interval + INTERVAL '15 minutes' < NOW()
       AND v_match_time + INTERVAL '24 hours' > NOW() THEN

      -- Same guarantee as public.notifiable_players: only players who still
      -- have an account can receive a notification.
      v_user_ids := public.notifiable_players(v_match.player_ids);

      IF array_length(v_user_ids, 1) > 0 THEN
        INSERT INTO notifications (user_id, type, title, message, related_id, read)
        SELECT unnest(v_user_ids), 'match_result_prompt',
               'How did your match go?',
               'Tap to enter your result.',
               v_match.id, false;
      END IF;

      UPDATE matches SET push_result_prompt_sent = true WHERE id = v_match.id;
    END IF;
  END LOOP;
END;
$$;
