-- Set default ELO to 1500 for new profiles
ALTER TABLE profiles
ALTER COLUMN internal_ranking SET DEFAULT 1500;

-- Fix any existing profiles with no ELO or wrong ELO
-- Only fix profiles that haven't had verified ELO-processed matches
UPDATE profiles p
SET internal_ranking = 1500
WHERE (internal_ranking IS NULL OR internal_ranking < 1400)
AND NOT EXISTS (
  SELECT 1 FROM match_results mr
  WHERE (mr.team1_players @> ARRAY[p.id]
    OR mr.team2_players @> ARRAY[p.id])
  AND mr.verification_status = 'verified'
  AND mr.elo_processed = true
);
