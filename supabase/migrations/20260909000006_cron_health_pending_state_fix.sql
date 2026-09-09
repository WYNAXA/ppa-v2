-- ── Cron health: 'pending' state for newly created jobs ─────────────────────
--
-- WHY THIS FILE EXISTS SEPARATELY:
--   The first revision of check_cron_health() classified any job with no run
--   history as 'stalled'. Within seconds of being scheduled it therefore
--   flagged ITSELF (cron-health-check) and its own heartbeat as stalled and
--   pushed two false alerts to every platform admin.
--
--   Migration 20260909000005 has been corrected in place, so a fresh database
--   never sees that bug. This file exists so the REPO's migration history
--   matches what PRODUCTION actually ran — production applied the original
--   revision and then this correction. Leaving it out would create exactly the
--   kind of repo/remote divergence that caused three of today's outages.
--
--   Every statement below is idempotent, so applying 000005 (corrected) and
--   then this file lands in the same state as production.
--
-- THE RULE THAT CHANGED:
--   A job with no runs yet is 'pending', not 'stalled'. It only becomes
--   'stalled' once it has had a full 24 hours to fire and still has not.
--   'pending' counts as healthy and never alerts.

ALTER TABLE public.cron_health_state
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.check_cron_health()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_job record; v_prev record; v_status text; v_should_alert boolean;
  v_title text; v_msg text;
  v_alerts int := 0; v_checked int := 0; v_unhealthy int := 0;
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
      SELECT jobid, percentile_cont(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(epoch FROM (newer_start - start_time))) AS median_gap_secs
      FROM runs WHERE rn <= 10 AND newer_start IS NOT NULL GROUP BY jobid
    ),
    latest AS (SELECT jobid, status, return_message, start_time FROM runs WHERE rn = 1),
    fails AS (
      SELECT d.jobid, count(*) AS failures_24h FROM cron.job_run_details d
      WHERE d.status = 'failed' AND d.start_time > now() - interval '24 hours' GROUP BY d.jobid
    )
    SELECT j.jobid, j.jobname, l.status AS last_status, l.return_message,
           l.start_time AS last_run_at, COALESCE(f.failures_24h, 0) AS failures_24h,
           c.median_gap_secs
    FROM cron.job j
    LEFT JOIN latest l ON l.jobid = j.jobid
    LEFT JOIN fails f ON f.jobid = j.jobid
    LEFT JOIN cadence c ON c.jobid = j.jobid
    WHERE j.active
  LOOP
    v_checked := v_checked + 1;

    SELECT * INTO v_prev FROM cron_health_state WHERE jobid = v_job.jobid;

    IF v_job.last_run_at IS NULL THEN
      IF COALESCE(v_prev.first_seen_at, now()) > now() - interval '24 hours' THEN
        v_status := 'pending';
      ELSE
        v_status := 'stalled';
      END IF;
    ELSIF v_job.median_gap_secs IS NOT NULL
          AND v_job.last_run_at < now() - make_interval(
                secs => GREATEST(v_job.median_gap_secs * 3, 5400)) THEN
      v_status := 'stalled';
    ELSIF v_job.last_status = 'failed' THEN
      v_status := 'failing';
    ELSIF v_job.failures_24h >= 3 THEN
      v_status := 'degraded';
    ELSE
      v_status := 'ok';
    END IF;

    IF v_status NOT IN ('ok', 'pending') THEN
      v_unhealthy := v_unhealthy + 1;
    END IF;

    v_should_alert :=
         (v_status NOT IN ('ok','pending')
            AND (v_prev.jobid IS NULL OR v_prev.status IN ('ok','pending')))
      OR (v_status NOT IN ('ok','pending') AND v_prev.alerted_at IS NOT NULL
            AND v_prev.alerted_at < now() - interval '24 hours')
      OR (v_status = 'ok' AND v_prev.jobid IS NOT NULL
            AND v_prev.status NOT IN ('ok','pending'));

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
      (jobid, jobname, status, failures_24h, last_run_at, last_error, alerted_at, first_seen_at, last_checked_at)
    VALUES
      (v_job.jobid, v_job.jobname, v_status, v_job.failures_24h, v_job.last_run_at,
       left(v_job.return_message, 500),
       CASE WHEN v_should_alert THEN now() ELSE NULL END,
       COALESCE(v_prev.first_seen_at, now()), now())
    ON CONFLICT (jobid) DO UPDATE SET
      jobname = EXCLUDED.jobname, status = EXCLUDED.status,
      failures_24h = EXCLUDED.failures_24h, last_run_at = EXCLUDED.last_run_at,
      last_error = EXCLUDED.last_error,
      alerted_at = CASE WHEN v_should_alert THEN now() ELSE s.alerted_at END,
      last_checked_at = now();
  END LOOP;

  RETURN jsonb_build_object('checked', v_checked, 'unhealthy', v_unhealthy, 'alerts_sent', v_alerts);
END;
$fn$;

-- Clear the false 'stalled' rows the first revision wrote for the monitor and
-- its heartbeat, so no bogus "recovered" alert fires when they first run.
UPDATE public.cron_health_state
SET status = 'pending', alerted_at = NULL, first_seen_at = now()
WHERE jobid IN (
  SELECT jobid FROM cron.job
  WHERE jobname IN ('cron-health-check','cron-health-heartbeat')
);

-- Remove the false notifications already delivered.
DELETE FROM public.notifications
WHERE type = 'cron_health'
  AND title = 'Scheduled job stalled'
  AND created_at > now() - interval '1 hour';
