-- Add admin columns to groups table
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS banner_url    text,
  ADD COLUMN IF NOT EXISTS rules         text,
  ADD COLUMN IF NOT EXISTS max_members   int,
  ADD COLUMN IF NOT EXISTS auto_approve  boolean DEFAULT false;

-- Backfill league_standings for any existing league_members without standings
INSERT INTO league_standings (league_id, user_id, wins, losses, draws, matches_played, ranking_points, category)
SELECT DISTINCT lm.league_id, lm.user_id, 0, 0, 0, 0, 0, 'overall'
FROM league_members lm
WHERE NOT EXISTS (
  SELECT 1 FROM league_standings ls
  WHERE ls.league_id = lm.league_id
  AND ls.user_id = lm.user_id
  AND ls.category = 'overall'
);
