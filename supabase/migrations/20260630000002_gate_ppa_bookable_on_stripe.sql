-- A venue may only be ppa_bookable (take in-app bookings/payments) when it has a
-- Stripe Connect account with charges_enabled. This trigger is the durable
-- safety net: even a direct API write can't set ppa_bookable=true without Stripe.
-- It silently forces ppa_bookable=false rather than raising, so editing other
-- fields pre-Stripe still succeeds; the manager UI disables the toggle and explains.
CREATE OR REPLACE FUNCTION public.enforce_ppa_bookable_requires_stripe()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ppa_bookable IS TRUE THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.venue_stripe_accounts vsa
      WHERE vsa.venue_id = NEW.venues_id
        AND vsa.charges_enabled = true
    ) THEN
      NEW.ppa_bookable := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ppa_bookable_requires_stripe
  BEFORE INSERT OR UPDATE ON public.padel_venues
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ppa_bookable_requires_stripe();
