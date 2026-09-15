-- E1: Restore damaged match, tighten CHECK, backfill booked_at.
-- Fix class: root-cause for E1a (data restore), root-cause for E1c (bidirectional CHECK).

-- ── E1a: 6b25bb1f already restored in a prior statement. Verify. ────────────
-- No action needed — restored above this migration via db query.

-- ── E1c: Backfill booked_at on 29 pre-self_report_booking matches ───────────
-- These are genuine bookings from March–May 2026 set by old deleted code.
-- updated_at is the closest proxy for when the booking was recorded.

UPDATE matches
SET booked_at = updated_at
WHERE booking_status = 'booked'
  AND booked_at IS NULL
  AND booked_by IS NOT NULL;

-- ── E1c: Tighten the consistency CHECK — both directions ────────────────────
-- Direction 1: non-booked → no booked_* fields (already enforced)
-- Direction 2: booked → REQUIRES venue name, booker, and time
-- Court number, reference and cost stay optional.

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_booking_fields_consistency;

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
    -- Direction 2: booked matches have the three required facts
    (booking_status <> 'booked'
     OR (booked_venue_name IS NOT NULL
         AND booked_by IS NOT NULL
         AND booked_at IS NOT NULL))
  );
