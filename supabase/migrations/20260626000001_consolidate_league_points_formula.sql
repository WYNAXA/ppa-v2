-- Consolidate league points formula into single source of truth: league_points_for_result()
-- Live scorers (apply_league_match_standings, rebuild_league_standings) now call the helper
-- instead of hardcoding +3/+1. Drops two dead, uncalled functions that carried stale copies.
-- Canonical rule lives ONLY in league_points_for_result: win=3, draw=1, loss=0.

DROP FUNCTION IF EXISTS public.update_league_standings_win(uuid, uuid[], uuid[]);
DROP FUNCTION IF EXISTS public.update_league_standings_draw(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.league_points_for_result(p_result text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE p_result
    WHEN 'win'  THEN 3
    WHEN 'draw' THEN 1
    WHEN 'loss' THEN 0
    ELSE NULL
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_league_match_standings(p_match_result_id uuid, p_league_id uuid, p_sets jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  SELECT league_standings_processed INTO v_already_processed
  FROM match_results WHERE id = p_match_result_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'match_result not found');
  END IF;
  IF v_already_processed THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_processed');
  END IF;

  FOR v_set IN SELECT * FROM jsonb_array_elements(p_sets)
  LOOP
    v_is_draw := (v_set->>'is_draw')::boolean;

    FOR v_elo_update IN SELECT * FROM jsonb_array_elements(v_set->'season_elo_updates')
    LOOP
      v_uid := (v_elo_update->>'user_id')::uuid;
      v_new_elo := (v_elo_update->>'new_season_elo')::int;
      UPDATE league_standings SET season_elo = v_new_elo
      WHERE league_id = p_league_id AND user_id = v_uid;
    END LOOP;

    SELECT ARRAY(SELECT (elem #>> '{}')::uuid FROM jsonb_array_elements(v_set->'winners') AS elem) INTO v_winners;
    SELECT ARRAY(SELECT (elem #>> '{}')::uuid FROM jsonb_array_elements(v_set->'losers') AS elem) INTO v_losers;

    IF v_is_draw THEN
      v_all_players := v_winners || v_losers;
      UPDATE league_standings
      SET draws = draws + 1, matches_played = matches_played + 1, ranking_points = ranking_points + league_points_for_result('draw')
      WHERE league_id = p_league_id AND user_id = ANY(v_all_players);
    ELSE
      UPDATE league_standings
      SET wins = wins + 1, matches_played = matches_played + 1, ranking_points = ranking_points + league_points_for_result('win')
      WHERE league_id = p_league_id AND user_id = ANY(v_winners);
      UPDATE league_standings
      SET losses = losses + 1, matches_played = matches_played + 1
      WHERE league_id = p_league_id AND user_id = ANY(v_losers);
    END IF;

    v_sets_applied := v_sets_applied + 1;
  END LOOP;

  UPDATE match_results SET league_standings_processed = true WHERE id = p_match_result_id;
  RETURN jsonb_build_object('applied_sets', v_sets_applied);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rebuild_league_standings(p_league_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mr record; v_set jsonb; v_g1 int; v_g2 int; v_total int;
  v_max_g int; v_min_g int; v_completed boolean; v_is_void boolean; v_is_draw boolean;
  v_t1_players uuid[]; v_t2_players uuid[]; v_winners uuid[]; v_losers uuid[];
  v_sets_count int; v_sets_applied int := 0; v_matches_processed int := 0;
BEGIN
  UPDATE league_standings
  SET wins=0, losses=0, draws=0, matches_played=0, ranking_points=0
  WHERE league_id = p_league_id;

  FOR v_mr IN
    SELECT mr.id, mr.team1_players, mr.team2_players, mr.sets_data
    FROM match_results mr JOIN matches m ON m.id = mr.match_id
    WHERE m.league_id = p_league_id AND mr.verification_status = 'verified'
    ORDER BY COALESCE(mr.verified_at, mr.created_at) ASC, mr.id ASC
  LOOP
    v_t1_players := v_mr.team1_players;
    v_t2_players := v_mr.team2_players;
    IF v_mr.sets_data IS NULL OR jsonb_typeof(v_mr.sets_data::jsonb) <> 'array' THEN
      v_matches_processed := v_matches_processed + 1; CONTINUE;
    END IF;
    v_sets_count := jsonb_array_length(v_mr.sets_data::jsonb);
    FOR i IN 0 .. v_sets_count - 1 LOOP
      v_set := v_mr.sets_data::jsonb -> i;
      v_g1 := COALESCE((v_set->>'team1')::int, (v_set->>'team1_score')::int, 0);
      v_g2 := COALESCE((v_set->>'team2')::int, (v_set->>'team2_score')::int, 0);
      v_total := v_g1 + v_g2; v_max_g := GREATEST(v_g1, v_g2); v_min_g := LEAST(v_g1, v_g2);
      v_completed := (v_max_g >= 6 AND ABS(v_g1 - v_g2) >= 2) OR (v_max_g = 7 AND v_min_g = 6);
      v_is_void := NOT v_completed AND v_total < 6;
      IF v_is_void THEN CONTINUE; END IF;
      IF v_completed THEN
        v_is_draw := false;
        IF v_g1 > v_g2 THEN v_winners := v_t1_players; v_losers := v_t2_players;
        ELSE v_winners := v_t2_players; v_losers := v_t1_players; END IF;
      ELSE
        IF v_g1 = v_g2 THEN v_is_draw := true;
        ELSE v_is_draw := false;
          IF v_g1 > v_g2 THEN v_winners := v_t1_players; v_losers := v_t2_players;
          ELSE v_winners := v_t2_players; v_losers := v_t1_players; END IF;
        END IF;
      END IF;
      IF v_is_draw THEN
        UPDATE league_standings SET draws=draws+1, matches_played=matches_played+1, ranking_points=ranking_points+league_points_for_result('draw')
        WHERE league_id = p_league_id AND user_id = ANY(v_t1_players || v_t2_players);
      ELSE
        UPDATE league_standings SET wins=wins+1, matches_played=matches_played+1, ranking_points=ranking_points+league_points_for_result('win')
        WHERE league_id = p_league_id AND user_id = ANY(v_winners);
        UPDATE league_standings SET losses=losses+1, matches_played=matches_played+1
        WHERE league_id = p_league_id AND user_id = ANY(v_losers);
      END IF;
      v_sets_applied := v_sets_applied + 1;
    END LOOP;
    v_matches_processed := v_matches_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('league_id', p_league_id, 'matches_processed', v_matches_processed, 'sets_applied', v_sets_applied);
END;
$function$
;
