-- ════════════════════════════════════════════════════════════════════════════
-- Add window_start / window_end to matches for range-poll bookable windows.
--
-- CONTRACT: for range-poll matches, window_start/window_end define the
-- maximal contiguous window the 4 chosen players share. Legacy slot matches
-- keep these NULL. match_time = window_start (working default).
--
-- Run each block separately in the SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════


-- 1. Add the columns
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS window_start time,
ADD COLUMN IF NOT EXISTS window_end   time;


-- 2. Schema reload
NOTIFY pgrst, 'reload schema';
