-- §3.3 claim expiry: a claim inside 24 hours of the game is released.
--
-- A silent claim that never becomes a booking is worse than no claim, because
-- everyone stopped worrying about it. This function runs hourly and releases
-- any claim on a match that starts within 24 hours.

-- ── expire_stale_booking_claims ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.expire_stale_booking_claims()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_name  text;
BEGIN
  FOR v_match IN
    SELECT m.id, m.match_date, m.match_time, m.player_ids,
           m.booking_claimed_by
    FROM matches m
    WHERE m.booking_status = 'claimed'
      AND m.booking_claimed_by IS NOT NULL
      AND (m.match_date + m.match_time) <= (now() + interval '24 hours')
      AND m.match_date >= current_date  -- don't touch past matches
  LOOP
    -- Release the claim
    UPDATE matches SET
      booking_status     = 'not_booked',
      booking_claimed_by = NULL,
      booking_claimed_at = NULL,
      updated_at         = now()
    WHERE id = v_match.id
      AND booking_status = 'claimed';  -- guard against race

    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT coalesce(name, 'A player') INTO v_name
    FROM profiles WHERE id = v_match.booking_claimed_by;

    -- Notify every player, including the former claimant
    INSERT INTO notifications (user_id, type, title, message, related_id)
    SELECT
      unnest(v_match.player_ids),
      'booking_claim_expired',
      'Court still needed',
      v_name || '''s claim expired for ' ||
        trim(to_char(v_match.match_date, 'Day')) || ' ' ||
        to_char(v_match.match_time, 'HH24:MI') ||
        '. Someone needs to book.',
      v_match.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_booking_claims() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_booking_claims() TO service_role;

-- ── Cron: hourly, unschedule-then-schedule for rebuild safety ───────────────

SELECT cron.unschedule('expire-stale-booking-claims')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-booking-claims');

SELECT cron.schedule(
  'expire-stale-booking-claims',
  '15 * * * *',
  $$SELECT public.expire_stale_booking_claims()$$
);

-- ── Add booking_claim_expired to wants_push and nav_url routing ─────────────
-- wants_push already routes booking_% to booking_reminders (added in the
-- previous migration). booking_claim_expired matches that pattern.
--
-- compute_notification_nav_url needs the explicit case alongside the three
-- types already added.

CREATE OR REPLACE FUNCTION public.compute_notification_nav_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.nav_url := CASE
    WHEN NEW.type LIKE 'open_match_%'
      THEN '/matches/' || COALESCE(NEW.related_id::text, '')

    WHEN NEW.type IN ('connection_request', 'connection_accepted')
      THEN '/community#connections'

    WHEN NEW.type = 'achievement' THEN '/you'
    WHEN NEW.type LIKE 'household_%' THEN '/you'

    WHEN NEW.type = 'court_booked'
      OR NEW.type = 'booking_claimed'
      OR NEW.type = 'booking_claim_released'
      OR NEW.type = 'booking_claim_expired'
      OR NEW.type = 'booking_window_open'
      THEN '/matches/' || COALESCE(NEW.related_id::text, '')

    WHEN NEW.type = 'booking_payment_due'
      THEN '/pay/booking/' || COALESCE(NEW.related_id::text, '') ||
           '/player/' || COALESCE(NEW.user_id::text, '')

    WHEN NEW.type LIKE '%match%'  THEN '/matches/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE '%league%' THEN '/compete/leagues/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE '%group%'  THEN '/community/groups/' || COALESCE(NEW.related_id::text, '')
    WHEN NEW.type LIKE '%poll%'   THEN '/play/availability/' || COALESCE(NEW.related_id::text, '')

    ELSE '/notifications'
  END;

  RETURN NEW;
END;
$$;
