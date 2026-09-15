-- ── Push notification triggers for match lifecycle ───────────────────────────
-- Two cron jobs that call the send-push Edge Function via pg_net:
-- 1. match_ended: 90min after match_time, prompt for result entry
-- 2. deadline_approaching: 23h after match_time, warn of 1h remaining

-- Ensure push_token column exists on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token text;

-- ── Function: notify match participants to enter result ──────────────────────
-- Fires ~90min after match_time for matches with no result yet.
-- Tracks sent pushes by setting a flag to avoid re-sending.

ALTER TABLE matches ADD COLUMN IF NOT EXISTS push_result_prompt_sent boolean DEFAULT false;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS push_deadline_sent boolean DEFAULT false;

CREATE OR REPLACE FUNCTION public.send_match_result_prompts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_match record;
  v_match_time timestamptz;
  v_user_ids uuid[];
BEGIN
  FOR v_match IN
    SELECT m.id, m.match_date, m.match_time, m.player_ids
    FROM matches m
    WHERE m.status IN ('scheduled', 'confirmed')
      AND m.push_result_prompt_sent IS NOT TRUE
      AND NOT EXISTS (SELECT 1 FROM match_results mr WHERE mr.match_id = m.id)
  LOOP
    v_match_time := (v_match.match_date::timestamp +
      COALESCE(v_match.match_time::time, '00:00:00'::time));

    -- 90 minutes after match time (typical match duration)
    IF v_match_time + INTERVAL '90 minutes' < NOW()
       AND v_match_time + INTERVAL '24 hours' > NOW() THEN

      -- Get real user IDs only
      SELECT ARRAY(
        SELECT p.id FROM profiles p WHERE p.id = ANY(v_match.player_ids)
      ) INTO v_user_ids;

      IF array_length(v_user_ids, 1) > 0 THEN
        -- Insert in-app notification
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

-- ── Function: warn about approaching deadline ────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_deadline_approaching_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_match record;
  v_match_time timestamptz;
  v_user_ids uuid[];
BEGIN
  FOR v_match IN
    SELECT m.id, m.match_date, m.match_time, m.player_ids
    FROM matches m
    WHERE m.status IN ('scheduled', 'confirmed', 'pending', 'open')
      AND m.push_deadline_sent IS NOT TRUE
      AND NOT EXISTS (SELECT 1 FROM match_results mr WHERE mr.match_id = m.id)
  LOOP
    v_match_time := (v_match.match_date::timestamp +
      COALESCE(v_match.match_time::time, '00:00:00'::time));

    -- 23 hours after match time (1 hour before deadline)
    IF v_match_time + INTERVAL '23 hours' < NOW()
       AND v_match_time + INTERVAL '24 hours' > NOW() THEN

      SELECT ARRAY(
        SELECT p.id FROM profiles p WHERE p.id = ANY(v_match.player_ids)
      ) INTO v_user_ids;

      IF array_length(v_user_ids, 1) > 0 THEN
        INSERT INTO notifications (user_id, type, title, message, related_id, read)
        SELECT unnest(v_user_ids), 'match_deadline_approaching',
               'Result entry closes in 1 hour',
               'Tap to record your result before it auto-cancels.',
               v_match.id, false;
      END IF;

      UPDATE matches SET push_deadline_sent = true WHERE id = v_match.id;
    END IF;
  END LOOP;
END;
$$;

-- ── Schedule cron jobs ──────────────────────────────────────────────────────
-- Result prompt: every 15 minutes
SELECT cron.schedule(
  'push-match-result-prompt',
  '*/15 * * * *',
  $$SELECT public.send_match_result_prompts();$$
);

-- Deadline approaching: every 30 minutes
SELECT cron.schedule(
  'push-deadline-approaching',
  '*/30 * * * *',
  $$SELECT public.send_deadline_approaching_alerts();$$
);
