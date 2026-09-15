-- discover_counts — the six numbers on the Discover tab, in one round trip.
--
-- WHY
--   Discover shows six counts and a hero. Today that is six separate client
--   queries whose definitions live in six places in Discover.tsx, which is how
--   the same tile came back wrong in three consecutive UATs with three
--   different meanings. The definition of "near you" belongs in one place, and
--   this is it.
--
-- SECURITY INVOKER, deliberately (no SECURITY DEFINER clause = invoker).
--   RLS still decides what the caller may count. The same choice discover_feed
--   makes, for the same reason: an RPC must not restate permission rules, or
--   it becomes a second place for them to drift. A private group is excluded
--   from `groups` below by the joinable predicate AND by RLS; either alone
--   would be enough.
--
-- THE DEFINITIONS, fixed here so they cannot drift again
--   venues     active, unmerged directory rows within the radius
--   players    geocoded profiles within the radius, excluding the caller
--   coaching   active rows within the radius where you can be coached
--   groups     JOINABLE and geocoded within the radius — a count that sends
--              you to a door you cannot open is worse than a zero
--   leagues    same predicate as discover_feed's league branch
--   events     same predicate as discover_feed's event branch, still to come
--   open_games open matches still to come — the hero's empty state reads this
--
--   open_games is returned even though there is no tile for it: the hero's
--   "0 open games near you / Be the one who posts" state is decided by this
--   number, and it must not be a seventh query or a hardcoded string.
--
-- JOINABLE, stated once
--   visibility in ('public','open') AND join_mode is not 'closed' AND
--   allow_join_requests. As of today that is TRUE for exactly one group in the
--   database — "India group", in Surat — so the Groups tile reads 0 in
--   Bristol. That is the honest number and it is the product problem, not a
--   display problem.
--
-- The radius is clamped to 0..500 and defaults to 25. Coordinates fall back to
-- the caller's profile, as discover_feed does, so the client may call it with
-- no arguments at all.

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
    (select count(*)::integer from public.padel_venues pv, me
      where pv.status = 'active' and pv.merged_into is null
        and pv.latitude is not null
        and me.lat is not null
        and public.haversine_miles(me.lat, me.lng, pv.latitude, pv.longitude) <= me.r),

    (select count(*)::integer from public.profiles p, me
      where p.latitude is not null
        and me.lat is not null
        and p.id is distinct from me.uid
        and public.haversine_miles(me.lat, me.lng, p.latitude, p.longitude) <= me.r),

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
