-- ── Household conflict detection ─────────────────────────────────────────────
--
-- For each user in the input array, look up their household partner.
-- Check if the partner has a match on the given date whose time overlaps
-- a 2-hour window around the requested time (90 min match + 30 min buffer).
--
-- Called from:
--   1. check-poll-auto-match edge function  (_user_ids, _match_date, _match_time)
--   2. generate-match-options edge function  (same signature)
--   3. AvailabilityPoll.tsx frontend         (resolves slots to date+time, calls same)

CREATE OR REPLACE FUNCTION public.get_household_conflicts(
  _user_ids   uuid[],
  _match_date date,
  _match_time time
)
RETURNS TABLE (
  user_id                     uuid,
  household_partner_id        uuid,
  conflicting_match_id        uuid,
  conflicting_time            time,
  conflicting_household_member uuid,
  description                 text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start time;
  v_window_end   time;
BEGIN
  -- 2-hour overlap window: 90 min before to 30 min after the requested time
  v_window_start := _match_time - interval '90 minutes';
  v_window_end   := _match_time + interval '30 minutes';

  RETURN QUERY
  SELECT
    p.id                           AS user_id,
    p.household_partner_id         AS household_partner_id,
    m.id                           AS conflicting_match_id,
    m.match_time::time             AS conflicting_time,
    p.household_partner_id         AS conflicting_household_member,
    'Your household partner has a match at ' || COALESCE(to_char(m.match_time::time, 'HH24:MI'), '?') AS description
  FROM unnest(_user_ids) AS uid(id)
  JOIN profiles p ON p.id = uid.id
  JOIN matches m
    ON m.match_date = _match_date
    AND m.status NOT IN ('cancelled', 'completed')
    AND p.household_partner_id = ANY(m.player_ids)
    AND m.match_time IS NOT NULL
    AND m.match_time::time >= v_window_start
    AND m.match_time::time <= v_window_end
  WHERE p.household_partner_id IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_household_conflicts(uuid[], date, time) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
