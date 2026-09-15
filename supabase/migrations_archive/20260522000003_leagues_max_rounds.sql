-- Add max_rounds to leagues for round-robin season length tracking.
-- NULL means unlimited rounds (backwards compatible with existing leagues).
-- For round-robin: default is N-1 (even teams) or N (odd teams, one bye per round).

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS max_rounds integer;
