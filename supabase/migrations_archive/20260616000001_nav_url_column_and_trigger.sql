-- =============================================================================
-- Add nav_url column to notifications, populated by a BEFORE INSERT trigger.
-- Single source of truth for notification→URL routing.
-- Already applied via SQL Editor.
-- =============================================================================

-- 1. Add the column
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS nav_url text;

-- 2. BEFORE INSERT trigger: compute nav_url from type + related_id
CREATE OR REPLACE FUNCTION public.compute_notification_nav_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.nav_url := CASE
    -- Group-related
    WHEN NEW.type IN (
      'group_invite', 'group_join', 'group_join_request',
      'group_update', 'announcement',
      'ringer_offer', 'ringer_approved', 'ringer_declined'
    ) THEN '/community/groups/' || COALESCE(NEW.related_id::text, '')

    -- Match-related
    WHEN NEW.type IN (
      'match_created', 'match_result', 'match_suggested', 'match_scheduled',
      'result_verify', 'result_pending_verification', 'result_verified', 'result_disputed',
      'match_result_prompt', 'match_deadline_approaching', 'match_auto_cancelled',
      'match_invitation', 'match_reminder',
      'lift_requested', 'lift_accepted', 'lift_declined'
    ) THEN '/matches/' || COALESCE(NEW.related_id::text, '')

    -- Match-related prefixes
    WHEN NEW.type LIKE 'ringer_for_%' THEN '/matches/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE 'open_match_%' THEN '/matches/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE 'invitation_%' THEN '/matches/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE 'invitee_%'    THEN '/matches/' || COALESCE(NEW.related_id::text, '')

    -- League-related
    WHEN NEW.type IN ('league_invite', 'league_update')
      THEN '/compete/leagues/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE 'league_%'
      THEN '/compete/leagues/' || COALESCE(NEW.related_id::text, '')

    -- Polls
    WHEN NEW.type IN ('poll_created')
      THEN '/play/availability/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE 'poll_%'
      THEN '/play/availability/' || COALESCE(NEW.related_id::text, '')

    -- Connections
    WHEN NEW.type IN ('connection_request', 'connection_accepted')
      THEN '/community#connections'

    -- Achievements
    WHEN NEW.type = 'achievement' THEN '/you'

    -- Court bookings
    WHEN NEW.type = 'court_booked'
      THEN '/matches/' || COALESCE(NEW.related_id::text, '')

    -- Fallback catch-all patterns
    WHEN NEW.type LIKE '%match%'  THEN '/matches/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE '%league%' THEN '/compete/leagues/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE '%group%'  THEN '/community/groups/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE '%poll%'   THEN '/play/availability/' || COALESCE(NEW.related_id::text, '')

    -- Default
    ELSE '/notifications'
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_nav_url ON notifications;
CREATE TRIGGER trg_compute_nav_url
  BEFORE INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION compute_notification_nav_url();

-- 3. Refactor dispatch_push_notification to read NEW.nav_url instead of recomputing
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
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_role_key := current_setting('app.settings.service_role_key', true);

  IF v_supabase_url IS NULL THEN
    v_supabase_url := 'https://timbjfihsxqfrqrxwdny.supabase.co';
  END IF;

  IF v_service_role_key IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM extensions.http_post(
      url := v_supabase_url || '/functions/v1/send-push',
      body := jsonb_build_object(
        'user_ids', jsonb_build_array(NEW.user_id::text),
        'title',   COALESCE(NEW.title, 'Notification'),
        'message', COALESCE(NEW.message, ''),
        'url',     COALESCE(NEW.nav_url, '/notifications'),
        'tag',     COALESCE(NEW.type, 'general')
      )::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      )::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'dispatch_push_notification failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION dispatch_push_notification() IS
  'Fires after each notification INSERT to dispatch a Web Push via the send-push edge function. Reads nav_url set by trg_compute_nav_url.';

NOTIFY pgrst, 'reload schema';
