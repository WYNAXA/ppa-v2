-- One place means one row.
--
-- The location contract for Discover: every item the feed can show must
-- resolve to exactly one geocoded row. Two things stopped that.
--
-- ROOT CAUSE 1 — matches.booked_venue_id is polymorphic and unconstrained.
--   The column is `text`, has no foreign key, and in practice names rows in
--   two different tables:
--
--     50 rows  →  padel_venues.venue_id
--      2 rows  →  venues.id            (both "The Padel Team Bristol")
--      0 rows  →  neither (no dangling references)
--
--   Nothing in the schema said which table a given value belongs to, so any
--   join had to guess, and a match could not be ranked by distance at all.
--
-- ROOT CAUSE 2 — a public event has nowhere to record where it is.
--   events carries a free-text `location` and `source_venue_id`, which points
--   at public.venues (7 rows: the claimed, operator-managed venues). That is a
--   permission relationship — "this venue's staff run this event" — not a
--   location. Padelfest Bristol is not held at a claimed venue and need not be
--   held at a padel venue at all, so before this migration there was no column
--   in which its coordinates could be stored.
--
-- WHY padel_venues IS THE ANCHOR
--   padel_venues:  6,099 rows, 6,099 geocoded (100%)
--   venues:            7 rows,     6 geocoded
--   Every claimed venue has a padel_venues sibling via padel_venues.venues_id,
--   so anchoring on padel_venues.venue_id loses nothing and covers the whole
--   directory. profiles already carries the viewer's latitude/longitude, and
--   PostGIS plus venues_near() are already in place to measure against it.
--
-- FIX CLASS: root-cause. Resolving the two shapes inside the feed query at
--   read time — the patch — would have left the ambiguity in the column for
--   every future reader to rediscover.
--
-- BLAST RADIUS
--   matches.padel_venue_id is ADDITIVE. booked_venue_id is untouched and
--   still populated, so nothing in ppa-v2 or venue-manager breaks on this
--   migration. This is phase one of a two-phase column migration: phase two
--   moves every reader onto padel_venue_id and drops booked_venue_id, and
--   must not be skipped — two columns holding the same fact is the state this
--   migration exists to end, not a state to settle in.
--
--   events gains three nullable columns and two CHECK constraints. All three
--   existing rows are group events (group_id IS NOT NULL) and satisfy the
--   location check unchanged. events.source_venue_id is deliberately KEPT: it
--   answers "who may publish this", padel_venue_id answers "where is it", and
--   collapsing the two would re-create the confusion above in a new place.
--
-- VERIFIED AFTER APPLYING
--   matches: 52 with booked_venue_id, 52 with padel_venue_id, 0 unresolved,
--            52 of 52 resolving to a geocoded padel_venues row.

-- ── matches: resolve the polymorphic venue reference ────────────────────────
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS padel_venue_id uuid;

-- 50 rows already name a padel_venues row directly.
UPDATE public.matches m
SET padel_venue_id = m.booked_venue_id::uuid
WHERE m.booked_venue_id IS NOT NULL
  AND m.padel_venue_id IS NULL
  AND EXISTS (SELECT 1 FROM public.padel_venues pv WHERE pv.venue_id = m.booked_venue_id::uuid);

-- 2 rows name a venues row; both resolve through padel_venues.venues_id.
UPDATE public.matches m
SET padel_venue_id = pv.venue_id
FROM public.venues v
JOIN public.padel_venues pv ON pv.venues_id = v.id
WHERE m.padel_venue_id IS NULL
  AND m.booked_venue_id IS NOT NULL
  AND v.id = m.booked_venue_id::uuid;

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_padel_venue_id_fkey;
ALTER TABLE public.matches ADD CONSTRAINT matches_padel_venue_id_fkey
  FOREIGN KEY (padel_venue_id) REFERENCES public.padel_venues(venue_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS matches_padel_venue_id_idx
  ON public.matches (padel_venue_id) WHERE padel_venue_id IS NOT NULL;

-- ── events: a public event must say where it is ─────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS padel_venue_id uuid,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_padel_venue_id_fkey;
ALTER TABLE public.events ADD CONSTRAINT events_padel_venue_id_fkey
  FOREIGN KEY (padel_venue_id) REFERENCES public.padel_venues(venue_id) ON DELETE SET NULL;

-- A public event anchors to a directory venue, or carries its own point.
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_public_has_a_location;
ALTER TABLE public.events ADD CONSTRAINT events_public_has_a_location
  CHECK (
    group_id IS NOT NULL
    OR padel_venue_id IS NOT NULL
    OR (latitude IS NOT NULL AND longitude IS NOT NULL)
  );

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_latlng_both_or_neither;
ALTER TABLE public.events ADD CONSTRAINT events_latlng_both_or_neither
  CHECK ((latitude IS NULL) = (longitude IS NULL));

CREATE INDEX IF NOT EXISTS events_padel_venue_id_idx
  ON public.events (padel_venue_id) WHERE padel_venue_id IS NOT NULL;
