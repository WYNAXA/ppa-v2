-- Make match deletion ELO-aware — fixes the parked career-ELO / matches_played
-- drift (KNOWN_ISSUES.md; audit 2026-07-28 finding H1).
--
-- ROOT CAUSE: the live delete path (MatchDetail.tsx did direct table deletes,
-- and this RPC's previous version) removed match_results + rating_history but
-- NEVER reversed the effect apply_match_elo() had already applied to
-- profiles.internal_ranking / matches_played. Every deletion of a match whose
-- result had been verified therefore left orphaned increments, so stored career
-- aggregates drifted ABOVE a clean rebuild by a variable per-player amount.
--
-- FIX: before deleting rating_history, subtract each player's summed
-- rating_change back out of internal_ranking and decrement matches_played by the
-- number of processed results they had for this match (apply_match_elo did
-- += rating_change and matches_played += 1 per processed result, writing exactly
-- one rating_history row per (player, match_result) — so this is symmetric).
-- Also now deletes ranking_changes (the previous version leaked those rows too).
--
-- peak_elo is a running historical max and is intentionally left untouched; a
-- full rebuild-ratings run can reconcile peaks if ever needed.
--
-- Auth model is unchanged: group-admin only (matches the client's canDelete =
-- isGroupAdmin gate).

CREATE OR REPLACE FUNCTION public.delete_match_cascade(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify caller is a group admin of the match's group
  IF NOT EXISTS (
    SELECT 1 FROM matches m
    LEFT JOIN groups g ON g.id = m.group_id
    LEFT JOIN group_members gm ON gm.group_id = g.id
      AND gm.user_id = auth.uid()
      AND gm.role = 'admin'
      AND gm.status = 'approved'
    WHERE m.id = p_match_id
      AND (g.admin_id = auth.uid() OR gm.user_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Not authorized to delete this match';
  END IF;

  -- ── Reverse applied ELO before deleting the audit rows it was derived from ──
  UPDATE profiles p
  SET internal_ranking = GREATEST(0, LEAST(3000, p.internal_ranking - agg.total_change)),
      matches_played   = GREATEST(0, p.matches_played - agg.cnt),
      is_provisional   = GREATEST(0, p.matches_played - agg.cnt) < 10
  FROM (
    SELECT rh.user_id,
           COALESCE(SUM(rh.rating_change), 0)::int AS total_change,
           COUNT(*)::int                            AS cnt
    FROM rating_history rh
    JOIN match_results mr ON mr.id = rh.match_result_id
    WHERE mr.match_id = p_match_id
    GROUP BY rh.user_id
  ) agg
  WHERE p.id = agg.user_id;

  -- ── Cascade delete child rows in dependency order (innermost first) ──
  DELETE FROM rating_history
    WHERE match_result_id IN (SELECT id FROM match_results WHERE match_id = p_match_id);
  DELETE FROM ranking_changes WHERE match_id = p_match_id;      -- was leaking before
  DELETE FROM match_result_votes
    WHERE match_result_id IN (SELECT id FROM match_results WHERE match_id = p_match_id);
  DELETE FROM match_peer_votes WHERE match_id = p_match_id;
  DELETE FROM match_results WHERE match_id = p_match_id;
  DELETE FROM travel_requests WHERE match_id = p_match_id;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'match_comments') THEN
    EXECUTE 'DELETE FROM match_comments WHERE match_id = $1' USING p_match_id;
  END IF;
  DELETE FROM notifications WHERE related_id = p_match_id::text;
  DELETE FROM matches WHERE id = p_match_id;
END;
$$;
