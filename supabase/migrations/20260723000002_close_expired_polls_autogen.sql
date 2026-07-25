-- ══════════════════════════════════════════════════════════════════════════════
-- close_expired_polls() — v2, adds optional auto-generation
--
-- Extends the hourly poll-closing job: when a poll closes AND its group has
-- auto_match_enabled = true, calls the poll-scheduler edge function in 'auto'
-- mode (propose + confirm server-side) via pg_net, authenticated with the
-- poll_cron_secret vault secret.
--
-- When auto_match_enabled is false (the default), behaviour is unchanged:
-- group admins are notified to generate matches manually.
--
-- Runs via existing pg_cron job 'close-expired-polls' (hourly, 5 past).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.close_expired_polls()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_poll     record;
  v_admin    record;
  v_count    integer := 0;
  v_auto     boolean;
  v_secret   text;
  v_url      text := 'https://timbjfihsxqfrqrxwdny.supabase.co/functions/v1/poll-scheduler';
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'poll_cron_secret';

  FOR v_poll IN
    SELECT p.id, p.title, p.group_id
    FROM polls p
    WHERE p.status = 'open'
      AND p.closes_at IS NOT NULL
      AND p.closes_at < now()
  LOOP
    UPDATE polls
    SET status = 'closed', updated_at = now()
    WHERE id = v_poll.id;

    SELECT COALESCE(auto_match_enabled, false) INTO v_auto
    FROM groups WHERE id = v_poll.group_id;

    IF v_auto AND v_secret IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', v_secret
        ),
        body := jsonb_build_object('mode', 'auto', 'poll_id', v_poll.id)
      );
    ELSE
      FOR v_admin IN
        SELECT gm.user_id
        FROM group_members gm
        WHERE gm.group_id = v_poll.group_id
          AND gm.role = 'admin'
      LOOP
        INSERT INTO notifications (user_id, type, title, message, related_id, read)
        VALUES (
          v_admin.user_id,
          'poll',
          'Poll closed — matches needed',
          'Voting has closed on "' || v_poll.title || '". Open the poll to generate matches.',
          v_poll.id,
          false
        );
      END LOOP;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
