-- Admins do not read private events.
--
-- CORRECTION TO 20260913155650's predecessor, 20260913115546, which I wrote.
--
-- "Venue staff and admins view their venue's events" read:
--
--     USING (is_platform_admin()
--            OR (source_venue_id IS NOT NULL AND is_venue_staff(source_venue_id)))
--
-- The admin branch had no scope at all. When an event could only be a group
-- event or a public one, that was already wider than it needed to be. The
-- moment a player can mark an event 'private', it means the three rows in
-- platform_admins can read every private event any user ever creates.
--
-- That is not moderation, it is a back door, and it would have shipped inside
-- the feature that introduced private events — found only because I went to
-- test the new visibility rules with a real connected pair and had to pick
-- viewers who were not admins.
--
-- A platform admin needs to see PUBLIC events, including 'pending' ones
-- awaiting review, which is the entire point of the moderation queue. They do
-- not need to see anyone's private plans. Venue staff keep sight of events
-- attributed to their own venue, which is scoped by construction.
--
-- FIX CLASS: root-cause. Filtering private rows out of the admin screen would
-- have left the rows readable to anyone issuing their own PostgREST request.
DROP POLICY IF EXISTS "Venue staff and admins view their venue's events" ON public.events;
CREATE POLICY "Venue staff and admins view their venue's events"
  ON public.events FOR SELECT TO authenticated
  USING (
    (visibility = 'public' AND public.is_platform_admin())
    OR (source_venue_id IS NOT NULL AND public.is_venue_staff(source_venue_id))
  );
