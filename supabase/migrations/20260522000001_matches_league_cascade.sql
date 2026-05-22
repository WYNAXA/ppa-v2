-- Change matches.league_id FK from ON DELETE NO ACTION to ON DELETE CASCADE
-- so deleting a league removes all its matches automatically.

ALTER TABLE matches
  DROP CONSTRAINT IF EXISTS matches_league_id_fkey;

ALTER TABLE matches
  ADD CONSTRAINT matches_league_id_fkey
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE;
