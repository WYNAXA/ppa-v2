-- The count is the list.
--
-- ROOT CAUSE — the defect UAT found, stated exactly.
--   discover_counts() defines "near you" for six nouns. The six pages behind
--   the six tiles define it again, six more times, each differently:
--
--     tile          discover_counts              the page behind it
--     Clubs 14      venue_type='club', 25 mi     VenuesPage.tsx:27  radius 60 mi
--     Players 57    geocoded, 25 mi, not me      AllPlayersPage.tsx:29  NO distance
--                                                filter at all, limit 100
--     Coaching 8    coaching_available, 25 mi    Coaches.tsx:110 venues_near(60 mi)
--                                                AND :130 venue_type='coach' only
--     Groups 0      (see below)                  AllGroupsPage.tsx:40  NO distance,
--                                                NO scope filter, limit 100
--     Leagues 0     open registration, 25 mi     LeagueDiscovery.tsx:183 status
--                                                ='active', NO distance
--     Events 1      public/connections, 25 mi    AllEventsPage.tsx:62 limit 100
--
--   Seven definitions of one idea. Every tile disagreed with its own page.
--
-- SECOND DEFECT, mine alone
--   discover_counts.groups required visibility public/open AND join_mode <>
--   'closed' AND allow_join_requests, and excluded groups the caller is already
--   in. No other tile does that. Clubs counts clubs you have played at; Players
--   counts players you are connected to. Groups alone was counting
--   "joinable strangers", which is why it read 0 with FIVE groups 1.9 miles
--   away — including BS3 Padel Players, public, that the caller is a member of.
--
--   "Near you" means near you. Whether you can join is the page's business, not
--   the count's.
--
-- FIX CLASS: root-cause, structural. Making six pages copy the RPC's predicates
--   is the workaround — it is six more places to drift, and drift is exactly
--   what this migration exists to end. Instead:
--
--     discover_list(kind, ...)   ONE definition of "near you" per noun
--     discover_counts(...)       = count(*) of discover_list, per kind
--
--   A count cannot disagree with its list, because the count IS the list
--   counted. The pages call discover_list for the same kind and get the rows
--   behind their own number, by construction.
--
-- SECURITY INVOKER on both (no SECURITY DEFINER clause). RLS still decides what
--   the caller may see — which is why groups needs no visibility predicate here
--   at all: can_see_group() already enforces it in the groups SELECT policy
--   (20260914133905). One place decides who may see a group.
--
-- p_limit NULL means unbounded, which is how discover_counts calls it.

