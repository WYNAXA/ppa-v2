-- Booking lifecycle: add 'held' and 'released' statuses for the pay-your-share model.
-- 'held'    = booker paid their share, slot blocked, awaiting other players / top-up.
-- 'released'= payment deadline passed unpaid and booker did not top up; slot reopens.
-- Existing statuses are preserved so no current rows are invalidated.

ALTER TABLE public.court_bookings
  DROP CONSTRAINT court_bookings_status_check;

ALTER TABLE public.court_bookings
  ADD CONSTRAINT court_bookings_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'payment_pending'::text,
    'held'::text,
    'confirmed'::text,
    'released'::text,
    'cancelled'::text,
    'completed'::text,
    'no_show'::text
  ]));

ALTER TABLE public.court_bookings
  ADD COLUMN IF NOT EXISTS booker_stripe_customer_id text;

DROP INDEX IF EXISTS idx_court_bookings_court_time;

CREATE INDEX idx_court_bookings_court_time
  ON public.court_bookings (court_id, start_at, end_at)
  WHERE status = ANY (ARRAY['payment_pending'::text, 'confirmed'::text, 'held'::text]);
