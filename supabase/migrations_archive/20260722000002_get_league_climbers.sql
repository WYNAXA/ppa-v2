-- ══════════════════════════════════════════════════════════════════════════════
-- get_league_climbers(p_league_id)
--
-- Returns total career ELO gained per player within a league.
-- Used by the "Climbers" standings view.
--
-- NOTE: rating_history is per MATCH, not per set. Data starts 2026-06-23;
-- earlier matches in the season predate ELO tracking.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_league_climbers(p_league_id uuid)
RETURNS TABLE (user_id uuid, elo_gained integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT rh.user_id,
         SUM(rh.rating_change)::integer AS elo_gained
  FROM rating_history rh
  JOIN match_results mr ON mr.id = rh.match_result_id
  JOIN matches m ON m.id = mr.match_id
  WHERE m.league_id = p_league_id
    AND mr.verification_status = 'verified'
    AND NOT COALESCE(mr.is_friendly, false)
  GROUP BY rh.user_id
  ORDER BY SUM(rh.rating_change) DESC;
$$;
