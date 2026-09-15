-- ══════════════════════════════════════════════════════════════════════════════
-- Add household_link_* notification types to nav_url routing → /you
-- Run in the Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════════════════════

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

    -- Achievements + Household
    WHEN NEW.type = 'achievement' THEN '/you'
    WHEN NEW.type LIKE 'household_%' THEN '/you'

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

NOTIFY pgrst, 'reload schema';
