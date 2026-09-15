-- ══════════════════════════════════════════════════════════════════════════════
-- Atomic league-join RPCs.
-- Insert league_members + league_standings in a single transaction.
-- Run in the Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 1. join_league — single player join ─────────────────────────────────────
-- Auth: caller must be p_user_id (self-join) OR a league admin.
-- Idempotent: skips if already a member (no error on re-join).

CREATE OR REPLACE FUNCTION public.join_league(
  p_league_id uuid,
  p_user_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Auth: self-join OR league admin (creator or league_members.role='admin')
  IF v_caller <> p_user_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM leagues WHERE id = p_league_id AND created_by = v_caller
    ) AND NOT EXISTS (
      SELECT 1 FROM league_members
      WHERE league_id = p_league_id AND user_id = v_caller AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Only the player themselves or a league admin can add members';
    END IF;
  END IF;

  -- Skip if already a member (idempotent)
  IF EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = p_league_id AND user_id = p_user_id
  ) THEN
    RETURN;
  END IF;

  -- Atomic: both inserts in one transaction
  INSERT INTO league_members (league_id, user_id, role, status)
  VALUES (p_league_id, p_user_id, 'member', 'active');

  INSERT INTO league_standings (league_id, user_id, wins, losses, draws, matches_played, ranking_points, category)
  VALUES (p_league_id, p_user_id, 0, 0, 0, 0, 0, 'overall');
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_league(uuid, uuid) TO authenticated;


-- ── 2. join_league_bulk — batch join (admin only) ───────────────────────────
-- All-or-nothing: every player added or none (transaction rolls back on error).
-- Skips players already in the league (idempotent per player).

CREATE OR REPLACE FUNCTION public.join_league_bulk(
  p_league_id uuid,
  p_user_ids  uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_added  int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Auth: league admin only (creator or league_members.role='admin')
  IF NOT EXISTS (
    SELECT 1 FROM leagues WHERE id = p_league_id AND created_by = v_caller
  ) AND NOT EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = p_league_id AND user_id = v_caller AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only a league admin can bulk-add members';
  END IF;

  -- Insert members (skip existing)
  INSERT INTO league_members (league_id, user_id, role, status)
  SELECT p_league_id, uid, 'member', 'active'
  FROM unnest(p_user_ids) AS uid
  WHERE NOT EXISTS (
    SELECT 1 FROM league_members lm
    WHERE lm.league_id = p_league_id AND lm.user_id = uid
  );

  GET DIAGNOSTICS v_added = ROW_COUNT;

  -- Insert standings for newly added members only
  INSERT INTO league_standings (league_id, user_id, wins, losses, draws, matches_played, ranking_points, category)
  SELECT p_league_id, uid, 0, 0, 0, 0, 0, 'overall'
  FROM unnest(p_user_ids) AS uid
  WHERE EXISTS (
    SELECT 1 FROM league_members lm
    WHERE lm.league_id = p_league_id AND lm.user_id = uid
  )
  AND NOT EXISTS (
    SELECT 1 FROM league_standings ls
    WHERE ls.league_id = p_league_id AND ls.user_id = uid
  );

  RETURN jsonb_build_object('added', v_added);
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_league_bulk(uuid, uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
