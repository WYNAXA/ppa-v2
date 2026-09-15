-- F8a: timezone diagnostic is an operator signal, not a player push.
-- Fix class: root-cause. Remove the notifications INSERT for
-- booking_timezone_missing and use notify_platform_admins instead.
-- That function sends an email via ops-alert and explicitly never
-- writes to public.notifications.

CREATE OR REPLACE FUNCTION public.expire_stale_booking_claims()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_name  text;
  v_skip  record;
  v_skip_count integer := 0;
BEGIN
  -- Normal expiry path: timezone IS NOT NULL
  FOR v_match IN
    SELECT m.id, m.match_date, m.match_time, m.player_ids,
           m.booking_claimed_by, m.timezone
    FROM matches m
    WHERE m.booking_status = 'claimed'
      AND m.booking_claimed_by IS NOT NULL
      AND m.timezone IS NOT NULL
      AND ((m.match_date + m.match_time) AT TIME ZONE m.timezone)
          <= (now() + interval '24 hours')
      AND m.match_date >= current_date
  LOOP
    UPDATE matches SET
      booking_status     = 'not_booked',
      booking_claimed_by = NULL,
      booking_claimed_at = NULL,
      booking_handoff_venue_id = NULL,
      booking_handoff_at = NULL,
      updated_at         = now()
    WHERE id = v_match.id
      AND booking_status = 'claimed';

    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT coalesce(name, 'A player') INTO v_name
    FROM profiles WHERE id = v_match.booking_claimed_by;

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

  -- Skipped rows: timezone IS NULL, claimed, future.
  -- Operator signal only — never to public.notifications.
  SELECT count(*) INTO v_skip_count
  FROM matches
  WHERE booking_status = 'claimed'
    AND booking_claimed_by IS NOT NULL
    AND timezone IS NULL
    AND match_date >= current_date;

  IF v_skip_count > 0 THEN
    PERFORM public.notify_platform_admins(
      'booking_timezone_missing',
      v_skip_count || ' claimed match(es) have no timezone',
      v_skip_count || ' claimed future match(es) were skipped by expire_stale_booking_claims because timezone is NULL. Check matches with booking_status=''claimed'' AND timezone IS NULL.'
    );
    RAISE WARNING '[expire_stale_booking_claims] % claimed match(es) have NULL timezone, skipped', v_skip_count;
  END IF;
END;
$$;
