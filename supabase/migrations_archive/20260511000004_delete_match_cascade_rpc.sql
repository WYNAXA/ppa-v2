-- ── RPC to hard-delete a match and all dependent rows ───────────────────────
-- Only callable by group admins. Deletes child rows explicitly in correct
-- order to avoid FK constraint violations, regardless of cascade settings.

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

  -- Delete child rows in dependency order (innermost first)
  DELETE FROM rating_history
    WHERE match_result_id IN (SELECT id FROM match_results WHERE match_id = p_match_id);
  DELETE FROM match_result_votes
    WHERE match_result_id IN (SELECT id FROM match_results WHERE match_id = p_match_id);
  DELETE FROM match_peer_votes WHERE match_id = p_match_id;
  DELETE FROM match_results WHERE match_id = p_match_id;
  DELETE FROM travel_requests WHERE match_id = p_match_id;
  -- match_comments may not exist — use IF EXISTS pattern
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'match_comments') THEN
    EXECUTE 'DELETE FROM match_comments WHERE match_id = $1' USING p_match_id;
  END IF;
  DELETE FROM notifications WHERE related_id = p_match_id::text;
  DELETE FROM matches WHERE id = p_match_id;
END;
$$;
