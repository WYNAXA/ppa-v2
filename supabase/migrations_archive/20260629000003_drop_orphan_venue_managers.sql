-- Dedup: standardise venue access on venue_users (canonical: owner/manager/staff
-- + status, used by VenueContext, is_venue_owner(), and padel_venues owner RLS).
-- venue_managers is an orphan: not used by any app code, and the RLS policies that
-- referenced it (venue_rewards_all, court_booking_messages) never applied to the
-- live DB. Verified: zero live policies and zero function bodies reference it
-- (only a stale comment in delete_user). Safe to drop.
DROP TABLE IF EXISTS public.venue_managers;
