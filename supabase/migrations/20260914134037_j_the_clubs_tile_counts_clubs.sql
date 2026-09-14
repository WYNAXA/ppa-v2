-- The Clubs tile counts clubs.
--
-- ROOT CAUSE — a defect in discover_counts (20260914132948), found by running
-- my own rejection criterion against my own work: "a count and the page behind
-- it must agree".
--
--   The `venues` field counted every active padel_venues row within the
--   radius, regardless of venue_type. Within 25 miles of the UAT account:
--
--     venue_type='club'    14   Bristol Padel Club, Rocket, Surge, The Padel
--                               Team, Padel4all, Filton, Future Padel, ...
--     venue_type='coach'    1   PadelwithPeter Coaching
--                          ---
--                           15
--
--   So the tile read "Clubs 15" and the page behind it would list 14 clubs
--   and a coaching business — which is also already counted, correctly, by
--   the Coaching tile. One row, two tiles, and a number that disagrees with
--   its own page.
--
-- FIX CLASS: root-cause. Filtering the coach row out in the client after the
--   RPC returned 15 is the display patch, and it would put the definition of
--   "club" back in the client, which is the thing this RPC exists to stop.
--
-- THE DEFINITION, narrowed by one clause
--   venues   = places you can book a court   -> venue_type = 'club'
--   coaching = places you can be coached     -> coaching_available, which
--              includes venue_type='coach' since 20260914132312 made that
--              flag true for every coach row. A club that offers lessons is
--              correctly in both; a coach who has no courts is correctly in
--              only one.
--
-- BLAST RADIUS
--   discover_counts has not shipped to any client yet — it was applied today
--   and the Discover v3 build has not been written. So this changes one live
--   number from 15 to 14 and nothing else. venues_near(), which the venue
--   directory page uses, already takes a p_venue_type argument and is
--   untouched.

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
      greatest(0, least(coalesce(p_radius_miles, 25), 500))  as r,
      auth.uid() as uid
    from (select 1) one
    left join public.profiles pr on pr.id = auth.uid()
  )
  select
    -- Places you can book a court. NOT coaches, who have their own tile.
    (select count(*)::integer from public.padel_venues pv, me
      where pv.status = 'active' and pv.merged_into is null
        and pv.venue_type = 'club'
        and pv.latitude is not null
        and me.lat is not null
        and public.haversine_miles(me.lat, me.lng, pv.latitude, pv.longitude) <= me.r),

    (select count(*)::integer from public.profiles p, me
      where p.latitude is not null
        and me.lat is not null
        and p.id is distinct from me.uid
        and public.haversine_miles(me.lat, me.lng, p.latitude, p.longitude) <= me.r),

    -- Places you can be coached: a club that offers lessons, or a coach.
    (select count(*)::integer from public.padel_venues pv, me
      where pv.status = 'active' and pv.merged_into is null
        and coalesce(pv.coaching_available, false)
        and pv.latitude is not null
        and me.lat is not null
        and public.haversine_miles(me.lat, me.lng, pv.latitude, pv.longitude) <= me.r),

    (select count(*)::integer from public.groups g, me
      where g.visibility in ('public', 'open')
        and coalesce(g.join_mode, 'request') <> 'closed'
        and coalesce(g.allow_join_requests, false)
        and g.latitude is not null
        and me.lat is not null
        and public.haversine_miles(me.lat, me.lng, g.latitude, g.longitude) <= me.r
        and not exists (
          select 1 from public.group_members gm
           where gm.group_id = g.id and gm.user_id = me.uid
             and gm.status in ('approved', 'ringer')
        )),

    (select count(*)::integer
       from public.leagues l
       left join public.padel_venues pv on pv.venue_id = l.padel_venue_id, me
      where l.visibility = 'open'
        and coalesce(l.is_open_registration, false) = true
        and l.status in ('active', 'upcoming', 'open')
        and me.lat is not null
        and coalesce(l.latitude, pv.latitude) is not null
        and public.haversine_miles(me.lat, me.lng,
              coalesce(l.latitude, pv.latitude)::double precision,
              coalesce(l.longitude, pv.longitude)::double precision) <= me.r),

    (select count(*)::integer
       from public.events e
       left join public.padel_venues pv on pv.venue_id = e.padel_venue_id, me
      where e.visibility in ('public', 'connections')
        and e.status = 'published'
        and e.start_time >= now()
        and me.lat is not null
        and coalesce(e.latitude, pv.latitude) is not null
        and public.haversine_miles(me.lat, me.lng,
              coalesce(e.latitude, pv.latitude)::double precision,
              coalesce(e.longitude, pv.longitude)::double precision) <= me.r),

    (select count(*)::integer
       from public.matches m
       join public.padel_venues pv on pv.venue_id = m.padel_venue_id, me
      where m.is_open = true
        and m.status not in ('cancelled', 'completed')
        and m.match_date is not null
        and (m.match_date + coalesce(m.match_time, m.window_start, time '00:00')) >= now() at time zone 'UTC'
        and me.lat is not null
        and public.haversine_miles(me.lat, me.lng, pv.latitude, pv.longitude) <= me.r),

    (select r from me), (select lat from me), (select lng from me)
$function$;

grant execute on function public.discover_counts(double precision, double precision, double precision)
  to authenticated;
