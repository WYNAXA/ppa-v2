-- F1b: number_of_courts was NOT NULL with no default. 5,821 venues had 0
-- (meaning "unknown"), indistinguishable from "genuinely zero courts".
--
-- Zero contradictions: no venue with number_of_courts = 0 had any non-NULL
-- split data (indoor/outdoor/panoramic/etc.), confirming all 5,821 zeros
-- are "never entered."
--
-- Applied in Supabase SQL Editor on 2026-09-16.

ALTER TABLE padel_venues ALTER COLUMN number_of_courts DROP NOT NULL;

UPDATE padel_venues
SET number_of_courts = NULL
WHERE number_of_courts = 0;
