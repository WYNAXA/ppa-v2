-- D3: Consistency trigger must REJECT not delete; booking_status CHECK;
-- search_path; cost path verification.
-- Fix class: root-cause for D3a (reject), display patch for D3c (search_path).

-- ── D3a: enforce_booking_fields_consistency — RAISE, not NULL ───────────────
-- A guard that silently deletes is worse than no guard. A wrong write should
-- fail loudly at the call site, not succeed quietly with the data gone.
-- No un-book flow exists today: confirmed by grep. If one is added, it
-- clears booked_* fields EXPLICITLY in its own statement.

CREATE OR REPLACE FUNCTION public.enforce_booking_fields_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public  -- D3c: was missing
AS $$
BEGIN
  IF NEW.booking_status <> 'booked' THEN
    IF NEW.booked_venue_name IS NOT NULL THEN
      RAISE EXCEPTION 'matches[%]: booked_venue_name must be NULL when booking_status=%, found "%"',
        NEW.id, NEW.booking_status, NEW.booked_venue_name;
    END IF;
    IF NEW.booked_court_number IS NOT NULL THEN
      RAISE EXCEPTION 'matches[%]: booked_court_number must be NULL when booking_status=%, found %',
        NEW.id, NEW.booking_status, NEW.booked_court_number;
    END IF;
    IF NEW.booking_reference IS NOT NULL THEN
      RAISE EXCEPTION 'matches[%]: booking_reference must be NULL when booking_status=%',
        NEW.id, NEW.booking_status;
    END IF;
    IF NEW.booked_by IS NOT NULL THEN
      RAISE EXCEPTION 'matches[%]: booked_by must be NULL when booking_status=%',
        NEW.id, NEW.booking_status;
    END IF;
    IF NEW.booked_at IS NOT NULL THEN
      RAISE EXCEPTION 'matches[%]: booked_at must be NULL when booking_status=%',
        NEW.id, NEW.booking_status;
    END IF;
    IF NEW.booking_total_cost_pence IS NOT NULL THEN
      RAISE EXCEPTION 'matches[%]: booking_total_cost_pence must be NULL when booking_status=%',
        NEW.id, NEW.booking_status;
    END IF;
    IF NEW.booking_per_player_pence IS NOT NULL THEN
      RAISE EXCEPTION 'matches[%]: booking_per_player_pence must be NULL when booking_status=%',
        NEW.id, NEW.booking_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- D3b: booking_status CHECK already exists (matches_booking_status_check).
-- Values: not_booked, claimed, booked, booked_with_changes.
-- Grepped DB: not_booked (expire, release), claimed (claim, expire), booked (self_report, claim guard, BookCourt).
-- Grepped client: booked (BookCourt x2).
-- booked_with_changes is unused (0 rows) but in the constraint from the original schema.
-- Leave it — removing a CHECK value is a breaking change with no benefit.
-- No additional constraint needed.
