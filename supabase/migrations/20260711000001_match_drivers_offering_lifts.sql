-- ════════════════════════════════════════════════════════════════════════════
-- Add offering_lifts flag to match_drivers.
-- A match_drivers row = "driving" (making own way).
-- offering_lifts = true = "also offering a lift to passengers".
--
-- Run each block separately in the SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════


-- 1. Add the column
ALTER TABLE match_drivers
ADD COLUMN IF NOT EXISTS offering_lifts boolean NOT NULL DEFAULT false;


-- 2. Schema reload
NOTIFY pgrst, 'reload schema';
