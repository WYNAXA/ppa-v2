-- §3.4 + §3.5: Venue selection with game in hand, handoff persistence,
-- claim contention, timezone on matches, D1–D5 fixes.
--
-- Fix classes:
--   D1 (claim contention)  — root-cause: claim_match_booking rejects when
--        already claimed; take_over_match_booking is the explicit takeover.
--   D2 (stale claim fields) — root-cause: self_report_booking clears them.
--   D3 (day name padding)  — display patch: trim() in message formatting.
--   D4 (timezone skew)     — root-cause: matches.timezone column, used in
--        the AT TIME ZONE cast so BST/CET/etc are correct.
--   D5 (no handoff record) — root-cause: new columns on matches.

-- ── D4: matches.timezone ────────────────────────────────────────────────────
-- Neither padel_venues nor groups has a timezone column. All 417 matches
-- resolve to the default. The column exists so the first non-UK venue or
-- group gets it right without another migration.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/London';

COMMENT ON COLUMN public.matches.timezone IS
  'IANA timezone for this match. Used when combining match_date + match_time '
  'into a wall-clock instant. Default Europe/London because every match today '
  'is UK-based; non-UK matches must set this on creation.';

-- Backfill is a no-op: padel_venues has no timezone, groups has no timezone,
-- every row gets the default. Measured:
--   total_matches: 417, has_venue: 223, has_group: 346, neither: 51
--   Route 1 (venue timezone): 0 — column does not exist on padel_venues
--   Route 2 (group timezone): 0 — column does not exist on groups
--   Route 3 (default):        417

-- ── D5: handoff columns ─────────────────────────────────────────────────────

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS booking_handoff_venue_id uuid,
  ADD COLUMN IF NOT EXISTS booking_handoff_at timestamptz;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_booking_handoff_venue_fkey
  FOREIGN KEY (booking_handoff_venue_id) REFERENCES public.padel_venues(venue_id);

COMMENT ON COLUMN public.matches.booking_handoff_venue_id IS
  'Set when the claimant taps through to an external platform for this venue. '
  'Persisted in the DB so it survives app kill and device switch. '
  'Cleared when self_report_booking completes.';

-- ── D1: claim_match_booking — reject when already claimed ───────────────────
-- Fix class: root-cause. Two RPCs for two intents: claim rejects contention,
-- take_over is the explicit handover. One function guessing between them is
-- exactly how two people end up booking two courts.

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
  v_claimant_name text;
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

  -- D1: reject when already claimed by a different player
  IF v_match.booking_status = 'claimed'
     AND v_match.booking_claimed_by IS NOT NULL
     AND v_match.booking_claimed_by IS DISTINCT FROM v_user_id
  THEN
    SELECT coalesce(name, 'A player') INTO v_claimant_name
    FROM profiles WHERE id = v_match.booking_claimed_by;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'already_claimed',
      'claimed_by', v_match.booking_claimed_by,
      'claimed_by_name', v_claimant_name,
      'claimed_at', v_match.booking_claimed_at
    );
  END IF;

  -- Idempotent: re-claiming your own claim is fine (updates timestamp)
  UPDATE matches SET
    booking_status     = 'claimed',
    booking_claimed_by = v_user_id,
    booking_claimed_at = now(),
    booking_pledged_by = NULL,
    booking_pledged_at = NULL,
    booking_pledge_assigned_randomly = false,
    updated_at = now()
  WHERE id = p_match_id;

  SELECT coalesce(name, 'A player') INTO v_name FROM profiles WHERE id = v_user_id;

  INSERT INTO notifications (user_id, type, title, message, related_id)
  SELECT
    unnest(array_remove(v_match.player_ids, v_user_id)),
    'booking_claimed',
    -- D3: trim day name
    v_name || ' is booking ' || trim(to_char(v_match.match_date, 'Day')) ||
      ' ' || to_char(v_match.match_time, 'HH24:MI'),
    v_name || ' is booking the court for ' ||
      trim(to_char(v_match.match_date, 'Day')) || ' ' ||
      to_char(v_match.match_time, 'HH24:MI'),
    p_match_id;

  RETURN jsonb_build_object('success', true, 'claimed_by', v_user_id);
