-- ── Cron health monitoring ──────────────────────────────────────────────────
--
-- WHY THIS EXISTS:
--   On 2026-09-09 three scheduled systems were found dead, having failed
--   silently for between four and twelve weeks:
--     job  7  push-match-result-prompt      8,131 failures since 2026-06-16
--     job 15  auto-verify-pending-results     665 failures since 2026-08-12
--     job 12  award-entertainer-jersey          7 failures since 2026-06-30
--   Every one of those failures was already recorded in cron.job_run_details.
--   Nothing read it. The evidence existed for 85 days and cost four weeks of
--   league data because no one was looking.
--
--   This is the root-cause fix for the class, not for any one of those bugs:
--   the individual crashes were cheap to repair once found. The expensive
--   defect was the absence of detection.
--
-- DESIGN NOTES:
--   1. Reuses the notification path (notifications -> dispatch_notification_to_
--      onesignal -> push) rather than adding infrastructure. That path was
--      itself dead until today, so this monitor and the thing it monitors share
--      a dependency — see the heartbeat below, which is how that is covered.
--
--   2. "Stalled" detection is self-calibrating. Rather than parsing cron
--      expressions, each job's expected cadence is derived from the median gap
--      between its own recent runs. A */15 job and a weekly job are both judged
--      against their own history, so no schedule table needs maintaining and a
--      schedule change needs no code change.
--
--   3. Alerts are throttled by state, not suppressed. A job alerts when it
--      transitions into an unhealthy state, and re-alerts at most once every 24
--      hours while it stays unhealthy. It also alerts on RECOVERY, so a silent
--      fix is visible too.
--
--   4. A weekly heartbeat fires whether or not anything is wrong. This is the
--      answer to "who watches the watcher": if the heartbeat stops arriving,
--      the monitor itself is down. A monitor that is only heard from when it
--      has bad news is indistinguishable from a broken one — which is exactly
--      the failure mode this migration exists to end.
--
--   5. Recipients go through notifiable_players() so a deleted admin can never
--      reproduce the FK crash that took out auto-verify.

-- ── State table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cron_health_state (
  jobid                bigint PRIMARY KEY,
  jobname              text        NOT NULL,
  status               text        NOT NULL DEFAULT 'unknown',
  failures_24h         integer     NOT NULL DEFAULT 0,
  last_run_at          timestamptz,
  last_error           text,
  alerted_at           timestamptz,
  last_checked_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cron_health_state IS
  'One row per pg_cron job. Tracks health between runs of check_cron_health() so alerts fire on state change rather than every hour.';

ALTER TABLE public.cron_health_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cron_health_state_admin_read ON public.cron_health_state;
CREATE POLICY cron_health_state_admin_read ON public.cron_health_state
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = auth.uid()));

-- ── Helper: notify every platform admin ─────────────────────────────────────
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
  v_recipients uuid[];
  v_count      integer;
BEGIN
  SELECT public.notifiable_players(ARRAY_AGG(pa.user_id))
    INTO v_recipients
    FROM platform_admins pa;

  IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
    RAISE WARNING '[notify_platform_admins] no notifiable admins for: %', p_title;
    RETURN 0;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, read)
  SELECT unnest(v_recipients), p_type, p_title, p_message, false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

-- ── The check ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_cron_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_job          record;
  v_prev         record;
  v_status       text;
  v_should_alert boolean;
  v_title        text;
  v_msg          text;
  v_alerts       int := 0;
  v_checked      int := 0;
  v_unhealthy    int := 0;
