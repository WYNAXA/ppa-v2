-- ── Fix A: webhook auth off legacy JWTs, onto the Vault shared-secret pattern ──
--
-- ROOT CAUSE (not a workaround):
--   Both webhook triggers on this database were created by
--   supabase_functions.http_request(...) with a legacy HS256 service_role JWT
--   hardcoded in the trigger definition. Supabase has disabled legacy JWT auth
--   on this project, so the Edge Function gateway now rejects every call:
--       {"code":"UNAUTHORIZED_LEGACY_JWT","message":"Invalid JWT"}
--   Verified live on 2026-09-09 via net.http_post (response id 24800).
--
--   Consequence: process-elo has not run since 2026-08-11 (no ELO, no league
--   standings), and notify-onesignal has not run either (no push).
--
-- THE FIX: adopt the pattern already proven in this project by
--   process-booking-deadlines / poll-scheduler — a per-function shared secret
--   held in Vault, sent as a header, checked inside the function, with
--   verify_jwt disabled at the gateway. No key material lives in a trigger
--   definition, and nothing here breaks again when Supabase rotates keys.
--
-- FIX CLASS: (a) root-cause. It is not a workaround: the legacy JWT is removed
--   entirely rather than replaced with another long-lived key, and the failure
--   mode that caused this outage cannot recur.
--
-- BLAST RADIUS: exactly two triggers use supabase_functions.http_request in
--   this database (confirmed by querying pg_trigger for tgfoid = http_request):
--     public.match_results.process-elo-on-verify   -> process-elo
--     public.notifications.notifications_to_onesignal -> notify-onesignal
--   Both are replaced below. No other consumer is affected. The payload shape
--   ({type, table, schema, record, old_record}) is reproduced exactly, because
--   both Edge Functions parse it — notify-onesignal asserts payload.table.
--
-- PREREQUISITES (must be done before this migration is applied):
--   1. Dashboard > Edge Functions > Secrets: set ELO_WEBHOOK_SECRET and
--      ONESIGNAL_WEBHOOK_SECRET.
--   2. Store the same two values in Vault under 'elo_webhook_secret' and
--      'onesignal_webhook_secret'.
--   3. Redeploy both functions with --no-verify-jwt and the header check.
--   This migration asserts (2) and fails loudly if it is missing.

-- ── Guard: refuse to deploy a half-configured webhook ───────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'elo_webhook_secret') THEN
    RAISE EXCEPTION 'Vault secret elo_webhook_secret is missing. Create it before applying this migration.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'onesignal_webhook_secret') THEN
    RAISE EXCEPTION 'Vault secret onesignal_webhook_secret is missing. Create it before applying this migration.';
  END IF;
END $$;

-- ── Remove the legacy-JWT triggers (this also deletes the plaintext
--    service_role key that was readable by anyone who could read pg_trigger) ──
DROP TRIGGER IF EXISTS "process-elo-on-verify"      ON public.match_results;
DROP TRIGGER IF EXISTS notifications_to_onesignal   ON public.notifications;

-- ── Dispatcher: match_results -> process-elo ────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_match_result_to_elo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'elo_webhook_secret';

  -- Loud, not silent. A missing secret is the failure mode that caused the
  -- August outage; we surface it rather than swallow it, but we do not abort
  -- the user's INSERT over a server config problem.
  IF v_secret IS NULL THEN
    RAISE WARNING '[dispatch_match_result_to_elo] vault secret elo_webhook_secret missing; ELO will not process for %', NEW.id;
  END IF;

  PERFORM net.http_post(
    url     := 'https://timbjfihsxqfrqrxwdny.supabase.co/functions/v1/process-elo',
    headers := jsonb_build_object(
                 'Content-Type',    'application/json',
                 'x-webhook-secret', v_secret
               ),
    body    := jsonb_build_object(
                 'type',       TG_OP,
                 'table',      TG_TABLE_NAME,
                 'schema',     TG_TABLE_SCHEMA,
                 'record',     to_jsonb(NEW),
                 'old_record', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
               ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

-- BEHAVIOUR CHANGE, stated deliberately: the old trigger fired on EVERY insert
-- and update of match_results, including process-elo's own elo_processed
-- writeback, which re-invoked the function to be told "already processed".
-- The WHEN clause below gives identical coverage (INSERT already verified, and
-- UPDATE transitioning to verified) without the self-retrigger.
CREATE TRIGGER dispatch_match_result_to_elo
AFTER INSERT OR UPDATE ON public.match_results
FOR EACH ROW
WHEN (NEW.verification_status = 'verified' AND NEW.elo_processed IS NOT TRUE)
EXECUTE FUNCTION public.dispatch_match_result_to_elo();

-- ── Dispatcher: notifications -> notify-onesignal ───────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_notification_to_onesignal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'onesignal_webhook_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING '[dispatch_notification_to_onesignal] vault secret onesignal_webhook_secret missing; push will not send for %', NEW.id;
  END IF;

  PERFORM net.http_post(
    url     := 'https://timbjfihsxqfrqrxwdny.supabase.co/functions/v1/notify-onesignal',
    headers := jsonb_build_object(
                 'Content-Type',    'application/json',
                 'x-webhook-secret', v_secret
               ),
    body    := jsonb_build_object(
                 'type',       TG_OP,
                 'table',      TG_TABLE_NAME,
                 'schema',     TG_TABLE_SCHEMA,
                 'record',     to_jsonb(NEW),
                 'old_record', NULL
               ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER dispatch_notification_to_onesignal
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.dispatch_notification_to_onesignal();
