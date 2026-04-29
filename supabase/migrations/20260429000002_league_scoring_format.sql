-- Add scoring_format to leagues table
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS scoring_format text DEFAULT 'standard';
