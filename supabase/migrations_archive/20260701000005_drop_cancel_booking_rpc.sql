-- Retire the legacy cancel_booking(uuid) RPC. It cancelled a booking WITHOUT any
-- refund (Postgres cannot call Stripe), silently keeping players' money. Cancellation
-- now runs exclusively through the cancel-booking / cancel-match edge functions,
-- which refund via the shared helper. Dropping it server-side ensures no cached
-- client bundle can reach the refund-less path.

DROP FUNCTION IF EXISTS public.cancel_booking(uuid);
