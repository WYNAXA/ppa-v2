-- Yellow and black jerseys now rank by Form:
--   (ranking_points + 9.0) / (matches_played + 6)
-- This matches the league standings table, replacing the previous
-- ranking_points sort. Captured from live database 2026-07-22.

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
  v_prev_yellow    uuid;
  v_prev_black     uuid;
  v_prev_green     uuid[];
  v_prev_red       uuid;
  v_lost_uid       uuid;
BEGIN
  FOR v_league IN SELECT id FROM leagues WHERE status = 'active' LOOP

    v_yellow_uid := NULL; v_black_uid := NULL;
    v_green_uid1 := NULL; v_green_uid2 := NULL; v_green_gap := NULL;
    v_red_uid := NULL; v_red_gain := NULL;

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

    DELETE FROM league_jerseys
    WHERE league_id = v_league.id
      AND jersey_type IN ('yellow', 'black', 'green', 'red');

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
    ORDER BY (ls.ranking_points + 9.0) / (ls.matches_played + 6) DESC,
             ls.ranking_points DESC,
             ls.matches_played ASC,
             (COALESCE(gd.games_won,0)-COALESCE(gd.games_lost,0)) DESC,
             p.internal_ranking ASC
    LIMIT 1;

    IF v_yellow_uid IS NOT NULL THEN
      INSERT INTO league_jerseys (league_id, user_id, jersey_color, jersey_type, awarded_week, reason)
      VALUES (v_league.id, v_yellow_uid, 'yellow', 'yellow', CURRENT_DATE, 'League leader');
    END IF;

    SELECT ls.user_id INTO v_black_uid
    FROM league_standings ls
    JOIN profiles p ON p.id = ls.user_id
    LEFT JOIN tmp_game_diff gd ON gd.user_id = ls.user_id
    WHERE ls.league_id = v_league.id AND ls.matches_played > 0
    ORDER BY (ls.ranking_points + 9.0) / (ls.matches_played + 6) ASC,
             ls.ranking_points ASC,
             ls.matches_played DESC,
             (COALESCE(gd.games_won,0)-COALESCE(gd.games_lost,0)) ASC,
             p.internal_ranking DESC
    LIMIT 1;

    IF v_black_uid IS NOT NULL THEN
      INSERT INTO league_jerseys (league_id, user_id, jersey_color, jersey_type, awarded_week, reason)
      VALUES (v_league.id, v_black_uid, 'black', 'black', CURRENT_DATE, 'Bottom of standings');
    END IF;

    DROP TABLE IF EXISTS tmp_green_candidates;
    CREATE TEMP TABLE tmp_green_candidates AS
    WITH sets_expanded AS (
      SELECT
        mr.id AS match_result_id,
        mr.team1_players,
        mr.team2_players,
        mr.verified_at,
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
        CASE
          WHEN se.g1 > se.g2 THEN 'team1'
          WHEN se.g2 > se.g1 THEN 'team2'
          ELSE NULL
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
        (SELECT COALESCE(SUM(rh.rating_before), 0)
         FROM rating_history rh
         WHERE rh.match_result_id = cs.match_result_id
           AND rh.user_id = ANY(cs.team1_players)) AS team1_combined_elo,
        (SELECT COALESCE(SUM(rh.rating_before), 0)
         FROM rating_history rh
         WHERE rh.match_result_id = cs.match_result_id
           AND rh.user_id = ANY(cs.team2_players)) AS team2_combined_elo
      FROM classified_sets cs
      WHERE NOT cs.is_void
        AND cs.winning_team IS NOT NULL
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

      IF v_green_uid2 IS NOT NULL THEN
        INSERT INTO league_jerseys (league_id, user_id, jersey_color, jersey_type, awarded_week, reason)
        VALUES (v_league.id, v_green_uid2, 'green', 'green', CURRENT_DATE, v_green_reason);
      END IF;
    END IF;

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

    IF v_yellow_uid IS NOT NULL AND (v_prev_yellow IS NULL OR v_prev_yellow <> v_yellow_uid) THEN
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (v_yellow_uid, 'achievement', '🟡 League Leader!',
              'You''re top of the standings — the yellow jersey is yours!',
              v_league.id, false);
    END IF;
    IF v_prev_yellow IS NOT NULL AND (v_yellow_uid IS NULL OR v_prev_yellow <> v_yellow_uid) THEN
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (v_prev_yellow, 'achievement', 'Yellow jersey passed on',
              'You''ve lost the league leader jersey. Fight back next week!',
              v_league.id, false);
    END IF;

    IF v_black_uid IS NOT NULL AND (v_prev_black IS NULL OR v_prev_black <> v_black_uid) THEN
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (v_black_uid, 'achievement', '⚫ Wooden Spoon!',
              'You''re holding the wooden spoon — time to climb the table!',
              v_league.id, false);
    END IF;
    IF v_prev_black IS NOT NULL AND (v_black_uid IS NULL OR v_prev_black <> v_black_uid) THEN
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (v_prev_black, 'achievement', 'Spoon passed on!',
              'Someone else had a bigger ELO gain this week.',
              v_league.id, false);
    END IF;

    IF v_green_uid1 IS NOT NULL THEN
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
    IF v_prev_green IS NOT NULL AND array_length(v_prev_green, 1) > 0 THEN
      FOREACH v_lost_uid IN ARRAY v_prev_green LOOP
        IF v_green_uid1 IS NOT NULL AND v_lost_uid = v_green_uid1 THEN CONTINUE; END IF;
        IF v_green_uid2 IS NOT NULL AND v_lost_uid = v_green_uid2 THEN CONTINUE; END IF;
        INSERT INTO notifications (user_id, type, title, message, related_id, read)
        VALUES (v_lost_uid, 'achievement', 'Underdog jersey passed on',
                'Another team pulled off a bigger upset this week.',
                v_league.id, false);
      END LOOP;
    END IF;

    IF v_red_uid IS NOT NULL AND (v_prev_red IS NULL OR v_prev_red <> v_red_uid) THEN
      INSERT INTO notifications (user_id, type, title, message, related_id, read)
      VALUES (v_red_uid, 'achievement', '🔴 Most Improved!',
              'You gained the most ELO in your league this week — +' || v_red_gain || '!',
              v_league.id, false);
    END IF;
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
$function$;
