-- Lower default ELO from 1500 to 1300 for new profiles.
-- 1300 matches the active user median (~Playtomic 1.96, improving beginner).
-- Existing profiles are NOT modified.

ALTER TABLE profiles
ALTER COLUMN internal_ranking SET DEFAULT 1300;
