import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Result =
  | { success: true; already_paid?: boolean }
  | { success: false; error: string }

/**
 * Verify a Stripe PaymentIntent and mark the order_item paid.
 *
 * This is the ONLY place order_items.status becomes 'paid'. Called by
 * confirm-event-payment (fast path) and stripe-payments-webhook (authority).
 * Idempotent: a second call with the same PI returns success without writing.
 */
export async function verifyAndFulfilEventPayment(
  stripe: Stripe,
  admin: SupabaseClient,
  paymentIntentId: string,
): Promise<Result> {
  // 1. Retrieve PI from Stripe — server-side, never trust client data.
  let pi: Stripe.PaymentIntent
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId)
  } catch (err) {
    console.error('[eventPayment] PI retrieve failed:', paymentIntentId, err)
    return { success: false, error: 'stripe_retrieve_failed' }
  }

  if (pi.status !== 'succeeded') {
    return { success: false, error: `payment_not_succeeded: ${pi.status}` }
  }

  // 2. Reject PIs from other flows — cheap guard against cross-contamination.
  if (pi.metadata?.type !== 'event_entry') {
    console.error('[eventPayment] PI is not event_entry:', paymentIntentId, pi.metadata?.type)
    return { success: false, error: 'wrong_payment_type' }
  }

  // 3. Read order_item_id from PI metadata.
  const orderItemId = pi.metadata?.order_item_id
  if (!orderItemId) {
    console.error('[eventPayment] PI missing order_item_id in metadata:', paymentIntentId)
    return { success: false, error: 'missing_order_item_metadata' }
  }

  // 4. Load the order_item.
  const { data: oi, error: oiErr } = await admin
    .from('order_items')
    .select('id, status, total_pence, venue_id')
    .eq('id', orderItemId)
    .maybeSingle()

  if (oiErr || !oi) {
    console.error('[eventPayment] order_item not found:', orderItemId, oiErr)
    return { success: false, error: 'order_item_not_found' }
  }

  // 5. Idempotent: already paid.
  if (oi.status === 'paid') {
    return { success: true, already_paid: true }
  }

  // 6. Cross-check amount. pi.amount is in minor units, same as total_pence.
  if (pi.amount !== oi.total_pence) {
    console.error(
      `[eventPayment] AMOUNT MISMATCH order_item=${orderItemId} ` +
      `stripe=${pi.amount} db=${oi.total_pence} pi=${paymentIntentId}`
    )
    return { success: false, error: 'amount_mismatch' }
  }

  // 7. Cross-check currency. Venues span GBP, EUR, SEK, AED — a numeric
  //    match across two currencies is not a match. Reject if the venue or its
  //    currency can't be resolved: don't wave money through on missing data.
  const { data: venue } = await admin
    .from('venues')
    .select('currency')
    .eq('id', oi.venue_id)
    .maybeSingle()

  if (!venue || !venue.currency) {
    console.error('[eventPayment] venue or currency not found for order_item:', orderItemId, oi.venue_id)
    return { success: false, error: 'venue_currency_not_found' }
  }

  if (pi.currency.toUpperCase() !== venue.currency.toUpperCase()) {
    console.error(
      `[eventPayment] CURRENCY MISMATCH order_item=${orderItemId} ` +
      `stripe=${pi.currency} venue=${venue.currency} pi=${paymentIntentId}`
    )
    return { success: false, error: 'currency_mismatch' }
  }

  // 8. Mark paid. Guarded by .eq('status','pending') so a concurrent write
  //    can't double-apply. Use .select('id') to detect whether the update
  //    actually wrote — supabase-js returns count only with { count: 'exact' }.
  const { data: updated, error: upErr } = await admin
    .from('order_items')
    .update({
      status: 'paid',
      stripe_payment_intent_id: pi.id,
    })
    .eq('id', orderItemId)
    .eq('status', 'pending')
    .select('id')

  if (upErr) {
    console.error('[eventPayment] order_item update failed:', orderItemId, upErr)
    return { success: false, error: 'update_failed' }
  }

  // updated.length === 0 means another writer got there first — still success.
  return { success: true, already_paid: (updated ?? []).length === 0 }
}
