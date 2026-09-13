-- An event can be public.
--
-- ROOT CAUSE
--   public.events had exactly one SELECT policy:
--
--     "Group members can view events"
--       USING (EXISTS (SELECT 1 FROM group_members
--                      WHERE group_id = events.group_id
--                        AND user_id = auth.uid()
--                        AND status = 'approved'))
--
--   events.group_id is nullable and nothing covered NULL, so a row with no
--   group was invisible to every caller — its own creator included. The INSERT
--   policy closed the other end:
--
--     "Group admins can create events"
--       WITH CHECK (auth.uid() = created_by
--                   AND EXISTS (SELECT 1 FROM group_members
--                               WHERE group_id = events.group_id
--                                 AND user_id = auth.uid()
--                                 AND role = 'admin' AND status = 'approved'))
--
--   With group_id NULL that EXISTS is false, so a public event could not be
--   written either. The table was group-private by construction, in both
--   directions, while carrying columns (is_official, source_type,
--   source_venue_id, target_radius_miles DEFAULT 10) that only make sense for
--   public, radius-based discovery. The design existed; the policies never
--   caught up.
--
--   Observable consequence: a real, open, city-wide event — Padelfest Bristol,
--   September 2026 — had nowhere in this schema it could live where a player
--   would find it.
--
-- FIX CLASS: root-cause. The alternative patch — letting the UI read events
--   through a SECURITY DEFINER RPC that bypasses RLS — would have made the
--   rows visible while leaving the table's own access rules wrong, and every
--   future reader would have had to know to use the RPC.
--
-- THE MODEL THIS ESTABLISHES
--   group_id IS NOT NULL  →  a group's event. Unchanged in every respect.
--   group_id IS NULL      →  a public event, governed by `status`:
--                              'draft'     author only
--                              'pending'   author only, awaiting review
--                              'published' visible to every signed-in user
--                              'cancelled' author only
--
--   Who may publish directly: platform admins, and staff of the venue named in
--   source_venue_id. Anyone else may submit, but only as 'pending' and only
--   with is_official = false — so opening events to the public does not open
--   an unmoderated broadcast channel to the whole user base.
--
-- BLAST RADIUS
--   - Every SELECT/INSERT/UPDATE on public.events. Group behaviour is
--     preserved by the `group_id IS NOT NULL` branch in each new policy.
--   - "Group admins can update events" is replaced. Its USING clause is kept
--     verbatim (created_by = auth.uid()) so no group author loses edit rights;
--     only the WITH CHECK is added, because that policy previously defaulted
--     WITH CHECK to USING and therefore let a submitter flip their own pending
--     event to 'published'.
--   - event_attendees' SELECT policy joins events to group_members and so
--     returns nothing for a public event; a matching policy is added, or no
--     one could see who is going to a public event.
--   - events.source_venue_id gains a foreign key to public.venues(id), the
--     table venue_users and is_venue_staff() operate on. It was added in
--     20260505000003 as a bare uuid with no stated target. All three existing
--     rows have it NULL, so the constraint applies cleanly.

-- ── Predicate used by the policies below ─────────────────────────────────────
-- SECURITY DEFINER so a policy can test platform-admin membership without
-- granting every caller read access to public.platform_admins. Mirrors the
-- guard already inlined in admin_classify_venue() and its siblings.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- ── Schema ───────────────────────────────────────────────────────────────────
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE public.events ADD CONSTRAINT events_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'pending'::text, 'published'::text, 'cancelled'::text]));

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_source_venue_id_fkey;
ALTER TABLE public.events ADD CONSTRAINT events_source_venue_id_fkey
  FOREIGN KEY (source_venue_id) REFERENCES public.venues(id) ON DELETE SET NULL;

-- A public event must say when it happens, or it cannot be ranked in a feed.
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_public_needs_start_time;
ALTER TABLE public.events ADD CONSTRAINT events_public_needs_start_time
  CHECK (group_id IS NOT NULL OR start_time IS NOT NULL);

-- The Discover feed's access path: upcoming public events, in time order.
CREATE INDEX IF NOT EXISTS events_public_upcoming_idx
  ON public.events (start_time)
  WHERE group_id IS NULL AND status = 'published';

-- ── Read ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can view published public events" ON public.events;
CREATE POLICY "Anyone can view published public events"
  ON public.events FOR SELECT TO authenticated
  USING (group_id IS NULL AND status = 'published');

-- Without this, an author cannot read back the draft or pending event they
-- just wrote — the same NULL-group blind spot, one row narrower.
DROP POLICY IF EXISTS "Authors can view their own events" ON public.events;
CREATE POLICY "Authors can view their own events"
  ON public.events FOR SELECT TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Venue staff and admins view their venue's events" ON public.events;
CREATE POLICY "Venue staff and admins view their venue's events"
  ON public.events FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (source_venue_id IS NOT NULL AND public.is_venue_staff(source_venue_id))
  );

-- ── Write ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Venue staff and admins publish public events" ON public.events;
CREATE POLICY "Venue staff and admins publish public events"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    group_id IS NULL
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
    group_id IS NULL
    AND created_by = auth.uid()
    AND status = 'pending'
    AND is_official = false
    AND source_type = 'player'
  );

-- Replaces "Group admins can update events". USING is unchanged; WITH CHECK is
-- new, and is what stops a player self-publishing or self-verifying.
DROP POLICY IF EXISTS "Group admins can update events" ON public.events;
DROP POLICY IF EXISTS "Authors update their own events" ON public.events;
CREATE POLICY "Authors update their own events"
  ON public.events FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (
    auth.uid() = created_by
    AND (
      group_id IS NOT NULL
      OR public.is_platform_admin()
      OR (source_venue_id IS NOT NULL AND public.is_venue_staff(source_venue_id))
      OR (status <> 'published' AND is_official = false)
    )
  );

-- Platform admins are the review queue: they move a pending public event to
-- published. They cannot touch group events.
DROP POLICY IF EXISTS "Admins moderate public events" ON public.events;
CREATE POLICY "Admins moderate public events"
  ON public.events FOR UPDATE TO authenticated
  USING (group_id IS NULL AND public.is_platform_admin())
  WITH CHECK (group_id IS NULL AND public.is_platform_admin());

-- ── Attendance on a public event ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can view attendees of a public event" ON public.event_attendees;
CREATE POLICY "Anyone can view attendees of a public event"
  ON public.event_attendees FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_attendees.event_id
        AND e.group_id IS NULL
        AND e.status = 'published'
    )
  );
