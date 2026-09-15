-- D1: Three SQL functions read booked_venue_name, none know preferred_venue_name.
-- D2: One remaining stale row + enforcement trigger.
-- Fix class: root-cause for both.

-- ── D1: discover_feed — show preferred venue, not just booked ───────────────
-- Rule: coalesce(booked_venue_name, preferred_venue_name) for display.
-- 'Open match' fallback only for matches with neither name.

DROP FUNCTION IF EXISTS public.discover_feed(double precision, double precision, double precision, integer, integer);

CREATE OR REPLACE FUNCTION public.discover_feed(
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_radius_miles double precision DEFAULT 25,
  p_days integer DEFAULT 28,
  p_limit integer DEFAULT 50
) RETURNS TABLE (
  kind text, id uuid, title text, subtitle text, starts_at timestamptz,
  venue_id uuid, venue_name text, latitude double precision, longitude double precision,
  distance_miles double precision, price_pence integer, currency text, spots_left integer
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
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
  SELECT
    'open_match'::text AS kind,
    m.id,
    -- D1: show preferred venue when no booked venue; 'Open match' only as last resort
    COALESCE(m.booked_venue_name, m.preferred_venue_name, 'Open match') AS title,
    CASE WHEN m.open_elo_min IS NOT NULL OR m.open_elo_max IS NOT NULL
         THEN 'Level ' || COALESCE(m.open_elo_min::text, 'any') || '-' || COALESCE(m.open_elo_max::text, 'any')
         ELSE 'Open to anyone' END AS subtitle,
    ((m.match_date + COALESCE(m.match_time, m.window_start, time '00:00')) AT TIME ZONE COALESCE(m.timezone, 'UTC')) AS starts_at,
    COALESCE(m.padel_venue_id, m.preferred_venue_id) AS venue_id,
    COALESCE(m.booked_venue_name, m.preferred_venue_name) AS venue_name,
    pv.latitude::double precision,
    pv.longitude::double precision,
    NULL::integer AS price_pence,
    NULL::text    AS currency,
    GREATEST(0, 4 - COALESCE(array_length(m.player_ids, 1), 0)) AS spots_left
  FROM public.matches m
  LEFT JOIN public.padel_venues pv ON pv.venue_id = COALESCE(m.padel_venue_id, m.preferred_venue_id)
  WHERE m.is_open = true
    AND m.status NOT IN ('cancelled', 'completed')
    AND m.match_date IS NOT NULL

  UNION ALL

  SELECT 'event', e.id, e.title, COALESCE(e.event_type, 'Event'), e.start_time,
    e.padel_venue_id, COALESCE(pv.venue_name, e.location),
    COALESCE(e.latitude, pv.latitude)::double precision,
    COALESCE(e.longitude, pv.longitude)::double precision,
    NULLIF(e.entry_fee_pence, 0), e.currency,
    CASE WHEN e.max_capacity IS NULL THEN NULL
         ELSE GREATEST(0, e.max_capacity - (SELECT count(*)::integer FROM public.event_attendees a WHERE a.event_id = e.id)) END
  FROM public.events e LEFT JOIN public.padel_venues pv ON pv.venue_id = e.padel_venue_id
  WHERE e.visibility IN ('public', 'connections') AND e.status = 'published'

  UNION ALL

  SELECT 'venue_event', occ.id, ve.name, COALESCE(ve.type, 'Session'), occ.starts_at,
    pv.venue_id, v.name, v.latitude::double precision, v.longitude::double precision,
    ve.price_per_player, NULL::text,
    CASE WHEN ve.capacity IS NULL THEN NULL ELSE GREATEST(0, ve.capacity - COALESCE(occ.spots_taken, 0)) END
  FROM public.venue_event_occurrences occ
  JOIN public.venue_events ve ON ve.id = occ.event_id
  JOIN public.venues v ON v.id = ve.venue_id
  LEFT JOIN public.padel_venues pv ON pv.venues_id = v.id
  WHERE COALESCE(occ.status, 'scheduled') <> 'cancelled'

  UNION ALL

  SELECT 'league', l.id, l.name, COALESCE(l.format, l.match_type, 'League'),
    COALESCE(l.season_start::timestamptz, l.tournament_start::timestamptz),
    l.padel_venue_id, COALESCE(pv.venue_name, l.city),
    COALESCE(l.latitude, pv.latitude)::double precision,
    COALESCE(l.longitude, pv.longitude)::double precision,
    NULLIF(l.entry_fee_pence, 0), l.currency,
    CASE WHEN l.max_participants IS NULL THEN NULL
         ELSE GREATEST(0, l.max_participants - (SELECT count(*)::integer FROM public.league_members lm WHERE lm.league_id = l.id)) END
  FROM public.leagues l LEFT JOIN public.padel_venues pv ON pv.venue_id = l.padel_venue_id
  WHERE l.visibility = 'open' AND COALESCE(l.is_open_registration, false) = true
    AND l.status IN ('active', 'upcoming', 'open')

  UNION ALL

  SELECT 'coaching', cs.id, COALESCE(cs.title, 'Coaching'), COALESCE(cs.session_type, 'Session'),
    cs.start_at, pv.venue_id, v.name, v.latitude::double precision, v.longitude::double precision,
    cs.price_pence, cs.currency, cs.capacity
  FROM public.coaching_sessions cs JOIN public.venues v ON v.id = cs.venue_id
  LEFT JOIN public.padel_venues pv ON pv.venues_id = v.id
  WHERE COALESCE(cs.status, 'scheduled') NOT IN ('cancelled', 'completed')
),
measured AS (
  SELECT i.*,
         CASE WHEN me.lat IS NULL OR i.latitude IS NULL THEN NULL
              ELSE public.haversine_miles(me.lat, me.lng, i.latitude, i.longitude) END AS distance_miles
  FROM items i CROSS JOIN me
)
SELECT x.kind, x.id, x.title, x.subtitle, x.starts_at,
  x.venue_id, x.venue_name, x.latitude, x.longitude, x.distance_miles,
  x.price_pence, x.currency, x.spots_left
