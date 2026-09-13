-- booked_venue_id is gone.
--
-- Phase two of the two-phase column migration begun in 20260913124419.
--
-- matches.booked_venue_id — text, no foreign key, holding values from two
-- different tables — is removed. Its replacement, matches.padel_venue_id, is
-- set on 222 of the 227 matches that name a venue, all 222 resolving to a
-- geocoded padel_venues row. The remaining 5 are 2 ambiguous by name and 3
-- with no directory match; they keep booked_venue_name and no id, which is
-- the honest answer.
--
-- ORDER OF OPERATIONS — every reader and writer shipped to production BEFORE
-- this ran, verified against Vercel rather than assumed:
--   ppa-v2        292b951  READY     BookCourt, MatchDetail, VenueDetail, types
--   venue-manager 817021e  READY     Bookings.tsx venues.id → venue_id resolution
--   edge functions          deployed  cancel-booking, cancel-match
--
-- Dropping first would have broken every court booking and every cancellation
-- in production with "column does not exist" until those deploys landed.
--
-- self_report_booking() stops writing the column in this same migration, so
-- there is no instant where the function references a column that is gone.
--
-- VERIFIED AFTER APPLYING
--   information_schema: 0 columns named booked_venue_id on matches
--   pg_proc:            0 functions referencing booked_venue_id
--   matches:            222 anchored to padel_venue_id
--
-- STILL OPEN — the same guess-which-table pattern survives at
-- venue-manager/src/pages/Bookings.tsx:1577, which looks up a currency with
-- .or('venues_id.eq.<id>,venue_id.eq.<id>'). Not blocking, but it is the last
-- place in either repo that asks a uuid which table it belongs to.

CREATE OR REPLACE FUNCTION public.self_report_booking(p_match_id uuid, p_venue_id uuid, p_venue_name text, p_court_number integer DEFAULT NULL::integer, p_booking_reference text DEFAULT NULL::text, p_total_cost_pence integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_match record;
  v_per_player_pence integer;
  v_player_count integer;
  v_user_name text;
  v_padel_venue_id uuid;
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

  -- Resolve the venue to one directory row, accepting either id space.
  IF p_venue_id IS NOT NULL THEN
    SELECT pv.venue_id INTO v_padel_venue_id
    FROM padel_venues pv WHERE pv.venue_id = p_venue_id;

    IF v_padel_venue_id IS NULL THEN
      SELECT pv.venue_id INTO v_padel_venue_id
      FROM padel_venues pv WHERE pv.venues_id = p_venue_id;
    END IF;

    IF v_padel_venue_id IS NULL THEN
      RAISE EXCEPTION 'unknown_venue';
    END IF;
  END IF;

  v_player_count := COALESCE(array_length(v_match.player_ids, 1), 4);
  IF p_total_cost_pence IS NOT NULL AND v_player_count > 0 THEN
    v_per_player_pence := p_total_cost_pence / v_player_count;
  ELSE
    v_per_player_pence := NULL;
  END IF;

  UPDATE matches SET
    booked_venue_name   = p_venue_name,
    padel_venue_id      = v_padel_venue_id,
    booked_court_number = p_court_number,
    booking_reference   = p_booking_reference,
    booked_at           = now(),
    booked_by           = v_user_id,
    booking_status      = 'booked',
    updated_at          = now()
  WHERE id = p_match_id;

  SELECT name INTO v_user_name FROM profiles WHERE id = v_user_id;
  v_user_name := COALESCE(v_user_name, 'A player');

  INSERT INTO notifications (user_id, type, title, message, related_id)
  SELECT
    unnest(array_remove(v_match.player_ids, v_user_id)),
    'court_booked',
    'Court booked',
    v_user_name || ' has booked a court at ' || p_venue_name ||
      CASE WHEN p_booking_reference IS NOT NULL
           THEN ' (ref: ' || p_booking_reference || ')'
           ELSE '' END,
    p_match_id;

  RETURN jsonb_build_object(
    'success', true,
    'per_player_pence', v_per_player_pence,
    'total_pence', p_total_cost_pence
  );
END;
$function$;

ALTER TABLE public.matches DROP COLUMN IF EXISTS booked_venue_id;
