-- ── RLS policies for league_members ──────────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "league_members_select" ON league_members FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "league_members_insert" ON league_members FOR INSERT TO authenticated
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "league_members_update" ON league_members FOR UPDATE TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "league_members_delete" ON league_members FOR DELETE TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS policies for league_standings ───────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "league_standings_select" ON league_standings FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "league_standings_insert" ON league_standings FOR INSERT TO authenticated
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "league_standings_update" ON league_standings FOR UPDATE TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
