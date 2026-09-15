-- E2: Undo fabricated timestamps, relax CHECK to what can be known truthfully.
-- Fix class: root-cause for E2a (wrong data removed), root-cause for E2b (constraint
-- matches reality).

-- ── E2a: Set the 29 fabricated booked_at values back to NULL ────────────────
-- booked_at was backfilled from updated_at, which is when the row was last
-- touched, not when a court was booked. An empty field is honest; a wrong one
-- is not.

-- Drop the old CHECK first so the UPDATE doesn't violate it
ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_booking_fields_consistency;

UPDATE matches
SET booked_at = NULL
WHERE booking_status = 'booked'
  AND booked_at IS NOT NULL
  AND booked_at::date > match_date;

-- ── E2b: Relax Direction 2 — booked_at is optional ─────────────────────────
-- Venue and booker are facts we have for every booked match. The timestamp
-- only exists for bookings made through a path that recorded it (self_report_
-- booking, BookCourt tier-1). Historical rows (March–May 2026) were booked by
-- deleted code that never set booked_at. Demanding it produced an invention.
-- Going forward, every new booking sets booked_at. Historical rows stay NULL.

ALTER TABLE public.matches
  ADD CONSTRAINT matches_booking_fields_consistency
  CHECK (
    -- Direction 1: non-booked matches have no booked_* fields
    (booking_status = 'booked'
     OR (booked_venue_name IS NULL
         AND booked_court_number IS NULL
         AND booking_reference IS NULL
         AND booked_by IS NULL
         AND booked_at IS NULL
         AND booking_total_cost_pence IS NULL
         AND booking_per_player_pence IS NULL))
    AND
    -- Direction 2: booked matches have venue and booker.
    -- booked_at is optional: recorded going forward, never captured for
    -- historical rows.
    (booking_status <> 'booked'
     OR (booked_venue_name IS NOT NULL
         AND booked_by IS NOT NULL))
  );
