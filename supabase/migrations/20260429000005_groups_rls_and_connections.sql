-- ── Fix 1: Groups RLS — allow authenticated users to read open groups ─────────

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- Drop existing conflicting policies if any
DROP POLICY IF EXISTS "Authenticated can read open groups" ON groups;
DROP POLICY IF EXISTS "Members can read their groups" ON groups;
DROP POLICY IF EXISTS "Admins can manage groups" ON groups;

-- Authenticated users can read open/public groups OR groups they belong to
CREATE POLICY "Authenticated can read groups"
ON groups FOR SELECT
TO authenticated
USING (
  visibility IN ('public', 'open')
  OR admin_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = groups.id
      AND gm.user_id = auth.uid()
      AND gm.status = 'approved'
  )
);

-- Members can insert (create) groups
CREATE POLICY "Authenticated can create groups"
ON groups FOR INSERT
TO authenticated
WITH CHECK (admin_id = auth.uid());

-- Admin can update their group
CREATE POLICY "Admin can update group"
ON groups FOR UPDATE
TO authenticated
USING (admin_id = auth.uid())
WITH CHECK (admin_id = auth.uid());

-- Admin can delete their group
CREATE POLICY "Admin can delete group"
ON groups FOR DELETE
TO authenticated
USING (admin_id = auth.uid());

-- ── Fix 2: player_connections RLS ─────────────────────────────────────────────

-- Ensure table exists with correct schema
CREATE TABLE IF NOT EXISTS player_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  connected_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, connected_user_id)
);

ALTER TABLE player_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own connections" ON player_connections;
DROP POLICY IF EXISTS "Users can create connections" ON player_connections;
DROP POLICY IF EXISTS "Users can update own connections" ON player_connections;

CREATE POLICY "Users can view own connections"
ON player_connections FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR connected_user_id = auth.uid());

CREATE POLICY "Users can create connections"
ON player_connections FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own connections"
ON player_connections FOR UPDATE
TO authenticated
USING (user_id = auth.uid() OR connected_user_id = auth.uid());

-- ── Fix 6: Group privacy options columns ─────────────────────────────────────

ALTER TABLE groups ADD COLUMN IF NOT EXISTS allow_join_requests boolean DEFAULT true;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS auto_approve_requests boolean DEFAULT false;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS allow_ringers boolean DEFAULT true;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS ringer_approval text DEFAULT 'admin'
  CHECK (ringer_approval IN ('admin', 'any_member'));
