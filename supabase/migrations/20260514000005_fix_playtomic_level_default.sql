-- Remove incorrect default of 1.5 on playtomic_level — should be NULL
-- so we can distinguish "not set" from "user said 1.5"
ALTER TABLE profiles
  ALTER COLUMN playtomic_level DROP DEFAULT;
