-- ── Peer vote tiered badges + aggregation RPC ──────────────────────────────
-- Phase 3a: awards bronze/silver/gold badges from VERIFIED peer vote counts.

-- 1. Add tier column to user_badges (nullable for existing non-tiered badges)
ALTER TABLE user_badges
ADD COLUMN IF NOT EXISTS tier text;

-- 2. RPC: Get verified peer vote counts per recipient per category.
--    Only counts votes on matches whose result has verification_status = 'verified'.
--    Returns: user_id, category, vote_count
CREATE OR REPLACE FUNCTION public.get_verified_peer_vote_counts(p_user_id uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid, category text, vote_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    pv.voted_for_id AS user_id,
    pv.category,
    COUNT(*) AS vote_count
  FROM match_peer_votes pv
  JOIN match_results mr ON mr.match_id = pv.match_id
  WHERE mr.verification_status = 'verified'
    AND (p_user_id IS NULL OR pv.voted_for_id = p_user_id)
  GROUP BY pv.voted_for_id, pv.category;
$$;

-- 3. Notify PostgREST to pick up the new RPC and column
NOTIFY pgrst, 'reload schema';
