-- ============================================================================
-- VENUE EVENTS — RLS + RPCs
-- Apply this to the shared database (timbjfihsxqfrqrxwdny).
-- Run as a privileged role (service_role / postgres).
-- ============================================================================

-- ── 1. RLS: let any authenticated user SELECT participants of public events ──

-- Current RLS only allows SELECT where auth.uid() = user_id.
-- This adds a policy so that any authenticated user can read participants
-- for occurrences whose parent event is public + open_to_join.
-- Members-only events stay restricted (no change needed).

ALTER TABLE venue_event_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view public event participants"
  ON venue_event_participants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM venue_event_occurrences occ
      JOIN venue_events ev ON ev.id = occ.event_id
      WHERE occ.id = venue_event_participants.occurrence_id
        AND ev.open_to_join = true
        AND ev.visibility = 'public'
    )
  );


-- ── 2. RPC: join_venue_event ─────────────────────────────────────────────────
-- Atomically checks capacity (on venue_events, NOT on occurrences), inserts a
-- participant row, and increments spots_taken on the occurrence.
--
-- Capacity lives on venue_events. If capacity IS NULL the event is uncapped —
-- joining is always allowed.
--
-- Two players joining the last spot simultaneously will NOT both succeed: the
-- UPDATE … FROM joins venue_events for the capacity check, and row-level
-- locking on the occurrence row serialises the increment.
--
-- For pay_in_app events, pass p_order_item_id and p_stripe_pi_id to record
-- proof of payment. For pay_at_venue / free events, omit those params.

CREATE OR REPLACE FUNCTION join_venue_event(
  p_occurrence_id UUID,
  p_order_item_id UUID DEFAULT NULL,
  p_stripe_pi_id  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_updated INT;
BEGIN
  -- Guard: already joined?
  IF EXISTS (
    SELECT 1 FROM venue_event_participants
    WHERE occurrence_id = p_occurrence_id
      AND user_id = v_user_id
      AND status = 'joined'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already joined');
  END IF;

  -- Atomic capacity check + increment.
  -- capacity lives on venue_events; spots_taken lives on venue_event_occurrences.
  -- If ev.capacity IS NULL the event is uncapped — the WHERE always matches.
  UPDATE venue_event_occurrences occ
  SET spots_taken = occ.spots_taken + 1
  FROM venue_events ev
  WHERE occ.id = p_occurrence_id
    AND ev.id = occ.event_id
    AND occ.status = 'scheduled'
    AND (ev.capacity IS NULL OR occ.spots_taken < ev.capacity);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event is full or not available');
  END IF;

  -- Insert (or re-activate a previously cancelled row)
  INSERT INTO venue_event_participants (occurrence_id, user_id, status)
  VALUES (p_occurrence_id, v_user_id, 'joined')
  ON CONFLICT (occurrence_id, user_id)
  DO UPDATE SET status = 'joined';

  -- If this is a paid entry, mark the order_item as paid
  IF p_order_item_id IS NOT NULL THEN
    UPDATE order_items
    SET status = 'paid', stripe_pi_id = COALESCE(p_stripe_pi_id, stripe_pi_id)
    WHERE id = p_order_item_id
      AND user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ── 3. RPC: leave_venue_event ────────────────────────────────────────────────
-- Marks participation as cancelled and decrements spots_taken.
-- Does NOT auto-refund for pay_in_app — that is a separate process.

CREATE OR REPLACE FUNCTION leave_venue_event(
  p_occurrence_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_updated INT;
BEGIN
  -- Only cancel if currently joined
  UPDATE venue_event_participants
  SET status = 'cancelled'
  WHERE occurrence_id = p_occurrence_id
    AND user_id = v_user_id
    AND status = 'joined';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not currently joined');
  END IF;

  -- Decrement spots_taken (floor at 0 for safety)
  UPDATE venue_event_occurrences
  SET spots_taken = GREATEST(0, spots_taken - 1)
  WHERE id = p_occurrence_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ── 4. Grant execute to authenticated role ───────────────────────────────────

GRANT EXECUTE ON FUNCTION join_venue_event(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION leave_venue_event(UUID) TO authenticated;
