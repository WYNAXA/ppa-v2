-- H2: Close remaining test venues that are polluting the claimed-venue set.
--
--   Preggio Padel (Preggio, Italy) — matches Christian's test claim email
--   Roshni's Padel Venue (Surat, India) — no courts, generic address
--
-- Applied in Supabase SQL Editor on 2026-09-16.

UPDATE padel_venues SET status = 'closed'
WHERE venue_id IN (
  '8dc11b51-13cc-453e-849e-5715e8a4a2ef',  -- Preggio Padel
  '2fb324a7-9255-4d54-b044-aa9c582b0da6'   -- Roshni's Padel Venue
);