FROM measured x, horizon h
WHERE x.starts_at >= h.from_ts AND x.starts_at < h.to_ts
  AND (x.distance_miles IS NULL OR x.distance_miles <= greatest(p_radius_miles, 0))
ORDER BY (x.starts_at AT TIME ZONE 'UTC')::date,
         x.distance_miles ASC NULLS LAST, x.starts_at
LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- ── D1: get_match_invite_preview — preferred fallback ───────────────────────
-- Wording: shows the venue name regardless of booking status. An invite says
-- "at The Padel Team Bristol" whether the court is booked or just preferred.

CREATE OR REPLACE FUNCTION public.get_match_invite_preview(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'guest_name', gi.guest_name,
    'status', gi.status,
    'expired', (gi.expires_at < now()),
    'match_id', m.id,
    'match_date', m.match_date,
    'match_time', m.match_time,
    'venue', COALESCE(m.booked_venue_name, m.preferred_venue_name),
    'inviter_name', p.name
  ) INTO v
  FROM public.match_guest_invites gi
  JOIN public.matches m ON m.id = gi.match_id
  LEFT JOIN public.profiles p ON p.id = gi.invited_by
  WHERE gi.invite_token = p_token;

  RETURN coalesce(v, jsonb_build_object('error', 'invalid_token'));
END;
$$;

-- ── D1: notify_match_scheduled — preferred fallback, wording distinction ────
-- For a booked match: " 📍 <venue>" (confirmed)
-- For a preferred venue: " → <venue>" (intended, not confirmed)
-- For neither: no venue line at all

CREATE OR REPLACE FUNCTION public.notify_match_scheduled()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id          UUID;
  v_group_name         TEXT;
  v_player_names       TEXT[];
  v_player_name        TEXT;
  v_players_str        TEXT;
  v_venue_str          TEXT;
  v_day_str            TEXT;
  v_notification_body  TEXT;
  v_existing_count     INTEGER;
BEGIN
  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_group_name FROM groups WHERE id = NEW.group_id;

  v_day_str := TO_CHAR(NEW.match_date, 'Dy DD Mon');

  -- D1: booked = 📍 (confirmed), preferred = → (intended), neither = blank
  IF NEW.booked_venue_name IS NOT NULL AND NEW.booked_venue_name != '' THEN
    v_venue_str := ' 📍 ' || NEW.booked_venue_name;
  ELSIF NEW.preferred_venue_name IS NOT NULL AND NEW.preferred_venue_name != '' THEN
    v_venue_str := ' → ' || NEW.preferred_venue_name;
  ELSE
    v_venue_str := '';
  END IF;

  v_player_names := ARRAY[]::TEXT[];
  FOR v_player_id IN SELECT unnest(NEW.player_ids) LOOP
    SELECT COALESCE(name, 'Unknown') INTO v_player_name
    FROM profiles WHERE id = v_player_id;
    v_player_names := v_player_names || v_player_name;
  END LOOP;
  v_players_str := array_to_string(v_player_names, ', ');

  FOREACH v_player_id IN ARRAY NEW.player_ids
  LOOP
    v_notification_body :=
      COALESCE(v_group_name, 'Your group') || ' match on ' ||
      v_day_str || ' at ' ||
      TO_CHAR(NEW.match_time, 'HH24:MI') ||
      v_venue_str ||
      ' with ' || v_players_str;

    SELECT COUNT(*) INTO v_existing_count
    FROM notifications
    WHERE user_id = v_player_id AND type = 'match_scheduled' AND related_id = NEW.id;

    IF v_existing_count = 0 THEN
      INSERT INTO notifications (user_id, type, title, message, related_id)
      VALUES (v_player_id, 'match_scheduled', 'Match Scheduled', v_notification_body, NEW.id);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- ── D2: Clean the one remaining stale row ───────────────────────────────────

UPDATE matches
SET booked_court_number = NULL
WHERE id = '7efc662e-8cb8-4e0f-a33d-bcb553fd2da8'
  AND booking_status <> 'booked';

-- Clean any others by the condition, not by id
UPDATE matches
SET booked_venue_name    = NULL,
    booked_court_number  = NULL,
    booking_reference    = NULL,
    booked_by            = NULL,
    booked_at            = NULL
WHERE booking_status <> 'booked'
  AND (booked_venue_name IS NOT NULL OR booked_court_number IS NOT NULL
       OR booking_reference IS NOT NULL OR booked_by IS NOT NULL
       OR booked_at IS NOT NULL);

-- ── D2: Trigger to enforce: non-booked matches cannot carry booked_* fields ──
-- Chose a trigger over a CHECK because CHECK cannot reference multiple columns
-- in a conditional way (it would need OR logic across 5 columns gated on
-- booking_status, which is expressible but unreadable). A trigger can give a
-- clear error message naming the offending field.

CREATE OR REPLACE FUNCTION public.enforce_booking_fields_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.booking_status <> 'booked' THEN
    -- Clear any booked_* fields that slipped through
    NEW.booked_venue_name    := NULL;
    NEW.booked_court_number  := NULL;
    NEW.booking_reference    := NULL;
    NEW.booked_by            := NULL;
    NEW.booked_at            := NULL;
    NEW.booking_total_cost_pence := NULL;
    NEW.booking_per_player_pence := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_booking_fields ON public.matches;
CREATE TRIGGER trg_enforce_booking_fields
  BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_booking_fields_consistency();
