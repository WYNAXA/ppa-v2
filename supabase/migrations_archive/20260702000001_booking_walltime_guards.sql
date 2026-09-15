-- Guard 1 (hygiene, all rows): court_bookings start_at/end_at are whole-minute
-- wall-clock. Reject any sub-minute precision — the signature of a Date.toISOString()
-- writer leaking milliseconds/seconds into a stored slot time.
ALTER TABLE public.court_bookings
  ADD CONSTRAINT court_bookings_walltime_whole_minute
  CHECK (
    EXTRACT(SECOND FROM start_at) = 0
    AND EXTRACT(SECOND FROM end_at) = 0
  );
