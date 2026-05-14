-- Self-report a court booking (booker reports they've booked elsewhere)
CREATE OR REPLACE FUNCTION public.self_report_booking(
  p_match_id uuid,
  p_venue_id uuid,
  p_venue_name text,
  p_court_number integer DEFAULT NULL,
  p_booking_reference text DEFAULT NULL,
  p_total_cost_pence integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match record;
  v_per_player_pence integer;
  v_player_count integer;
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
    RAISE EXCEPTION 'You must be a player in this match to report a booking';
  END IF;

  IF v_match.booking_status = 'booked' THEN
    RAISE EXCEPTION 'This match is already booked';
  END IF;

  v_player_count := COALESCE(array_length(v_match.player_ids, 1), 4);
  IF p_total_cost_pence IS NOT NULL AND v_player_count > 0 THEN
    v_per_player_pence := p_total_cost_pence / v_player_count;
  ELSE
    v_per_player_pence := NULL;
  END IF;

  UPDATE matches SET
    booked_venue_name = p_venue_name,
    booked_venue_id = p_venue_id::text,
    booked_court_number = p_court_number,
    booking_reference = p_booking_reference,
    booked_at = now(),
    booked_by = v_user_id,
    booking_status = 'booked',
    updated_at = now()
  WHERE id = p_match_id;

  SELECT name INTO v_user_name FROM profiles WHERE id = v_user_id;
  v_user_name := COALESCE(v_user_name, 'A player');

  INSERT INTO notifications (user_id, type, title, message, related_id)
  SELECT
    unnest(v_match.player_ids),
    'court_booked',
    'Court booked',
    v_user_name || ' has booked a court at ' || p_venue_name ||
      CASE WHEN p_booking_reference IS NOT NULL
           THEN ' (ref: ' || p_booking_reference || ')'
           ELSE '' END,
    p_match_id
  WHERE unnest(v_match.player_ids) <> v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'per_player_pence', v_per_player_pence,
    'total_pence', p_total_cost_pence
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.self_report_booking(uuid, uuid, text, integer, text, integer) TO authenticated;

-- Cancel a booking (PPA or self-reported), booker-only
CREATE OR REPLACE FUNCTION public.cancel_booking(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match record;
  v_user_name text;
  v_had_ppa_booking boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF v_match.booked_by IS NULL OR v_match.booked_by <> v_user_id THEN
    RAISE EXCEPTION 'Only the booker can cancel this booking';
  END IF;

  IF v_match.booking_status <> 'booked' THEN
    RAISE EXCEPTION 'No active booking to cancel';
  END IF;

  UPDATE court_bookings
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_user_id,
      cancellation_reason = 'booker_cancelled',
      updated_at = now()
  WHERE match_id = p_match_id
    AND status = 'confirmed';

  UPDATE matches SET
    booked_venue_name = NULL,
    booked_venue_id = NULL,
    booked_court_number = NULL,
    booking_reference = NULL,
    booked_at = NULL,
    booked_by = NULL,
    booking_status = 'not_booked',
    updated_at = now()
  WHERE id = p_match_id;

  SELECT name INTO v_user_name FROM profiles WHERE id = v_user_id;
  v_user_name := COALESCE(v_user_name, 'The booker');

  INSERT INTO notifications (user_id, type, title, message, related_id)
  SELECT
    unnest(v_match.player_ids),
    'court_booking_cancelled',
    'Booking cancelled',
    v_user_name || ' has cancelled the court booking. The match needs a new court.',
    p_match_id
  WHERE unnest(v_match.player_ids) <> v_user_id;

  RETURN jsonb_build_object(
    'success', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
