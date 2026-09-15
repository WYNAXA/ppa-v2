-- ── Poll delete: RLS policy + cascade cleanup ───────────────────────────────

-- Allow poll creator or group admin to delete polls
CREATE POLICY "Creator or group admin can delete poll"
  ON polls FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = polls.group_id
        AND user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- Ensure poll_responses cascade on poll delete.
-- The FK may not have ON DELETE CASCADE from initial schema — fix it.
-- Drop existing FK constraint (name unknown) and re-add with CASCADE.
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT tc.constraint_name INTO v_constraint
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'poll_responses'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'poll_id'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE poll_responses DROP CONSTRAINT %I', v_constraint);
    ALTER TABLE poll_responses
      ADD CONSTRAINT poll_responses_poll_id_fkey
      FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
