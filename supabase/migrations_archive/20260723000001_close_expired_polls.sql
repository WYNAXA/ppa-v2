-- ══════════════════════════════════════════════════════════════════════════════
-- close_expired_polls()
--
-- Closes any poll whose closes_at deadline has passed and notifies that
-- group's admins that matches need generating.
--
-- WHY: polls had no automated closing. 20 polls sat in 'open' status with
-- deadlines months past, and two consecutive weeks (27 Jul, 3 Aug) closed
-- without anyone generating fixtures because nothing surfaced that the poll
-- was waiting. Match generation remains a manual admin action.
--
-- Scheduled hourly at 5 past via pg_cron job 'close-expired-polls'.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.close_expired_polls()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_poll   record;
  v_admin  record;
  v_count  integer := 0;
BEGIN
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

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Cron registration (applied separately; recorded here for reference):
-- SELECT cron.schedule('close-expired-polls', '5 * * * *',
--                      $cron$SELECT public.close_expired_polls();$cron$);
