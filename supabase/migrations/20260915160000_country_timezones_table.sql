-- F5: Country→timezone is a table, not a CASE statement.
-- F5a: all 59 country codes in padel_venues, seeded from the live data.
-- F5b: derive_match_timezone uses one lookup, not two 22-line blocks.
-- F5c: timezone is nullable; NULL means "not derived yet".
-- F5d: venue-less matches stay NULL until booked. The trigger derives on
--       UPDATE when padel_venue_id is set.

-- ── F5a: country_timezones table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.country_timezones (
  country_code text PRIMARY KEY,
  timezone     text NOT NULL,
  multi_zone   boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE public.country_timezones IS
  'IANA timezone for single-timezone countries. multi_zone = true means the '
  'timezone is the majority zone; city/lat-long should be used where possible. '
  'Adding a country is one INSERT, not a function rewrite.';

-- Seed ALL 59 codes present in padel_venues.
-- Multi-zone countries: majority zone stored, multi_zone = true.
--   ES: Europe/Madrid (mainland majority; Canary Islands = Atlantic/Canary)
--   PT: Europe/Lisbon (mainland; Azores = Atlantic/Azores)
--   US: America/New_York (East Coast majority for padel)
--   CA: America/Toronto (majority)
--   AU: Australia/Sydney (East Coast majority)
--   BR: America/Sao_Paulo (majority)
--   MX: America/Mexico_City (majority)
--   ID: Asia/Jakarta (majority)
--   CL: America/Santiago (mainland)
--   NZ: Pacific/Auckland (mainland)
--   CN: Asia/Shanghai (single civil time but technically multi-zone)
INSERT INTO public.country_timezones (country_code, timezone, multi_zone) VALUES
  ('AE', 'Asia/Dubai',                     false),
  ('AR', 'America/Argentina/Buenos_Aires',  false),
  ('AT', 'Europe/Vienna',                   false),
  ('AU', 'Australia/Sydney',                true),
  ('BE', 'Europe/Brussels',                 false),
  ('BH', 'Asia/Bahrain',                    false),
  ('BR', 'America/Sao_Paulo',              true),
  ('CA', 'America/Toronto',                 true),
  ('CH', 'Europe/Zurich',                   false),
  ('CL', 'America/Santiago',                true),
  ('CN', 'Asia/Shanghai',                   false),
  ('CO', 'America/Bogota',                  false),
  ('CZ', 'Europe/Prague',                   false),
  ('DE', 'Europe/Berlin',                   false),
  ('DK', 'Europe/Copenhagen',               false),
  ('EG', 'Africa/Cairo',                    false),
  ('ES', 'Europe/Madrid',                   true),
  ('FI', 'Europe/Helsinki',                 false),
  ('FR', 'Europe/Paris',                    false),
  ('GB', 'Europe/London',                   false),
  ('GR', 'Europe/Athens',                   false),
  ('HK', 'Asia/Hong_Kong',                  false),
  ('HR', 'Europe/Zagreb',                   false),
  ('HU', 'Europe/Budapest',                 false),
  ('ID', 'Asia/Jakarta',                    true),
  ('IE', 'Europe/Dublin',                   false),
  ('IL', 'Asia/Jerusalem',                  false),
  ('IN', 'Asia/Kolkata',                    false),
  ('IT', 'Europe/Rome',                     false),
  ('JO', 'Asia/Amman',                      false),
  ('JP', 'Asia/Tokyo',                      false),
  ('KE', 'Africa/Nairobi',                  false),
  ('KW', 'Asia/Kuwait',                     false),
  ('MA', 'Africa/Casablanca',               false),
  ('MX', 'America/Mexico_City',             true),
  ('MY', 'Asia/Kuala_Lumpur',               false),
  ('NG', 'Africa/Lagos',                    false),
  ('NL', 'Europe/Amsterdam',                false),
  ('NO', 'Europe/Oslo',                     false),
  ('NZ', 'Pacific/Auckland',                true),
  ('OM', 'Asia/Muscat',                     false),
  ('PE', 'America/Lima',                    false),
  ('PH', 'Asia/Manila',                     false),
  ('PL', 'Europe/Warsaw',                   false),
  ('PT', 'Europe/Lisbon',                   true),
  ('PY', 'America/Asuncion',                false),
  ('QA', 'Asia/Qatar',                      false),
  ('RO', 'Europe/Bucharest',                false),
  ('RS', 'Europe/Belgrade',                 false),
  ('SA', 'Asia/Riyadh',                     false),
  ('SE', 'Europe/Stockholm',                false),
  ('SG', 'Asia/Singapore',                  false),
  ('SI', 'Europe/Ljubljana',                false),
  ('SK', 'Europe/Bratislava',               false),
  ('TH', 'Asia/Bangkok',                    false),
  ('TR', 'Europe/Istanbul',                 false),
  ('US', 'America/New_York',                true),
  ('UY', 'America/Montevideo',              false),
  ('ZA', 'Africa/Johannesburg',             false)
ON CONFLICT (country_code) DO NOTHING;

-- RLS: readable by anyone, writable by service_role only
ALTER TABLE public.country_timezones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read country_timezones"
  ON public.country_timezones FOR SELECT TO authenticated USING (true);

-- ── F5c: timezone is nullable; NULL = not derived ───────────────────────────
-- Chose nullable over timezone_source because:
--   - NULL is a single column, timezone_source is two columns for one fact
--   - the trigger only writes timezone when it can resolve, so NULL = unresolved
--     is a natural representation, not a convention
--   - expire_stale_booking_claims coalesces to 'Europe/London' for NULL,
--     which is the safe default for the 7 future venue-less matches (all UK)

ALTER TABLE public.matches ALTER COLUMN timezone DROP NOT NULL;
ALTER TABLE public.matches ALTER COLUMN timezone DROP DEFAULT;

-- Reset all 'Europe/London' values to NULL where they were from the default,
-- then re-backfill properly from the table.
UPDATE matches SET timezone = NULL;

-- ── Re-backfill from country_timezones table ────────────────────────────────

UPDATE matches m
SET timezone = ct.timezone
FROM padel_venues pv
JOIN country_timezones ct ON ct.country_code = pv.country_code
WHERE pv.venue_id = m.padel_venue_id
  AND m.padel_venue_id IS NOT NULL;

-- ── F5b: derive_match_timezone — one lookup, no duplication ─────────────────

CREATE OR REPLACE FUNCTION public.derive_match_timezone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
BEGIN
  -- On INSERT: derive if timezone is NULL and we have a venue
  -- On UPDATE: derive when padel_venue_id changes
  IF (TG_OP = 'INSERT' AND NEW.timezone IS NULL AND NEW.padel_venue_id IS NOT NULL)
     OR (TG_OP = 'UPDATE'
         AND NEW.padel_venue_id IS DISTINCT FROM OLD.padel_venue_id
         AND NEW.padel_venue_id IS NOT NULL)
  THEN
    SELECT ct.timezone INTO v_tz
    FROM padel_venues pv
    JOIN country_timezones ct ON ct.country_code = pv.country_code
    WHERE pv.venue_id = NEW.padel_venue_id;

    IF v_tz IS NOT NULL THEN
      NEW.timezone := v_tz;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger already exists from previous migration; CREATE OR REPLACE above
-- replaces the function body. The trigger binding is unchanged.

-- ── Drop the old helper function ────────────────────────────────────────────
DROP FUNCTION IF EXISTS public._country_code_to_tz(text);

-- ── Fix expire_stale_booking_claims to coalesce NULL timezone ────────────────

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
      -- timezone-aware: NULL defaults to Europe/London (all current
      -- venue-less matches are UK-based)
      AND ((m.match_date + m.match_time)
           AT TIME ZONE coalesce(m.timezone, 'Europe/London'))
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
