-- Fix match_type constraint to allow 'competitive'
ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_match_type_check;

ALTER TABLE leagues
ADD CONSTRAINT leagues_match_type_check
CHECK (match_type IN (
  'competitive','friendly','casual',
  'practice','social','pairs','individual','tournament',
  'mexicano','round_robin','knockout','americano'
) OR match_type IS NULL);

-- Fix scoring_format constraint
ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_scoring_format_check;

ALTER TABLE leagues
ADD CONSTRAINT leagues_scoring_format_check
CHECK (scoring_format IN (
  'standard','short_sets','one_set','custom'
) OR scoring_format IS NULL);

-- Fix format constraint
ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_format_check;

ALTER TABLE leagues
ADD CONSTRAINT leagues_format_check
CHECK (format IN (
  'round_robin','knockout','americano',
  'mexicano','king_of_hill','compass_draw',
  'box_league','flex_league'
) OR format IS NULL);
