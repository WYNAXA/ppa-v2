-- §3.1–§3.3: Booking claim and whose-turn RPCs.
--
-- The columns booking_claimed_by, booking_claimed_at, booking_pledged_by,
-- booking_pledged_at and booking_pledge_assigned_randomly have existed since
-- the schema was created. Nothing reads or writes them — verified by grep
-- across both repos. The data in them (9 pledges, 3 random assignments) was
-- written by code that has since been deleted.
--
-- This migration adds the RPCs that bring them to life, and deliberately
-- drops random assignment: whose-turn = fewest bookings in the group's last
-- 10 games, ties broken by longest since last booked. See §3.2.

-- ── claim_match_booking ─────────────────────────────────────────────────────
-- "I'll book it." Sets claimed_by, notifies the group.

CREATE OR REPLACE FUNCTION public.claim_match_booking(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match   record;
  v_name    text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF NOT (v_user_id = ANY(v_match.player_ids)) THEN
    RAISE EXCEPTION 'not_a_player';
  END IF;

  IF v_match.booking_status = 'booked' THEN
    RAISE EXCEPTION 'already_booked';
  END IF;

  -- Claim it. If someone already claimed, this overwrites — the last
  -- person to say "I'll do it" is the one who means it.
  UPDATE matches SET
    booking_status     = 'claimed',
    booking_claimed_by = v_user_id,
    booking_claimed_at = now(),
    -- Clear any prior pledge — the claim supersedes it.
    booking_pledged_by = NULL,
    booking_pledged_at = NULL,
    booking_pledge_assigned_randomly = false,
    updated_at = now()
  WHERE id = p_match_id;

  SELECT coalesce(name, 'A player') INTO v_name FROM profiles WHERE id = v_user_id;

  -- Notify every other player
  INSERT INTO notifications (user_id, type, title, message, related_id)
  SELECT
    unnest(array_remove(v_match.player_ids, v_user_id)),
    'booking_claimed',
    v_name || ' is booking this',
    v_name || ' is booking the court for ' ||
      to_char(v_match.match_date, 'Day') || ' ' ||
      to_char(v_match.match_time, 'HH24:MI'),
    p_match_id;

  RETURN jsonb_build_object('success', true, 'claimed_by', v_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_match_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_match_booking(uuid) TO authenticated;

-- ── release_match_booking_claim ─────────────────────────────────────────────
-- Called when a claim expires or the claimant gives up.

CREATE OR REPLACE FUNCTION public.release_match_booking_claim(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match   record;
  v_name    text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  -- Only the claimant or a group admin can release
  IF v_match.booking_claimed_by IS DISTINCT FROM v_user_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = v_match.group_id
        AND gm.user_id = v_user_id
        AND gm.role = 'admin'
        AND gm.status = 'approved'
    ) THEN
      RAISE EXCEPTION 'not_the_claimant';
    END IF;
  END IF;

  IF v_match.booking_status <> 'claimed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_claimed');
  END IF;

  UPDATE matches SET
    booking_status     = 'not_booked',
    booking_claimed_by = NULL,
    booking_claimed_at = NULL,
    updated_at = now()
  WHERE id = p_match_id;

  SELECT coalesce(name, 'A player') INTO v_name
  FROM profiles WHERE id = v_match.booking_claimed_by;

  -- Notify the group that the claim was released
  INSERT INTO notifications (user_id, type, title, message, related_id)
  SELECT
    unnest(array_remove(v_match.player_ids, v_user_id)),
    'booking_claim_released',
    'Court still needed',
    v_name || ' is no longer booking ' ||
      to_char(v_match.match_date, 'Day') || ' ' ||
      to_char(v_match.match_time, 'HH24:MI') ||
      '. Someone else needs to.',
    p_match_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.release_match_booking_claim(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_match_booking_claim(uuid) TO authenticated;

-- ── whose_turn_to_book ──────────────────────────────────────────────────────
-- Returns group members ranked by fewest bookings in the group's last 10
-- games, ties broken by longest since they last booked.
-- Random assignment was deliberately dropped — see §3.2.

CREATE OR REPLACE FUNCTION public.whose_turn_to_book(
  p_match_id uuid
) RETURNS TABLE (
  user_id   uuid,
  name      text,
  avatar_url text,
  bookings_count integer,
  last_booked_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH match_info AS (
    SELECT m.group_id, m.player_ids
    FROM matches m
    WHERE m.id = p_match_id
  ),
  recent_group_matches AS (
    SELECT m.id, m.booked_by, m.booked_at
    FROM matches m, match_info mi
    WHERE m.group_id = mi.group_id
      AND m.booking_status = 'booked'
      AND m.booked_by IS NOT NULL
    ORDER BY m.booked_at DESC NULLS LAST
    LIMIT 10
  ),
  player_stats AS (
    SELECT
      p.id AS user_id,
      p.name,
      p.avatar_url,
      count(r.id)::integer AS bookings_count,
      max(r.booked_at) AS last_booked_at
    FROM match_info mi,
         unnest(mi.player_ids) pid(id)
    JOIN profiles p ON p.id = pid.id
    LEFT JOIN recent_group_matches r ON r.booked_by = p.id
    GROUP BY p.id, p.name, p.avatar_url
  )
  SELECT ps.user_id, ps.name, ps.avatar_url, ps.bookings_count, ps.last_booked_at
  FROM player_stats ps
  ORDER BY ps.bookings_count ASC, ps.last_booked_at ASC NULLS FIRST;
$$;

REVOKE ALL ON FUNCTION public.whose_turn_to_book(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whose_turn_to_book(uuid) TO authenticated;

-- ── Add booking_reminders to notification_preferences ───────────────────────

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS booking_reminders boolean NOT NULL DEFAULT true;

-- ── Teach wants_push about booking types ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wants_push(p_user_id uuid, p_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(NOT (SELECT p.push_opted_out FROM profiles p WHERE p.id = p_user_id), true)
    AND
    coalesce(
      (
        SELECT CASE
          WHEN p_type LIKE 'booking_%' OR p_type = 'court_booked'         THEN np.booking_reminders
          WHEN p_type LIKE 'open_match%'                                   THEN np.open_matches
          WHEN p_type LIKE 'poll_%'                                        THEN np.poll_reminders
          WHEN p_type LIKE 'connection_%'                                  THEN np.connection_requests
          WHEN p_type LIKE 'chat_%' OR p_type LIKE '%message%'             THEN np.chat_notifications
          WHEN p_type LIKE 'result_%' OR p_type LIKE 'match_result%'       THEN np.match_results
          WHEN p_type LIKE 'match_reminder%' OR p_type LIKE 'match_deadline%' THEN np.match_reminders
          ELSE true
        END
        FROM notification_preferences np
        WHERE np.user_id = p_user_id
      ),
      true
    );
$$;

-- ── Teach compute_notification_nav_url about booking types ──────────────────
-- booking_claimed, booking_claim_released → /matches/<related_id>
-- Add them alongside court_booked (line 3085 of baseline) so they route to
-- the match. The existing LIKE '%match%' pattern does NOT match 'booking_*'.

CREATE OR REPLACE FUNCTION public.compute_notification_nav_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.nav_url := CASE
    WHEN NEW.type LIKE 'open_match_%'
      THEN '/matches/' || COALESCE(NEW.related_id::text, '')

    WHEN NEW.type IN ('connection_request', 'connection_accepted')
      THEN '/community#connections'

    WHEN NEW.type = 'achievement' THEN '/you'
    WHEN NEW.type LIKE 'household_%' THEN '/you'

    WHEN NEW.type = 'court_booked'
      OR NEW.type = 'booking_claimed'
      OR NEW.type = 'booking_claim_released'
      OR NEW.type = 'booking_window_open'
      THEN '/matches/' || COALESCE(NEW.related_id::text, '')

    WHEN NEW.type = 'booking_payment_due'
      THEN '/pay/booking/' || COALESCE(NEW.related_id::text, '') ||
           '/player/' || COALESCE(NEW.user_id::text, '')

    WHEN NEW.type LIKE '%match%'  THEN '/matches/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE '%league%' THEN '/compete/leagues/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE '%group%'  THEN '/community/groups/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE '%poll%'   THEN '/play/availability/' || COALESCE(NEW.related_id::text, '')

    ELSE '/notifications'
  END;

  RETURN NEW;
END;
$$;
