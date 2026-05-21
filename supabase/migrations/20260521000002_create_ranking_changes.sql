-- Create ranking_changes table
-- Stores per-player ELO deltas written by process-elo edge function.
-- Queried by Home (7-day trend) and Compete (30-day trend) pages.

CREATE TABLE IF NOT EXISTS ranking_changes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  match_result_id uuid NOT NULL REFERENCES match_results(id) ON DELETE CASCADE,
  points_change integer NOT NULL DEFAULT 0,
  old_ranking   integer NOT NULL DEFAULT 0,
  new_ranking   integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for the two frontend queries: player_id + created_at range
CREATE INDEX IF NOT EXISTS idx_ranking_changes_player_created
  ON ranking_changes (player_id, created_at DESC);

-- Unique constraint: one entry per player per match result (idempotency)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ranking_changes_player_result
  ON ranking_changes (player_id, match_result_id);

-- RLS
ALTER TABLE ranking_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own ranking changes"
  ON ranking_changes FOR SELECT
  USING (player_id = auth.uid());

CREATE POLICY "Service role can insert ranking changes"
  ON ranking_changes FOR INSERT
  WITH CHECK (true);
