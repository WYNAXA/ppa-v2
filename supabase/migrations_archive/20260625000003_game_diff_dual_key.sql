-- ══════════════════════════════════════════════════════════════════════════════
-- Game-diff dual-key fix: readers must handle BOTH set-score key formats.
--
-- 120 of 367 verified sets (Nov 2025–May 2026) use legacy keys
-- {team1_score, team2_score}; newer sets use {team1, team2}. Game-diff readers
-- that only read team1/team2 counted 0 games for the 120 legacy sets — game-diff
-- was wrong app-wide (verified: one active player's games-won was 319 vs 650
-- correct — ~half their games were dropped).
--
-- Fix = read score as COALESCE(team1, team1_score, 0) in all readers. We do NOT
-- migrate the legacy data: the old format is structurally RICHER (also carries
-- per-set team1_players/team2_players arrays and sometimes tiebreak_score), so
-- rewriting it would risk losing information. Readers tolerate both instead.
--
-- Three readers fixed:
--   1. Frontend gdMap (LeagueDetail.tsx) — committed separately.
--   2. award_weekly_jerseys tmp_game_diff — in migration 20260625000002 (updated).
--   3. league_team_standings view — below (also adds missing COALESCE, bug #1).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW league_team_standings AS
 SELECT t.id AS team_id,
    t.league_id,
    t.team_name,
    t.player1_id,
    t.player2_id,
    COALESCE(s1.wins, 0) AS wins,
    COALESCE(s1.losses, 0) AS losses,
    COALESCE(s1.draws, 0) AS draws,
    COALESCE(s1.matches_played, 0) AS matches_played,
    COALESCE(s1.ranking_points, 0::numeric) AS ranking_points,
    COALESCE(gd.games_won, 0::bigint) AS games_won,
    COALESCE(gd.games_lost, 0::bigint) AS games_lost,
    COALESCE(gd.games_won, 0::bigint) - COALESCE(gd.games_lost, 0::bigint) AS game_difference
   FROM league_teams t
     LEFT JOIN league_standings s1 ON s1.league_id = t.league_id AND s1.user_id = t.player1_id
     LEFT JOIN LATERAL ( SELECT sum(
                CASE
                    WHEN mr.team1_players @> ARRAY[t.player1_id] THEN COALESCE((s.val ->> 'team1'::text)::integer, (s.val ->> 'team1_score'::text)::integer, 0)
                    ELSE COALESCE((s.val ->> 'team2'::text)::integer, (s.val ->> 'team2_score'::text)::integer, 0)
                END) AS games_won,
            sum(
                CASE
                    WHEN mr.team1_players @> ARRAY[t.player1_id] THEN COALESCE((s.val ->> 'team2'::text)::integer, (s.val ->> 'team2_score'::text)::integer, 0)
                    ELSE COALESCE((s.val ->> 'team1'::text)::integer, (s.val ->> 'team1_score'::text)::integer, 0)
                END) AS games_lost
           FROM match_results mr
             CROSS JOIN LATERAL jsonb_array_elements(mr.sets_data) s(val)
             JOIN matches m ON m.id = mr.match_id AND m.league_id = t.league_id
          WHERE mr.verification_status = 'verified'::text AND (mr.team1_players @> ARRAY[t.player1_id] OR mr.team2_players @> ARRAY[t.player1_id])) gd ON true;
