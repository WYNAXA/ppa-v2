-- Phase 1b: deterministic backfill from provable anchors. No guessed values.
-- payment_state is ledger-aware: refunded only where booking_payments proves a refund.

-- Group 1 — Stripe PI + match => in-app game bookings.
UPDATE public.bookings
  SET source = 'in_app', purpose = 'game'
  WHERE booker_stripe_pi_id IS NOT NULL AND match_id IS NOT NULL;

-- Group 2 — no PI, no match => VM-created bookings. purpose from notes.
UPDATE public.bookings
  SET source = 'venue',
      purpose = CASE WHEN notes ILIKE '%coaching%' THEN 'coaching' ELSE 'other' END
  WHERE booker_stripe_pi_id IS NULL AND match_id IS NULL;

-- Owner: every row has booked_by (no venue-entered names in this set).
UPDATE public.bookings
  SET owner_user_id = booked_by
  WHERE booked_by IS NOT NULL AND owner_user_id IS NULL;

-- reservation_state from legacy status (unambiguous).
UPDATE public.bookings
  SET reservation_state = CASE
        WHEN status IN ('cancelled','released') THEN 'cancelled'
        WHEN status = 'completed' THEN 'completed'
        ELSE 'active'
      END;

-- payment_state (in_app only): ledger-aware for the cancelled refund/forfeit distinction.
UPDATE public.bookings b
  SET payment_state = CASE
        WHEN b.status = 'held' THEN 'held'
        WHEN b.status = 'released' THEN 'released'
        WHEN b.status IN ('confirmed','completed') THEN 'paid'
        WHEN b.status = 'cancelled'
             AND EXISTS (SELECT 1 FROM public.booking_payments bp
                         WHERE bp.booking_id = b.id AND bp.status = 'refunded')
          THEN 'refunded'
        WHEN b.status = 'cancelled'
             AND EXISTS (SELECT 1 FROM public.booking_payments bp
                         WHERE bp.booking_id = b.id AND bp.status = 'paid')
          THEN 'paid'
        ELSE NULL
      END
  WHERE b.source = 'in_app';
