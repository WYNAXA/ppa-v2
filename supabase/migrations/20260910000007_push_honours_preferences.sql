-- Push notifications start honouring the preferences table that already exists.
--
-- WHAT WAS WRONG
--   `notification_preferences` has a row for all 93 players and five switches —
--   match_reminders, poll_reminders, chat_notifications, connection_requests,
--   match_results. **Nothing reads it.** `dispatch_push_notification` pushes
--   every row inserted into `notifications`, whatever the player has set.
--
--   Nobody has muted anything, so this changes no behaviour today. It is not
--   cosmetic: it is the difference between a switch that works and a switch that
--   lies, and the app was one settings screen away from lying to 93 people.
--
-- WHY IT MATTERS NOW
--   "Put it out there" adds a sixth kind of push, and one broadcast reaches
--   every accepted connection — 34 of them for the account this was tested on.
--   Shipping a push type with no possible off switch, into a system where the
--   off switch is already scaffolded and disconnected, is the patch. So the
--   category is added and the dispatcher is taught to read all six.
--
-- MAPPING
--   Types are matched by prefix so new ones inherit sensible behaviour rather
--   than silently defaulting to "always push". Anything unmapped still pushes —
--   an unknown type is more likely to be important than spam, and the failure
--   mode of over-delivery is recoverable where under-delivery is invisible.
--
-- STILL MISSING, AND NAMED RATHER THAN HIDDEN
--   There is no settings UI. The switches work now, but a player cannot reach
--   them. That is the next piece, and until it is built every value stays at its
--   default of true, which is exactly today's behaviour.

alter table public.notification_preferences
  add column if not exists open_matches boolean not null default true;

comment on column public.notification_preferences.open_matches is
  'Push when a connection says they are free, or an open match matches you. '
  'One broadcast reaches every accepted connection, so this is the switch that '
  'keeps the feature from being muted at the OS level instead.';

create or replace function public.dispatch_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_service_role_key text;
  v_supabase_url text;
  v_allowed boolean;
BEGIN
  -- Does this player want this kind of push? Absent row = defaults = yes.
  SELECT CASE
    WHEN NEW.type LIKE 'open_match%'                              THEN np.open_matches
    WHEN NEW.type LIKE 'poll_%'                                   THEN np.poll_reminders
    WHEN NEW.type LIKE 'connection_%'                             THEN np.connection_requests
    WHEN NEW.type LIKE 'chat_%' OR NEW.type LIKE '%message%'      THEN np.chat_notifications
    WHEN NEW.type LIKE 'result_%' OR NEW.type LIKE 'match_result%' THEN np.match_results
    WHEN NEW.type LIKE 'match_reminder%' OR NEW.type LIKE 'match_deadline%' THEN np.match_reminders
    -- Unmapped types still go out. An unknown type is more likely to matter
    -- than to be noise, and over-delivery is recoverable where a silently
    -- dropped push is invisible.
    ELSE true
  END
  INTO v_allowed
  FROM notification_preferences np
  WHERE np.user_id = NEW.user_id;

  IF v_allowed IS FALSE THEN
    RETURN NEW;
  END IF;

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
