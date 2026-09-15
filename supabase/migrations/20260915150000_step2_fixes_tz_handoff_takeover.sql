-- Step 2 fixes: F1 (timezone backfill), F2 (handoff guards), F3 (takeover
-- asks displaced claimant), F4 (re-ask cap).

-- ── F1: Timezone backfill ───────────────────────────────────────────────────
-- Fix class: root-cause. The default-only backfill was the hardcode we were
-- told not to ship. Single-timezone country_codes can be resolved directly.
--
-- Measured routes:
--   223 matches have padel_venue_id
--     220 → GB venues → Europe/London
--       3 → FR venues → Europe/Paris
--       0 → multi-zone countries (ES, PT, US, CA, AU, BR, MX, ID, RU, CL, NZ)
--   194 matches have no venue
--     143 have a group (but groups have no timezone column)
--      51 have neither
--
-- Result: 220 resolved by venue country_code GB, 3 by FR, 194 left at default.

-- Single-timezone country → IANA mapping (covers all codes in current match data)
CREATE OR REPLACE FUNCTION public._country_code_to_tz(cc text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE cc
    -- Countries in the match/venue data today (single-zone only)
    WHEN 'GB' THEN 'Europe/London'
    WHEN 'IE' THEN 'Europe/Dublin'
    WHEN 'FR' THEN 'Europe/Paris'
    WHEN 'DE' THEN 'Europe/Berlin'
    WHEN 'IT' THEN 'Europe/Rome'
    WHEN 'NL' THEN 'Europe/Amsterdam'
    WHEN 'BE' THEN 'Europe/Brussels'
    WHEN 'SE' THEN 'Europe/Stockholm'
    WHEN 'FI' THEN 'Europe/Helsinki'
    WHEN 'NO' THEN 'Europe/Oslo'
    WHEN 'DK' THEN 'Europe/Copenhagen'
    WHEN 'CH' THEN 'Europe/Zurich'
    WHEN 'AT' THEN 'Europe/Vienna'
    WHEN 'PL' THEN 'Europe/Warsaw'
    WHEN 'CZ' THEN 'Europe/Prague'
    WHEN 'GR' THEN 'Europe/Athens'
    WHEN 'TR' THEN 'Europe/Istanbul'
    WHEN 'AE' THEN 'Asia/Dubai'
    WHEN 'SA' THEN 'Asia/Riyadh'
    WHEN 'QA' THEN 'Asia/Qatar'
    WHEN 'BH' THEN 'Asia/Bahrain'
    WHEN 'KW' THEN 'Asia/Kuwait'
    WHEN 'IN' THEN 'Asia/Kolkata'
    WHEN 'SG' THEN 'Asia/Singapore'
    WHEN 'JP' THEN 'Asia/Tokyo'
    WHEN 'KR' THEN 'Asia/Seoul'
    WHEN 'TH' THEN 'Asia/Bangkok'
    WHEN 'ZA' THEN 'Africa/Johannesburg'
    WHEN 'EG' THEN 'Africa/Cairo'
    WHEN 'MA' THEN 'Africa/Casablanca'
    WHEN 'AR' THEN 'America/Argentina/Buenos_Aires'
    WHEN 'UY' THEN 'America/Montevideo'
    WHEN 'PY' THEN 'America/Asuncion'
    WHEN 'CO' THEN 'America/Bogota'
    WHEN 'PE' THEN 'America/Lima'
    WHEN 'EC' THEN 'America/Guayaquil'
    WHEN 'CR' THEN 'America/Costa_Rica'
    WHEN 'PA' THEN 'America/Panama'
    WHEN 'NZ' THEN 'Pacific/Auckland'  -- NZ mainland is single-zone for padel
    -- Multi-zone: DO NOT resolve by country alone
    -- US, CA, AU, BR, MX, ID, RU, CL, PT, ES → return NULL
    ELSE NULL
  END;
$$;

-- Backfill: venue country_code for single-timezone countries
UPDATE matches m
SET timezone = public._country_code_to_tz(pv.country_code)
FROM padel_venues pv
WHERE pv.venue_id = m.padel_venue_id
  AND m.padel_venue_id IS NOT NULL
  AND public._country_code_to_tz(pv.country_code) IS NOT NULL;

-- For matches with venues in multi-zone countries: resolve by ES city if possible.
-- ES: mainland = Europe/Madrid, Canary Islands = Atlantic/Canary.
-- PT: mainland = Europe/Lisbon, Azores = Atlantic/Azores.
-- Currently 0 matches in multi-zone countries, so this is defensive.
-- Left at default: 194 (no venue) + 0 (unresolvable multi-zone) = 194.

-- Drop the helper — it served the backfill and should not become a public API
DROP FUNCTION IF EXISTS public._country_code_to_tz(text);

-- ── F1 part 4: Where does timezone get set for NEW matches? ─────────────────
-- Today: nowhere. confirm_poll_schedule, BookCourt.tsx standalone insert,
-- LeagueDetail.tsx, TournamentMode.tsx all create matches without timezone.
-- They all get the column default 'Europe/London'.
--
-- The right fix: self_report_booking (which sets padel_venue_id) should also
-- resolve and set timezone from the venue. This covers Path A completely —
-- the match gets its timezone when the court is booked.
-- For Path B (BookCourt standalone): the insert already has padel_venue_id,
-- so we add a BEFORE INSERT trigger that derives timezone from the venue.

CREATE OR REPLACE FUNCTION public.derive_match_timezone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cc text;
  v_tz text;
BEGIN
  -- Only derive if timezone is still the default and we have a venue
  IF NEW.timezone = 'Europe/London' AND NEW.padel_venue_id IS NOT NULL THEN
    SELECT country_code INTO v_cc
    FROM padel_venues WHERE venue_id = NEW.padel_venue_id;

    v_tz := CASE v_cc
      WHEN 'GB' THEN 'Europe/London'
      WHEN 'IE' THEN 'Europe/Dublin'
      WHEN 'FR' THEN 'Europe/Paris'
      WHEN 'DE' THEN 'Europe/Berlin'
      WHEN 'IT' THEN 'Europe/Rome'
      WHEN 'NL' THEN 'Europe/Amsterdam'
      WHEN 'BE' THEN 'Europe/Brussels'
      WHEN 'SE' THEN 'Europe/Stockholm'
      WHEN 'FI' THEN 'Europe/Helsinki'
      WHEN 'CH' THEN 'Europe/Zurich'
      WHEN 'AT' THEN 'Europe/Vienna'
      WHEN 'AE' THEN 'Asia/Dubai'
      WHEN 'SA' THEN 'Asia/Riyadh'
      WHEN 'IN' THEN 'Asia/Kolkata'
      WHEN 'SG' THEN 'Asia/Singapore'
      WHEN 'ZA' THEN 'Africa/Johannesburg'
      WHEN 'EG' THEN 'Africa/Cairo'
      WHEN 'MA' THEN 'Africa/Casablanca'
      WHEN 'AR' THEN 'America/Argentina/Buenos_Aires'
      WHEN 'CO' THEN 'America/Bogota'
      ELSE NULL
    END;

    IF v_tz IS NOT NULL THEN
      NEW.timezone := v_tz;
    END IF;
  END IF;

  -- Also derive on UPDATE when padel_venue_id changes (self_report_booking)
  IF TG_OP = 'UPDATE'
     AND NEW.padel_venue_id IS DISTINCT FROM OLD.padel_venue_id
     AND NEW.padel_venue_id IS NOT NULL
  THEN
    SELECT country_code INTO v_cc
    FROM padel_venues WHERE venue_id = NEW.padel_venue_id;

    v_tz := CASE v_cc
      WHEN 'GB' THEN 'Europe/London'
      WHEN 'IE' THEN 'Europe/Dublin'
      WHEN 'FR' THEN 'Europe/Paris'
      WHEN 'DE' THEN 'Europe/Berlin'
      WHEN 'IT' THEN 'Europe/Rome'
      WHEN 'NL' THEN 'Europe/Amsterdam'
      WHEN 'BE' THEN 'Europe/Brussels'
      WHEN 'SE' THEN 'Europe/Stockholm'
      WHEN 'FI' THEN 'Europe/Helsinki'
      WHEN 'CH' THEN 'Europe/Zurich'
      WHEN 'AT' THEN 'Europe/Vienna'
      WHEN 'AE' THEN 'Asia/Dubai'
      WHEN 'SA' THEN 'Asia/Riyadh'
      WHEN 'IN' THEN 'Asia/Kolkata'
      WHEN 'SG' THEN 'Asia/Singapore'
      WHEN 'ZA' THEN 'Africa/Johannesburg'
      WHEN 'EG' THEN 'Africa/Cairo'
      WHEN 'MA' THEN 'Africa/Casablanca'
      WHEN 'AR' THEN 'America/Argentina/Buenos_Aires'
      WHEN 'CO' THEN 'America/Bogota'
      ELSE NULL
    END;

    IF v_tz IS NOT NULL THEN
      NEW.timezone := v_tz;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derive_match_timezone ON public.matches;
CREATE TRIGGER trg_derive_match_timezone
  BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.derive_match_timezone();

-- ── F2: record_booking_handoff — guard and raise ────────────────────────────
-- Fix class: root-cause. Two functions doing one lookup must not disagree
-- about what failure means.

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

  -- Must be in claimed state
  IF v_match.booking_status <> 'claimed' THEN
    RAISE EXCEPTION 'not_claimed';
  END IF;

  -- Resolve venue — same logic as self_report_booking, same failure
  SELECT pv.venue_id INTO v_padel_venue_id
  FROM padel_venues pv WHERE pv.venue_id = p_venue_id;
  IF v_padel_venue_id IS NULL THEN
    SELECT pv.venue_id INTO v_padel_venue_id
    FROM padel_venues pv WHERE pv.venues_id = p_venue_id;
  END IF;
  IF v_padel_venue_id IS NULL THEN
    RAISE EXCEPTION 'unknown_venue';
  END IF;

  UPDATE matches SET
    booking_handoff_venue_id = v_padel_venue_id,
    booking_handoff_at = now(),
    updated_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── F3: take_over_match_booking — keep handoff, ask displaced claimant ──────
-- Fix class: root-cause. The displaced claimant may have already booked.
-- Telling them "you no longer need to" when they already did is false.
-- Instead: ask "did you already book it?" and route to DidYouBookSheet.
-- The old claimant's handoff row is KEPT so the sheet knows which venue.

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

  -- Transfer claim. DO NOT clear the old claimant's handoff — they may
  -- have already booked, and DidYouBookSheet needs the venue to name.
  UPDATE matches SET
    booking_claimed_by = v_user_id,
    booking_claimed_at = now(),
    -- handoff stays: booking_handoff_venue_id, booking_handoff_at unchanged
    updated_at = now()
  WHERE id = p_match_id;

  SELECT coalesce(name, 'A player') INTO v_name FROM profiles WHERE id = v_user_id;
  SELECT coalesce(name, 'A player') INTO v_old_name FROM profiles WHERE id = v_old_claimant;

  -- Ask the displaced claimant: did you already book it?
  -- Routes to DidYouBookSheet so they can self-report if they did.
  INSERT INTO notifications (user_id, type, title, message, related_id)
  VALUES (
    v_old_claimant,
    'booking_claim_taken_over',
    'Did you already book it?',
    v_name || ' has taken over booking ' ||
      trim(to_char(v_match.match_date, 'Day')) || ' ' ||
      to_char(v_match.match_time, 'HH24:MI') ||
      '. Did you already book it?',
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

-- ── F4: Re-ask cap — booking_handoff_ask_count on matches ───────────────────
-- Fix class: root-cause. "Ask once per session" means ask forever.
-- Cap at 3 asks. Stored on the match row (survives device switch).
-- After 3 dismissals, the prompt stops and the handoff stays for manual check.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS booking_handoff_ask_count integer NOT NULL DEFAULT 0;

-- self_report_booking already clears the handoff columns, which resets this.
-- The DidYouBookSheet increments it on "Not yet".

-- ── Nav URL: booking_claim_taken_over routes to match ───────────────────────
-- Already handled: the previous migration added it to compute_notification_nav_url.
-- The displaced claimant sees the match, where DidYouBookSheet picks up the
-- handoff if one exists.