BEGIN
  FOR v_job IN
    WITH runs AS (
      SELECT d.jobid, d.status, d.return_message, d.start_time,
             row_number() OVER (PARTITION BY d.jobid ORDER BY d.start_time DESC) AS rn,
             lag(d.start_time) OVER (PARTITION BY d.jobid ORDER BY d.start_time DESC) AS newer_start
      FROM cron.job_run_details d
      WHERE d.start_time > now() - interval '30 days'
    ),
    cadence AS (
      -- median gap between this job's own recent runs; self-calibrating, so no
      -- cron expression ever has to be parsed
      SELECT jobid,
             percentile_cont(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(epoch FROM (newer_start - start_time))
             ) AS median_gap_secs
      FROM runs
      WHERE rn <= 10 AND newer_start IS NOT NULL
      GROUP BY jobid
    ),
    latest AS (
      SELECT jobid, status, return_message, start_time
      FROM runs WHERE rn = 1
    ),
    fails AS (
      SELECT d.jobid, count(*) AS failures_24h
      FROM cron.job_run_details d
      WHERE d.status = 'failed' AND d.start_time > now() - interval '24 hours'
      GROUP BY d.jobid
    )
    SELECT j.jobid, j.jobname,
           l.status        AS last_status,
           l.return_message,
           l.start_time    AS last_run_at,
           COALESCE(f.failures_24h, 0) AS failures_24h,
           c.median_gap_secs
    FROM cron.job j
    LEFT JOIN latest  l ON l.jobid = j.jobid
    LEFT JOIN fails   f ON f.jobid = j.jobid
    LEFT JOIN cadence c ON c.jobid = j.jobid
    WHERE j.active
  LOOP
    v_checked := v_checked + 1;

    -- Classify. 'stalled' means the job is enabled but has stopped firing at
    -- anything like its own historical cadence (3x median gap, floor 90 min).
    IF v_job.last_run_at IS NULL THEN
      v_status := 'stalled';
    ELSIF v_job.median_gap_secs IS NOT NULL
          AND v_job.last_run_at < now() - make_interval(
                secs => GREATEST(v_job.median_gap_secs * 3, 5400))
    THEN
      v_status := 'stalled';
    ELSIF v_job.last_status = 'failed' THEN
      -- Judged on the LATEST run, deliberately. An earlier draft used
      -- "failures_24h > 0", which would have kept a job marked broken for a
      -- full day after it started succeeding again, and hidden its recovery.
      -- The 24h count is severity context, not the trigger.
      v_status := 'failing';
    ELSIF v_job.failures_24h >= 3 THEN
      -- Latest run passed but the job is flapping. Worth surfacing once,
      -- without treating every flip as a state change.
      v_status := 'degraded';
    ELSE
      v_status := 'ok';
    END IF;

    IF v_status <> 'ok' THEN
      v_unhealthy := v_unhealthy + 1;
    END IF;

    SELECT * INTO v_prev FROM cron_health_state WHERE jobid = v_job.jobid;

    -- Alert on: entering an unhealthy state, still unhealthy 24h later, or
    -- recovering from one. Never silent about a change of state.
    v_should_alert :=
         (v_status <> 'ok' AND (v_prev.jobid IS NULL OR v_prev.status = 'ok'))
      OR (v_status <> 'ok' AND v_prev.alerted_at IS NOT NULL
            AND v_prev.alerted_at < now() - interval '24 hours')
      OR (v_status = 'ok' AND v_prev.jobid IS NOT NULL AND v_prev.status <> 'ok');

    IF v_should_alert THEN
      IF v_status = 'ok' THEN
        v_title := 'Scheduled job recovered';
        v_msg   := v_job.jobname || ' is running cleanly again.';
      ELSIF v_status = 'stalled' THEN
        v_title := 'Scheduled job stalled';
        v_msg   := v_job.jobname || ' has stopped running. Last run: '
                   || COALESCE(v_job.last_run_at::text, 'never') || '.';
      ELSIF v_status = 'degraded' THEN
        v_title := 'Scheduled job unstable';
        v_msg   := v_job.jobname || ' last run passed but failed '
                   || v_job.failures_24h || ' time(s) in 24h.';
      ELSE
        v_title := 'Scheduled job failing';
        v_msg   := v_job.jobname || ' failed ' || v_job.failures_24h
                   || ' time(s) in 24h. ' || left(COALESCE(v_job.return_message, ''), 160);
      END IF;

      PERFORM public.notify_platform_admins('cron_health', v_title, v_msg);
      v_alerts := v_alerts + 1;
    END IF;

    INSERT INTO cron_health_state AS s
      (jobid, jobname, status, failures_24h, last_run_at, last_error, alerted_at, last_checked_at)
    VALUES
      (v_job.jobid, v_job.jobname, v_status, v_job.failures_24h, v_job.last_run_at,
       left(v_job.return_message, 500),
       CASE WHEN v_should_alert THEN now() ELSE NULL END,
       now())
    ON CONFLICT (jobid) DO UPDATE SET
      jobname         = EXCLUDED.jobname,
      status          = EXCLUDED.status,
      failures_24h    = EXCLUDED.failures_24h,
      last_run_at     = EXCLUDED.last_run_at,
      last_error      = EXCLUDED.last_error,
      alerted_at      = CASE WHEN v_should_alert THEN now() ELSE s.alerted_at END,
      last_checked_at = now();
  END LOOP;

  RETURN jsonb_build_object(
    'checked', v_checked, 'unhealthy', v_unhealthy, 'alerts_sent', v_alerts);
END;
$fn$;

-- ── Weekly heartbeat — proves the monitor itself is alive ───────────────────
CREATE OR REPLACE FUNCTION public.cron_health_heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_total     int;
  v_unhealthy int;
  v_names     text;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE status <> 'ok'),
         string_agg(jobname, ', ') FILTER (WHERE status <> 'ok')
    INTO v_total, v_unhealthy, v_names
    FROM cron_health_state;

  PERFORM public.notify_platform_admins(
    'cron_health',
    CASE WHEN v_unhealthy = 0
         THEN 'Weekly check: all scheduled jobs healthy'
         ELSE 'Weekly check: ' || v_unhealthy || ' job(s) unhealthy' END,
    CASE WHEN v_unhealthy = 0
         THEN v_total || ' jobs monitored, all green.'
         ELSE v_total || ' jobs monitored. Unhealthy: ' || v_names END
  );
END;
$fn$;

-- ── Schedule ────────────────────────────────────────────────────────────────
SELECT cron.unschedule('cron-health-check')     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-health-check');
SELECT cron.unschedule('cron-health-heartbeat') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-health-heartbeat');

SELECT cron.schedule('cron-health-check', '20 * * * *',
  $$SELECT public.check_cron_health();$$);

SELECT cron.schedule('cron-health-heartbeat', '0 8 * * 1',
  $$SELECT public.cron_health_heartbeat();$$);
