-- ══════════════════════════════════════════════════════════════════════════════
-- Travel enhancements: pickup_time column + privacy-gated rider address RPC
-- Run in the Supabase SQL Editor BEFORE deploying the frontend.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── Part 2: pickup_time column on travel_requests ────────────────────────────
ALTER TABLE travel_requests
  ADD COLUMN IF NOT EXISTS pickup_time time WITHOUT TIME ZONE;

COMMENT ON COLUMN travel_requests.pickup_time IS
  'Optional pickup time set by the driver after accepting. Displayed to the rider.';


-- ── Part 3: Privacy-gated RPC for rider address ──────────────────────────────
-- Returns the rider's address ONLY when the caller is the accepted driver
-- for that rider on that specific match. Enforced at the DB level, not the UI.

CREATE OR REPLACE FUNCTION public.get_rider_address_for_driver(
  p_match_id  uuid,
  p_rider_id  uuid
)
RETURNS TABLE (
  postal_code text,
  city        text,
  latitude    numeric,
  longitude   numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify the caller is the accepted driver for this rider on this match
  IF NOT EXISTS (
    SELECT 1 FROM travel_requests
    WHERE match_id     = p_match_id
      AND requester_id = p_rider_id
      AND driver_id    = v_caller
      AND status       = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Not authorised — you are not the confirmed driver for this rider';
  END IF;

  RETURN QUERY
  SELECT p.postal_code, p.city, p.latitude, p.longitude
  FROM profiles p
  WHERE p.id = p_rider_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rider_address_for_driver(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
