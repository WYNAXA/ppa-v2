-- Reset all profiles to 1500 ELO baseline
-- (previous migration ×30 scaling caused some profiles to hit ceiling)
UPDATE profiles SET internal_ranking = 1500;

-- Mark all existing verified results as already processed
-- so process-elo does NOT reprocess historical matches
UPDATE match_results
SET elo_processed = true
WHERE verification_status = 'verified';
