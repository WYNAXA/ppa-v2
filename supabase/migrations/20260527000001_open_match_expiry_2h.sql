-- ── Fix 1: Reduce push-to-open expiry window from 24h → 2h ─────────────────
-- Previously users couldn't push same-day matches because the 24-hour cutoff
-- made the window expire before the match was even created.

CREATE OR REPLACE FUNCTION public.push_match_to_open(
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
  v_expiry timestamptz;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  IF array_length(v_match.player_ids, 1) >= 4 THEN
    RAISE EXCEPTION 'Match is already full';
  END IF;

  v_is_player := v_user_id = ANY(COALESCE(v_match.player_ids, ARRAY[]::uuid[]));
  IF NOT v_is_player AND v_match.group_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = v_match.group_id AND user_id = v_user_id AND role = 'admin'
    ) INTO v_is_admin;
  END IF;

  IF NOT v_is_player AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only match players or group admins can open a match';
  END IF;

  v_expiry := (v_match.match_date::timestamp + COALESCE(v_match.match_time, '00:00')::time) - INTERVAL '2 hours';
  IF v_expiry <= now() THEN
    RAISE EXCEPTION 'Too late to open this match';
  END IF;

  IF p_elo_min < 600 OR p_elo_max > 2500 OR p_elo_min >= p_elo_max THEN
    RAISE EXCEPTION 'Invalid ELO range';
  END IF;

  UPDATE matches
  SET is_open = true, open_elo_min = p_elo_min, open_elo_max = p_elo_max,
      opened_by = v_user_id, opened_at = now(), updated_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── Fix 2: RLS — let any authenticated user see open matches ────────────────
-- The existing 2 SELECT policies only cover group members and match players.
-- Open matches (is_open = true) were invisible to everyone else.

DROP POLICY IF EXISTS "Anyone can view open matches" ON matches;

CREATE POLICY "Anyone can view open matches"
ON matches FOR SELECT TO authenticated
USING (is_open = true);

NOTIFY pgrst, 'reload schema';
