-- Consolidate void/completion set-classification rule into single SQL source of truth.
-- classify_set_sql(g1,g2) returns (is_completed, is_void, winner) encoding the canonical rule:
--   completed = (max>=6 AND |diff|>=2) OR (max=7 AND min=6); void = NOT completed AND total<6.
-- rebuild_league_standings and award_weekly_jerseys now call it instead of inlining the rule.
-- Validated against all 378 live sets (0 disagreements) and via standings-hash equivalence.
-- NOTE: TS mirror classifySet() in supabase/functions/_shared/elo.ts cannot import this (Deno vs
-- Postgres). The two definitions must stay in sync; a cross-runtime drift test guards them.

CREATE OR REPLACE FUNCTION public.classify_set_sql(p_g1 integer, p_g2 integer)
 RETURNS TABLE(is_completed boolean, is_void boolean, winner integer)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT
    comp,
    (NOT comp) AND (p_g1 + p_g2) < 6,
    CASE WHEN p_g1 > p_g2 THEN 1 WHEN p_g2 > p_g1 THEN 2 ELSE 0 END
  FROM (
    SELECT (GREATEST(p_g1, p_g2) >= 6 AND ABS(p_g1 - p_g2) >= 2)
        OR (GREATEST(p_g1, p_g2) = 7 AND LEAST(p_g1, p_g2) = 6) AS comp
  ) c;
$function$
;

