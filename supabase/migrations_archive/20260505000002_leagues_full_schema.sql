-- ── Complete leagues schema: add missing columns ─────────────────────────────

ALTER TABLE leagues
ADD COLUMN IF NOT EXISTS format text DEFAULT 'round_robin',
ADD COLUMN IF NOT EXISTS scoring_format text DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS max_participants int DEFAULT 20,
ADD COLUMN IF NOT EXISTS min_elo int,
ADD COLUMN IF NOT EXISTS max_elo int,
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS auto_generate_fixtures boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS banner_url text;

-- Backfill format for existing leagues
UPDATE leagues SET format = 'round_robin' WHERE format IS NULL;

-- ── League invitations table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS league_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  invited_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(league_id, invited_user_id)
);

ALTER TABLE league_invitations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "league_invitations_view" ON league_invitations FOR SELECT TO authenticated
    USING (auth.uid() = invited_user_id OR auth.uid() = invited_by);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "league_invitations_insert" ON league_invitations FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = invited_by);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "league_invitations_update" ON league_invitations FOR UPDATE TO authenticated
    USING (auth.uid() = invited_user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
