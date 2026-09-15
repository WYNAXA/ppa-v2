-- Prevent the double-tap race: two concurrent create-event-payment calls for
-- the same (user, occurrence) both see no pending row and both try to insert.
-- The partial unique index makes the loser get 23505 instead of a second PI.
-- Safe to add: order_items has 0 rows.
CREATE UNIQUE INDEX IF NOT EXISTS order_items_one_pending_per_user_occurrence
  ON public.order_items (user_id, occurrence_id)
  WHERE status = 'pending' AND occurrence_id IS NOT NULL;

-- Define the status vocabulary before the first real row, not after.
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_status_valid
  CHECK (status IN ('pending', 'paid', 'superseded', 'refunded', 'cancelled'));
