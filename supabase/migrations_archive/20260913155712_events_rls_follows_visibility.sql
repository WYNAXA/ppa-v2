-- events RLS follows visibility.
--
-- Every events policy now keys on the explicit visibility column introduced in
-- 20260913155650 instead of inferring the rule from whether group_id is null.
--
-- WHAT THIS MAKES POSSIBLE
--   private     an event only its author can see
--   connections an event the author's connections can see, with no group
--   group       unchanged behaviour, now stated rather than implied
--   public      unchanged: published by venue staff or a platform admin;
--               submitted by anyone else as 'pending' for review
--
-- THE ONE BEHAVIOUR CHANGE TO NOTICE
--   The old "Group members can view events" policy granted group members sight
--   of ANY row carrying their group_id. With visibility explicit, a row marked
--   private that happens to name a group is no longer visible to that group.
--   No existing row is affected: all three group events backfilled to 'group'.
--
-- VERIFIED, with a real connected pair and a real stranger:
--   author (90e0b3aa)      sees both his connections and private events
--   connected friend       sees the connections event, NOT the private one
--   unconnected stranger   sees neither
--   platform admin         sees the connections event only because he is
--                          himself connected to the author — not by being an
--                          admin (see 20260913155811)

-- ── Read ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can view published public events" ON public.events;
CREATE POLICY "Anyone can view published public events"
  ON public.events FOR SELECT TO authenticated
  USING (visibility = 'public' AND status = 'published');

DROP POLICY IF EXISTS "Connections can view a connections event" ON public.events;
CREATE POLICY "Connections can view a connections event"
  ON public.events FOR SELECT TO authenticated
  USING (
    visibility = 'connections'
    AND status = 'published'
    AND created_by IS NOT NULL
    AND public.are_connected(created_by, auth.uid())
  );

DROP POLICY IF EXISTS "Group members can view events" ON public.events;
CREATE POLICY "Group members can view events"
  ON public.events FOR SELECT TO authenticated
  USING (
    visibility = 'group'
    AND EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = events.group_id
        AND gm.user_id = auth.uid()
        AND gm.status = 'approved'
    )
  );

-- "Authors can view their own events" is unchanged and still applies. It is
-- what makes visibility='private' work: nobody else matches any policy.

-- ── Write ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Group admins can create events" ON public.events;
CREATE POLICY "Group admins can create events"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    visibility = 'group'
    AND auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = events.group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'::group_role
        AND gm.status = 'approved'
    )
  );

-- Anyone can make an event for themselves or their connections. No moderation
-- gate, because neither is a broadcast to the whole user base.
DROP POLICY IF EXISTS "Players create private and connections events" ON public.events;
CREATE POLICY "Players create private and connections events"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    visibility IN ('private', 'connections')
    AND created_by = auth.uid()
    AND group_id IS NULL
    AND is_official = false
  );

DROP POLICY IF EXISTS "Venue staff and admins publish public events" ON public.events;
CREATE POLICY "Venue staff and admins publish public events"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    visibility = 'public'
    AND group_id IS NULL
    AND created_by = auth.uid()
    AND (
      public.is_platform_admin()
      OR (source_venue_id IS NOT NULL AND public.is_venue_staff(source_venue_id))
    )
  );

DROP POLICY IF EXISTS "Players submit public events for review" ON public.events;
CREATE POLICY "Players submit public events for review"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    visibility = 'public'
    AND group_id IS NULL
    AND created_by = auth.uid()
    AND status = 'pending'
    AND is_official = false
    AND source_type = 'player'
  );

-- The thing being prevented is a player publishing to EVERYONE. Publishing to
-- yourself, your connections or your group needs no gate.
DROP POLICY IF EXISTS "Authors update their own events" ON public.events;
CREATE POLICY "Authors update their own events"
  ON public.events FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (
    auth.uid() = created_by
    AND (
      visibility <> 'public'
      OR public.is_platform_admin()
      OR (source_venue_id IS NOT NULL AND public.is_venue_staff(source_venue_id))
      OR (status <> 'published' AND is_official = false)
    )
  );

DROP POLICY IF EXISTS "Admins moderate public events" ON public.events;
CREATE POLICY "Admins moderate public events"
  ON public.events FOR UPDATE TO authenticated
  USING (visibility = 'public' AND public.is_platform_admin())
  WITH CHECK (visibility = 'public' AND public.is_platform_admin());

-- ── Attendance ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can view attendees of a public event" ON public.event_attendees;
CREATE POLICY "Anyone can view attendees of a public event"
  ON public.event_attendees FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_attendees.event_id
        AND e.status = 'published'
        AND (
          e.visibility = 'public'
          OR (e.visibility = 'connections'
              AND e.created_by IS NOT NULL
              AND public.are_connected(e.created_by, auth.uid()))
        )
    )
  );
