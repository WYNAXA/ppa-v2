-- ── Fix league constraints that block creation ───────────────────────────────

-- Drop any CHECK constraints on format/scoring_format that may reject values
DO $$
DECLARE
  con_name text;
BEGIN
  FOR con_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'leagues'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%format%'
  LOOP
    EXECUTE format('ALTER TABLE leagues DROP CONSTRAINT IF EXISTS %I', con_name);
  END LOOP;
END $$;

-- Also drop any check on scoring_format
DO $$
DECLARE
  con_name text;
BEGIN
  FOR con_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'leagues'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%scoring%'
  LOOP
    EXECUTE format('ALTER TABLE leagues DROP CONSTRAINT IF EXISTS %I', con_name);
  END LOOP;
END $$;

-- Ensure visibility accepts our values (drop old constraint)
DO $$
DECLARE
  con_name text;
BEGIN
  FOR con_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'leagues'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%visibility%'
  LOOP
    EXECUTE format('ALTER TABLE leagues DROP CONSTRAINT IF EXISTS %I', con_name);
  END LOOP;
END $$;

-- Ensure season_start and season_end are date-compatible (text or date)
-- They should already be date/timestamptz from the original schema

-- ── League standings RPC functions ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_league_standings_win(
  p_league_id uuid,
  p_winner_ids uuid[],
  p_loser_ids uuid[]
) RETURNS void AS $$
BEGIN
  UPDATE league_standings
  SET wins = wins + 1,
      matches_played = COALESCE(matches_played, 0) + 1,
      ranking_points = COALESCE(ranking_points, 0) + 3
  WHERE league_id = p_league_id
  AND user_id = ANY(p_winner_ids);

  UPDATE league_standings
  SET losses = losses + 1,
      matches_played = COALESCE(matches_played, 0) + 1
  WHERE league_id = p_league_id
  AND user_id = ANY(p_loser_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_league_standings_draw(
  p_league_id uuid,
  p_player_ids uuid[]
) RETURNS void AS $$
BEGIN
  UPDATE league_standings
  SET draws = draws + 1,
      matches_played = COALESCE(matches_played, 0) + 1,
      ranking_points = COALESCE(ranking_points, 0) + 1
  WHERE league_id = p_league_id
  AND user_id = ANY(p_player_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Reset and recalculate all standings from verified results ─────────────────

-- Reset all standings to zero
UPDATE league_standings
SET wins = 0, losses = 0, draws = 0,
    matches_played = 0, ranking_points = 0;

-- Recalculate from match_results
DO $$
DECLARE
  r RECORD;
  v_league_id uuid;
BEGIN
  FOR r IN
    SELECT mr.match_id, mr.result_type, mr.team1_players, mr.team2_players,
           m.league_id
    FROM match_results mr
    JOIN matches m ON m.id = mr.match_id
    WHERE m.league_id IS NOT NULL
    AND mr.verification_status IN ('verified', 'pending')
  LOOP
    v_league_id := r.league_id;
    IF v_league_id IS NULL THEN CONTINUE; END IF;

    IF r.result_type = 'team1_win' THEN
      UPDATE league_standings
      SET wins = wins + 1, matches_played = matches_played + 1, ranking_points = ranking_points + 3
      WHERE league_id = v_league_id AND user_id = ANY(r.team1_players);

      UPDATE league_standings
      SET losses = losses + 1, matches_played = matches_played + 1
      WHERE league_id = v_league_id AND user_id = ANY(r.team2_players);

    ELSIF r.result_type = 'team2_win' THEN
      UPDATE league_standings
      SET wins = wins + 1, matches_played = matches_played + 1, ranking_points = ranking_points + 3
      WHERE league_id = v_league_id AND user_id = ANY(r.team2_players);

      UPDATE league_standings
      SET losses = losses + 1, matches_played = matches_played + 1
      WHERE league_id = v_league_id AND user_id = ANY(r.team1_players);

    ELSIF r.result_type = 'draw' THEN
      UPDATE league_standings
      SET draws = draws + 1, matches_played = matches_played + 1, ranking_points = ranking_points + 1
      WHERE league_id = v_league_id AND user_id = ANY(r.team1_players || r.team2_players);
    END IF;
  END LOOP;
END $$;
