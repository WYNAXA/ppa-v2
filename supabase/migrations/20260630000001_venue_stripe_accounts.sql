-- Stripe Connect (Express) account state per venue. Drives whether a venue can
-- take in-app payments: ppa_bookable may only be true when charges_enabled = true.
-- Writes happen server-side (edge functions / webhook via service role, which
-- bypasses RLS). Owners can READ their venue's payment status.
CREATE TABLE IF NOT EXISTS public.venue_stripe_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          uuid NOT NULL UNIQUE REFERENCES public.venues(id) ON DELETE CASCADE,
  stripe_account_id text,
  charges_enabled   boolean NOT NULL DEFAULT false,
  payouts_enabled   boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  onboarded_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_stripe_accounts ENABLE ROW LEVEL SECURITY;

-- Owners can read their own venue's Stripe status.
CREATE POLICY "Venue owners can read their stripe account"
  ON public.venue_stripe_accounts
  FOR SELECT
  TO authenticated
  USING (is_venue_owner(venue_id));
