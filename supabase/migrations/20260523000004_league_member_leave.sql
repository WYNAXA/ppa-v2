-- ── Allow league members to leave (self-remove) ─────────────────────────────

CREATE POLICY "Members can leave their leagues"
  ON league_members FOR DELETE
  USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