END;
$$;

-- ── D1: take_over_match_booking — explicit handover ─────────────────────────
-- Fix class: root-cause. The only way a claim changes hands. Notifies the
-- displaced claimant specifically so they know they are no longer booking.

CREATE OR REPLACE FUNCTION public.take_over_match_booking(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_match        record;
  v_name         text;
  v_old_name     text;
  v_old_claimant uuid;
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

  IF v_match.booking_status <> 'claimed' OR v_match.booking_claimed_by IS NULL THEN
    RAISE EXCEPTION 'not_claimed';
  END IF;

  IF v_match.booking_claimed_by = v_user_id THEN
    RETURN jsonb_build_object('success', true, 'note', 'already_yours');
  END IF;

  v_old_claimant := v_match.booking_claimed_by;

  UPDATE matches SET
    booking_claimed_by = v_user_id,
    booking_claimed_at = now(),
    -- Clear the old claimant's handoff
    booking_handoff_venue_id = NULL,
    booking_handoff_at = NULL,
    updated_at = now()
  WHERE id = p_match_id;

  SELECT coalesce(name, 'A player') INTO v_name FROM profiles WHERE id = v_user_id;
  SELECT coalesce(name, 'A player') INTO v_old_name FROM profiles WHERE id = v_old_claimant;

  -- Notify the displaced claimant
  INSERT INTO notifications (user_id, type, title, message, related_id)
  VALUES (
    v_old_claimant,
    'booking_claim_taken_over',
    v_name || ' took over booking',
    v_name || ' is now booking the court for ' ||
      trim(to_char(v_match.match_date, 'Day')) || ' ' ||
      to_char(v_match.match_time, 'HH24:MI') ||
      '. You no longer need to.',
    p_match_id
  );

  -- Notify the rest of the group that the booker changed
  INSERT INTO notifications (user_id, type, title, message, related_id)
  SELECT
    unnest(array_remove(array_remove(v_match.player_ids, v_user_id), v_old_claimant)),
    'booking_claimed',
    v_name || ' is now booking ' || trim(to_char(v_match.match_date, 'Day')) ||
      ' ' || to_char(v_match.match_time, 'HH24:MI'),
    v_name || ' took over booking from ' || v_old_name || ' for ' ||
      trim(to_char(v_match.match_date, 'Day')) || ' ' ||
      to_char(v_match.match_time, 'HH24:MI'),
    p_match_id;

  RETURN jsonb_build_object('success', true, 'claimed_by', v_user_id, 'displaced', v_old_claimant);
END;
$$;

REVOKE ALL ON FUNCTION public.take_over_match_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.take_over_match_booking(uuid) TO authenticated;

-- ── D3: release_match_booking_claim — trim day names ────────────────────────
-- Fix class: display patch. to_char(date, 'Day') pads to 9 chars.

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
    booking_handoff_venue_id = NULL,
    booking_handoff_at = NULL,
    updated_at = now()
  WHERE id = p_match_id;

  SELECT coalesce(name, 'A player') INTO v_name
  FROM profiles WHERE id = v_match.booking_claimed_by;

  INSERT INTO notifications (user_id, type, title, message, related_id)
  SELECT
    unnest(array_remove(v_match.player_ids, v_user_id)),
    'booking_claim_released',
    'Court still needed',
    -- D3: trimmed
    v_name || ' is no longer booking ' ||
      trim(to_char(v_match.match_date, 'Day')) || ' ' ||
      to_char(v_match.match_time, 'HH24:MI') ||
      '. Someone else needs to.',
    p_match_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── D4: expire_stale_booking_claims — timezone-aware comparison ─────────────
-- Fix class: root-cause. Uses matches.timezone in the AT TIME ZONE cast.

CREATE OR REPLACE FUNCTION public.expire_stale_booking_claims()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_name  text;
BEGIN
  FOR v_match IN
    SELECT m.id, m.match_date, m.match_time, m.player_ids,
           m.booking_claimed_by, m.timezone
    FROM matches m
    WHERE m.booking_status = 'claimed'
      AND m.booking_claimed_by IS NOT NULL
      -- D4: timezone-aware comparison
      AND ((m.match_date + m.match_time) AT TIME ZONE m.timezone)
          <= (now() + interval '24 hours')
      AND m.match_date >= current_date
  LOOP
    UPDATE matches SET
      booking_status     = 'not_booked',
      booking_claimed_by = NULL,
      booking_claimed_at = NULL,
      booking_handoff_venue_id = NULL,
      booking_handoff_at = NULL,
      updated_at         = now()
    WHERE id = v_match.id
      AND booking_status = 'claimed';

    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT coalesce(name, 'A player') INTO v_name
    FROM profiles WHERE id = v_match.booking_claimed_by;

    INSERT INTO notifications (user_id, type, title, message, related_id)
    SELECT
      unnest(v_match.player_ids),
      'booking_claim_expired',
      'Court still needed',
      v_name || '''s claim expired for ' ||
        trim(to_char(v_match.match_date, 'Day')) || ' ' ||
        to_char(v_match.match_time, 'HH24:MI') ||
        '. Someone needs to book.',
      v_match.id;
  END LOOP;
END;
$$;

-- ── D2: self_report_booking — clear claim + handoff fields ──────────────────
-- Fix class: root-cause. After booking, claim and handoff are stale.

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
    booked_venue_name   = p_venue_name,
    padel_venue_id      = v_padel_venue_id,
    booked_court_number = p_court_number,
    booking_reference   = p_booking_reference,
    booked_at           = now(),
    booked_by           = v_user_id,
    booking_status      = 'booked',
    -- D2: clear claim and handoff fields
    booking_claimed_by       = NULL,
    booking_claimed_at       = NULL,
    booking_handoff_venue_id = NULL,
    booking_handoff_at       = NULL,
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
$$;

-- ── Record handoff to external platform ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_booking_handoff(
  p_match_id uuid,
  p_venue_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match   record;
  v_padel_venue_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  -- Only the claimant can record a handoff
  IF v_match.booking_claimed_by IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'not_the_claimant';
  END IF;

  -- Resolve venue id
  SELECT pv.venue_id INTO v_padel_venue_id
  FROM padel_venues pv WHERE pv.venue_id = p_venue_id;
  IF v_padel_venue_id IS NULL THEN
    SELECT pv.venue_id INTO v_padel_venue_id
    FROM padel_venues pv WHERE pv.venues_id = p_venue_id;
  END IF;

  UPDATE matches SET
    booking_handoff_venue_id = v_padel_venue_id,
    booking_handoff_at = now(),
    updated_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.record_booking_handoff(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_booking_handoff(uuid, uuid) TO authenticated;

-- ── Nav URL routing for new notification types ──────────────────────────────

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
      OR NEW.type = 'booking_claim_expired'
      OR NEW.type = 'booking_claim_taken_over'
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

-- ── D12: clean up 3 historical claimed rows ─────────────────────────────────
-- These predate the booking rebuild. The claims are from Dec 2025 and Apr 2026,
-- written by code that has since been deleted. The matches are long past.
-- Setting to not_booked + clearing claim fields. Not deleting anything.

UPDATE matches SET
  booking_status     = 'not_booked',
  booking_claimed_by = NULL,
  booking_claimed_at = NULL
WHERE id IN (
  'eb88340b-a0d5-4348-aabc-600cc8c849b1',
  '6fc75322-dd28-4ef0-a578-e346101ef239',
  '92549b0b-16b8-4d44-996d-4618c1dedfff'
) AND booking_status = 'claimed';
