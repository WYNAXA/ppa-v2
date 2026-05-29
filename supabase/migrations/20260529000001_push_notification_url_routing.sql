-- =============================================================================
-- Add URL routing to push notification dispatch.
-- Previously the push payload had no 'url' field, so every notification click
-- navigated to '/' (home). Now we compute the correct destination URL from
-- notification type + related_id, mirroring the in-app getNavTarget logic.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.dispatch_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_service_role_key text;
  v_supabase_url text;
  v_nav_url text;
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

  -- Compute navigation URL based on notification type
  v_nav_url := CASE
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
      'match_invitation',
      'lift_requested', 'lift_accepted', 'lift_declined'
    ) THEN '/matches/' || COALESCE(NEW.related_id::text, '')

    -- Match-related prefixes (ringer_for_match_*, open_match_*, invitation_*)
    WHEN NEW.type LIKE 'ringer_for_%' THEN '/matches/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE 'open_match_%' THEN '/matches/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE 'invitation_%' THEN '/matches/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE 'invitee_%'    THEN '/matches/' || COALESCE(NEW.related_id::text, '')

    -- League-related
    WHEN NEW.type IN ('league_invite', 'league_update')
      THEN '/compete/leagues/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE 'league_%'
      THEN '/compete/leagues/' || COALESCE(NEW.related_id::text, '')

    -- Polls (live inside groups, related_id is poll id)
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

    -- Fallback: generic catch-all patterns (mirror getNavTarget order)
    WHEN NEW.type LIKE '%match%'  THEN '/matches/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE '%league%' THEN '/compete/leagues/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE '%group%'  THEN '/community/groups/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE '%poll%'   THEN '/play/availability/' || COALESCE(NEW.related_id::text, '')

    -- Default
    ELSE '/notifications'
  END;

  -- Fire-and-forget HTTP call to send-push edge function.
  -- Wrapped in BEGIN/EXCEPTION so failures never block the notification insert.
  BEGIN
    PERFORM extensions.http_post(
      url := v_supabase_url || '/functions/v1/send-push',
      body := jsonb_build_object(
        'user_ids', jsonb_build_array(NEW.user_id::text),
        'title',   COALESCE(NEW.title, 'Notification'),
        'message', COALESCE(NEW.message, ''),
        'url',     v_nav_url,
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

COMMENT ON FUNCTION dispatch_push_notification() IS
  'Fires after each notification INSERT to dispatch a Web Push via the send-push edge function. Includes URL routing based on notification type.';
