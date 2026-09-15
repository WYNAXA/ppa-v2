-- A coach coaches.
--
-- ROOT CAUSE
--   Discover's Coaching tile counts padel_venues where coaching_available is
--   true. Found while measuring it: the one dedicated coach business in
--   Bristol, "PadelwithPeter Coaching", has coaching_available = false.
--
--   It is not one bad row. Every coach row in the directory says the same:
--
--     venue_type='club'   coaching_available=false   5829
--     venue_type='club'   coaching_available=true     246
--     venue_type='coach'  coaching_available=false      20   <-- all of them
--     venue_type='coach'  coaching_available=true        0
--
--   Twenty for twenty. The importer sets venue_type from the listing's
--   category and coaching_available from a separate amenities field that a
--   coach listing does not have, so the flag defaulted false and nothing ever
--   reconciled the two. The Coaching count was wrong everywhere, not just here.
--
-- FIX CLASS: root-cause on the data, plus a constraint so it cannot recur.
--   Teaching the tile to count "venue_type='coach' OR coaching_available" is
--   the display patch, and it would leave the flag lying to every other reader
--   — VenueDetail, search filters, venues_near(p_venue_type) and the Hub.
--   One fact, one column.
--
-- BLAST RADIUS
--   coaching_available is read by the venue directory filters, VenueDetail and
--   discover's Coaching count. All three get MORE rows, never fewer. No reader
--   treats false as meaningful, so nothing depended on the wrong value.
--
-- STILL OPEN, deliberately not guessed here
--   246 of 6,075 clubs (4%) claim coaching. That is certainly an undercount —
--   most padel clubs offer lessons — but there is no evidence in the database
--   to set it from, and inventing it would be worse than a low number. It is
--   an enrichment job, not a migration.

update public.padel_venues
   set coaching_available = true,
       updated_at = now()
 where venue_type = 'coach'
   and coaching_available is distinct from true;

-- A coach row can never again say it does not coach.
alter table public.padel_venues drop constraint if exists padel_venues_coach_offers_coaching;
alter table public.padel_venues add constraint padel_venues_coach_offers_coaching
  check (venue_type is distinct from 'coach' or coalesce(coaching_available, false)) not valid;

alter table public.padel_venues validate constraint padel_venues_coach_offers_coaching;
