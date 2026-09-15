-- Allow group members to view all matches in their groups.
-- Catherine (and other members) couldn't see group matches
-- because the existing SELECT policy only checked player_ids.

-- Drop if exists to make this idempotent
DROP POLICY IF EXISTS "Group members can view group matches" ON matches;

CREATE POLICY "Group members can view group matches"
ON matches FOR SELECT TO authenticated
USING (
  group_id IN (
    SELECT gm.group_id FROM group_members gm
    WHERE gm.user_id = auth.uid()
    AND gm.status IN ('approved', 'ringer')
  )
);

-- Also ensure players in the match can always see it (covers non-group matches)
DROP POLICY IF EXISTS "Players can view their matches" ON matches;

CREATE POLICY "Players can view their matches"
ON matches FOR SELECT TO authenticated
USING (
  auth.uid() = ANY(player_ids)
);
