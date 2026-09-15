-- ── Ensure league_invitations has correct RLS policies ───────────────────────

DO $$ BEGIN
  CREATE POLICY "league_inv_select" ON league_invitations FOR SELECT TO authenticated
    USING (auth.uid() = invited_user_id OR auth.uid() = invited_by);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "league_inv_insert" ON league_invitations FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = invited_by);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "league_inv_update" ON league_invitations FOR UPDATE TO authenticated
    USING (auth.uid() = invited_user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ensure notifications INSERT is allowed for authenticated users
DO $$ BEGIN
  CREATE POLICY "notifications_insert_auth" ON notifications FOR INSERT TO authenticated
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
