-- Add round_number to matches for round-robin scheduling.
-- Used by the round-robin generator to track which round each match belongs to
-- and to calculate which round to generate next.

ALTER TABLE matches ADD COLUMN IF NOT EXISTS round_number integer;
