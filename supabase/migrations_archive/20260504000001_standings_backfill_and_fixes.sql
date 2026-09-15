-- Backfill league_standings for any league_members that don't have a standings row
INSERT INTO league_standings (
  league_id, user_id, wins, losses,
  draws, matches_played, ranking_points, category
)
SELECT DISTINCT lm.league_id, lm.user_id,
  0, 0, 0, 0, 0, 'overall'
FROM league_members lm
WHERE lm.status = 'active'
AND NOT EXISTS (
  SELECT 1 FROM league_standings ls
  WHERE ls.league_id = lm.league_id
  AND ls.user_id = lm.user_id
);
