CREATE OR REPLACE FUNCTION public.claim_venue(p_padel_venue_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid := auth.uid();
  v_anchor    uuid;
  v_listing   public.padel_venues%ROWTYPE;
  v_existing  uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_listing
  FROM public.padel_venues
  WHERE venue_id = p_padel_venue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'venue_not_found';
  END IF;

  IF v_listing.venues_id IS NOT NULL THEN
    v_anchor := v_listing.venues_id;
  ELSE
    INSERT INTO public.venues (name, country, city, address, latitude, longitude,
                               booking_url, has_app_booking, booking_type)
    VALUES (
      COALESCE(v_listing.venue_name, 'Unnamed venue'),
      COALESCE(v_listing.country, 'United Kingdom'),
      v_listing.city,
      v_listing.full_address,
      v_listing.latitude,
      v_listing.longitude,
      v_listing.booking_url,
      true,
      'link'
    )
    RETURNING id INTO v_anchor;

    UPDATE public.padel_venues
    SET venues_id = v_anchor
    WHERE venue_id = p_padel_venue_id;
  END IF;

  SELECT venue_id INTO v_existing
  FROM public.venue_users
  WHERE venue_id = v_anchor AND user_id = v_user;

  IF FOUND THEN
    RAISE EXCEPTION 'already_claimed';
  END IF;

  INSERT INTO public.venue_users (venue_id, user_id, role, status)
  VALUES (v_anchor, v_user, 'owner', 'pending');

  RETURN v_anchor;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_venue(uuid) TO authenticated;
