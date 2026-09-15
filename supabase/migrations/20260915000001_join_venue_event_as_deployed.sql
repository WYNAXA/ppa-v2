-- Committed verbatim from pg_get_functiondef('join_venue_event'::regproc)
-- on 15 Sep 2026. This is the version that is live. The two defects
-- (unverified payment marking, no price gate) are fixed in the next migration.

CREATE OR REPLACE FUNCTION public.join_venue_event(p_occurrence_id uuid, p_order_item_id uuid DEFAULT NULL::uuid, p_stripe_pi_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
