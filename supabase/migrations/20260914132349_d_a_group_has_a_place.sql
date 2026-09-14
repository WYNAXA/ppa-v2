-- A group has a place.
--
-- ROOT CAUSE
--   groups.latitude and groups.longitude already exist (double precision,
--   nullable). All 8 rows are NULL. So "groups near you" is not a query that
--   returns few results — it is a query that can never return anything, and
--   the Groups tile on Discover is structurally incapable of showing a number.
--
--   The columns were never populated because nothing in the create-group flow
--   asks where the group plays, and nothing derives it.
--
-- FIX CLASS: root-cause, in three parts. A one-off backfill alone is the
--   workaround — every group created tomorrow would be invisible again, and
--   the backfill would decay to nothing.
--
--     1. groups.padel_venue_id — joins the same location contract as
--        matches, events and leagues (20260913124419 / 20260913153426).
--        A group that plays somewhere gets a real point, not a city centroid.
--     2. A trigger that derives latitude/longitude FROM that venue, so the
--        coordinates cannot drift from the venue they claim to be at. One
--        fact, one place.
--     3. The backfill below, for the rows that have only a city.
--
--   Part 4 is client-side and is NOT in this migration: the create-group form
--   must ask where the group plays. Until it does, parts 1-3 are a floor, not
--   a fix.
--
-- THE BACKFILL, and what it refuses to do
--   City coordinates are taken as the centroid of ACTIVE padel_venues in that
--   city — real rows in this database, not a geocoding service and not a
--   guess:
--     bristol  12 venues  51.466243, -2.580050
--     surat     1 venue   21.170200, 72.831100
--
--   That covers 6 of 8 groups. The other two are left NULL on purpose:
--     "We love Padel" (Farnham) — the directory has no Farnham venue, so
--        there is nothing in this database to derive a point from.
--     "No Cheats Allowed" — no city at all.
--   Both are private groups, so neither would appear in a Discover count
--   either way. Inventing coordinates for them would launder a guess into a
--   column that reads as fact.
--
-- BLAST RADIUS
--   Additive: one nullable column, one FK, one index, one BEFORE trigger.
--   No existing reader of groups selects padel_venue_id, so nothing in ppa-v2
--   or venue-manager changes behaviour on this migration. The trigger only
--   writes lat/lng when padel_venue_id is non-null, which it is on zero rows
--   today, so the backfill below is unaffected by it.

alter table public.groups add column if not exists padel_venue_id uuid;

alter table public.groups drop constraint if exists groups_padel_venue_id_fkey;
alter table public.groups add constraint groups_padel_venue_id_fkey
  foreign key (padel_venue_id) references public.padel_venues(venue_id) on delete set null;

create index if not exists groups_padel_venue_id_idx
  on public.groups (padel_venue_id) where padel_venue_id is not null;

create index if not exists groups_latlng_idx
  on public.groups (latitude, longitude) where latitude is not null;

-- The venue is the source of truth for a group's coordinates when one is set.
create or replace function public.groups_sync_location()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.padel_venue_id is not null
     and (tg_op = 'INSERT'
          or new.padel_venue_id is distinct from old.padel_venue_id) then
    select pv.latitude, pv.longitude
      into new.latitude, new.longitude
      from public.padel_venues pv
     where pv.venue_id = new.padel_venue_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists groups_sync_location_trg on public.groups;
create trigger groups_sync_location_trg
  before insert or update of padel_venue_id on public.groups
  for each row execute function public.groups_sync_location();

-- Backfill from city, using this database's own venue coordinates.
with city_point as (
  select lower(btrim(city)) as city,
         avg(latitude)::double precision  as lat,
         avg(longitude)::double precision as lng
    from public.padel_venues
   where status = 'active' and latitude is not null
   group by 1
)
update public.groups g
   set latitude  = cp.lat,
       longitude = cp.lng,
       updated_at = now()
  from city_point cp
 where g.latitude is null
   and g.city is not null
   and lower(btrim(g.city)) = cp.city;
