-- ════════════════════════════════════════════════════════════════════════════
-- Add availability_ranges to poll_responses for range-based availability.
--
-- CONTRACT: availability_ranges jsonb =
--   { "yyyy-MM-dd": [ {"start":"HH:MM","end":"HH:MM"}, ... ], ... }
--
-- Nullable — legacy polls use selected_slots; new polls use availability_ranges.
-- Run each block separately in the SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════


-- 1. Add the column
ALTER TABLE poll_responses
ADD COLUMN IF NOT EXISTS availability_ranges jsonb;


-- 2. Add poll_dates to polls (the date list for range-model polls)
ALTER TABLE polls
ADD COLUMN IF NOT EXISTS poll_dates text[];


-- 3. Schema reload
NOTIFY pgrst, 'reload schema';
