-- ── ELO System Migration ─────────────────────────────────────────────────────
-- Migrate existing ratings from 0-100 to 0-3000 scale
UPDATE profiles
SET internal_ranking = GREATEST(0,
  LEAST(3000, ROUND(internal_ranking * 30)))
WHERE internal_ranking IS NOT NULL;

-- Add new columns to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS matches_played int DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_provisional boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS peak_elo int,
ADD COLUMN IF NOT EXISTS peak_elo_date date;

-- Update matches_played from existing data
UPDATE profiles p
SET matches_played = (
  SELECT COUNT(*) FROM match_results mr
  WHERE p.id = ANY(mr.team1_players)
     OR p.id = ANY(mr.team2_players)
);

-- Mark non-provisional (10+ matches)
UPDATE profiles
SET is_provisional = false
WHERE matches_played >= 10;

-- Create rating_history table
CREATE TABLE IF NOT EXISTS rating_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id)
    ON DELETE CASCADE,
  match_result_id uuid REFERENCES match_results(id)
    ON DELETE SET NULL,
  rating_before int NOT NULL,
  rating_after int NOT NULL,
  rating_change int NOT NULL,
  expected_score numeric(5,4) NOT NULL,
  actual_score numeric(5,4) NOT NULL,
  k_factor int NOT NULL,
  opponent_ids uuid[] NOT NULL,
  opponent_avg_rating int NOT NULL,
  is_provisional boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rating_history_user
ON rating_history(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rating_history_match
ON rating_history(match_result_id);

-- Ensure idempotency — one rating change per user per match result
CREATE UNIQUE INDEX IF NOT EXISTS idx_rating_history_unique
ON rating_history(user_id, match_result_id);

-- Add processed flag to match_results to prevent double-processing
ALTER TABLE match_results
ADD COLUMN IF NOT EXISTS elo_processed boolean DEFAULT false;
