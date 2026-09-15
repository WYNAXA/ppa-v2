-- Payment deadline is venue-configurable. Default 72h before match:
-- by this point all shares should be paid, else the booker is prompted to top up.
-- The cancellation cutoff already lives in cancellation_notice_hours.

ALTER TABLE public.court_availability_settings
  ADD COLUMN IF NOT EXISTS payment_deadline_hours integer NOT NULL DEFAULT 72;

ALTER TABLE public.court_availability_settings
  ADD CONSTRAINT court_availability_settings_payment_deadline_hours_check
  CHECK (payment_deadline_hours > 0);

-- Set The Padel Team (test venue) cutoff to the model's 48h.
UPDATE public.court_availability_settings
  SET cancellation_notice_hours = 48
  WHERE venue_id = '237aa440-7f1a-40ea-95b2-5296fbe01a40';
