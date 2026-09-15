CREATE OR REPLACE FUNCTION public.switch_teams(
  p_match_id uuid,
  p_team1 uuid[],
  p_team2 uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match record;
  v_is_admin boolean := false;
  v_combined uuid[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF NOT (v_user_id = ANY(COALESCE(v_match.player_ids, ARRAY[]::uuid[]))) THEN
    IF v_match.group_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = v_match.group_id
          AND user_id = v_user_id
          AND role = 'admin'
      ) INTO v_is_admin;
    END IF;
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'You do not have permission to switch teams on this match';
    END IF;
  END IF;

  IF array_length(p_team1, 1) <> 2 OR array_length(p_team2, 1) <> 2 THEN
    RAISE EXCEPTION 'Each team must have exactly 2 players';
  END IF;

  v_combined := p_team1 || p_team2;
  IF array_length(v_combined, 1) <> 4 THEN
    RAISE EXCEPTION 'Teams combined must have 4 players';
  END IF;

  IF NOT (
    p_team1[1] = ANY(v_match.player_ids)
    AND p_team1[2] = ANY(v_match.player_ids)
    AND p_team2[1] = ANY(v_match.player_ids)
    AND p_team2[2] = ANY(v_match.player_ids)
  ) THEN
    RAISE EXCEPTION 'All team members must be players in the match';
  END IF;

  IF p_team1[1] = ANY(p_team2) OR p_team1[2] = ANY(p_team2) THEN
    RAISE EXCEPTION 'A player cannot appear on both teams';
  END IF;

  UPDATE matches SET
    team1_player_ids = p_team1,
    team2_player_ids = p_team2,
    updated_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_teams(uuid, uuid[], uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
