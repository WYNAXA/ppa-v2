-- ── Fix 1: Ensure RLS is enabled on group_members with INSERT policy ─────────

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- Allow users to request to join groups (insert their own row)
DROP POLICY IF EXISTS "Users can request to join groups" ON group_members;
CREATE POLICY "Users can request to join groups"
ON group_members FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status IN ('pending', 'approved')
);

-- Allow users to read group members for groups they belong to
DROP POLICY IF EXISTS "Members can view group members" ON group_members;
CREATE POLICY "Members can view group members"
ON group_members FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM group_members my
    WHERE my.group_id = group_members.group_id
      AND my.user_id = auth.uid()
      AND my.status IN ('approved', 'ringer')
  )
  OR EXISTS (
    SELECT 1 FROM groups g
    WHERE g.id = group_members.group_id
      AND g.admin_id = auth.uid()
  )
);

-- Allow admins to update members in their groups
DROP POLICY IF EXISTS "Admins can update group members" ON group_members;
CREATE POLICY "Admins can update group members"
ON group_members FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM group_members admin_row
    WHERE admin_row.group_id = group_members.group_id
      AND admin_row.user_id = auth.uid()
      AND admin_row.role = 'admin'
      AND admin_row.status = 'approved'
  )
  OR EXISTS (
    SELECT 1 FROM groups g
    WHERE g.id = group_members.group_id
      AND g.admin_id = auth.uid()
  )
  OR user_id = auth.uid()
);

-- Allow admins to remove members, or users to leave
DROP POLICY IF EXISTS "Admins or self can delete group members" ON group_members;
CREATE POLICY "Admins or self can delete group members"
ON group_members FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM group_members admin_row
    WHERE admin_row.group_id = group_members.group_id
      AND admin_row.user_id = auth.uid()
      AND admin_row.role = 'admin'
      AND admin_row.status = 'approved'
  )
  OR EXISTS (
    SELECT 1 FROM groups g
    WHERE g.id = group_members.group_id
      AND g.admin_id = auth.uid()
  )
);

-- ── Fix 2: Notify group admins when a join request is submitted ──────────────

CREATE OR REPLACE FUNCTION notify_admins_on_join_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group_name text;
  v_requester_name text;
  v_admin record;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_group_name FROM groups WHERE id = NEW.group_id;
  SELECT name INTO v_requester_name FROM profiles WHERE id = NEW.user_id;

  -- Notify all admins (via group_members role='admin' and legacy admin_id)
  FOR v_admin IN
    SELECT DISTINCT u_id FROM (
      SELECT gm.user_id AS u_id
      FROM group_members gm
      WHERE gm.group_id = NEW.group_id
        AND gm.role = 'admin'
        AND gm.status = 'approved'
      UNION
      SELECT g.admin_id AS u_id
      FROM groups g
      WHERE g.id = NEW.group_id
    ) admins
    WHERE u_id IS NOT NULL AND u_id <> NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, type, title, message, related_id, read)
    VALUES (
      v_admin.u_id,
      'group_join_request',
      v_group_name,
      COALESCE(v_requester_name, 'Someone') || ' wants to join ' || COALESCE(v_group_name, 'your group'),
      NEW.group_id,
      false
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_on_join_request ON group_members;
CREATE TRIGGER trg_notify_admins_on_join_request
  AFTER INSERT ON group_members
  FOR EACH ROW
  EXECUTE FUNCTION notify_admins_on_join_request();
