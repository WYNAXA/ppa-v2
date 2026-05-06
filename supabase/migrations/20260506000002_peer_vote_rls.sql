-- Ensure match_peer_votes has proper INSERT policy
DO $$ BEGIN
  CREATE POLICY "mpv_insert_check" ON match_peer_votes FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = voter_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ensure match_result_votes allows insert for participants
DO $$ BEGIN
  CREATE POLICY "mrv_insert" ON match_result_votes FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = voter_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "mrv_select" ON match_result_votes FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
