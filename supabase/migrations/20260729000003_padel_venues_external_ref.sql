-- Dedup key for imported venues (Google Places, and future sources) so re-running
-- an import upserts instead of duplicating. Null for manually-created / claimed venues;
-- a unique index permits many nulls (NULLS DISTINCT) so existing rows are unaffected.

alter table public.padel_venues add column if not exists external_ref text;

create unique index if not exists padel_venues_external_ref_key
  on public.padel_venues (external_ref);

comment on column public.padel_venues.external_ref is
  'Import dedup key, e.g. "google_places:<place_id>". Null for hand-created/claimed venues.';
