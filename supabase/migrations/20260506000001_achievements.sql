-- ── Achievement system: league scope, peer voting, jerseys ───────────────────

-- Ensure player_achievements exists and has needed columns
CREATE TABLE IF NOT EXISTS player_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_type text NOT NULL,
  achievement_name text,
  achievement_description text,
  league_id uuid REFERENCES leagues(id) ON DELETE SET NULL,
  match_id uuid,
  count int NOT NULL DEFAULT 1,
  metadata jsonb DEFAULT '{}',
  awarded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE player_achievements ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "pa_select" ON player_achievements FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "pa_insert" ON player_achievements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "pa_update" ON player_achievements FOR UPDATE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Peer voting
CREATE TABLE IF NOT EXISTS match_peer_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  voter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  voted_for_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(match_id, voter_id, category)
);

ALTER TABLE match_peer_votes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "mpv_select" ON match_peer_votes FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "mpv_insert" ON match_peer_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = voter_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Jersey colours
ALTER TABLE league_jerseys
ADD COLUMN IF NOT EXISTS jersey_color text,
ADD COLUMN IF NOT EXISTS awarded_week date,
ADD COLUMN IF NOT EXISTS reason text;

-- Weekly jersey auto-award function
CREATE OR REPLACE FUNCTION award_weekly_jerseys() RETURNS void AS $$
DECLARE lr RECORD;
BEGIN
  FOR lr IN SELECT id FROM leagues WHERE status = 'active' LOOP
    -- Yellow: leader
    INSERT INTO league_jerseys (league_id, user_id, jersey_number, jersey_color, awarded_week, reason)
    SELECT lr.id, user_id, 1, 'yellow', CURRENT_DATE, 'League leader'
    FROM league_standings WHERE league_id = lr.id ORDER BY ranking_points DESC LIMIT 1
    ON CONFLICT (league_id, jersey_number) DO UPDATE SET user_id = EXCLUDED.user_id, jersey_color = 'yellow', awarded_week = CURRENT_DATE, reason = 'League leader';

    -- Black: wooden spoon
    INSERT INTO league_jerseys (league_id, user_id, jersey_number, jersey_color, awarded_week, reason)
    SELECT lr.id, user_id, 5, 'black', CURRENT_DATE, 'Bottom of standings'
    FROM league_standings WHERE league_id = lr.id AND matches_played > 0 ORDER BY ranking_points ASC LIMIT 1
    ON CONFLICT (league_id, jersey_number) DO UPDATE SET user_id = EXCLUDED.user_id, jersey_color = 'black', awarded_week = CURRENT_DATE, reason = 'Bottom of standings';
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
