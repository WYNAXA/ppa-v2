-- F7: A claim must always have a deadline.
-- Fix class: root-cause for F7a (group fallback in trigger),
-- root-cause for F7b (skip surfaces to notifications table),
-- root-cause for F7c (country_code captured at source — client-side).

-- ── F7a: derive_match_timezone — group member modal country fallback ────────

CREATE OR REPLACE FUNCTION public.derive_match_timezone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
BEGIN
  -- Derive on INSERT when NULL, or on UPDATE when venue changes
  IF (TG_OP = 'INSERT' AND NEW.timezone IS NULL)
     OR (TG_OP = 'UPDATE'
         AND NEW.padel_venue_id IS DISTINCT FROM OLD.padel_venue_id
         AND NEW.padel_venue_id IS NOT NULL)
  THEN
    -- Route 1: venue country_code
    IF NEW.padel_venue_id IS NOT NULL THEN
      SELECT ct.timezone INTO v_tz
      FROM padel_venues pv
      JOIN country_timezones ct ON ct.country_code = pv.country_code
      WHERE pv.venue_id = NEW.padel_venue_id;
    END IF;

    -- Route 2: creator's profile country_code
    IF v_tz IS NULL AND NEW.created_by IS NOT NULL THEN
      SELECT ct.timezone INTO v_tz
      FROM profiles p
      JOIN country_timezones ct ON ct.country_code = p.country_code
      WHERE p.id = NEW.created_by;
    END IF;

    -- Route 3: modal country_code across approved group members
    IF v_tz IS NULL AND NEW.group_id IS NOT NULL THEN
      SELECT ct.timezone INTO v_tz
      FROM (
        SELECT p.country_code, count(*) as n,
               -- Tie-break: the group creator's code wins
               max(CASE WHEN gm.user_id = g.admin_id THEN 1 ELSE 0 END) as is_creator
        FROM group_members gm
        JOIN profiles p ON p.id = gm.user_id
        JOIN groups g ON g.id = gm.group_id
        WHERE gm.group_id = NEW.group_id
          AND gm.status = 'approved'
          AND p.country_code IS NOT NULL
        GROUP BY p.country_code
        ORDER BY n DESC, is_creator DESC
        LIMIT 1
      ) modal
      JOIN country_timezones ct ON ct.country_code = modal.country_code;
    END IF;

    IF v_tz IS NOT NULL THEN
      NEW.timezone := v_tz;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── Backfill the 3 NULL-timezone future matches via group route ─────────────

WITH group_tz AS (
  SELECT gm.group_id,
         (SELECT ct.timezone
          FROM (
            SELECT p2.country_code, count(*) as n,
                   max(CASE WHEN gm2.user_id = g2.admin_id THEN 1 ELSE 0 END) as is_creator
            FROM group_members gm2
            JOIN profiles p2 ON p2.id = gm2.user_id
            JOIN groups g2 ON g2.id = gm2.group_id
            WHERE gm2.group_id = gm.group_id
              AND gm2.status = 'approved'
              AND p2.country_code IS NOT NULL
            GROUP BY p2.country_code
            ORDER BY n DESC, is_creator DESC
            LIMIT 1
          ) modal
          JOIN country_timezones ct ON ct.country_code = modal.country_code
         ) as timezone
  FROM group_members gm
  WHERE gm.group_id IN (
    SELECT DISTINCT m.group_id FROM matches m
    WHERE m.timezone IS NULL AND m.group_id IS NOT NULL
  )
  GROUP BY gm.group_id
)
UPDATE matches m
SET timezone = gt.timezone
FROM group_tz gt
WHERE gt.group_id = m.group_id
  AND m.timezone IS NULL
  AND gt.timezone IS NOT NULL;

-- ── F7b: expire skip surfaces to notifications, not just logs ───────────────
-- When a claimed match has NULL timezone and gets skipped, insert a
-- notification to the claimant naming the problem. This is visible in the
-- bell, not buried in Postgres logs.

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

  -- Skipped rows: timezone IS NULL, claimed, future. Notify the claimant.
  FOR v_skip IN
    SELECT m.id, m.booking_claimed_by, m.match_date, m.match_time
    FROM matches m
    WHERE m.booking_status = 'claimed'
      AND m.booking_claimed_by IS NOT NULL
      AND m.timezone IS NULL
      AND m.match_date >= current_date
  LOOP
    -- Only notify once: check if we already sent this type for this match
    IF NOT EXISTS (
      SELECT 1 FROM notifications
      WHERE related_id = v_skip.id
        AND type = 'booking_timezone_missing'
        AND user_id = v_skip.booking_claimed_by
    ) THEN
      INSERT INTO notifications (user_id, type, title, message, related_id)
      VALUES (
        v_skip.booking_claimed_by,
        'booking_timezone_missing',
        'Cannot check booking deadline',
        'The match on ' || trim(to_char(v_skip.match_date, 'Day')) ||
          ' ' || to_char(v_skip.match_time, 'HH24:MI') ||
          ' has no timezone set. Please book a venue so we can track the deadline.',
        v_skip.id
      );
    END IF;

    RAISE WARNING '[expire_stale_booking_claims] match % has NULL timezone, skipped', v_skip.id;
  END LOOP;
END;
$$;
