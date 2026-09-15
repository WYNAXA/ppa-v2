CREATE OR REPLACE FUNCTION public.update_paid_player_ids(
  p_booking_id       uuid,
  p_paid_player_ids  jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_ok  boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT (b.booked_by = v_uid OR v_uid = ANY(b.player_ids))
    INTO v_ok
  FROM public.bookings b
  WHERE b.id = p_booking_id;

  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;

  UPDATE public.bookings
     SET paid_player_ids = p_paid_player_ids
   WHERE id = p_booking_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.update_paid_player_ids(uuid, jsonb) TO authenticated;
