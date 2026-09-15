-- A closed venue was being offered to players.
--
-- "The Padel Team - Bristol" (status 'closed', a google_places scrape with no
-- venues_id, no courts and no Stripe account) appeared in the app's venue list
-- directly beside the real "The Padel Team Bristol". A player tapping it reaches
-- a venue that cannot be booked.
--
-- The cause is not that row. Of the 22 places the app reads padel_venues, six
-- offer the player a venue to choose and none of them filter on status; two more
-- count rows for a figure shown on screen; and exactly two - Search.tsx and the
-- nearby list on VenueDetail.tsx - already carry .eq('status','active'). So the
-- rule exists and was applied inconsistently, which is what happens when a
-- product rule lives in client queries instead of in one database object.
--
-- Fix class: root-cause. Filtering the six call sites would work today and
-- guarantee the seventh is written without it, exactly as these six were.
--
-- Lookups by id deliberately keep reading padel_venues directly. A player must
-- still be able to open the venue for a court they have already paid for, even
-- after that venue closes, so PayBooking, MatchDetail, Waitlist, You,
-- EmbedVenueBooking and the rest are not touched.

-- security_invoker is not optional here. padel_venues has RLS enabled with five
-- policies; a normal view executes as its owner and would bypass every one of
-- them, silently widening read access to the whole directory. With this set, the
-- view enforces the caller's policies exactly as the table does.
--
-- `select *` freezes the column list at creation. A column added to padel_venues
-- later will be missing here until this view is recreated - a visible "column
-- does not exist" error at the call site, not a silent wrong answer.
create or replace view public.discoverable_venues
with (security_invoker = true)
as
select * from public.padel_venues where status = 'active';

comment on view public.discoverable_venues is
  'Venues that may be OFFERED to a player: searched, listed, or counted. The only '
  'definition of discoverability. Read padel_venues directly when resolving a venue '
  'already referenced by a booking, match or waitlist entry - those must keep '
  'resolving after a venue closes.';

grant select on public.discoverable_venues to anon, authenticated;
