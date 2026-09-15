-- ══════════════════════════════════════════════════════════════════════════════
-- Four-rung tiebreak for yellow/black jerseys:
--   ranking_points DESC, wins DESC, losses ASC, game_diff DESC (yellow)
--   ranking_points ASC,  wins ASC,  losses DESC, game_diff ASC  (black)
--
-- game_diff computed on-the-fly from match_results.sets_data per player
-- per league — same pattern as LeagueDetail.tsx and league_team_standings.
--
-- Run in the Supabase SQL Editor. Does NOT schedule the cron.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.award_weekly_jerseys()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_league record;
  v_yellow_uid uuid;
  v_black_uid  uuid;
BEGIN
  FOR v_league IN SELECT id FROM leagues WHERE status = 'active' LOOP

    -- ── Compute per-player game difference for this league ──
    -- CTE: sum games won/lost from sets_data across all verified match_results
    WITH game_diff AS (
      SELECT
        pid AS user_id,
        SUM(CASE
          WHEN mr.team1_players @> ARRAY[pid] THEN COALESCE((s.val->>'team1')::int, 0)
          ELSE COALESCE((s.val->>'team2')::int, 0)
        END) AS games_won,
        SUM(CASE
          WHEN mr.team1_players @> ARRAY[pid] THEN COALESCE((s.val->>'team2')::int, 0)
          ELSE COALESCE((s.val->>'team1')::int, 0)
        END) AS games_lost
      FROM match_results mr
      JOIN matches m ON m.id = mr.match_id
        AND m.league_id = v_league.id
      CROSS JOIN LATERAL jsonb_array_elements(mr.sets_data) AS s(val)
      CROSS JOIN LATERAL unnest(mr.team1_players || mr.team2_players) AS pid
      WHERE mr.verification_status = 'verified'
        AND (mr.team1_players @> ARRAY[pid] OR mr.team2_players @> ARRAY[pid])
      GROUP BY pid
    )
    -- ── Yellow: league leader (full four-rung tiebreak) ──
    SELECT ls.user_id INTO v_yellow_uid
    FROM league_standings ls
    LEFT JOIN game_diff gd ON gd.user_id = ls.user_id
    WHERE ls.league_id = v_league.id
      AND ls.matches_played > 0
    ORDER BY
      ls.ranking_points DESC,
      ls.wins DESC,
      ls.losses ASC,
      (COALESCE(gd.games_won, 0) - COALESCE(gd.games_lost, 0)) DESC
    LIMIT 1;

    IF v_yellow_uid IS NOT NULL THEN
      INSERT INTO league_jerseys (
        league_id, user_id, jersey_number, jersey_color, jersey_type, awarded_week, reason
      ) VALUES (
        v_league.id, v_yellow_uid, 1, 'yellow', 'yellow', CURRENT_DATE, 'League leader'
      )
      ON CONFLICT (league_id, jersey_type)
      DO UPDATE SET
        user_id      = EXCLUDED.user_id,
        jersey_color = 'yellow',
        awarded_week = CURRENT_DATE,
        reason       = 'League leader';
    END IF;

    -- ── Black: wooden spoon (reverse four-rung tiebreak) ──
    SELECT ls.user_id INTO v_black_uid
    FROM league_standings ls
    LEFT JOIN game_diff gd ON gd.user_id = ls.user_id
    WHERE ls.league_id = v_league.id
      AND ls.matches_played > 0
    ORDER BY
      ls.ranking_points ASC,
      ls.wins ASC,
      ls.losses DESC,
      (COALESCE(gd.games_won, 0) - COALESCE(gd.games_lost, 0)) ASC
    LIMIT 1;

    IF v_black_uid IS NOT NULL THEN
      INSERT INTO league_jerseys (
        league_id, user_id, jersey_number, jersey_color, jersey_type, awarded_week, reason
      ) VALUES (
        v_league.id, v_black_uid, 5, 'black', 'black', CURRENT_DATE, 'Bottom of standings'
      )
      ON CONFLICT (league_id, jersey_type)
      DO UPDATE SET
        user_id      = EXCLUDED.user_id,
        jersey_color = 'black',
        awarded_week = CURRENT_DATE,
        reason       = 'Bottom of standings';
    END IF;

  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
