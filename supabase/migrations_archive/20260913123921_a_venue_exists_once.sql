-- A venue exists once.
--
-- ROOT CAUSE
--   public.venues held four rows named "Filton Padel", identical in name, city
--   and coordinates:
--
--     bf772804…  2026-06-30 08:57:22
--     7e50a1fa…  2026-06-30 09:00:34
--     c28e182d…  2026-06-30 09:01:18
--     86a2c6e3…  2026-06-30 10:28:42   ← the only one linked to padel_venues
--
--   Three of them inside four minutes: a create-venue submission retried by a
--   person who saw no confirmation. public.padel_venues has carried
--   UNIQUE (venue_name, city) since 20260330000003, and create_owned_venue()
--   probes it and raises 'venue_exists' before inserting — but public.venues
--   itself had no uniqueness of any kind, so any write path that touched
--   venues without also writing padel_venues could duplicate the row freely.
--   That is exactly the shape of the three orphans: venues rows with no
--   padel_venues sibling, which today's create_owned_venue() can never produce
--   because it always writes both.
--
-- FIX CLASS: root-cause on the constraint, cleanup on the data. Excluding the
--   orphans from a query — the alternative — would have left three rows that
--   any future join, count or admin screen could still pick up.
--
-- BLAST RADIUS — measured, not assumed.
--   Every table with a foreign key to venues(id) — bookings, courts,
--   venue_users, venue_events, venue_contracts, venue_stripe_accounts,
--   pricing_rules, court_availability_settings, court_block_outs,
--   coaching_sessions, venue_onboarding, venue_activity_log, products,
--   order_items, padel_venues, events — was counted for each of the three
--   deleted ids. Every count was 0.
--
--   So were the sixteen columns that name a venue WITHOUT a foreign key:
--   leagues.source_venue_id, memberships, profiles.verified_venue_id,
--   slot_waitlist, user_venue_stamps, venue_claim_invites.venues_id,
--   venue_claim_requests, venue_claim_verifications, venue_customer_notes,
--   venue_ratings, venue_rewards, voucher_redemptions, vouchers — all 0 — and
--   matches.booked_venue_id (text, unconstrained) — also 0.
--
--   Nothing was repointed because nothing pointed at them. The surviving row
--   86a2c6e3 keeps its padel_venues sibling d1dcee2e ("Filton Padel").
--
-- STILL OPEN, deliberately not fixed here:
--   matches.booked_venue_id is text with no foreign key and points at two
--   different tables — 50 rows at padel_venues.venue_id and 2 at venues.id.
--   That polymorphism blocks distance-ranking open matches and needs its own
--   migration; conflating it with this one would hide it.

DELETE FROM public.venues
WHERE id IN (
  'bf772804-c82e-4432-90e9-30a134d02c04',
  '7e50a1fa-11b3-49b0-9581-0ed452557842',
  'c28e182d-f617-4e3c-b90d-532da73fb292'
);

-- The same identity rule padel_venues already enforces, so the two tables
-- agree on what "the same venue" means.
CREATE UNIQUE INDEX IF NOT EXISTS venues_name_city_uniq
  ON public.venues (lower(btrim(name)), coalesce(lower(btrim(city)), ''));
