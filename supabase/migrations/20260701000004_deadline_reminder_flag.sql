-- Tracks whether the booker has been nudged to top up after the payment deadline.
-- Prevents the deadline processor (runs every ~15 min) from re-notifying each pass.

ALTER TABLE public.court_bookings
  ADD COLUMN IF NOT EXISTS deadline_reminder_sent boolean NOT NULL DEFAULT false;
