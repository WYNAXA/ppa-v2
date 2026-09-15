-- BUG 3: Unique constraint for poll response upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_responses_unique
ON poll_responses(poll_id, user_id);

-- BUG 3: RLS update policy for poll_responses
DO $$ BEGIN
  CREATE POLICY "Users can update own poll responses"
    ON poll_responses FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- BUG 4: RLS select policy for league_standings
DO $$ BEGIN
  CREATE POLICY "Anyone can view standings"
    ON league_standings FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- BUG 4: Backfill standings for members without them
INSERT INTO league_standings (
  league_id, user_id, wins, losses,
  draws, matches_played, ranking_points, category
)
SELECT DISTINCT
  lm.league_id, lm.user_id,
  0, 0, 0, 0, 0, 'overall'
FROM league_members lm
LEFT JOIN league_standings ls
  ON ls.league_id = lm.league_id AND ls.user_id = lm.user_id
WHERE ls.id IS NULL
AND lm.status = 'active';

-- BUG 5: RLS insert policy for leagues
DO $$ BEGIN
  CREATE POLICY "Authenticated can create leagues"
    ON leagues FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = created_by);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tournament fields on leagues
ALTER TABLE leagues
ADD COLUMN IF NOT EXISTS tournament_start timestamptz,
ADD COLUMN IF NOT EXISTS tournament_end timestamptz,
ADD COLUMN IF NOT EXISTS courts_available int DEFAULT 1,
ADD COLUMN IF NOT EXISTS match_duration_mins int DEFAULT 90,
ADD COLUMN IF NOT EXISTS break_duration_mins int DEFAULT 10;

-- Event improvements
ALTER TABLE events
ADD COLUMN IF NOT EXISTS is_ticketed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ticket_price_pence int DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_capacity int,
ADD COLUMN IF NOT EXISTS image_url text,
ADD COLUMN IF NOT EXISTS external_link text;

-- event_attendees ticket fields (create table if needed)
DO $$ BEGIN
  ALTER TABLE event_attendees
  ADD COLUMN IF NOT EXISTS ticket_code text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_pi_id text;
EXCEPTION WHEN undefined_table THEN
  CREATE TABLE event_attendees (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL,
    user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'going',
    ticket_code text,
    paid_at timestamptz,
    stripe_pi_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(event_id, user_id)
  );
  ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "event_attendees_read" ON event_attendees FOR SELECT USING (true);
  CREATE POLICY "event_attendees_write" ON event_attendees FOR ALL USING (auth.uid() = user_id);
END $$;
