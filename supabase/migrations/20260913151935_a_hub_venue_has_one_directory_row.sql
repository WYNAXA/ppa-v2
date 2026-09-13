-- A Hub venue has one directory row.
--
-- venue-manager Bookings.tsx now resolves venues.id to padel_venues.venue_id
-- with .eq('venues_id', venueId).maybeSingle(), because matches.padel_venue_id
-- has a foreign key to padel_venues(venue_id) and the Hub only knows venues.id.
--
-- maybeSingle() throws if that link is not one-to-one, and nothing enforced
-- that it was. It holds today — 0 duplicate venues_id values — so the
-- invariant is written down before code starts depending on it, rather than
-- after a venue owner hits the error.
--
-- Partial index: venues_id is NULL for the 6,093 directory rows nobody has
-- claimed, and those are not duplicates of each other.
CREATE UNIQUE INDEX IF NOT EXISTS padel_venues_venues_id_uniq
  ON public.padel_venues (venues_id) WHERE venues_id IS NOT NULL;
