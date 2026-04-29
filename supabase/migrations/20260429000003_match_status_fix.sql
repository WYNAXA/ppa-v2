-- Expand matches.status constraint to include additional valid values
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE matches ADD CONSTRAINT matches_status_check
CHECK (status IN ('pending', 'scheduled', 'confirmed', 'open', 'completed', 'cancelled', 'suggested'));
