-- Haversine distance function (miles)
CREATE OR REPLACE FUNCTION public.haversine_miles(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $$
  SELECT 3959 * 2 * asin(
    sqrt(
      pow(sin(radians((lat2 - lat1) / 2)), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      pow(sin(radians((lng2 - lng1) / 2)), 2)
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.haversine_miles(double precision, double precision, double precision, double precision) TO authenticated;

-- Geo-scoped audience count for open matches
CREATE OR REPLACE FUNCTION public.count_open_match_audience(
  p_lat double precision,
  p_lng double precision,
  p_elo_min integer,
  p_elo_max integer,
  p_exclude_player_ids uuid[],
  p_radius_miles double precision DEFAULT 10
)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM profiles p
  WHERE p.internal_ranking BETWEEN p_elo_min AND p_elo_max
    AND p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    AND NOT (p.id = ANY(p_exclude_player_ids))
    AND haversine_miles(p_lat, p_lng, p.latitude, p.longitude) <= p_radius_miles;
$$;

GRANT EXECUTE ON FUNCTION public.count_open_match_audience(double precision, double precision, integer, integer, uuid[], double precision) TO authenticated;

-- Update ELO range on an already-open match
CREATE OR REPLACE FUNCTION public.update_open_match_range(
  p_match_id uuid,
  p_elo_min integer,
  p_elo_max integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match record;
  v_is_player boolean := false;
  v_is_admin boolean := false;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF NOT v_match.is_open THEN RAISE EXCEPTION 'Match is not open'; END IF;
  v_is_player := v_user_id = ANY(COALESCE(v_match.player_ids, ARRAY[]::uuid[]));
  IF NOT v_is_player AND v_match.group_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = v_match.group_id AND user_id = v_user_id AND role = 'admin'
    ) INTO v_is_admin;
  END IF;
  IF NOT v_is_player AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only match players or group admins can update range';
  END IF;
  IF p_elo_min < 600 OR p_elo_max > 2500 OR p_elo_min >= p_elo_max THEN
    RAISE EXCEPTION 'Invalid ELO range';
  END IF;
  UPDATE matches
  SET open_elo_min = p_elo_min, open_elo_max = p_elo_max, updated_at = now()
  WHERE id = p_match_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_open_match_range(uuid, integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
