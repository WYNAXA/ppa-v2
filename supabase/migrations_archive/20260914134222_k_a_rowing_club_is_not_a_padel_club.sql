-- A rowing club is not a padel club.
--
-- CONTEXT
--   padel_venues has a review queue: needs_review + review_reason, populated
--   by the classifier in 20260912082152 / 20260912134548. 306 active rows are
--   flagged. Zero have ever been reviewed. Meanwhile they are counted as clubs
--   and shown in the directory, because needs_review changes nothing about
--   status or venue_type.
--
--   The flags separate cleanly into two kinds, which is what makes this
--   actionable rather than a guess:
--
--     IDENTITY — "this may not be a padel venue at all"
--       name suggests a different sport ......................  45
--       name suggests a shop, not a venue ....................  96
--       name suggests an academy or school ................... 162
--     DATA QUALITY — "this IS a club, a field is wrong"
--       postcode and postal_code disagree .....................  2   (Rocket
--                                              Padel Bristol, Surge Padel)
--       booking_platform says Playtomic, url isn't .............  1
--
--   The data-quality three must keep counting — Rocket Padel is the largest
--   club in the UAT account's city. Only identity flags are in scope.
--
-- A SIGNAL I CHECKED AND REJECTED
--   All 303 identity-flagged rows have zero courts recorded, which looked like
--   clean evidence. It is not: only 280 of 5,769 unflagged clubs (4.9%) have a
--   court count either. Court data is absent almost everywhere, so its absence
--   proves nothing. Discarded.
--
-- WHAT THIS MIGRATION DOES, and only this
--   The 45 "different sport" rows, read individually. They are Seattle Canoe &
--   Kayak Club, Renton Rowing Center, Montevideo Rowing Club, National Club Of
--   Swimming, Pedalheads Swim Lessons (three rows), Miami Beach Paddleboard,
--   and thirty-odd pickleball courts. None of them is a padel venue.
--
--   THREE ARE KEPT as 'club' and stay flagged, because the evidence points the
--   other way and a wrong reclassification is worse than an unreviewed row:
--     Dugout Sports Arena Vikaspuri — its booking URL is
--       hudle.in/venues/dugout-sports-arena-pickleball-padel/ and says padel
--     Paddle Hub 7 x Kelab Pickleball Titiwangsa — "Paddle Hub" may be padel
--     Paddle Paradise (OKR) Pickleball — same ambiguity
--
-- FIX CLASS: root-cause on the data. Filtering review_reason strings inside
--   discover_counts was the alternative and is a workaround twice over: it
--   leaves the rows wrong for every other reader, and it couples an RPC to
--   free-text wording that the classifier can change underneath it.
--
-- NOT DONE HERE, deliberately
--   The 96 shop rows and 162 academy rows are NOT touched. "Academy" is
--   genuinely ambiguous — plenty of real padel clubs are named "X Padel
--   Academy" — and deciding 258 rows needs the same row-by-row reading this
--   45 got. They stay flagged and stay counted until then. Half-doing it with
--   a name regex is how the directory got into this state.
--
-- BLAST RADIUS
--   venue_type 'not_padel' removes these rows from discover_counts.venues
--   (which requires 'club' as of 20260914134037), from
--   venue_duplicate_candidates (which filters venue_type='club'), and from any
--   venues_near() call passing a venue_type. status stays 'active' and no row
--   is deleted, so this is reversible by setting venue_type back.
--   None of the 45 is referenced by a match, event or league — all were
--   scraped, none claimed (venues_id is null on every one).

update public.padel_venues
   set venue_type    = 'not_padel',
       needs_review  = false,
       review_reason = null,
       classified_by = 'migration:2026-09-14-different-sport',
       classified_at = now(),
       updated_at    = now()
 where status = 'active'
   and venue_type = 'club'
   and needs_review
   and review_reason = 'name suggests a different sport'
   and venue_name not in (
     'Dugout Sports Arena Vikaspuri - Cricket, Football, Pickleball and Cricket Bowling Machine',
     'Paddle Hub 7 x Kelab Pickleball Titiwangsa @ Taman Maluri',
     'Paddle Paradise (OKR) Pickleball'
   );
