-- discover_feed() — one read path for the Discover tab.
--
-- WHAT IT IS
--   Five sources, one ranked list of joinable things near the caller:
--     open_match   a game you can join
--     event        a public event (this is where Padelfest lives)
--     venue_event  a venue's own session or tournament
--     league       a league taking entries
--     coaching     a bookable coaching slot
--
--   Before this, the Community tab queried tables directly and each source had
--   its own shape, its own visibility rule and its own idea of where a thing
--   is. Nothing could be ranked against anything else.
--
-- SECURITY INVOKER, deliberately
--   The function does NOT restate who may see what. RLS on matches already
--   encodes open_audience (open / connections / groups) across five policies;
--   RLS on events encodes the public/pending split; RLS on venue_events and
--   venue_event_occurrences encodes open_to_join + visibility='public'. A
--   SECURITY DEFINER function would have had to duplicate all of that, and the
--   copy would drift. Verified: a non-admin player calling this sees a
--   published public event and does NOT see a pending one.
--
-- LOCATION
--   Every source resolves to one point, per the contract in 20260913124419:
--   a padel_venues row, or the item's own latitude/longitude. Distance uses
--   public.haversine_miles(), the same function venues_near() uses — the
--   maths is not reimplemented here.
--
--   The caller may pass a point; otherwise the viewer's profile point is used.
--   If neither exists the radius filter is skipped rather than returning an
--   empty feed, because a feed that silently shows nothing is worse than one
--   that is merely unsorted.
--
-- ORDER
--   Soonest day first, nearest within the day. That is explainable in one
--   sentence and needs no weighting constant anyone has to defend later. A
--   single ORDER BY distance would bury tomorrow's game behind a nearer one
--   next month; a single ORDER BY time would put a 40-mile trip above a
--   court down the road.
--
-- KNOWN MODELLING GAP, not introduced here
--   matches.match_date is a date and matches.match_time is `time without time
--   zone` — a naive wall clock. This reads it as UTC, which is what every
--   existing reader already does implicitly. In British Summer Time that is
--   an hour out. Fixing it means changing how matches store time, which is a
--   change of its own and is not smuggled in here.
--
-- WHAT IT RETURNS TODAY — measured, not assumed
--   Called as a real non-admin player, 25 miles around Bristol: ZERO rows.
--   Not a bug in this function. There is no supply:
--     open matches   4 exist, all status='completed', all from May
--     public events  0
--     venue events   7 exist, ALL owned by the seed venue
--                    11111111-1111-1111-1111-111111111111, named "test",
--                    "test 3", "RLS Test"; the only ones with future
--                    occurrences have open_to_join=false and so are
--                    correctly invisible to players
--     open leagues   0 (all 3 leagues are visibility='group')
--     coaching       0 rows in coaching_sessions
--
--   Proven working by inserting one real row: a published public event at
--   Bristol coordinates appears for an unrelated player at 0.0 miles, and a
--   pending one beside it does not.

