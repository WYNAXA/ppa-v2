-- ══════════════════════════════════════════════════════════════════════════════
-- Atomic group admin promotion.
-- Writes group_members.role AND groups.admin_id in a single transaction.
-- Does NOT demote the old admin — multiple admins are supported
-- (useIsGroupAdmin checks both groups.admin_id and group_members.role).
-- Run in the Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.promote_to_group_admin(
  p_group_id    uuid,
  p_new_admin_id uuid
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

  -- Verify the caller is currently an admin of this group
  -- (matches useIsGroupAdmin: checks groups.admin_id OR group_members.role)
  IF NOT EXISTS (
    SELECT 1 FROM groups WHERE id = p_group_id AND admin_id = v_caller
  ) AND NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = v_caller AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only a group admin can promote members';
  END IF;

  -- Verify the target is a member of the group
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = p_new_admin_id
  ) THEN
    RAISE EXCEPTION 'Player is not a member of this group';
  END IF;

  -- Atomic: both writes in one transaction
  UPDATE group_members
  SET role = 'admin'
  WHERE group_id = p_group_id AND user_id = p_new_admin_id;

  UPDATE groups
  SET admin_id = p_new_admin_id
  WHERE id = p_group_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_to_group_admin(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
