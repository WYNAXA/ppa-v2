-- Register the hourly 'close-expired-polls' pg_cron job in version control.
--
-- Audit finding (2026-07-28, H4): 20260723000001 documented this job only as a
-- COMMENTED-OUT cron.schedule, and 20260723000002 assumes it "runs via existing
-- pg_cron job". If the job was never hand-created in the dashboard, expired polls
-- never close AND the poll-scheduler auto-match path (net.http_post from
-- close_expired_polls) never fires — auto-scheduling silently no-ops.
--
-- This makes the schedule reproducible from the repo. Idempotent: any existing
-- job of the same name is unscheduled first so pushing this can't create a
-- duplicate.
DO $$
BEGIN
  PERFORM cron.unschedule('close-expired-polls');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job did not exist yet; nothing to unschedule
END $$;

SELECT cron.schedule(
  'close-expired-polls',
  '5 * * * *',                                  -- hourly, 5 minutes past
  $cron$SELECT public.close_expired_polls();$cron$
);
