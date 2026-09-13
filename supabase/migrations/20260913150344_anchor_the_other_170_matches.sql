-- Anchor the other 170 matches.
--
-- ROOT CAUSE
--   20260913124419 backfilled matches.padel_venue_id from booked_venue_id.
--   That column was set on only 52 rows, so the backfill looked complete when
--   it was not: 227 matches actually name a venue.
--
--   The other 175 carry booked_venue_name and NO id at all, because the four
--   client paths that set a venue on a match — CreateMatchSheet,
--   EditMatchSheet, PlayAnotherSheet and RecordResultSheet — write the name
--   only. booked_venue_id is written by BookCourt and self_report_booking()
--   alone.
--
--   Before this migration:
--     227  matches with a venue name
--      52  with a venue id          (23%)
--     175  with a name and no id    (77%)
--
--   That mattered beyond the backfill. MatchDetail resolves a match's map
--   pin by trying booked_venue_id first and falling back to an ilike on
--   booked_venue_name — and that fallback was carrying 175 of 227 matches,
--   not the dead code it looked like. Removing it before this ran would have
--   silently blanked the venue map on 77% of booked matches. VenueDetail's
--   "have you played here" check has the same dependency.
--
-- RESOLUTION, measured
--   Of the 175:
--     170  match exactly one padel_venues row by name   → anchored here
--       2  match FOUR rows ("House of Padel")           → left null
--       3  match none ("Bandeja Padel Club - Perugia")  → left null
--
--   Only the unambiguous 170 are written. The ambiguous two are exactly the
--   case the ilike fallback got wrong anyway — it picked whichever row came
--   back first. Guessing them here would launder that error into an FK.
--
-- FIX CLASS: root-cause on the data. The client paths that write a name with
--   no id are the upstream cause and are addressed separately.
--
-- VERIFIED AFTER APPLYING
--   227 with a venue name, 222 anchored, 222 of 222 resolving to a geocoded
--   padel_venues row, 5 keeping a free-text name and no id.
--
-- NOTED IN PASSING
--   A large share of the 170 resolve to "Bristol Padel Club", the seed row
--   22222222-2222-2222-2222-222222222222. Real matches now reference it, so
--   deleting that seed row is no longer a clean delete.

UPDATE public.matches m
SET padel_venue_id = pv.venue_id
FROM public.padel_venues pv
WHERE m.padel_venue_id IS NULL
  AND m.booked_venue_name IS NOT NULL
  AND lower(btrim(pv.venue_name)) = lower(btrim(m.booked_venue_name))
  AND (
    SELECT count(*) FROM public.padel_venues x
    WHERE lower(btrim(x.venue_name)) = lower(btrim(m.booked_venue_name))
  ) = 1;
