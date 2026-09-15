-- ══════════════════════════════════════════════════════════════════════════════
-- Lineup-changed notifications for leave_match, confirm_ringer_for_match,
-- and confirm_invitee_for_match.
--
-- Uses type 'match_lineup_changed' which auto-routes to /matches/{id} via
-- the nav_url trigger's catch-all: WHEN NEW.type LIKE '%match%'.
--
-- Run in the Supabase SQL Editor. Each function is CREATE OR REPLACE.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 1. leave_match — notify remaining players after someone leaves ───────────

CREATE OR REPLACE FUNCTION public.leave_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match record;
  v_new_player_ids uuid[];
  v_new_team1 uuid[];
  v_new_team2 uuid[];
  v_new_confirmed uuid[];
  v_new_status text;
  v_was_driver boolean := false;
  v_was_passenger boolean := false;
  v_passenger_count integer := 0;
  v_driver_count integer := 0;
  v_user_name text;
  v_day_time text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF NOT (v_user_id = ANY(COALESCE(v_match.player_ids, ARRAY[]::uuid[]))) THEN
    RAISE EXCEPTION 'You are not in this match';
  END IF;

  SELECT name INTO v_user_name FROM profiles WHERE id = v_user_id;
  v_user_name := COALESCE(v_user_name, 'A player');

  v_new_player_ids := array_remove(COALESCE(v_match.player_ids, ARRAY[]::uuid[]), v_user_id);
  v_new_team1 := array_remove(COALESCE(v_match.team1_player_ids, ARRAY[]::uuid[]), v_user_id);
  v_new_team2 := array_remove(COALESCE(v_match.team2_player_ids, ARRAY[]::uuid[]), v_user_id);
  v_new_confirmed := array_remove(COALESCE(v_match.confirmed_players, ARRAY[]::uuid[]), v_user_id);

  v_new_status := CASE
    WHEN array_length(v_new_player_ids, 1) IS NULL OR array_length(v_new_player_ids, 1) < 4
      THEN 'pending'
    ELSE v_match.status
  END;

  UPDATE matches SET
    player_ids = v_new_player_ids,
    team1_player_ids = v_new_team1,
    team2_player_ids = v_new_team2,
    confirmed_players = v_new_confirmed,
    status = v_new_status,
    updated_at = now()
  WHERE id = p_match_id;

  -- ── Lineup-changed notification to remaining players ──
  v_day_time := TO_CHAR(v_match.match_date, 'Dy DD Mon');
  IF v_match.match_time IS NOT NULL THEN
    v_day_time := v_day_time || ' · ' || LEFT(v_match.match_time::text, 5);
  END IF;

  IF array_length(v_new_player_ids, 1) > 0 THEN
    INSERT INTO notifications (user_id, type, title, message, related_id, read)
    SELECT
      unnest(v_new_player_ids),
      'match_lineup_changed',
      'Lineup changed',
      'Your ' || v_day_time || ' match lineup changed — tap to see.',
      p_match_id,
      false;
  END IF;

  -- Check if user was a driver
  SELECT COUNT(*) INTO v_passenger_count
  FROM travel_requests
  WHERE match_id = p_match_id
    AND driver_id = v_user_id
    AND status IN ('pending', 'accepted');
  v_was_driver := v_passenger_count > 0;

  -- Check if user was a passenger
  SELECT COUNT(*) INTO v_driver_count
  FROM travel_requests
  WHERE match_id = p_match_id
    AND requester_id = v_user_id
    AND status IN ('pending', 'accepted');
  v_was_passenger := v_driver_count > 0;

  -- DRIVER LEAVING: notify accepted passengers, cancel all
  IF v_was_driver THEN
    INSERT INTO notifications (user_id, type, title, message, related_id)
    SELECT
      tr.requester_id,
      'lift_cancelled_driver_left',
      'Lift no longer available',
      v_user_name || ' has left the match — you''ll need to ask another driver for a lift.',
      p_match_id
    FROM travel_requests tr
    WHERE tr.match_id = p_match_id
      AND tr.driver_id = v_user_id
      AND tr.status = 'accepted';

    UPDATE travel_requests
    SET status = 'cancelled',
        cancellation_reason = 'driver_left_match',
        updated_at = now()
    WHERE match_id = p_match_id
      AND driver_id = v_user_id
      AND status IN ('pending', 'accepted');
  END IF;

  -- PASSENGER LEAVING: notify accepted drivers, cancel all
  IF v_was_passenger THEN
    INSERT INTO notifications (user_id, type, title, message, related_id)
    SELECT
      tr.driver_id,
      'lift_cancelled_passenger_left',
      'Lift offer no longer needed',
      v_user_name || ' has left the match — your lift offer is no longer needed.',
      p_match_id
    FROM travel_requests tr
    WHERE tr.match_id = p_match_id
      AND tr.requester_id = v_user_id
      AND tr.status = 'accepted';

    UPDATE travel_requests
    SET status = 'cancelled',
        cancellation_reason = 'passenger_left_match',
        updated_at = now()
    WHERE match_id = p_match_id
      AND requester_id = v_user_id
      AND status IN ('pending', 'accepted');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'was_driver', v_was_driver,
    'was_passenger', v_was_passenger,
    'new_player_count', COALESCE(array_length(v_new_player_ids, 1), 0),
    'new_status', v_new_status
  );
END;
$$;


-- ── 2. confirm_ringer_for_match — notify existing players when ringer joins ──

