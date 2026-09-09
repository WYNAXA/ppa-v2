-- ── Move operational alerts off the player push channel ────────────────────
--
-- WHAT WENT WRONG:
--   20260909000005 routed cron health alerts through public.notifications,
--   which fans out to dispatch_notification_to_onesignal and becomes a phone
--   push. Two problems, both real:
--
--     1. CIRCULAR DEPENDENCY. The outage this monitor exists to catch was the
--        push pipeline being dead for four weeks. A monitor reporting through
--        that same pipeline cannot report that the pipeline is down.
--
--     2. WRONG CHANNEL FOR THE CONTENT. "Scheduled job failing" was delivered
--        to admin accounts on the identical channel players receive
--        "How did your match go?". Correctly targeted, still wrong. Operational
--        text must be structurally incapable of reaching a player's device.
--
--   Only platform admins were ever addressed, and OneSignal confirmed just one
--   device actually received anything. No player was affected. The fix is
--   architectural, not damage control.
--
-- THE FIX:
--   Alerts go to admin EMAIL via the ops-alert Edge Function (Resend), using
--   the same Vault shared-secret pattern as process-elo and notify-onesignal.
--   notify_platform_admins() no longer writes to public.notifications at all,
--   so no future ops alert can reach push even by mistake. Health history stays
--   queryable in cron_health_state.
--
-- PREREQUISITE: Vault secret 'ops_alert_secret' and Edge Function secret
--   OPS_ALERT_SECRET must both exist. This migration asserts the Vault half.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'ops_alert_secret') THEN
    RAISE EXCEPTION 'Vault secret ops_alert_secret is missing. Create it before applying this migration.';
  END IF;
END $$;

-- ── Admin email lookup (auth schema stays behind a definer function) ────────
CREATE OR REPLACE FUNCTION public.platform_admin_emails()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(ARRAY_AGG(u.email ORDER BY u.email), '{}'::text[])
  FROM platform_admins pa
  JOIN auth.users u ON u.id = pa.user_id
  WHERE u.email IS NOT NULL;
$fn$;

REVOKE ALL ON FUNCTION public.platform_admin_emails() FROM PUBLIC, anon, authenticated;

-- ── Replace the notifier: email only, never public.notifications ────────────
CREATE OR REPLACE FUNCTION public.notify_platform_admins(
  p_type    text,
  p_title   text,
  p_message text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_emails text[];
  v_secret text;
BEGIN
  v_emails := public.platform_admin_emails();

  IF array_length(v_emails, 1) IS NULL THEN
    RAISE WARNING '[notify_platform_admins] no admin email addresses for: %', p_title;
    RETURN 0;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'ops_alert_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING '[notify_platform_admins] vault secret ops_alert_secret missing; alert not sent: %', p_title;
    RETURN 0;
  END IF;

  -- Deliberately NOT an insert into public.notifications. Operational alerts
  -- must not be able to reach the player push channel by any path.
  PERFORM net.http_post(
    url     := 'https://timbjfihsxqfrqrxwdny.supabase.co/functions/v1/ops-alert',
    headers := jsonb_build_object(
                 'Content-Type',     'application/json',
                 'x-webhook-secret', v_secret
               ),
    body    := jsonb_build_object(
                 'subject',    p_title,
                 'body',       p_message,
                 'recipients', to_jsonb(v_emails)
               ),
    timeout_milliseconds := 5000
  );

  RETURN array_length(v_emails, 1);
END;
$fn$;

COMMENT ON FUNCTION public.notify_platform_admins(text, text, text) IS
  'Sends an operational alert to platform admins by EMAIL via the ops-alert Edge Function. Never writes to public.notifications — ops alerts must not be able to reach the player push channel.';

-- ── Seed-silent first run ───────────────────────────────────────────────────
-- The original revision alerted on its very first execution, which is how a
-- burst of five arrived at once. A monitor's first run should record state and
-- say nothing; alerting begins at the second run, on an actual state change.
-- Any job not yet in the table is seeded here as 'ok' so nothing back-fires.
INSERT INTO public.cron_health_state (jobid, jobname, status, first_seen_at, last_checked_at)
SELECT j.jobid, j.jobname, 'ok', now(), now()
FROM cron.job j
WHERE j.active
ON CONFLICT (jobid) DO NOTHING;
