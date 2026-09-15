-- Add explicit team pairing columns to matches.
-- NULL means: use the default pairing (player_ids[0..1] vs player_ids[2..3]).
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS team1_player_ids uuid[],
  ADD COLUMN IF NOT EXISTS team2_player_ids uuid[];