CREATE OR REPLACE FUNCTION public.confirm_ringer_for_match(
  p_match_id uuid,
  p_ringer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match record;
  v_is_admin boolean := false;
  v_is_player boolean := false;
  v_request_status text;
  v_new_player_ids uuid[];
  v_day_time text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  v_is_player := v_user_id = ANY(COALESCE(v_match.player_ids, ARRAY[]::uuid[]));

  IF NOT v_is_player AND v_match.group_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = v_match.group_id
        AND user_id = v_user_id
        AND role = 'admin'
    ) INTO v_is_admin;
  END IF;

  IF NOT v_is_player AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only match players or group admins can confirm ringers';
  END IF;

  SELECT status INTO v_request_status
  FROM ringer_requests
  WHERE match_id = p_match_id AND ringer_id = p_ringer_id;

  IF v_request_status IS NULL THEN
    RAISE EXCEPTION 'No request found for this ringer';
  END IF;
  IF v_request_status <> 'accepted' THEN
    RAISE EXCEPTION 'Ringer has not accepted';
  END IF;

  IF array_length(v_match.player_ids, 1) >= 4 THEN
    RAISE EXCEPTION 'Match is already full';
  END IF;

  v_new_player_ids := COALESCE(v_match.player_ids, ARRAY[]::uuid[]) || p_ringer_id;

  UPDATE matches
  SET player_ids = v_new_player_ids,
      status = CASE WHEN array_length(v_new_player_ids, 1) >= 4 THEN 'scheduled' ELSE status END,
      updated_at = now()
  WHERE id = p_match_id;

  UPDATE ringer_requests
  SET status = 'filled_by_other', responded_at = now()
  WHERE match_id = p_match_id
    AND ringer_id <> p_ringer_id
    AND status = 'pending';

  -- Notify the ringer they're confirmed
  INSERT INTO notifications (user_id, type, title, message, related_id)
  VALUES (
    p_ringer_id,
    'ringer_confirmed',
    'You''re in!',
    'You''ve been confirmed for the match. Check details.',
    p_match_id
  );

  -- ── Lineup-changed notification to existing players (exclude the ringer) ──
  v_day_time := TO_CHAR(v_match.match_date, 'Dy DD Mon');
  IF v_match.match_time IS NOT NULL THEN
    v_day_time := v_day_time || ' · ' || LEFT(v_match.match_time::text, 5);
  END IF;

  IF array_length(v_match.player_ids, 1) > 0 THEN
    INSERT INTO notifications (user_id, type, title, message, related_id, read)
    SELECT
      unnest(v_match.player_ids),
      'match_lineup_changed',
      'Lineup changed',
      'Your ' || v_day_time || ' match lineup changed — tap to see.',
      p_match_id,
      false;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ── 3. confirm_invitee_for_match — notify existing players when invitee added ─

CREATE OR REPLACE FUNCTION public.confirm_invitee_for_match(
  p_match_id uuid,
  p_invitee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match record;
  v_is_player boolean := false;
  v_is_admin boolean := false;
  v_invitation_status text;
  v_new_player_ids uuid[];
  v_will_be_full boolean;
  v_day_time text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  v_is_player := v_user_id = ANY(COALESCE(v_match.player_ids, ARRAY[]::uuid[]));
  IF NOT v_is_player AND v_match.group_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = v_match.group_id AND user_id = v_user_id AND role = 'admin'
    ) INTO v_is_admin;
  END IF;
  IF NOT v_is_player AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only match players or group admins can confirm invitees';
  END IF;

  SELECT status INTO v_invitation_status FROM match_invitations
  WHERE match_id = p_match_id AND invitee_id = p_invitee_id;
  IF v_invitation_status IS NULL THEN RAISE EXCEPTION 'No invitation found'; END IF;
  IF v_invitation_status <> 'accepted' THEN RAISE EXCEPTION 'Invitee has not accepted'; END IF;
  IF array_length(v_match.player_ids, 1) >= 4 THEN RAISE EXCEPTION 'Match is full'; END IF;

  v_new_player_ids := COALESCE(v_match.player_ids, ARRAY[]::uuid[]) || p_invitee_id;
  v_will_be_full := array_length(v_new_player_ids, 1) >= 4;

  UPDATE matches
  SET player_ids = v_new_player_ids,
      is_open = CASE WHEN v_will_be_full THEN false ELSE is_open END,
      open_elo_min = CASE WHEN v_will_be_full THEN NULL ELSE open_elo_min END,
      open_elo_max = CASE WHEN v_will_be_full THEN NULL ELSE open_elo_max END,
      status = CASE WHEN v_will_be_full THEN 'scheduled' ELSE status END,
      updated_at = now()
  WHERE id = p_match_id;

  IF v_will_be_full THEN
    UPDATE ringer_requests SET status = 'filled_by_other', responded_at = now()
      WHERE match_id = p_match_id AND status = 'pending';
    UPDATE match_invitations SET status = 'filled_by_other', responded_at = now()
      WHERE match_id = p_match_id AND status = 'pending' AND invitee_id <> p_invitee_id;
  END IF;

  -- Notify the invitee they're confirmed
  INSERT INTO notifications (user_id, type, title, message, related_id)
  VALUES (p_invitee_id, 'invitee_confirmed', 'You''re in!',
    'You''ve been confirmed for the match.', p_match_id);

  -- ── Lineup-changed notification to existing players (exclude the invitee) ──
  v_day_time := TO_CHAR(v_match.match_date, 'Dy DD Mon');
  IF v_match.match_time IS NOT NULL THEN
    v_day_time := v_day_time || ' · ' || LEFT(v_match.match_time::text, 5);
  END IF;

  IF array_length(v_match.player_ids, 1) > 0 THEN
    INSERT INTO notifications (user_id, type, title, message, related_id, read)
    SELECT
      unnest(v_match.player_ids),
      'match_lineup_changed',
      'Lineup changed',
      'Your ' || v_day_time || ' match lineup changed — tap to see.',
      p_match_id,
      false;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

NOTIFY pgrst, 'reload schema';
