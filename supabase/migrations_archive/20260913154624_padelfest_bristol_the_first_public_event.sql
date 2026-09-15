-- PadelFest Bristol — the first real row in the Discover feed.
--
-- Saturday 19 September 2026, 10:00–23:00 BST, at Rocket Padel Bristol.
-- Organised by The Padel Directory, £9.99 entry, 14 courts. This is the event
-- a player could not find on the app, which is what sent us looking at the
-- events RLS in the first place.
--
-- SOURCES (two independent, in agreement on date, venue, postcode and price):
--   https://events.humanitix.com/padelfest-bristol   (the organiser's ticketing page)
--   https://www.eventbrite.com/e/padelfest-tickets-1997840796603
--
-- Times stored in UTC: 10:00 BST = 09:00Z, 23:00 BST = 22:00Z.
--
-- No latitude/longitude of its own: anchored to the Rocket Padel Bristol
-- directory row, so the feed uses that venue's point.
--
-- source_type = 'venue' rather than 'player' because it is not user-generated;
-- is_official = true because it has a real organiser and LTA support. The
-- event is NOT owned by Wynaxa and the app does not sell the ticket —
-- external_link sends the player to the organiser.
--
-- VERIFIED: discover_feed() called as an unrelated non-admin player, 25 miles
-- around central Bristol, returns exactly this row — 1.4 miles, £9.99.

INSERT INTO public.events (
  id, group_id, created_by, title, description, event_type,
  start_time, end_time, status, source_type, is_official,
  padel_venue_id, location, external_link,
  entry_fee_pence, currency, registration_open, target_radius_miles
)
SELECT
  '19092026-0000-4000-8000-000000000001'::uuid,
  NULL,
  (SELECT user_id FROM public.platform_admins ORDER BY user_id LIMIT 1),
  'PadelFest Bristol',
  'The UK''s first dedicated consumer padel festival. 14 courts, play sessions '
    || 'for all levels, coaching clinics, an evening mixed doubles tournament, '
    || 'a wellness zone, exhibitor stands, food and drink. Organised by The Padel Directory.',
  'tournament',
  timestamptz '2026-09-19 09:00:00+00',
  timestamptz '2026-09-19 22:00:00+00',
  'published',
  'venue',
  true,
  '69e3c467-4f42-40b6-8ecd-22eaf199d123',
  'Rocket Padel Bristol, St Annes Road, Brislington, Bristol BS4 4EB',
  'https://events.humanitix.com/padelfest-bristol',
  999,
  'GBP',
  true,
  50
WHERE NOT EXISTS (
  SELECT 1 FROM public.events WHERE id = '19092026-0000-4000-8000-000000000001'::uuid
);

-- Resolves an outstanding conflict on the venue row rather than leaving it.
-- padel_venues held BS1 3XT for Rocket Padel Bristol — a city-centre postcode.
-- Both sources above give St Annes Road, Brislington, BS4 4EB, and the
-- organiser's own ticketing page is authoritative for where the venue is.
--
-- Coordinates are deliberately NOT changed. The stored point (51.43450,
-- -2.58790) sits about 1.1 miles west of the BS4 outcode centroid
-- (51.43534, -2.56390, per api.postcodes.io). BS4 4EB itself is not in the ONS
-- postcode dataset — likely a new large-user code — so there is no
-- authoritative point to move it to. Replacing a wrong coordinate with a
-- guessed one is not a fix; this needs a real geocode.
UPDATE public.padel_venues
SET postcode = 'BS4 4EB',
    postal_code = NULL
WHERE venue_id = '69e3c467-4f42-40b6-8ecd-22eaf199d123';
