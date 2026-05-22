-- ── league_teams: fixed pairs for pairs-format leagues ──────────────────────

CREATE TABLE IF NOT EXISTS league_teams (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  player1_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  player2_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_name       text,
  created_at      timestamptz DEFAULT now(),
  CHECK (player1_id < player2_id),
  UNIQUE (league_id, player1_id),
  UNIQUE (league_id, player2_id)
);

ALTER TABLE league_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read teams in their leagues"
  ON league_teams FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM league_members WHERE league_id = league_teams.league_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM leagues WHERE id = league_teams.league_id AND created_by = auth.uid())
  );

CREATE POLICY "League admin can manage teams"
  ON league_teams FOR ALL
  USING (EXISTS (SELECT 1 FROM leagues WHERE id = league_teams.league_id AND created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM leagues WHERE id = league_teams.league_id AND created_by = auth.uid()));

-- ── matches: optional team references for pairs leagues ─────────────────────

ALTER TABLE matches ADD COLUMN IF NOT EXISTS team1_id uuid REFERENCES league_teams(id) ON DELETE SET NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS team2_id uuid REFERENCES league_teams(id) ON DELETE SET NULL;

-- ── league_team_standings: read-time view using player1's stats ──────────────
-- Both pair members play every match together, so their individual stats
-- (matches_played, wins, losses, draws, ranking_points) are identical.
-- We use player1's row only to avoid double-counting.
-- Game difference calculated from match_results.sets_data for tie-breaking.

CREATE OR REPLACE VIEW league_team_standings AS
SELECT
  t.id              AS team_id,
  t.league_id,
  t.team_name,
  t.player1_id,
  t.player2_id,
  COALESCE(s1.wins, 0)             AS wins,
  COALESCE(s1.losses, 0)           AS losses,
  COALESCE(s1.draws, 0)            AS draws,
  COALESCE(s1.matches_played, 0)   AS matches_played,
  COALESCE(s1.ranking_points, 0)   AS ranking_points,
  COALESCE(gd.games_won, 0)       AS games_won,
  COALESCE(gd.games_lost, 0)      AS games_lost,
  COALESCE(gd.games_won, 0) - COALESCE(gd.games_lost, 0) AS game_difference
FROM league_teams t
LEFT JOIN league_standings s1 ON s1.league_id = t.league_id AND s1.user_id = t.player1_id
LEFT JOIN LATERAL (
  SELECT
    SUM(CASE
      WHEN mr.team1_players @> ARRAY[t.player1_id] THEN (s.val->>'team1')::int
      ELSE (s.val->>'team2')::int
    END) AS games_won,
    SUM(CASE
      WHEN mr.team1_players @> ARRAY[t.player1_id] THEN (s.val->>'team2')::int
      ELSE (s.val->>'team1')::int
    END) AS games_lost
  FROM match_results mr
  CROSS JOIN LATERAL jsonb_array_elements(mr.sets_data) AS s(val)
  JOIN matches m ON m.id = mr.match_id AND m.league_id = t.league_id
  WHERE mr.verification_status = 'verified'
    AND (mr.team1_players @> ARRAY[t.player1_id] OR mr.team2_players @> ARRAY[t.player1_id])
) gd ON true;
