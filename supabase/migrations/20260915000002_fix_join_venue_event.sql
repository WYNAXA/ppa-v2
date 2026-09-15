-- Fix join_venue_event: remove unverified payment marking, add price gate,
-- bind seat to order item, add missing unique index, lock down anon access.
--
-- Defects fixed:
--   (a) The RPC accepted p_stripe_pi_id from the browser and wrote
--       order_items.status='paid' with no Stripe verification. SECURITY DEFINER.
--   (b) No price gate: calling with only p_occurrence_id joined a paid event
--       for free — no order_item required.
--   (c) ON CONFLICT (occurrence_id, user_id) had no matching unique index,
--       so the function raised 42P10 on every call. 0 rows in the table.
--   (d) anon could execute the function; auth.uid() would be null.

-- 1. The unique index ON CONFLICT needs. Table has 0 rows — safe.
CREATE UNIQUE INDEX IF NOT EXISTS venue_event_participants_occ_user_uniq
  ON public.venue_event_participants (occurrence_id, user_id);

-- 2. Bind seat to order item: which payment bought this seat.
ALTER TABLE public.venue_event_participants
  ADD COLUMN IF NOT EXISTS order_item_id uuid
  REFERENCES public.order_items(id);

-- 3. Drop the vulnerable 3-arg overload. CREATE OR REPLACE with a different
--    signature creates an overload, not a replacement.
DROP FUNCTION IF EXISTS public.join_venue_event(uuid, uuid, text);

-- 4. The fixed function.
CREATE OR REPLACE FUNCTION public.join_venue_event(
  p_occurrence_id uuid,
  p_order_item_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_updated INT;
  v_price   numeric;
BEGIN
  -- Auth guard: anon must not reach this.
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Guard: already joined?
  IF EXISTS (
    SELECT 1 FROM venue_event_participants
    WHERE occurrence_id = p_occurrence_id
      AND user_id = v_user_id
      AND status = 'joined'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already joined');
  END IF;

  -- Price gate: if the event costs money, a SPECIFIC paid order_item must exist.
  SELECT ev.price_per_player INTO v_price
  FROM venue_event_occurrences occ
  JOIN venue_events ev ON ev.id = occ.event_id
  WHERE occ.id = p_occurrence_id;

  IF v_price IS NOT NULL AND v_price > 0 THEN
    IF p_order_item_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'payment_required');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM order_items
      WHERE id = p_order_item_id
        AND user_id = v_user_id
        AND occurrence_id = p_occurrence_id
        AND status = 'paid'
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'payment_required');
    END IF;
  END IF;

  -- Atomic capacity check + increment (unchanged).
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

  -- Insert (or re-activate a previously cancelled row).
  -- Bind the order item so every paid seat records which payment bought it.
  INSERT INTO venue_event_participants (occurrence_id, user_id, status, order_item_id)
  VALUES (p_occurrence_id, v_user_id, 'joined', p_order_item_id)
  ON CONFLICT (occurrence_id, user_id)
  DO UPDATE SET status = 'joined', order_item_id = EXCLUDED.order_item_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- 5. Lock down: only authenticated users may call this.
REVOKE EXECUTE ON FUNCTION public.join_venue_event(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.join_venue_event(uuid, uuid) TO authenticated;
