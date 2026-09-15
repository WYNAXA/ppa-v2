-- Leagues join the location contract.
--
-- events gained padel_venue_id + latitude/longitude in 20260913124419. leagues
-- had only `city`, so "open leagues near me" was not expressible and
-- discover_feed() would have had to special-case one of its five sources.
-- Same three columns, same rule, so every source joins the same way.
--
-- No NOT NULL and no location CHECK: a league can legitimately run across
-- several venues, and there are 0 open leagues today to constrain. The feed
-- returns a NULL distance for a league with no point rather than dropping it.
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS padel_venue_id uuid,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;

ALTER TABLE public.leagues DROP CONSTRAINT IF EXISTS leagues_padel_venue_id_fkey;
ALTER TABLE public.leagues ADD CONSTRAINT leagues_padel_venue_id_fkey
  FOREIGN KEY (padel_venue_id) REFERENCES public.padel_venues(venue_id) ON DELETE SET NULL;

ALTER TABLE public.leagues DROP CONSTRAINT IF EXISTS leagues_latlng_both_or_neither;
ALTER TABLE public.leagues ADD CONSTRAINT leagues_latlng_both_or_neither
  CHECK ((latitude IS NULL) = (longitude IS NULL));

CREATE INDEX IF NOT EXISTS leagues_padel_venue_id_idx
  ON public.leagues (padel_venue_id) WHERE padel_venue_id IS NOT NULL;
