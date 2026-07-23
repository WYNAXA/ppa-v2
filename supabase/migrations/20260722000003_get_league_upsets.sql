-- ══════════════════════════════════════════════════════════════════════════════
-- get_league_upsets(p_league_id)
--
-- Counts per-set wins where the winning pair's combined match-time career ELO
-- was at least 150 BELOW the losing pair's. Both winners are credited.
-- Used by the "Upsets" standings view.
--
-- Mirrors the green/underdog jersey logic in award_weekly_jerseys(), but
-- season-wide rather than weekly.
--
-- Void sets are excluded via classify_set_sql(). Draws excluded (no winner).
-- Depends on rating_history.rating_before for match-time ELO; data starts
-- 2026-06-23.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_league_upsets(p_league_id uuid)
RETURNS TABLE (user_id uuid, upset_wins integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH sets_expanded AS (
    SELECT
      mr.id AS mrid,
      mr.team1_players,
      mr.team2_players,
      COALESCE((s.val->>'team1')::int, (s.val->>'team1_score')::int, 0) AS g1,
      COALESCE((s.val->>'team2')::int, (s.val->>'team2_score')::int, 0) AS g2
    FROM match_results mr
    JOIN matches m ON m.id = mr.match_id
    CROSS JOIN LATERAL jsonb_array_elements(mr.sets_data) AS s(val)
    WHERE m.league_id = p_league_id
      AND mr.verification_status = 'verified'
      AND NOT COALESCE(mr.is_friendly, false)
  ),
  classified AS (
    SELECT se.*, c.is_void
    FROM sets_expanded se
    CROSS JOIN LATERAL classify_set_sql(se.g1, se.g2) c
  ),
  gaps AS (
    SELECT
      cl.mrid,
      CASE WHEN cl.g1 > cl.g2 THEN cl.team1_players ELSE cl.team2_players END AS winners,
      CASE WHEN cl.g1 > cl.g2
        THEN (SELECT COALESCE(SUM(rh.rating_before),0) FROM rating_history rh
              WHERE rh.match_result_id = cl.mrid AND rh.user_id = ANY(cl.team2_players))
           - (SELECT COALESCE(SUM(rh.rating_before),0) FROM rating_history rh
              WHERE rh.match_result_id = cl.mrid AND rh.user_id = ANY(cl.team1_players))
        ELSE (SELECT COALESCE(SUM(rh.rating_before),0) FROM rating_history rh
              WHERE rh.match_result_id = cl.mrid AND rh.user_id = ANY(cl.team1_players))
           - (SELECT COALESCE(SUM(rh.rating_before),0) FROM rating_history rh
              WHERE rh.match_result_id = cl.mrid AND rh.user_id = ANY(cl.team2_players))
      END AS elo_gap
    FROM classified cl
    WHERE NOT cl.is_void
      AND cl.g1 <> cl.g2
  )
  SELECT uid AS user_id, COUNT(*)::integer AS upset_wins
  FROM gaps g
  CROSS JOIN LATERAL unnest(g.winners) AS uid
  WHERE g.elo_gap >= 150
  GROUP BY uid
  ORDER BY COUNT(*) DESC;
$$;
