-- Phase 2a: derive reservation_state + payment_state from status on every write, so
-- all existing writers (which set status, via the compat view) keep the new axes
-- correct with zero code changes. status is authoritative during Phase 2; this trigger
-- retires in Phase 2b when writers set the axes natively.

CREATE OR REPLACE FUNCTION public.sync_booking_axes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_in_app boolean;
BEGIN
  -- Only derive from status when status is the driver: INSERT, or an UPDATE that
  -- actually changed status. This lets future axes-native writers set the axes
  -- directly without this trigger reverting them.
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- reservation_state: does this booking occupy the slot? (availability reads this)
  NEW.reservation_state := CASE
    WHEN NEW.status IN ('cancelled','released') THEN 'cancelled'
    WHEN NEW.status IN ('completed','no_show')  THEN 'completed'
    ELSE 'active'
  END;

  -- in-app if explicitly tagged, or (pre-migration) a Stripe PI is present.
  v_in_app := (NEW.source = 'in_app')
              OR (NEW.source IS NULL AND NEW.booker_stripe_pi_id IS NOT NULL);

  IF NOT v_in_app THEN
    NEW.payment_state := NULL;
  ELSE
    NEW.payment_state := CASE
      WHEN NEW.status IN ('held','payment_pending')  THEN 'held'
      WHEN NEW.status IN ('confirmed','completed')    THEN 'paid'
      WHEN NEW.status = 'released'                     THEN 'released'
      WHEN NEW.status = 'cancelled' THEN (
        CASE
          WHEN EXISTS (SELECT 1 FROM booking_payments bp
                       WHERE bp.booking_id = NEW.id AND bp.status = 'refunded') THEN 'refunded'
          WHEN EXISTS (SELECT 1 FROM booking_payments bp
                       WHERE bp.booking_id = NEW.id AND bp.status = 'paid')     THEN 'paid'
          ELSE NULL
        END
      )
      ELSE NULL
    END;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_booking_axes ON public.bookings;
CREATE TRIGGER trg_sync_booking_axes
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_booking_axes();
