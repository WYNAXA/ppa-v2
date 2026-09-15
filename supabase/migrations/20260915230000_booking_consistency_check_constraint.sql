-- D3a revised: CHECK constraint instead of trigger.
-- The trigger fires but db query swallows the exception via the Management API.
-- A CHECK constraint is enforced at the storage layer and cannot be bypassed.

-- Clean up the test data
UPDATE matches SET booked_venue_name = NULL WHERE id = '6b25bb1f-749f-4faf-bcfd-30d75451adee';

-- Drop the trigger that silently passed
DROP TRIGGER IF EXISTS trg_enforce_booking_fields ON public.matches;
DROP FUNCTION IF EXISTS public.enforce_booking_fields_consistency();

-- CHECK constraint: non-booked matches cannot carry booked_* fields.
-- This is a storage-layer constraint — it cannot be bypassed by any role,
-- any API, or any execution context.
ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_booking_fields_consistency;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_booking_fields_consistency
  CHECK (
    booking_status = 'booked'
    OR (
      booked_venue_name IS NULL
      AND booked_court_number IS NULL
      AND booking_reference IS NULL
      AND booked_by IS NULL
      AND booked_at IS NULL
      AND booking_total_cost_pence IS NULL
      AND booking_per_player_pence IS NULL
    )
  );