CREATE OR REPLACE FUNCTION public.rebuild_league_standings(p_league_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mr record; v_set jsonb; v_g1 int; v_g2 int;
  v_completed boolean; v_is_void boolean; v_is_draw boolean;
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

      SELECT c.is_completed, c.is_void INTO v_completed, v_is_void
      FROM classify_set_sql(v_g1, v_g2) c;

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

CREATE OR REPLACE FUNCTION public.award_weekly_jerseys()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_league         record;
  v_yellow_uid     uuid;
  v_black_uid      uuid;
  v_green_uid1     uuid;
  v_green_uid2     uuid;
  v_green_gap      int;
  v_green_reason   text;
  v_red_uid        uuid;
  v_red_gain       int;
  v_week_start     date := (date_trunc('week', CURRENT_DATE) - INTERVAL '7 days')::date;
  v_week_end       date := (date_trunc('week', CURRENT_DATE))::date;
  -- Prior holders (for notifications)
  v_prev_yellow    uuid;
  v_prev_black     uuid;
  v_prev_green     uuid[];
  v_prev_red       uuid;
  v_lost_uid       uuid;
BEGIN
  FOR v_league IN SELECT id FROM leagues WHERE status = 'active' LOOP

    -- Reset per-league state
    v_yellow_uid := NULL; v_black_uid := NULL;
    v_green_uid1 := NULL; v_green_uid2 := NULL; v_green_gap := NULL;
    v_red_uid := NULL; v_red_gain := NULL;

    -- ── Capture prior holders BEFORE delete ──
    SELECT user_id INTO v_prev_yellow
    FROM league_jerseys
    WHERE league_id = v_league.id AND jersey_type = 'yellow'
    LIMIT 1;

    SELECT user_id INTO v_prev_black
    FROM league_jerseys
    WHERE league_id = v_league.id AND jersey_type = 'black'
    LIMIT 1;

    SELECT ARRAY(
      SELECT user_id FROM league_jerseys
      WHERE league_id = v_league.id AND jersey_type = 'green'
    ) INTO v_prev_green;

    SELECT user_id INTO v_prev_red
    FROM league_jerseys
    WHERE league_id = v_league.id AND jersey_type = 'red'
    LIMIT 1;

    -- ── Delete current jerseys for types this function manages ──
    -- Does NOT touch 'blue'/'entertainer' (managed by award_entertainer_jersey)
    DELETE FROM league_jerseys
    WHERE league_id = v_league.id
      AND jersey_type IN ('yellow', 'black', 'green', 'red');


    -- ══════════════════════════════════════════════════════════════════════════
    -- YELLOW: league leader (5-rung tiebreak, underdog wins on perfect tie)
    -- ══════════════════════════════════════════════════════════════════════════

    -- Compute per-player game diff for this league
    -- Dual-key: legacy sets use {team1_score, team2_score}, newer use {team1, team2}
    DROP TABLE IF EXISTS tmp_game_diff;
    CREATE TEMP TABLE tmp_game_diff AS
      SELECT
        pid AS user_id,
        SUM(CASE WHEN mr.team1_players @> ARRAY[pid]
                 THEN COALESCE((s.val->>'team1')::int, (s.val->>'team1_score')::int, 0)
                 ELSE COALESCE((s.val->>'team2')::int, (s.val->>'team2_score')::int, 0) END) AS games_won,
        SUM(CASE WHEN mr.team1_players @> ARRAY[pid]
                 THEN COALESCE((s.val->>'team2')::int, (s.val->>'team2_score')::int, 0)
                 ELSE COALESCE((s.val->>'team1')::int, (s.val->>'team1_score')::int, 0) END) AS games_lost
      FROM match_results mr
      JOIN matches m ON m.id = mr.match_id AND m.league_id = v_league.id
      CROSS JOIN LATERAL jsonb_array_elements(mr.sets_data) AS s(val)
      CROSS JOIN LATERAL unnest(mr.team1_players || mr.team2_players) AS pid
      WHERE mr.verification_status = 'verified'
      GROUP BY pid;

    SELECT ls.user_id INTO v_yellow_uid
    FROM league_standings ls
    JOIN profiles p ON p.id = ls.user_id
    LEFT JOIN tmp_game_diff gd ON gd.user_id = ls.user_id
    WHERE ls.league_id = v_league.id AND ls.matches_played > 0
    ORDER BY ls.ranking_points DESC, ls.wins DESC, ls.losses ASC,
             (COALESCE(gd.games_won,0)-COALESCE(gd.games_lost,0)) DESC,
             p.internal_ranking ASC
    LIMIT 1;

    IF v_yellow_uid IS NOT NULL THEN
      INSERT INTO league_jerseys (league_id, user_id, jersey_color, jersey_type, awarded_week, reason)
      VALUES (v_league.id, v_yellow_uid, 'yellow', 'yellow', CURRENT_DATE, 'League leader');
    END IF;


    -- ══════════════════════════════════════════════════════════════════════════
    -- BLACK: wooden spoon (5-rung tiebreak, higher ELO gets spoon on tie)
    -- ══════════════════════════════════════════════════════════════════════════

    SELECT ls.user_id INTO v_black_uid
    FROM league_standings ls
    JOIN profiles p ON p.id = ls.user_id
    LEFT JOIN tmp_game_diff gd ON gd.user_id = ls.user_id
    WHERE ls.league_id = v_league.id AND ls.matches_played > 0
    ORDER BY ls.ranking_points ASC, ls.wins ASC, ls.losses DESC,
             (COALESCE(gd.games_won,0)-COALESCE(gd.games_lost,0)) ASC,
             p.internal_ranking DESC
    LIMIT 1;

    IF v_black_uid IS NOT NULL THEN
      INSERT INTO league_jerseys (league_id, user_id, jersey_color, jersey_type, awarded_week, reason)
      VALUES (v_league.id, v_black_uid, 'black', 'black', CURRENT_DATE, 'Bottom of standings');
    END IF;


    -- ══════════════════════════════════════════════════════════════════════════
    -- GREEN: Underdog — biggest career-ELO upset this week, per set.
    -- Both players on the winning team get the jersey.
    -- ══════════════════════════════════════════════════════════════════════════

    -- Find the set with the biggest qualifying ELO gap (>=150) this week.
    -- Uses rating_history.rating_before for match-time career ELO.
    -- MIRROR of classifySet void/win rule (SQL, can't import TS):
    --   completed = (max>=6 AND |diff|>=2) OR (max==7 AND min==6)
    --   void = NOT completed AND total<6 → skip
    --   draws don't qualify (no winner)

    DROP TABLE IF EXISTS tmp_green_candidates;
    CREATE TEMP TABLE tmp_green_candidates AS
    WITH sets_expanded AS (
      SELECT
        mr.id AS match_result_id,
        mr.team1_players,
        mr.team2_players,
        mr.verified_at,
        -- Dual-key: legacy sets use team1_score/team2_score, newer use team1/team2
        COALESCE((s.val->>'team1')::int, (s.val->>'team1_score')::int, 0) AS g1,
        COALESCE((s.val->>'team2')::int, (s.val->>'team2_score')::int, 0) AS g2,
        s.ordinality AS set_num
      FROM match_results mr
      JOIN matches m ON m.id = mr.match_id AND m.league_id = v_league.id
      CROSS JOIN LATERAL jsonb_array_elements(mr.sets_data) WITH ORDINALITY AS s(val, ordinality)
      WHERE mr.verification_status = 'verified'
        AND NOT COALESCE(mr.is_friendly, false)
        AND COALESCE(mr.verified_at, mr.created_at) >= v_week_start
        AND COALESCE(mr.verified_at, mr.created_at) < v_week_end
    ),
    classified_sets AS (
      SELECT
        se.*,
        c.is_completed,
        c.is_void,
        -- winner determination
        CASE
          WHEN se.g1 > se.g2 THEN 'team1'
          WHEN se.g2 > se.g1 THEN 'team2'
          ELSE NULL  -- draw: no winner, doesn't qualify
        END AS winning_team
      FROM sets_expanded se
      CROSS JOIN LATERAL classify_set_sql(se.g1, se.g2) c
    ),
    qualifying_sets AS (
      SELECT
        cs.match_result_id,
        cs.team1_players,
        cs.team2_players,
        cs.verified_at,
        cs.winning_team,
        cs.set_num,
        -- Get combined match-time career ELO for each team
        (SELECT COALESCE(SUM(rh.rating_before), 0)
         FROM rating_history rh
         WHERE rh.match_result_id = cs.match_result_id
           AND rh.user_id = ANY(cs.team1_players)) AS team1_combined_elo,
        (SELECT COALESCE(SUM(rh.rating_before), 0)
         FROM rating_history rh
         WHERE rh.match_result_id = cs.match_result_id
           AND rh.user_id = ANY(cs.team2_players)) AS team2_combined_elo
      FROM classified_sets cs
      WHERE NOT cs.is_void           -- skip void sets
        AND cs.winning_team IS NOT NULL  -- skip draws
    )
    SELECT
      qs.match_result_id,
      qs.verified_at,
      qs.winning_team,
      qs.team1_players,
      qs.team2_players,
      CASE qs.winning_team
        WHEN 'team1' THEN qs.team2_combined_elo - qs.team1_combined_elo
        WHEN 'team2' THEN qs.team1_combined_elo - qs.team2_combined_elo
      END AS elo_gap
    FROM qualifying_sets qs
    WHERE CASE qs.winning_team
            WHEN 'team1' THEN qs.team2_combined_elo - qs.team1_combined_elo
            WHEN 'team2' THEN qs.team1_combined_elo - qs.team2_combined_elo
          END >= 150;

    -- Pick the biggest gap; tiebreak: most recent, then match_result_id
    SELECT
      CASE winning_team
        WHEN 'team1' THEN team1_players[1]
        WHEN 'team2' THEN team2_players[1]
      END,
      CASE winning_team
        WHEN 'team1' THEN team1_players[2]
        WHEN 'team2' THEN team2_players[2]
      END,
      elo_gap
    INTO v_green_uid1, v_green_uid2, v_green_gap
    FROM tmp_green_candidates
    ORDER BY elo_gap DESC, verified_at DESC, match_result_id DESC
    LIMIT 1;

    IF v_green_uid1 IS NOT NULL THEN
      v_green_reason := 'Underdog — ' || v_green_gap || ' ELO gap upset';

      INSERT INTO league_jerseys (league_id, user_id, jersey_color, jersey_type, awarded_week, reason)
      VALUES (v_league.id, v_green_uid1, 'green', 'green', CURRENT_DATE, v_green_reason);

      -- Second player (may be NULL for 1v1, though unlikely in padel)
      IF v_green_uid2 IS NOT NULL THEN
        INSERT INTO league_jerseys (league_id, user_id, jersey_color, jersey_type, awarded_week, reason)
        VALUES (v_league.id, v_green_uid2, 'green', 'green', CURRENT_DATE, v_green_reason);
      END IF;
    END IF;


    -- ══════════════════════════════════════════════════════════════════════════
    -- RED: Most Improved — biggest SUM(rating_change) in this league this week.
    -- Single holder. Must be positive. Nobody if no one gained.
    -- ══════════════════════════════════════════════════════════════════════════

    SELECT rh.user_id, SUM(rh.rating_change) AS total_gain
    INTO v_red_uid, v_red_gain
    FROM rating_history rh
    JOIN match_results mr ON mr.id = rh.match_result_id
    JOIN matches m ON m.id = mr.match_id AND m.league_id = v_league.id
    WHERE mr.verification_status = 'verified'
      AND NOT COALESCE(mr.is_friendly, false)
      AND COALESCE(mr.verified_at, mr.created_at) >= v_week_start
      AND COALESCE(mr.verified_at, mr.created_at) < v_week_end
    GROUP BY rh.user_id
    HAVING SUM(rh.rating_change) > 0
    ORDER BY SUM(rh.rating_change) DESC,
             (SELECT internal_ranking FROM profiles WHERE id = rh.user_id) ASC,
             rh.user_id ASC
    LIMIT 1;

    IF v_red_uid IS NOT NULL THEN
      INSERT INTO league_jerseys (league_id, user_id, jersey_color, jersey_type, awarded_week, reason)
      VALUES (v_league.id, v_red_uid, 'red', 'red', CURRENT_DATE,
              'Most Improved — +' || v_red_gain || ' ELO this week');
    END IF;


    -- ══════════════════════════════════════════════════════════════════════════
    -- NOTIFICATIONS: gained / lost for yellow, black, green, red
    -- ══════════════════════════════════════════════════════════════════════════

    -- Yellow gained
    IF v_yellow_uid IS NOT NULL AND (v_prev_yellow IS NULL OR v_prev_yellow <> v_yellow_uid) THEN
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (v_yellow_uid, 'achievement', '🟡 League Leader!',
              'You''re top of the standings — the yellow jersey is yours!',
              v_league.id, false);
    END IF;
    -- Yellow lost
    IF v_prev_yellow IS NOT NULL AND (v_yellow_uid IS NULL OR v_prev_yellow <> v_yellow_uid) THEN
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (v_prev_yellow, 'achievement', 'Yellow jersey passed on',
              'You''ve lost the league leader jersey. Fight back next week!',
              v_league.id, false);
    END IF;

    -- Black gained
    IF v_black_uid IS NOT NULL AND (v_prev_black IS NULL OR v_prev_black <> v_black_uid) THEN
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (v_black_uid, 'achievement', '⚫ Wooden Spoon!',
              'You''re holding the wooden spoon — time to climb the table!',
              v_league.id, false);
    END IF;
    -- Black lost (good news!)
    IF v_prev_black IS NOT NULL AND (v_black_uid IS NULL OR v_prev_black <> v_black_uid) THEN
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (v_prev_black, 'achievement', 'Spoon passed on!',
              'You''ve escaped the wooden spoon — keep it up!',
              v_league.id, false);
    END IF;

    -- Green gained (notify both new holders)
    IF v_green_uid1 IS NOT NULL THEN
      -- Only notify if not a prior holder
      IF v_prev_green IS NULL OR NOT (v_green_uid1 = ANY(v_prev_green)) THEN
        INSERT INTO notifications (user_id, type, title, message, related_id, read)
        VALUES (v_green_uid1, 'achievement', '🟢 Underdog!',
                'Your team beat a much stronger pair — ' || v_green_gap || ' ELO gap upset!',
                v_league.id, false);
      END IF;
      IF v_green_uid2 IS NOT NULL AND (v_prev_green IS NULL OR NOT (v_green_uid2 = ANY(v_prev_green))) THEN
        INSERT INTO notifications (user_id, type, title, message, related_id, read)
        VALUES (v_green_uid2, 'achievement', '🟢 Underdog!',
                'Your team beat a much stronger pair — ' || v_green_gap || ' ELO gap upset!',
                v_league.id, false);
      END IF;
    END IF;
    -- Green lost (notify prior holders who are no longer holders)
    IF v_prev_green IS NOT NULL AND array_length(v_prev_green, 1) > 0 THEN
      FOREACH v_lost_uid IN ARRAY v_prev_green LOOP
        -- Skip if they're still a green holder
        IF v_green_uid1 IS NOT NULL AND v_lost_uid = v_green_uid1 THEN CONTINUE; END IF;
        IF v_green_uid2 IS NOT NULL AND v_lost_uid = v_green_uid2 THEN CONTINUE; END IF;
        INSERT INTO notifications (user_id, type, title, message, related_id, read)
        VALUES (v_lost_uid, 'achievement', 'Underdog jersey passed on',
                'Another team pulled off a bigger upset this week.',
                v_league.id, false);
      END LOOP;
    END IF;

    -- Red gained
    IF v_red_uid IS NOT NULL AND (v_prev_red IS NULL OR v_prev_red <> v_red_uid) THEN
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (v_red_uid, 'achievement', '🔴 Most Improved!',
              'You gained the most ELO in your league this week — +' || v_red_gain || '!',
              v_league.id, false);
    END IF;
    -- Red lost
    IF v_prev_red IS NOT NULL AND (v_red_uid IS NULL OR v_prev_red <> v_red_uid) THEN
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (v_prev_red, 'achievement', 'Most Improved jersey passed on',
              'Someone else had a bigger ELO gain this week.',
              v_league.id, false);
    END IF;

  END LOOP;

  DROP TABLE IF EXISTS tmp_game_diff;
  DROP TABLE IF EXISTS tmp_green_candidates;
END;
$function$
;
