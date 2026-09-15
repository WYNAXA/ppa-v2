-- Scheduled jobs are part of the schema.
--
-- WHY THIS EXISTS
--   The production baseline (20260915090000_baseline_from_production.sql) was
--   produced by `supabase db dump`, which covers the public schema. pg_cron
--   jobs live in the `cron` schema, so the dump contains none of them —
--   verified: zero cron.schedule() calls in 24,446 lines.
--
--   Rebuilding from that baseline alone produces an app where no push
--   notification fires, no poll closes, no jersey is awarded, no booking
--   deadline is processed and no expired review resolves. Everything looks
--   correct and none of the scheduled work happens.
--
--   The supabase_realtime publication IS in the dump (13 ADD TABLE lines), so
--   only cron needed recovering.
--
-- IDEMPOTENT
--   unschedule-then-schedule, so this is safe to run against a database that
--   already has these jobs and safe on a fresh rebuild. Applied to production
--   on creation rather than repaired-as-applied, so the file is proven to work
--   rather than assumed to.
--
-- NO SECRETS
--   Eleven jobs call a SECURITY DEFINER function. process-booking-deadlines
--   posts to an edge function with an x-cron-secret header read from
--   vault.decrypted_secrets at run time — the secret is never in this file.
--
-- REBUILD NOTE
--   A rebuilt database needs the vault secret `deadline_cron_secret` recreated
--   by hand before process-booking-deadlines will authenticate. Vault contents
--   are data, not DDL, and deliberately live in no file.

do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'auto-resolve-expired-reviews','auto-verify-pending-results',
    'award-entertainer-jersey','award-weekly-jerseys','close-expired-polls',
    'cron-health-check','cron-health-heartbeat','notify-waitlist',
    'process-booking-deadlines','push-deadline-approaching',
    'push-match-reminder','push-match-result-prompt'
  ] loop
    if exists (select 1 from cron.job where jobname = v_name) then
      perform cron.unschedule(v_name);
    end if;
  end loop;
end $$;

select cron.schedule('auto-resolve-expired-reviews', '0 * * * *',  'SELECT public.auto_resolve_expired_reviews();');
select cron.schedule('auto-verify-pending-results',  '0 * * * *',  'SELECT public.auto_verify_old_pending_results();');
select cron.schedule('award-entertainer-jersey',     '0 2 * * 2',  'SELECT public.award_entertainer_jersey();');
select cron.schedule('award-weekly-jerseys',         '0 2 * * 2',  'SELECT public.award_weekly_jerseys();');
select cron.schedule('close-expired-polls',          '5 * * * *',  'SELECT public.close_expired_polls();');
select cron.schedule('cron-health-check',            '20 * * * *', 'SELECT public.check_cron_health();');
select cron.schedule('cron-health-heartbeat',        '0 8 * * 1',  'SELECT public.cron_health_heartbeat();');
select cron.schedule('push-deadline-approaching',    '*/30 * * * *', 'SELECT public.send_deadline_approaching_alerts();');
select cron.schedule('push-match-reminder',          '*/10 * * * *', 'SELECT public.send_match_reminders();');
select cron.schedule('push-match-result-prompt',     '*/15 * * * *', 'SELECT public.send_match_result_prompts();');

select cron.schedule('notify-waitlist', '*/15 * * * *', $job$ select net.http_post(
       url := 'https://timbjfihsxqfrqrxwdny.supabase.co/functions/v1/notify-waitlist',
       headers := jsonb_build_object('Content-Type','application/json'),
       body := '{}'::jsonb
     ); $job$);

select cron.schedule('process-booking-deadlines', '*/15 * * * *', $job$ SELECT net.http_post( url := 'https://timbjfihsxqfrqrxwdny.supabase.co/functions/v1/process-booking-deadlines', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'deadline_cron_secret')), body := '{}'::jsonb); $job$);
