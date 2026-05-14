-- ── Leave match RPC with lift cascade and notifications ──────────────────────
-- Handles: remove player from arrays, cancel travel_requests, notify affected.

-- Add cancellation_reason column to travel_requests
ALTER TABLE travel_requests
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- Drop function if exists (for clean re-runs)
DROP FUNCTION IF EXISTS public.leave_match(uuid);

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

GRANT EXECUTE ON FUNCTION public.leave_match(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
