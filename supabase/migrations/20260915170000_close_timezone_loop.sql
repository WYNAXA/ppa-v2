-- F6: Close the timezone loop permanently.
-- Fix class: root-cause for F6a (hardcoded Europe/London removed),
-- root-cause for F6b (country_code on profiles, populated by geocode).

-- ── F6a step 1: profiles.country_code ───────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country_code text;

-- ── F6a step 2: Backfill from profiles.country via venue name→code map ──────
-- Exact match only. 'UK' is a known abbreviation not in the venue map;
-- we handle it explicitly.

WITH venue_map AS (
  SELECT DISTINCT ON (country) country, country_code
  FROM padel_venues
  WHERE country IS NOT NULL AND country_code IS NOT NULL
    AND country <> '' AND country_code <> ''
    -- For 'United Kingdom' prefer GB (220 venues) over IE (63 venues)
    AND NOT (country = 'United Kingdom' AND country_code = 'IE')
  ORDER BY country, count(*) OVER (PARTITION BY country, country_code) DESC
)
UPDATE profiles p
SET country_code = COALESCE(
  vm.country_code,
  CASE p.country WHEN 'UK' THEN 'GB' ELSE NULL END
)
FROM (SELECT id, country FROM profiles WHERE country IS NOT NULL AND country <> '') pc
LEFT JOIN venue_map vm ON vm.country = pc.country
WHERE p.id = pc.id
  AND COALESCE(vm.country_code, CASE pc.country WHEN 'UK' THEN 'GB' ELSE NULL END) IS NOT NULL;

-- ── F6a step 3: derive_match_timezone — creator fallback, no hardcode ───────

CREATE OR REPLACE FUNCTION public.derive_match_timezone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
BEGIN
  -- On INSERT: derive if timezone is NULL
  -- On UPDATE: re-derive when padel_venue_id changes
  IF (TG_OP = 'INSERT' AND NEW.timezone IS NULL)
     OR (TG_OP = 'UPDATE'
         AND NEW.padel_venue_id IS DISTINCT FROM OLD.padel_venue_id
         AND NEW.padel_venue_id IS NOT NULL)
  THEN
    -- Route 1: venue country_code
    IF NEW.padel_venue_id IS NOT NULL THEN
      SELECT ct.timezone INTO v_tz
      FROM padel_venues pv
      JOIN country_timezones ct ON ct.country_code = pv.country_code
      WHERE pv.venue_id = NEW.padel_venue_id;
    END IF;

    -- Route 2: creator's profile country_code (when no venue)
    IF v_tz IS NULL AND NEW.created_by IS NOT NULL THEN
      SELECT ct.timezone INTO v_tz
      FROM profiles p
      JOIN country_timezones ct ON ct.country_code = p.country_code
      WHERE p.id = NEW.created_by;
    END IF;

    IF v_tz IS NOT NULL THEN
      NEW.timezone := v_tz;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── Re-backfill matches through the updated trigger logic ───────────────────
-- Matches with a venue: derive from venue (already done, but re-run for safety)
-- Matches without a venue but with a creator: derive from creator's country_code

UPDATE matches m
SET timezone = ct.timezone
FROM padel_venues pv
JOIN country_timezones ct ON ct.country_code = pv.country_code
WHERE pv.venue_id = m.padel_venue_id
  AND m.padel_venue_id IS NOT NULL
  AND m.timezone IS NULL;

UPDATE matches m
SET timezone = ct.timezone
FROM profiles p
JOIN country_timezones ct ON ct.country_code = p.country_code
WHERE p.id = m.created_by
  AND m.padel_venue_id IS NULL
  AND m.created_by IS NOT NULL
  AND m.timezone IS NULL;

-- ── F6a step 4: expire_stale_booking_claims — no coalesce, skip NULLs ──────
-- Choice: skip the row and log it (option i).
-- Why: a NULL timezone means we genuinely do not know where this match is.
-- Silently assuming a country is the exact defect this fix chain exists to
-- remove. Skipping is safe because:
--   - The match is still checked next hour when the cron re-runs
--   - If a venue is booked in the meantime, the trigger sets timezone
--   - RAISE WARNING is visible in Supabase logs and ops-alert can catch it
-- The group's most common member country (option ii) requires a subquery
-- per match and introduces a new derivation path that can drift — more
-- moving parts for a case that affects 0 rows today.

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
      AND m.timezone IS NOT NULL
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

  -- Log any claimed matches with NULL timezone so ops-alert can surface them
  IF EXISTS (
    SELECT 1 FROM matches
    WHERE booking_status = 'claimed'
      AND booking_claimed_by IS NOT NULL
      AND timezone IS NULL
      AND match_date >= current_date
  ) THEN
    RAISE WARNING '[expire_stale_booking_claims] % claimed match(es) have NULL timezone and were skipped',
      (SELECT count(*) FROM matches
       WHERE booking_status = 'claimed'
         AND booking_claimed_by IS NOT NULL
         AND timezone IS NULL
         AND match_date >= current_date);
  END IF;
END;
$$;
