-- F1: Drop misleading defaults and NULL-ify values that were never entered.
--
-- Root cause: indoor_courts, outdoor_courts, panoramic_courts, singles_courts,
-- doubles_courts, covered_courts defaulted to 0; surface_type defaulted to
-- 'artificial_grass'; booking_url defaulted to ''.  These made "unknown"
-- indistinguishable from "genuinely zero / genuinely artificial grass / no URL".
--
-- Rule: number_of_courts > 0 means someone entered court data (every such row
-- has at least one split > 0).  number_of_courts = 0 means no data was ever
-- entered — all splits are pure DB defaults.
--
-- Applied in Supabase SQL Editor on 2026-09-16.  This file is a byte-identical
-- record per CLAUDE.md §"Repo and live must agree".

-- ── 1. Drop column defaults ────────────────────────────────────────────────────

ALTER TABLE padel_venues ALTER COLUMN indoor_courts    DROP DEFAULT;
ALTER TABLE padel_venues ALTER COLUMN outdoor_courts   DROP DEFAULT;
ALTER TABLE padel_venues ALTER COLUMN covered_courts   DROP DEFAULT;
ALTER TABLE padel_venues ALTER COLUMN panoramic_courts DROP DEFAULT;
ALTER TABLE padel_venues ALTER COLUMN singles_courts   DROP DEFAULT;
ALTER TABLE padel_venues ALTER COLUMN doubles_courts   DROP DEFAULT;
ALTER TABLE padel_venues ALTER COLUMN surface_type     DROP DEFAULT;
ALTER TABLE padel_venues ALTER COLUMN booking_url      DROP DEFAULT;

-- Make booking_url nullable (was NOT NULL DEFAULT '')
ALTER TABLE padel_venues ALTER COLUMN booking_url      DROP NOT NULL;

-- ── 2. NULL-ify defaults where no evidence of entry ────────────────────────────

-- Court splits → NULL where number_of_courts = 0 (5,821 rows)
UPDATE padel_venues
SET indoor_courts    = NULL,
    outdoor_courts   = NULL,
    covered_courts   = NULL,
    panoramic_courts = NULL,
    singles_courts   = NULL,
    doubles_courts   = NULL
WHERE number_of_courts = 0;

-- Surface type → NULL where no courts AND value is the default (5,627 rows)
-- Keeps the 12 venues with non-default surfaces from data ingestion.
-- Keeps the 283 venues with courts — artificial grass is probably correct
-- (dominant padel surface) and cannot be distinguished from default.
UPDATE padel_venues
SET surface_type = NULL
WHERE number_of_courts = 0
  AND surface_type = 'artificial_grass';

-- booking_url: '' → NULL for all 1,562 empty-string rows
UPDATE padel_venues
SET booking_url = NULL
WHERE booking_url = '';

-- ── 3. Fix specific venues ─────────────────────────────────────────────────────

-- Surge Padel Bristol: all 8 courts are indoor (owner-confirmed 2026-09-16)
UPDATE padel_venues
SET indoor_courts = 8, outdoor_courts = 0
WHERE venue_id = '67b0cd59-a975-4da9-95c6-87f5dc20c244';

-- The Els Club Dubai: URL is elsclubdubai.com, not Playtomic
UPDATE padel_venues
SET booking_platform = NULL
WHERE venue_id = '945ca2b1-44be-43b6-9c5d-53241b0e4cc5';

-- Rocket Padel Bristol: URL is rocketpadel.com, not Padel Mates
UPDATE padel_venues
SET booking_platform = NULL
WHERE venue_id = '69e3c467-4f42-40b6-8ecd-22eaf199d123';

-- ── 4. Platform / URL mismatch guard ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION guard_booking_platform_url()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  host text;
  expected text;
BEGIN
  -- Only check when both platform and URL are set
  IF NEW.booking_platform IS NULL OR NEW.booking_platform = ''
     OR NEW.booking_url IS NULL OR NEW.booking_url = '' THEN
    RETURN NEW;
  END IF;

  -- Platforms that allow any URL — no host constraint
  IF NEW.booking_platform IN ('Own', 'Own website', 'Other', 'Custom') THEN
    RETURN NEW;
  END IF;

  -- Extract hostname (lowercase)
  BEGIN
    host := lower((regexp_matches(NEW.booking_url, '://([^/:]+)'))[1]);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'booking_url is not a valid URL: %', NEW.booking_url;
  END;

  -- Map platform → expected token in hostname
  expected := CASE lower(NEW.booking_platform)
    WHEN 'playtomic'     THEN 'playtomic'
    WHEN 'matchi'        THEN 'matchi'
    WHEN 'padel mates'   THEN 'padelmates'
    WHEN 'easycancha'    THEN 'easycancha'
    WHEN 'court booking' THEN 'courtbooking'
    ELSE NULL
  END;

  IF expected IS NOT NULL AND host NOT LIKE '%' || expected || '%' THEN
    RAISE EXCEPTION
      'booking_platform "%" expects "%" in the URL hostname, got "%". '
      'Fix the URL or set booking_platform to "Own" / "Other".',
      NEW.booking_platform, expected, host;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_booking_platform_url ON padel_venues;

CREATE TRIGGER check_booking_platform_url
  BEFORE INSERT OR UPDATE OF booking_platform, booking_url
  ON padel_venues
  FOR EACH ROW
  EXECUTE FUNCTION guard_booking_platform_url();
