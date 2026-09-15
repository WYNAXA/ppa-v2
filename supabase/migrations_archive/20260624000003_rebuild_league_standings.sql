-- ══════════════════════════════════════════════════════════════════════════════
-- Deterministic league standings rebuild from verified match_results.
-- MIRROR of classifySet() in supabase/functions/_shared/elo.ts (SQL, can't import TS).
-- Canonical thresholds: completed = (max>=6 AND |diff|>=2) OR (max==7 AND min==6)
--                       void = NOT completed AND total < 6
-- Keep in sync with the TS canonical. See classifySet source-of-truth comment.
--
-- Per-set logic:
--   - Void set → skip entirely
--   - Completed set: winner = team with more games → +1W +3pts
--   - Unfinished set with equal games: draw → +1D +1pt each
--   - Unfinished set with unequal games: W/L by game count
--   - Everyone in a non-void set: +1 matches_played
--
-- Also serves as calculate_league_standings (alias).
-- Run in the Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rebuild_league_standings(p_league_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mr          record;
  v_set         jsonb;
  v_g1          int;
  v_g2          int;
  v_total       int;
  v_max_g       int;
  v_min_g       int;
  v_completed   boolean;
  v_is_void     boolean;
  v_is_draw     boolean;
  v_t1_players  uuid[];
  v_t2_players  uuid[];
  v_winners     uuid[];
  v_losers      uuid[];
  v_sets_count  int;
  v_sets_applied int := 0;
  v_matches_processed int := 0;
BEGIN
  -- Reset this league's standings to zero (preserves the rows + season_elo)
  UPDATE league_standings
  SET wins = 0, losses = 0, draws = 0,
      matches_played = 0, ranking_points = 0
  WHERE league_id = p_league_id;

  -- Iterate every verified match_result for this league
  FOR v_mr IN
    SELECT mr.id, mr.team1_players, mr.team2_players, mr.sets_data
    FROM match_results mr
    JOIN matches m ON m.id = mr.match_id
    WHERE m.league_id = p_league_id
      AND mr.verification_status = 'verified'
    ORDER BY COALESCE(mr.verified_at, mr.created_at) ASC, mr.id ASC
  LOOP
    v_t1_players := v_mr.team1_players;
    v_t2_players := v_mr.team2_players;

    -- Skip if sets_data is null or not an array
    IF v_mr.sets_data IS NULL OR jsonb_typeof(v_mr.sets_data::jsonb) <> 'array' THEN
      v_matches_processed := v_matches_processed + 1;
      CONTINUE;
    END IF;

    v_sets_count := jsonb_array_length(v_mr.sets_data::jsonb);

    -- Iterate each set in the match
    FOR i IN 0 .. v_sets_count - 1 LOOP
      v_set := v_mr.sets_data::jsonb -> i;

      v_g1 := COALESCE((v_set->>'team1')::int, (v_set->>'team1_score')::int, 0);
      v_g2 := COALESCE((v_set->>'team2')::int, (v_set->>'team2_score')::int, 0);
      v_total := v_g1 + v_g2;
      v_max_g := GREATEST(v_g1, v_g2);
      v_min_g := LEAST(v_g1, v_g2);

      -- Completed: one side reached 6+ with 2-game lead, or 7-6
      v_completed := (v_max_g >= 6 AND ABS(v_g1 - v_g2) >= 2)
                  OR (v_max_g = 7 AND v_min_g = 6);

      -- Void: not completed AND total games < 6 → skip entirely
      v_is_void := NOT v_completed AND v_total < 6;
      IF v_is_void THEN CONTINUE; END IF;

      -- Determine outcome
      IF v_completed THEN
        -- Completed set: winner has more games
        v_is_draw := false;
        IF v_g1 > v_g2 THEN
          v_winners := v_t1_players;
          v_losers  := v_t2_players;
        ELSE
          v_winners := v_t2_players;
          v_losers  := v_t1_players;
        END IF;
      ELSE
        -- Unfinished but ≥6 total games
        IF v_g1 = v_g2 THEN
          v_is_draw := true;
        ELSE
          v_is_draw := false;
          IF v_g1 > v_g2 THEN
            v_winners := v_t1_players;
            v_losers  := v_t2_players;
          ELSE
            v_winners := v_t2_players;
            v_losers  := v_t1_players;
          END IF;
        END IF;
      END IF;

      -- Apply to standings
      IF v_is_draw THEN
        UPDATE league_standings
        SET draws = draws + 1,
            matches_played = matches_played + 1,
            ranking_points = ranking_points + 1
        WHERE league_id = p_league_id
          AND user_id = ANY(v_t1_players || v_t2_players);
      ELSE
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

    v_matches_processed := v_matches_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'league_id', p_league_id,
    'matches_processed', v_matches_processed,
    'sets_applied', v_sets_applied
  );
END;
$$;

-- Alias so calculate_league_standings resolves
CREATE OR REPLACE FUNCTION public.calculate_league_standings(p_league_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT rebuild_league_standings(p_league_id);
$$;

GRANT EXECUTE ON FUNCTION public.rebuild_league_standings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_league_standings(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
