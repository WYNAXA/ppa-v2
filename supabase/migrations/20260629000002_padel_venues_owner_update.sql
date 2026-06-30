-- Venue owners can update their own venue's padel_venues row, regardless of
-- verified status. The pre-existing "Users can update unverified venues"
-- policy (USING verified = false) blocked owners from editing verified venues,
-- silently failing manager-app saves. is_venue_owner() takes a venues.id;
-- padel_venues links to it via venues_id.
CREATE POLICY "Venue owners can update their padel_venues row"
  ON public.padel_venues
  FOR UPDATE
  TO authenticated
  USING (is_venue_owner(venues_id))
  WITH CHECK (is_venue_owner(venues_id));
