-- ══════════════════════════════════════════════════════════════════════════════
-- Atomic league standings application for one match result.
-- Replaces the per-player/per-set non-atomic write loop in process-elo
-- Branch A (season ELO + W/L/D/pts) with a single transactional RPC.
--
-- Run in the Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════════════════════

-- Add league-specific processing flag (separate from career elo_processed)
ALTER TABLE match_results
  ADD COLUMN IF NOT EXISTS league_standings_processed boolean NOT NULL DEFAULT false;



CREATE OR REPLACE FUNCTION public.apply_league_match_standings(
  p_match_result_id uuid,
  p_league_id       uuid,
  p_sets            jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_already_processed boolean;
  v_set               jsonb;
  v_elo_update        jsonb;
  v_uid               uuid;
  v_new_elo           int;
  v_winners           uuid[];
  v_losers            uuid[];
  v_all_players       uuid[];
  v_is_draw           boolean;
  v_sets_applied      int := 0;
BEGIN
  -- ── Idempotency gate ──
  SELECT league_standings_processed INTO v_already_processed
  FROM match_results
  WHERE id = p_match_result_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'match_result not found');
  END IF;

  IF v_already_processed THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_processed');
  END IF;

  -- ── Process each set (void sets already excluded by caller) ──
  FOR v_set IN SELECT * FROM jsonb_array_elements(p_sets)
  LOOP
    v_is_draw := (v_set->>'is_draw')::boolean;

    -- Apply season_elo updates for each player in this set
    FOR v_elo_update IN SELECT * FROM jsonb_array_elements(v_set->'season_elo_updates')
    LOOP
      v_uid     := (v_elo_update->>'user_id')::uuid;
      v_new_elo := (v_elo_update->>'new_season_elo')::int;

      UPDATE league_standings
      SET season_elo = v_new_elo
      WHERE league_id = p_league_id AND user_id = v_uid;
    END LOOP;

    -- Apply W/L/D standings increments
    IF v_is_draw THEN
      -- Draw: all players in winners+losers arrays (they're the same for draws)
      SELECT ARRAY(
        SELECT (elem #>> '{}')::uuid
        FROM jsonb_array_elements(v_set->'winners') AS elem
      ) INTO v_winners;
      SELECT ARRAY(
        SELECT (elem #>> '{}')::uuid
        FROM jsonb_array_elements(v_set->'losers') AS elem
      ) INTO v_losers;
      v_all_players := v_winners || v_losers;

      UPDATE league_standings
      SET draws = draws + 1,
          matches_played = matches_played + 1,
          ranking_points = ranking_points + 1
      WHERE league_id = p_league_id
        AND user_id = ANY(v_all_players);
    ELSE
      -- Win/loss
      SELECT ARRAY(
        SELECT (elem #>> '{}')::uuid
        FROM jsonb_array_elements(v_set->'winners') AS elem
      ) INTO v_winners;
      SELECT ARRAY(
        SELECT (elem #>> '{}')::uuid
        FROM jsonb_array_elements(v_set->'losers') AS elem
      ) INTO v_losers;

      UPDATE league_standings
      SET wins = wins + 1,
          matches_played = matches_played + 1,
          ranking_points = ranking_points + 3
      WHERE league_id = p_league_id
        AND user_id = ANY(v_winners);

      UPDATE league_standings
      SET losses = losses + 1,
          matches_played = matches_played + 1
      WHERE league_id = p_league_id
        AND user_id = ANY(v_losers);
    END IF;

    v_sets_applied := v_sets_applied + 1;
  END LOOP;

  -- ── Mark as processed (same transaction) ──
  UPDATE match_results
  SET league_standings_processed = true
  WHERE id = p_match_result_id;

  RETURN jsonb_build_object('applied_sets', v_sets_applied);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_league_match_standings(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_league_match_standings(uuid, uuid, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
