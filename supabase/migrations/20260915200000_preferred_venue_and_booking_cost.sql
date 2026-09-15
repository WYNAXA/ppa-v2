-- C1: booked_venue_name used for preferred venue, not confirmed booking.
-- Fix class: root-cause. Separate field for "where we want to play".
--
-- C3: 1-player match in NEEDS A COURT — not a real game.

-- ── C1: preferred_venue_name — where the group wants to play ────────────────
-- This is the "venue this group usually plays at" concept. It is set at
-- match creation and editing. booked_venue_name is ONLY for confirmed
-- bookings (self_report_booking, tier-1 payment).

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS preferred_venue_name text,
  ADD COLUMN IF NOT EXISTS preferred_venue_id uuid;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_preferred_venue_fkey
  FOREIGN KEY (preferred_venue_id) REFERENCES public.padel_venues(venue_id);

COMMENT ON COLUMN public.matches.preferred_venue_name IS
  'Where the group wants to play — set at match creation/edit. '
  'NOT a confirmed booking. booked_venue_name is for confirmed bookings only.';

-- Migrate: any match with booked_venue_name but booking_status != 'booked'
-- has the venue in the wrong column. Move it to preferred_venue_name.
UPDATE matches
SET preferred_venue_name = booked_venue_name,
    preferred_venue_id   = padel_venue_id,
    booked_venue_name    = NULL,
    booked_court_number  = NULL,
    padel_venue_id       = NULL
WHERE booking_status <> 'booked'
  AND booked_venue_name IS NOT NULL;

-- ── C1: add per_player_cost_pence to matches for the settle-up ledger ───────
-- self_report_booking already calculates this but the client discards it.
-- Store it on the row so MatchDetail can render the ledger.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS booking_total_cost_pence integer,
  ADD COLUMN IF NOT EXISTS booking_per_player_pence integer;

-- Update self_report_booking to write cost columns alongside the booking
CREATE OR REPLACE FUNCTION public.self_report_booking(
  p_match_id uuid,
  p_venue_id uuid,
  p_venue_name text,
  p_court_number integer DEFAULT NULL,
  p_booking_reference text DEFAULT NULL,
  p_total_cost_pence integer DEFAULT NULL
) RETURNS jsonb
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
    booked_venue_name        = p_venue_name,
    padel_venue_id           = v_padel_venue_id,
    booked_court_number      = p_court_number,
    booking_reference        = p_booking_reference,
    booked_at                = now(),
    booked_by                = v_user_id,
    booking_status           = 'booked',
    booking_total_cost_pence = p_total_cost_pence,
    booking_per_player_pence = v_per_player_pence,
    -- Clear claim and handoff fields (D2)
    booking_claimed_by       = NULL,
    booking_claimed_at       = NULL,
    booking_handoff_venue_id = NULL,
    booking_handoff_at       = NULL,
    updated_at               = now()
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
$$;
