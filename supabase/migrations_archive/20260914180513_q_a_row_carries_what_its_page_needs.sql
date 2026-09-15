-- A row carries what its page needs.
--
-- ROOT CAUSE THIS FIXES
--   The tile pages read meta keys that discover_list never emitted, so the
--   controls that depend on them were dead on arrival:
--
--     VenuesPage.tsx:112   row.meta.booking_platform   -> always null, so every
--                          external-booking button read "Visit website" instead
--                          of the platform name the locale already supports
--                          (courts.books_via).
--     AllGroupsPage.tsx:128 the "Welcomes ringers" filter chip had nothing in
--                          the payload to filter on, and was wired to state
--                          that nothing read.
--
--   The group join sheet also needs auto_approve to decide between "Join" and
--   "Request to join", and allow_ringers to offer the ringer path at all.
--
-- FIX CLASS: root-cause. The payload is the contract between the RPC and the
--   page; the page was reading a contract that did not exist. Widening the
--   payload is the fix. The alternative -- deleting the reads -- would delete
--   working features (platform names, the ringer path) to match a too-narrow
--   contract, which is (c) a display patch.
--
-- BLAST RADIUS
--   Only the jsonb_build_object payloads change. Every WHERE clause, the row
--   set, the ordering and the signature are byte-identical to
--   20260914134222_p_an_event_at_a_venue_is_an_event. discover_counts is
--   defined as count(*) of discover_list per kind, so the counts cannot move.
--   Verified after applying.
--
-- DELIBERATELY NOT ADDED: padel_venues.photos. Those URLs embed the Google
--   Places API key. They must not travel to a client.

CREATE OR REPLACE FUNCTION public.discover_list(p_kind text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_miles double precision DEFAULT 25, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, subtitle text, distance_miles double precision, meta jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
    select pv.venue_id as id, pv.venue_name as title, nullif(pv.city,'') as subtitle,
           public.haversine_miles(me.lat, me.lng, pv.latitude, pv.longitude) as distance_miles,
           jsonb_build_object(
             'courts', nullif(greatest(coalesce(pv.number_of_courts,0),
                        coalesce(pv.indoor_courts,0)+coalesce(pv.outdoor_courts,0)+coalesce(pv.covered_courts,0)), 0),
             'booking_url', nullif(pv.booking_url,''),
             'booking_platform', nullif(pv.booking_platform,''),
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
    select pv.venue_id, pv.venue_name, nullif(pv.city,''),
           public.haversine_miles(me.lat, me.lng, pv.latitude, pv.longitude),
           jsonb_build_object('venue_type', pv.venue_type,
                              'booking_url', nullif(pv.booking_url,''),
                              'booking_platform', nullif(pv.booking_platform,''))
      from public.padel_venues pv, me
     where p_kind = 'coaching'
       and pv.status = 'active' and pv.merged_into is null
       and coalesce(pv.coaching_available, false)
       and pv.latitude is not null and me.lat is not null
       and public.haversine_miles(me.lat, me.lng, pv.latitude, pv.longitude) <= me.r

    union all
    select p.id, p.name, nullif(p.city,''),
           public.haversine_miles(me.lat, me.lng, p.latitude::double precision, p.longitude::double precision),
           jsonb_build_object('avatar_url', p.avatar_url, 'rating', p.internal_ranking)
      from public.profiles p, me
     where p_kind = 'players'
       and p.latitude is not null and me.lat is not null
       and p.id is distinct from me.uid
       and public.haversine_miles(me.lat, me.lng, p.latitude::double precision, p.longitude::double precision) <= me.r

    union all
    select g.id, g.name, nullif(g.city,''),
           public.haversine_miles(me.lat, me.lng, g.latitude, g.longitude),
           jsonb_build_object(
             'visibility', g.visibility, 'join_mode', g.join_mode,
             'allow_ringers', coalesce(g.allow_ringers, false),
             'auto_approve', coalesce(g.auto_approve, false),
             'banner_url', nullif(g.banner_url,''),
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
    -- EVENTS, kind 1: group events and public events.
    select e.id, e.title, coalesce(pv.venue_name, e.location),
           public.haversine_miles(me.lat, me.lng,
             coalesce(e.latitude, pv.latitude)::double precision,
             coalesce(e.longitude, pv.longitude)::double precision),
           jsonb_build_object('source', 'event', 'route', '/discover/events/' || e.id::text,
                              'start_time', e.start_time,
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

    union all
    -- EVENTS, kind 2: sessions a venue runs. The id is the OCCURRENCE id,
    -- because /play/events/:occurrenceId routes on that.
    select occ.id, ve.name, v.name,
           public.haversine_miles(me.lat, me.lng, v.latitude::double precision, v.longitude::double precision),
           jsonb_build_object('source', 'venue_event',
                              'route', '/play/events/' || occ.id::text,
                              'start_time', occ.starts_at,
                              'entry_fee_pence', ve.price_per_player,
                              'spots_left', case when ve.capacity is null then null
                                   else greatest(0, ve.capacity - coalesce(occ.spots_taken,0)) end,
                              'padel_venue_id', pv.venue_id)
      from public.venue_event_occurrences occ
      join public.venue_events ve on ve.id = occ.event_id
      join public.venues v        on v.id  = ve.venue_id
      left join public.padel_venues pv on pv.venues_id = v.id, me
     where p_kind = 'events'
       and coalesce(occ.status,'scheduled') <> 'cancelled'
       and occ.starts_at >= now()
       and me.lat is not null
       and v.latitude is not null
       and public.haversine_miles(me.lat, me.lng, v.latitude::double precision, v.longitude::double precision) <= me.r
  )
  select id, title, subtitle, distance_miles, meta
    from rows
   order by distance_miles asc nulls last, title
   offset greatest(coalesce(p_offset, 0), 0)
   limit case when p_limit is null then null else greatest(p_limit, 1) end
$function$;
