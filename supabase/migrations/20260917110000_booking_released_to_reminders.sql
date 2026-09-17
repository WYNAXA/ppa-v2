-- S4-D2: booking_released is a game fact (the court is gone), not a payment.
-- Moved from booking_payments to booking_reminders in wants_push.
-- Applied in Supabase SQL Editor on 2026-09-17.

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
          -- GAME: court and claim lifecycle (includes booking_released — the court is gone)
          WHEN p_type IN ('court_booked', 'booking_claimed', 'booking_claim_expired',
                          'booking_claim_taken_over', 'booking_window_open',
                          'booking_needs_court', 'booking_confirmed', 'booking_released')
            THEN np.booking_reminders
          -- MONEY: payment requests only
          WHEN p_type IN ('booking_payment_due', 'booking_topup_reminder')
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
