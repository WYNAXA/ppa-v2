-- ════════════════════════════════════════════════════════════════════════════
-- Add max_matches to poll_responses for matches-wanted cap.
--
-- Semantics: 1 = one match max, 2 = two max, NULL = capped at distinct
-- available days (can't exceed days voted; same-day multiple only if
-- can_play_twice). The ILP uses this as a hard constraint.
--
-- Run each block separately in the SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════


-- 1. Add the column
ALTER TABLE poll_responses
ADD COLUMN IF NOT EXISTS max_matches int;


-- 2. Schema reload
NOTIFY pgrst, 'reload schema';
