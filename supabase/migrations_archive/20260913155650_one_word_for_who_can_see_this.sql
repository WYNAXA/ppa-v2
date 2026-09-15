-- One word for who can see this.
--
-- ROOT CAUSE
--   "Who can see this" was said four different ways across four tables, and
--   events said it a fifth way by not saying it at all:
--
--     groups.visibility        open | private | public   (two words for one idea)
--     matches.open_audience    connections | groups | open
--     venue_events.visibility  public | members_only
--     leagues.visibility       open | group  (NO check constraint)
--     events                   no column — the presence of group_id WAS the rule
--
--   Adding private/connections to events in its own shape would have made six.
--
-- FIX CLASS: root-cause. A domain puts the vocabulary in one place, so the
--   next table to need it adopts the list rather than inventing one.
--
-- SCOPE, deliberately limited: events adopts the domain now. Migrating
--   matches, leagues, venue_events and groups onto it means rewriting their
--   RLS too, which is its own piece of work with its own blast radius. The
--   COMMENT below is the note that says so, in the place someone will look.
CREATE DOMAIN public.audience AS text
  CONSTRAINT audience_values CHECK (
    VALUE IN ('public', 'connections', 'group', 'venue_members', 'private')
  );

COMMENT ON DOMAIN public.audience IS
  'Who can see a thing. public = any signed-in user; connections = people the '
  'author is connected to; group = approved members of the linked group; '
  'venue_members = members of the owning venue; private = the author only. '
  'events uses this. matches.open_audience, leagues.visibility, '
  'venue_events.visibility and groups.visibility predate it and should migrate '
  'onto it rather than each keeping their own list.';

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS visibility public.audience;

-- Backfill from what group_id already meant.
UPDATE public.events
SET visibility = CASE WHEN group_id IS NOT NULL THEN 'group' ELSE 'public' END
WHERE visibility IS NULL;

-- Default 'group' preserves today's behaviour: every existing client insert
-- path (CreateEventSheet) is group-scoped and sets group_id.
ALTER TABLE public.events ALTER COLUMN visibility SET DEFAULT 'group';
ALTER TABLE public.events ALTER COLUMN visibility SET NOT NULL;

-- group_id now means "which group owns this", not "is this private".
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_group_visibility_needs_group;
ALTER TABLE public.events ADD CONSTRAINT events_group_visibility_needs_group
  CHECK (visibility <> 'group' OR group_id IS NOT NULL);

-- The location and start-time rules were keyed on group_id IS NULL as a proxy
-- for "public". They now say what they mean: a private or connections event
-- need not name a place; a public one must, or it cannot be ranked in a feed.
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_public_has_a_location;
ALTER TABLE public.events ADD CONSTRAINT events_public_has_a_location
  CHECK (
    visibility <> 'public'
    OR padel_venue_id IS NOT NULL
    OR (latitude IS NOT NULL AND longitude IS NOT NULL)
  );

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_public_needs_start_time;
ALTER TABLE public.events ADD CONSTRAINT events_public_needs_start_time
  CHECK (visibility <> 'public' OR start_time IS NOT NULL);

-- Provenance for events found online, so a re-scrape updates rather than
-- duplicates. Same pattern as padel_venues.external_ref, which is what kept
-- the venue directory from growing a second copy of every club.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS external_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS events_external_ref_uniq
  ON public.events (external_ref) WHERE external_ref IS NOT NULL;

UPDATE public.events
SET external_ref = 'humanitix:padelfest-bristol'
WHERE id = '19092026-0000-4000-8000-000000000001' AND external_ref IS NULL;

CREATE INDEX IF NOT EXISTS events_visibility_upcoming_idx
  ON public.events (visibility, start_time) WHERE status = 'published';
