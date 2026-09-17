-- S4: Booking push notifications — preference split + two new notifications.
-- Applied in Supabase SQL Editor on 2026-09-17.
--
-- S4-A: Split booking_reminders into booking_reminders (GAME) and
-- booking_payments (MONEY). 10 types explicitly mapped, no LIKE catch-all.
-- S4-C #1: notify_unbooked_matches — fires once per unbooked unclaimed game.
-- S4-C #3: notify_booking_window_open — fires for the claimant when the
-- booking window opens (tier 1: venue's release_days/time, tier 2/3: 7 days
-- before at 08:00 local via matches.timezone).

-- ── Schema changes ──────────────────────────────────────────────────────────

ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS booking_payments boolean NOT NULL DEFAULT true;
UPDATE notification_preferences SET booking_payments = booking_reminders;

ALTER TABLE padel_venues ADD COLUMN IF NOT EXISTS booking_release_days integer;
ALTER TABLE padel_venues ADD COLUMN IF NOT EXISTS booking_release_time time;

ALTER TABLE matches ADD COLUMN IF NOT EXISTS booking_needs_court_notified boolean NOT NULL DEFAULT false;

-- ── wants_push: explicit type-to-key mapping ────────────────────────────────

CREATE OR REPLACE FUNCTION public.wants_push(p_user_id uuid, p_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(NOT (SELECT p.push_opted_out FROM profiles p WHERE p.id = p_user_id), true)
    AND
    coalesce(
      (
        SELECT CASE
          WHEN p_type IN ('court_booked', 'booking_claimed', 'booking_claim_expired',
                          'booking_claim_taken_over', 'booking_window_open',
                          'booking_needs_court', 'booking_confirmed')
            THEN np.booking_reminders
          WHEN p_type IN ('booking_released', 'booking_payment_due', 'booking_topup_reminder')
            THEN np.booking_payments
          WHEN p_type LIKE 'open_match%'                                   THEN np.open_matches
          WHEN p_type LIKE 'poll_%'                                        THEN np.poll_reminders
          WHEN p_type LIKE 'connection_%'                                  THEN np.connection_requests
          WHEN p_type LIKE 'chat_%' OR p_type LIKE '%message%'             THEN np.chat_notifications
          WHEN p_type LIKE 'result_%' OR p_type LIKE 'match_result%'       THEN np.match_results
          WHEN p_type LIKE 'match_reminder%' OR p_type LIKE 'match_deadline%' THEN np.match_reminders
          ELSE true
        END
        FROM notification_preferences np
        WHERE np.user_id = p_user_id
      ),
      true
    );
$$;

-- ── Notification #1: unbooked unclaimed → all players, once per game ────────

CREATE OR REPLACE FUNCTION public.notify_unbooked_matches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  v_day text;
  v_time text;
  v_player_id uuid;
BEGIN
  FOR rec IN
    SELECT m.id, m.match_date, m.match_time, m.player_ids, m.timezone
    FROM matches m
    WHERE m.match_date >= current_date
      AND coalesce(m.booking_status, 'not_booked') = 'not_booked'
      AND m.booking_claimed_by IS NULL
      AND m.booking_needs_court_notified = false
      AND m.court_requirement = 'needed'
      AND m.status NOT IN ('cancelled', 'completed', 'open')
      AND array_length(m.player_ids, 1) >= 2
      AND (m.match_date + coalesce(m.match_time, time '23:59'))
          > (now() AT TIME ZONE coalesce(m.timezone, 'UTC'))
  LOOP
    v_day := trim(to_char(rec.match_date, 'Day'));
    v_time := coalesce(left(rec.match_time::text, 5), '');

    FOREACH v_player_id IN ARRAY rec.player_ids LOOP
      IF wants_push(v_player_id, 'booking_needs_court') THEN
        INSERT INTO notifications (user_id, type, title, message, related_id)
        VALUES (v_player_id, 'booking_needs_court',
                v_day || ' ' || v_time || ' needs a court',
                'No one has claimed this yet. Anyone?',
                rec.id);
      END IF;
    END LOOP;

    UPDATE matches SET booking_needs_court_notified = true WHERE id = rec.id;
  END LOOP;
END;
$$;

-- ── Notification #3: booking window opens → claimant only ───────────────────

CREATE OR REPLACE FUNCTION public.notify_booking_window_open()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  v_day text;
  v_release_days integer;
  v_release_time time;
  v_window_opens timestamptz;
  v_now timestamptz;
BEGIN
  v_now := now();

  FOR rec IN
    SELECT m.id, m.match_date, m.match_time, m.booking_claimed_by, m.timezone,
           m.group_id, m.padel_venue_id,
           pv.booking_release_days AS venue_release_days,
           pv.booking_release_time AS venue_release_time
    FROM matches m
    LEFT JOIN padel_venues pv ON pv.venue_id = m.padel_venue_id AND pv.ppa_bookable = true
    WHERE m.match_date >= current_date
      AND m.booking_status = 'claimed'
      AND m.booking_claimed_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.related_id = m.id AND n.type = 'booking_window_open'
          AND n.user_id = m.booking_claimed_by
      )
  LOOP
    v_release_days := coalesce(rec.venue_release_days, 7);
    v_release_time := coalesce(rec.venue_release_time, time '08:00');

    v_window_opens := (
      (rec.match_date - v_release_days)::timestamp + v_release_time
    ) AT TIME ZONE coalesce(rec.timezone, 'UTC');

    IF v_now >= v_window_opens THEN
      v_day := trim(to_char(rec.match_date, 'Day'));

      IF wants_push(rec.booking_claimed_by, 'booking_window_open') THEN
        INSERT INTO notifications (user_id, type, title, message, related_id)
        VALUES (rec.booking_claimed_by, 'booking_window_open',
                'Time to book ' || v_day || '''s court',
                CASE
                  WHEN rec.venue_release_days IS NOT NULL
                    THEN 'Courts are open for booking. You''re on it.'
                  ELSE 'We''ll remind you ' || v_release_days || ' days before, ' ||
                       left(v_release_time::text, 5) || '. You''re booking this one.'
                END,
                rec.id);
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- ── Cron jobs ───────────────────────────────────────────────────────────────

SELECT cron.unschedule('notify-unbooked-matches')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-unbooked-matches');
SELECT cron.schedule('notify-unbooked-matches', '*/30 * * * *',
  $$SELECT public.notify_unbooked_matches()$$);

SELECT cron.unschedule('notify-booking-window-open')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-booking-window-open');
SELECT cron.schedule('notify-booking-window-open', '*/15 * * * *',
  $$SELECT public.notify_booking_window_open()$$);

-- ── Update compute_notification_nav_url for booking_needs_court ─────────────

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
      OR NEW.type = 'booking_window_open'
      OR NEW.type = 'booking_needs_court'
      OR NEW.type = 'booking_claim_expired'
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
