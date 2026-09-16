-- N9: Drop p_user_id from open_matches_for. Use auth.uid() internally.
-- Every other RPC in this codebase derives the caller internally.
-- A wrong p_user_id would reintroduce N7a (offered own game).
--
-- Applied in Supabase SQL Editor on 2026-09-16.

CREATE OR REPLACE FUNCTION open_matches_for(
  p_date date,
  p_from time,
  p_to time,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_radius_miles double precision DEFAULT 25
)
RETURNS TABLE (
  match_id uuid,
  match_time time,
  venue_name text,
  spots_left integer,
  distance_miles double precision,
  reason text
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  WITH me AS (
    SELECT auth.uid() AS uid
  ),
  candidates AS (
    SELECT m.id, m.match_time, m.player_ids, m.group_id,
           COALESCE(m.booked_venue_name, m.preferred_venue_name) AS venue_display,
           COALESCE(m.padel_venue_id, m.preferred_venue_id) AS venue_ref
    FROM matches m, me
    WHERE me.uid IS NOT NULL
      AND m.is_open = true
      AND m.match_date = p_date
      AND m.status NOT IN ('cancelled', 'completed')
      AND (p_from IS NULL OR m.match_time >= p_from)
      AND (p_to IS NULL OR m.match_time < p_to)
      AND NOT (me.uid = ANY(COALESCE(m.player_ids, ARRAY[]::uuid[])))
  ),
  with_venue AS (
    SELECT c.*,
           pv.venue_name AS pv_name,
           pv.latitude AS pv_lat,
           pv.longitude AS pv_lng,
           CASE WHEN pv.latitude IS NOT NULL AND p_lat IS NOT NULL
                THEN haversine_miles(p_lat, p_lng, pv.latitude, pv.longitude)
                ELSE NULL END AS dist
    FROM candidates c
    LEFT JOIN padel_venues pv ON pv.venue_id = c.venue_ref
  ),
  with_group AS (
    SELECT wv.*,
           g.name AS group_name,
           EXISTS (
             SELECT 1 FROM group_members gm, me
             WHERE gm.group_id = wv.group_id
               AND gm.user_id = me.uid
               AND gm.status IN ('approved', 'ringer')
           ) AS in_my_group
    FROM with_venue wv
    LEFT JOIN groups g ON g.id = wv.group_id
  )
  SELECT
    wg.id AS match_id,
    wg.match_time,
    COALESCE(wg.venue_display, wg.pv_name) AS venue_name,
    GREATEST(0, 4 - COALESCE(array_length(wg.player_ids, 1), 0))::integer AS spots_left,
    wg.dist AS distance_miles,
    CASE
      WHEN wg.dist IS NOT NULL AND wg.dist <= p_radius_miles
        THEN 'at ' || COALESCE(wg.venue_display, wg.pv_name, 'venue') || ', ' || ROUND(wg.dist::numeric, 1) || ' mi'
      WHEN wg.in_my_group
        THEN COALESCE(wg.group_name, 'Your group')
      ELSE NULL
    END AS reason
  FROM with_group wg
  WHERE (wg.dist IS NOT NULL AND wg.dist <= p_radius_miles)
     OR wg.in_my_group
  ORDER BY wg.dist ASC NULLS LAST, wg.match_time;
$$;

-- Drop the old 7-arg signature that took p_user_id
DROP FUNCTION IF EXISTS open_matches_for(uuid, date, time, time, double precision, double precision, double precision);
