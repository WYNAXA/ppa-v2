-- One pending order per seat, and a defined status vocabulary.
--
-- ROOT CAUSE
--   create-event-payment's idempotency check reads then writes in application
--   code: it looks for a pending order_item for (user, occurrence) and creates
--   one if absent. Two concurrent invocations — an impatient double-tap — both
--   read no pending row and both insert, producing two PaymentIntents against
--   one seat. If both complete, the player is charged twice and
--   join_venue_event binds exactly one of them.
--
--   A read-then-write in the application cannot be atomic. The database is the
--   only place this can be made true.
--
-- FIX CLASS: root-cause. The application check stays — it gives the loser of
--   the race the winner's client_secret, which is the good UX. This index is
--   what makes the guarantee hold when the two requests land in the same
--   millisecond. Removing the app check and keeping only this would be (b) a
--   workaround with a worse error path; keeping only the app check is the bug.
--
-- STATUS VOCABULARY
--   order_items.status is text NOT NULL with no CHECK and, at the time of
--   writing, zero rows. The values are named here — before the first real row
--   exists — so every later reader knows what it can encounter. 'superseded'
--   is written by create-event-payment when a pending order's PaymentIntent is
--   terminal and a fresh one must be created.
--
-- BLAST RADIUS
--   order_items has 0 rows, so neither statement can fail on existing data and
--   nothing is rewritten. The only writers are create-event-payment (insert
--   'pending', update to 'superseded') and _shared/eventPayment.ts (update to
--   'paid'). No venue-manager code reads order_items.

CREATE UNIQUE INDEX IF NOT EXISTS order_items_one_pending_per_user_occurrence
  ON public.order_items (user_id, occurrence_id)
  WHERE status = 'pending' AND occurrence_id IS NOT NULL;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_status_valid
  CHECK (status IN ('pending', 'paid', 'superseded', 'refunded', 'cancelled'));
