-- =============================================================================
-- Auto-dispatch push notifications when a row is inserted into notifications.
-- Uses pg_net to call the send-push Edge Function asynchronously.
-- Push failures never block the in-app notification from being recorded.
-- =============================================================================

-- Ensure pg_net extension is available
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── Dispatch function ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dispatch_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_service_role_key text;
  v_supabase_url text;
BEGIN
  -- Read config from Supabase built-in settings
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_role_key := current_setting('app.settings.service_role_key', true);

  -- Fallback to env-based config if app.settings not available
  IF v_supabase_url IS NULL THEN
    v_supabase_url := 'https://timbjfihsxqfrqrxwdny.supabase.co';
  END IF;

  -- If no service_role_key available, skip push silently (in-app notif still saved)
  IF v_service_role_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fire-and-forget HTTP call to send-push edge function.
  -- Wrapped in BEGIN/EXCEPTION so failures never block the notification insert.
  BEGIN
    PERFORM extensions.http_post(
      url := v_supabase_url || '/functions/v1/send-push',
      body := jsonb_build_object(
        'user_ids', jsonb_build_array(NEW.user_id::text),
        'title',   COALESCE(NEW.title, 'Notification'),
        'message', COALESCE(NEW.message, ''),
        'tag',     COALESCE(NEW.type, 'general')
      )::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      )::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    -- Push dispatch failed — log but don't block the notification insert
    RAISE WARNING 'dispatch_push_notification failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- ── Trigger ────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_dispatch_push ON notifications;

CREATE TRIGGER trg_dispatch_push
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION dispatch_push_notification();

COMMENT ON FUNCTION dispatch_push_notification() IS
  'Fires after each notification INSERT to dispatch a Web Push via the send-push edge function.';
