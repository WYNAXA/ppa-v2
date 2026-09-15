-- Allow authenticated users to create venue anchor rows. Needed by venue-manager
-- onboarding: both the create-new-venue flow and the claim flow (which lazily
-- creates a venues anchor for unlinked padel_venues directory listings).
-- Creating an anchor is not itself privileged — access is gated separately by
-- venue_users (claims are pending-approval; created venues set the creator as owner).
CREATE POLICY "Authenticated users can create venues"
  ON public.venues
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