create or replace function public.discover_list(
  p_kind text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_miles double precision default 25,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  subtitle text,
  distance_miles double precision,
  meta jsonb
)
language sql
stable
set search_path to 'public'
as $function$
  with me as (
    select
      coalesce(p_lat, pr.latitude::double precision)  as lat,
      coalesce(p_lng, pr.longitude::double precision) as lng,
      greatest(0, least(coalesce(p_radius_miles, 25), 500)) as r,
      auth.uid() as uid
    from (select 1) one
    left join public.profiles pr on pr.id = auth.uid()
  ),
  rows as (
    -- CLUBS: places you can book a court.
    select pv.venue_id as id,
           pv.venue_name as title,
           nullif(pv.city, '') as subtitle,
           public.haversine_miles(me.lat, me.lng, pv.latitude, pv.longitude) as distance_miles,
           jsonb_build_object(
             'courts', nullif(greatest(coalesce(pv.number_of_courts,0),
                        coalesce(pv.indoor_courts,0)+coalesce(pv.outdoor_courts,0)+coalesce(pv.covered_courts,0)), 0),
             'booking_url', nullif(pv.booking_url,''),
             'ppa_bookable', pv.ppa_bookable,
             'coaching', coalesce(pv.coaching_available,false)
           ) as meta
      from public.padel_venues pv, me
     where p_kind = 'venues'
       and pv.status = 'active' and pv.merged_into is null
       and pv.venue_type = 'club'
       and pv.latitude is not null and me.lat is not null
       and public.haversine_miles(me.lat, me.lng, pv.latitude, pv.longitude) <= me.r

    union all
    -- COACHING: a club that offers lessons, or a coach.
    select pv.venue_id, pv.venue_name, nullif(pv.city,''),
           public.haversine_miles(me.lat, me.lng, pv.latitude, pv.longitude),
           jsonb_build_object('venue_type', pv.venue_type,
                              'booking_url', nullif(pv.booking_url,''))
      from public.padel_venues pv, me
     where p_kind = 'coaching'
       and pv.status = 'active' and pv.merged_into is null
       and coalesce(pv.coaching_available, false)
       and pv.latitude is not null and me.lat is not null
       and public.haversine_miles(me.lat, me.lng, pv.latitude, pv.longitude) <= me.r

    union all
    -- PLAYERS: geocoded profiles near you, excluding yourself.
    select p.id, p.name, nullif(p.city,''),
           public.haversine_miles(me.lat, me.lng, p.latitude::double precision, p.longitude::double precision),
           jsonb_build_object('avatar_url', p.avatar_url, 'rating', p.internal_ranking)
      from public.profiles p, me
     where p_kind = 'players'
       and p.latitude is not null and me.lat is not null
       and p.id is distinct from me.uid
       and public.haversine_miles(me.lat, me.lng, p.latitude::double precision, p.longitude::double precision) <= me.r

    union all
    -- GROUPS: every group you can SEE, near you. RLS (can_see_group) already
    -- decides visibility; whether you can JOIN is the page's business.
    select g.id, g.name, nullif(g.city,''),
           public.haversine_miles(me.lat, me.lng, g.latitude, g.longitude),
           jsonb_build_object(
             'visibility', g.visibility,
             'join_mode', g.join_mode,
             'member_count', (select count(*) from public.group_members gm
                               where gm.group_id = g.id and gm.status = 'approved'),
             'my_status', (select gm.status from public.group_members gm
                            where gm.group_id = g.id and gm.user_id = me.uid)
           )
      from public.groups g, me
     where p_kind = 'groups'
       and g.latitude is not null and me.lat is not null
       and public.haversine_miles(me.lat, me.lng, g.latitude, g.longitude) <= me.r

    union all
    -- LEAGUES: open to entry, near you.
    select l.id, l.name, coalesce(l.format, l.match_type),
           public.haversine_miles(me.lat, me.lng,
             coalesce(l.latitude, pv.latitude)::double precision,
             coalesce(l.longitude, pv.longitude)::double precision),
           jsonb_build_object('entry_fee_pence', nullif(l.entry_fee_pence,0),
                              'currency', l.currency, 'status', l.status)
      from public.leagues l
      left join public.padel_venues pv on pv.venue_id = l.padel_venue_id, me
     where p_kind = 'leagues'
       and l.visibility = 'open'
       and coalesce(l.is_open_registration, false) = true
       and l.status in ('active','upcoming','open')
       and me.lat is not null
       and coalesce(l.latitude, pv.latitude) is not null
       and public.haversine_miles(me.lat, me.lng,
             coalesce(l.latitude, pv.latitude)::double precision,
             coalesce(l.longitude, pv.longitude)::double precision) <= me.r

    union all
    -- EVENTS: public or connections-only, published, still to come.
    select e.id, e.title, coalesce(pv.venue_name, e.location),
           public.haversine_miles(me.lat, me.lng,
             coalesce(e.latitude, pv.latitude)::double precision,
             coalesce(e.longitude, pv.longitude)::double precision),
           jsonb_build_object('start_time', e.start_time,
                              'entry_fee_pence', nullif(e.entry_fee_pence,0),
                              'currency', e.currency,
                              'external_link', nullif(e.external_link,''))
      from public.events e
      left join public.padel_venues pv on pv.venue_id = e.padel_venue_id, me
     where p_kind = 'events'
       and e.visibility in ('public','connections')
       and e.status = 'published'
       and e.start_time >= now()
       and me.lat is not null
       and coalesce(e.latitude, pv.latitude) is not null
       and public.haversine_miles(me.lat, me.lng,
             coalesce(e.latitude, pv.latitude)::double precision,
             coalesce(e.longitude, pv.longitude)::double precision) <= me.r
  )
  select id, title, subtitle, distance_miles, meta
    from rows
   order by distance_miles asc nulls last, title
   offset greatest(coalesce(p_offset, 0), 0)
   limit case when p_limit is null then null else greatest(p_limit, 1) end
$function$;

grant execute on function public.discover_list(text, double precision, double precision, double precision, integer, integer)
  to authenticated;

-- The counts are now the lists, counted. There is no second predicate to drift.
create or replace function public.discover_counts(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_miles double precision default 25
)
returns table (
  venues integer,
  players integer,
  coaching integer,
  groups integer,
  leagues integer,
  events integer,
  open_games integer,
  radius_miles double precision,
  lat double precision,
  lng double precision
)
language sql
stable
set search_path to 'public'
as $function$
  with me as (
    select
      coalesce(p_lat, pr.latitude::double precision)  as lat,
      coalesce(p_lng, pr.longitude::double precision) as lng,
      greatest(0, least(coalesce(p_radius_miles, 25), 500)) as r
    from (select 1) one
    left join public.profiles pr on pr.id = auth.uid()
  )
  select
    (select count(*)::integer from public.discover_list('venues',   p_lat, p_lng, p_radius_miles, null, 0)),
    (select count(*)::integer from public.discover_list('players',  p_lat, p_lng, p_radius_miles, null, 0)),
    (select count(*)::integer from public.discover_list('coaching', p_lat, p_lng, p_radius_miles, null, 0)),
    (select count(*)::integer from public.discover_list('groups',   p_lat, p_lng, p_radius_miles, null, 0)),
    (select count(*)::integer from public.discover_list('leagues',  p_lat, p_lng, p_radius_miles, null, 0)),
    (select count(*)::integer from public.discover_list('events',   p_lat, p_lng, p_radius_miles, null, 0)),
    -- open_games has no tile and no page; it drives the hero's empty state only.
    (select count(*)::integer
       from public.matches m
       join public.padel_venues pv on pv.venue_id = m.padel_venue_id, me
      where m.is_open = true
        and m.status not in ('cancelled','completed')
        and m.match_date is not null
        and (m.match_date + coalesce(m.match_time, m.window_start, time '00:00')) >= now() at time zone 'UTC'
        and me.lat is not null
        and public.haversine_miles(me.lat, me.lng, pv.latitude, pv.longitude) <= me.r),
    (select r from me), (select lat from me), (select lng from me)
$function$;

grant execute on function public.discover_counts(double precision, double precision, double precision)
  to authenticated;