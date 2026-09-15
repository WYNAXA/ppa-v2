-- ════════════════════════════════════════════════════════════════════════════
-- poll_player_outcomes table + groups.auto_match_enabled column
--
-- Schema foundation for rotation fairness.  The recording logic
-- (deciding who is 'scheduled' vs 'benched') is NOT in this migration —
-- only the storage and access control.
--
-- Run each fenced block as a separate statement in the SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════


-- 1. Create poll_player_outcomes table
CREATE TABLE IF NOT EXISTS poll_player_outcomes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id    uuid        NOT NULL REFERENCES polls(id)    ON DELETE CASCADE,
  group_id   uuid        NOT NULL REFERENCES groups(id),
  user_id    uuid        NOT NULL REFERENCES profiles(id),
  outcome    text        NOT NULL CHECK (outcome IN ('scheduled', 'benched')),
  match_id   uuid        REFERENCES matches(id),
  created_at timestamptz NOT NULL DEFAULT now()
);


-- 2. Unique constraint: one outcome per user per poll
CREATE UNIQUE INDEX idx_poll_player_outcomes_unique
ON poll_player_outcomes (poll_id, user_id);


-- 3. Lookup index: per-group history for a player, most recent first
CREATE INDEX idx_poll_player_outcomes_group_user
ON poll_player_outcomes (group_id, user_id, created_at DESC);


-- 4. Enable RLS
ALTER TABLE poll_player_outcomes ENABLE ROW LEVEL SECURITY;


-- 5. SELECT policy: group members can view outcomes for their groups.
--    Modelled on matches RLS from 20260508000001_fix_matches_rls.sql:8-16:
--      CREATE POLICY "Group members can view group matches"
--      ON matches FOR SELECT TO authenticated
--      USING (
--        group_id IN (
--          SELECT gm.group_id FROM group_members gm
--          WHERE gm.user_id = auth.uid()
--          AND gm.status IN ('approved', 'ringer')
--        )
--      );
CREATE POLICY "Group members can view poll outcomes"
ON poll_player_outcomes FOR SELECT TO authenticated
USING (
  group_id IN (
    SELECT gm.group_id FROM group_members gm
    WHERE gm.user_id = auth.uid()
    AND gm.status IN ('approved', 'ringer')
  )
);


-- 6. INSERT policy: only service role writes outcomes (via edge function).
--    Authenticated users cannot insert directly.
--    Service role bypasses RLS, so no explicit INSERT policy is needed.
--    This comment documents the intentional omission.


-- 7. Users can view their own outcomes regardless of group membership
--    (mirrors matches "Players can view their matches" pattern).
CREATE POLICY "Users can view own poll outcomes"
ON poll_player_outcomes FOR SELECT TO authenticated
USING (auth.uid() = user_id);


-- 8. Add auto_match_enabled to groups
ALTER TABLE groups
ADD COLUMN IF NOT EXISTS auto_match_enabled boolean NOT NULL DEFAULT false;


-- 9. Schema reload
NOTIFY pgrst, 'reload schema';
