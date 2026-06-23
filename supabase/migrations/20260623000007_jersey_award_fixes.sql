
-- ══════════════════════════════════════════════════════════════════════════════
-- award_weekly_jerseys — working version (matches live production).
-- Fixes vs earlier migrations:
--   1. No jersey_number column (doesn't exist on league_jerseys).
--   2. game_diff computed into a TEMP TABLE so BOTH yellow and black selects
--      can read it (a CTE only attaches to one following statement).
-- Five-rung tiebreak: points, wins, losses, game_diff, internal_ranking
--   (ASC for yellow's ELO rung = underdog wins; DESC for black = higher ELO gets spoon).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.award_weekly_jerseys()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_league record;
  v_yellow_uid uuid;
  v_black_uid  uuid;
BEGIN
  FOR v_league IN SELECT id FROM leagues WHERE status = 'active' LOOP

    -- Compute per-player game diff for this league into a temp table
    DROP TABLE IF EXISTS tmp_game_diff;
    CREATE TEMP TABLE tmp_game_diff AS
      SELECT
        pid AS user_id,
        SUM(CASE WHEN mr.team1_players @> ARRAY[pid] THEN COALESCE((s.val->>'team1')::int,0)
                 ELSE COALESCE((s.val->>'team2')::int,0) END) AS games_won,
        SUM(CASE WHEN mr.team1_players @> ARRAY[pid] THEN COALESCE((s.val->>'team2')::int,0)
                 ELSE COALESCE((s.val->>'team1')::int,0) END) AS games_lost
      FROM match_results mr
      JOIN matches m ON m.id = mr.match_id AND m.league_id = v_league.id
      CROSS JOIN LATERAL jsonb_array_elements(mr.sets_data) AS s(val)
      CROSS JOIN LATERAL unnest(mr.team1_players || mr.team2_players) AS pid
      WHERE mr.verification_status = 'verified'
      GROUP BY pid;

    -- Yellow: leader (underdog wins perfect tie → lower ELO)
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
      VALUES (v_league.id, v_yellow_uid, 'yellow', 'yellow', CURRENT_DATE, 'League leader')
      ON CONFLICT (league_id, jersey_type) DO UPDATE SET
        user_id = EXCLUDED.user_id, jersey_color = 'yellow', awarded_week = CURRENT_DATE, reason = 'League leader';
    END IF;

    -- Black: spoon (higher ELO gets it on perfect tie)
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
      VALUES (v_league.id, v_black_uid, 'black', 'black', CURRENT_DATE, 'Bottom of standings')
      ON CONFLICT (league_id, jersey_type) DO UPDATE SET
        user_id = EXCLUDED.user_id, jersey_color = 'black', awarded_week = CURRENT_DATE, reason = 'Bottom of standings';
    END IF;

  END LOOP;

  DROP TABLE IF EXISTS tmp_game_diff;
END;
$function$;

NOTIFY pgrst, 'reload schema';