CREATE OR REPLACE FUNCTION public.discover_feed(
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_radius_miles double precision DEFAULT 25,
  p_days integer DEFAULT 28,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  kind           text,
  id             uuid,
  title          text,
  subtitle       text,
  starts_at      timestamptz,
  venue_id       uuid,
  venue_name     text,
  latitude       double precision,
  longitude      double precision,
  distance_miles double precision,
  price_pence    integer,
  currency       text,
  spots_left     integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
WITH me AS (
  SELECT
    COALESCE(p_lat, pr.latitude::double precision)  AS lat,
    COALESCE(p_lng, pr.longitude::double precision) AS lng
  FROM (SELECT 1) one
  LEFT JOIN public.profiles pr ON pr.id = auth.uid()
),
horizon AS (
  SELECT now() AS from_ts,
         now() + make_interval(days => greatest(1, least(coalesce(p_days, 28), 365))) AS to_ts
),
items AS (
  -- 1. A GAME YOU CAN JOIN. RLS on matches already encodes open_audience
  --    (open / connections / groups), so this does not restate it.
  SELECT
    'open_match'::text AS kind,
    m.id,
    COALESCE(m.booked_venue_name, 'Open match') AS title,
    CASE WHEN m.open_elo_min IS NOT NULL OR m.open_elo_max IS NOT NULL
         THEN 'Level ' || COALESCE(m.open_elo_min::text, 'any') || '-' || COALESCE(m.open_elo_max::text, 'any')
         ELSE 'Open to anyone' END AS subtitle,
    -- match_date + match_time is a naive wall clock with no zone. Read as UTC,
    -- which is what every existing reader already does implicitly.
    ((m.match_date + COALESCE(m.match_time, m.window_start, time '00:00')) AT TIME ZONE 'UTC') AS starts_at,
    m.padel_venue_id AS venue_id,
    m.booked_venue_name AS venue_name,
    pv.latitude::double precision,
    pv.longitude::double precision,
    NULL::integer AS price_pence,
    NULL::text    AS currency,
    GREATEST(0, 4 - COALESCE(array_length(m.player_ids, 1), 0)) AS spots_left
  FROM public.matches m
  LEFT JOIN public.padel_venues pv ON pv.venue_id = m.padel_venue_id
  WHERE m.is_open = true
    AND m.status NOT IN ('cancelled', 'completed')
    AND m.match_date IS NOT NULL

  UNION ALL

  -- 2. A PUBLIC EVENT. Padelfest lives here. RLS restricts this to
  --    group_id IS NULL AND status = 'published'.
  SELECT
    'event',
    e.id,
    e.title,
    COALESCE(e.event_type, 'Event'),
    e.start_time,
    e.padel_venue_id,
    COALESCE(pv.venue_name, e.location),
    COALESCE(e.latitude, pv.latitude)::double precision,
    COALESCE(e.longitude, pv.longitude)::double precision,
    NULLIF(e.entry_fee_pence, 0),
    e.currency,
    CASE WHEN e.max_capacity IS NULL THEN NULL
         ELSE GREATEST(0, e.max_capacity
              - (SELECT count(*)::integer FROM public.event_attendees a WHERE a.event_id = e.id)) END
  FROM public.events e
  LEFT JOIN public.padel_venues pv ON pv.venue_id = e.padel_venue_id
  WHERE e.group_id IS NULL
    AND e.status = 'published'

  UNION ALL

  -- 3. A VENUE'S OWN SESSION - the only publicly discoverable event type
  --    before today, and previously reachable only by deep link.
  SELECT
    'venue_event',
    occ.id,
    ve.name,
    COALESCE(ve.type, 'Session'),
    occ.starts_at,
    pv.venue_id,
    v.name,
    v.latitude::double precision,
    v.longitude::double precision,
    ve.price_per_player,
    NULL::text,
    CASE WHEN ve.capacity IS NULL THEN NULL
         ELSE GREATEST(0, ve.capacity - COALESCE(occ.spots_taken, 0)) END
  FROM public.venue_event_occurrences occ
  JOIN public.venue_events ve ON ve.id = occ.event_id
  JOIN public.venues v        ON v.id = ve.venue_id
  LEFT JOIN public.padel_venues pv ON pv.venues_id = v.id
  WHERE COALESCE(occ.status, 'scheduled') <> 'cancelled'

  UNION ALL

  -- 4. A LEAGUE TAKING ENTRIES. RLS restricts this to visibility='open',
  --    leagues you created, and leagues you are already in; the filter below
  --    keeps only the ones a stranger can actually join.
  SELECT
    'league',
    l.id,
    l.name,
    COALESCE(l.format, l.match_type, 'League'),
    COALESCE(l.season_start::timestamptz, l.tournament_start::timestamptz),
    l.padel_venue_id,
    COALESCE(pv.venue_name, l.city),
    COALESCE(l.latitude, pv.latitude)::double precision,
    COALESCE(l.longitude, pv.longitude)::double precision,
    NULLIF(l.entry_fee_pence, 0),
    l.currency,
    CASE WHEN l.max_participants IS NULL THEN NULL
         ELSE GREATEST(0, l.max_participants
              - (SELECT count(*)::integer FROM public.league_members lm WHERE lm.league_id = l.id)) END
  FROM public.leagues l
  LEFT JOIN public.padel_venues pv ON pv.venue_id = l.padel_venue_id
  WHERE l.visibility = 'open'
    AND COALESCE(l.is_open_registration, false) = true
    AND l.status IN ('active', 'upcoming', 'open')

  UNION ALL

  -- 5. A COACHING SLOT. Zero rows today - a supply problem, not a code one.
  SELECT
    'coaching',
    cs.id,
    COALESCE(cs.title, 'Coaching'),
    COALESCE(cs.session_type, 'Session'),
    cs.start_at,
    pv.venue_id,
    v.name,
    v.latitude::double precision,
    v.longitude::double precision,
    cs.price_pence,
    cs.currency,
    cs.capacity
  FROM public.coaching_sessions cs
  JOIN public.venues v ON v.id = cs.venue_id
  LEFT JOIN public.padel_venues pv ON pv.venues_id = v.id
  WHERE COALESCE(cs.status, 'scheduled') NOT IN ('cancelled', 'completed')
),
measured AS (
  SELECT i.*,
         CASE WHEN me.lat IS NULL OR i.latitude IS NULL THEN NULL
              ELSE public.haversine_miles(me.lat, me.lng, i.latitude, i.longitude) END AS distance_miles
  FROM items i CROSS JOIN me
)
SELECT
  x.kind, x.id, x.title, x.subtitle, x.starts_at,
  x.venue_id, x.venue_name, x.latitude, x.longitude, x.distance_miles,
  x.price_pence, x.currency, x.spots_left
FROM measured x, horizon h
WHERE x.starts_at >= h.from_ts
  AND x.starts_at <  h.to_ts
  -- No radius filter when neither the caller nor the profile has a location:
  -- a feed that silently returns nothing is worse than an unsorted one.
  AND (x.distance_miles IS NULL OR x.distance_miles <= greatest(p_radius_miles, 0))
-- Soonest day first, nearest within the day. Explainable in one sentence,
-- and it needs no weighting constant anyone has to defend later.
ORDER BY (x.starts_at AT TIME ZONE 'UTC')::date,
         x.distance_miles ASC NULLS LAST,
         x.starts_at
LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
$function$;

REVOKE ALL ON FUNCTION public.discover_feed(double precision, double precision, double precision, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discover_feed(double precision, double precision, double precision, integer, integer) TO authenticated;
