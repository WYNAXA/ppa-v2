-- Payment ledger. Every booking payment (booker's initial, each player's link
-- payment, and future deadline top-ups) writes exactly one row here. Refunds read
-- this table to know which Stripe PaymentIntent to refund and which shares it covered.
-- Writes are service-role only (edge functions / webhook) — never raw client inserts.

CREATE TABLE public.booking_payments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id             uuid NOT NULL REFERENCES public.court_bookings(id) ON DELETE CASCADE,
  stripe_payment_intent_id text NOT NULL,
  payer_id               text,
  amount_pence           integer NOT NULL CHECK (amount_pence > 0),
  application_fee_pence   integer NOT NULL DEFAULT 0,
  covered_player_ids     jsonb NOT NULL DEFAULT '[]'::jsonb,
  share_count            integer NOT NULL DEFAULT 1 CHECK (share_count >= 1),
  status                 text NOT NULL DEFAULT 'paid'
                           CHECK (status IN ('paid', 'refunded', 'partially_refunded')),
  stripe_refund_id       text,
  refunded_amount_pence  integer NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  refunded_at            timestamptz
);

CREATE INDEX idx_booking_payments_booking ON public.booking_payments (booking_id);

CREATE UNIQUE INDEX idx_booking_payments_pi ON public.booking_payments (stripe_payment_intent_id);

ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Booking participants can view payments"
  ON public.booking_payments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.court_bookings cb
    WHERE cb.id = booking_payments.booking_id
      AND (cb.booked_by = auth.uid() OR auth.uid() = ANY (cb.player_ids))
  ));
