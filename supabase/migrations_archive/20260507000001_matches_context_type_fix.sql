-- Fix matches context_type constraint to include 'poll'
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_context_type_check;

-- Allow all context types used by the app
ALTER TABLE matches
ADD CONSTRAINT matches_context_type_check
CHECK (context_type IN (
  'league', 'group', 'poll', 'casual', 'open',
  'friendly', 'competitive', 'practice'
) OR context_type IS NULL);
