-- Allow a user to submit a venue claim for THEMSELVES, as a PENDING request only.
-- Existing INSERT policy required is_venue_owner(venue_id) — impossible for a
-- claimant who is not yet an owner (chicken-and-egg). This policy permits a
-- self-insert strictly scoped to status='pending', so it cannot be used to grant
-- oneself active access. Approval (pending -> active) remains a separate, gated
-- action performed by an owner/admin.
CREATE POLICY "Users can submit their own pending venue claim"
  ON public.venue_users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');
