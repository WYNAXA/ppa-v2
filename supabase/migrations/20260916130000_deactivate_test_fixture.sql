-- S3-G1: Bristol Padel Club (venue_id 22222222-...) is a test fixture at
-- "1 Test Lane, Bristol BS3 0AA". It was surfacing as OPEN because S3-F1
-- trusts court_availability_settings, and the fixture had a row there.
-- Set status to 'closed' (recoverable, FK references survive).
--
-- Applied in Supabase SQL Editor on 2026-09-16.

UPDATE padel_venues
SET status = 'closed'
WHERE venue_id = '22222222-2222-2222-2222-222222222222';
