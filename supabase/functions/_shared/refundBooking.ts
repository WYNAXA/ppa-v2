// Core refund mechanism, shared by cancel-booking (user path) and the deadline
// processor cron (release path). Full refunds — Wynaxa absorbs the ~10p card fee
// (Stripe keeps the original processing fee on refunds). Idempotent: only 'paid' rows.

import type Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface RefundResult {
  refunded_count: number
  refunded_total_pence: number
  errors: string[]
}

export async function refundBooking(
  supabaseAdmin: SupabaseClient,
  stripe: Stripe,
  bookingId: string,
): Promise<RefundResult> {
  const result: RefundResult = { refunded_count: 0, refunded_total_pence: 0, errors: [] }

  const { data: payments, error } = await supabaseAdmin
    .from('booking_payments')
    .select('id, stripe_payment_intent_id, amount_pence')
    .eq('booking_id', bookingId)
    .eq('status', 'paid')

  if (error) {
    result.errors.push('ledger read failed: ' + error.message)
    return result
  }
  if (!payments || payments.length === 0) return result

  for (const p of payments) {
    try {
      // No amount => full refund. reverse_transfer claws back from the venue,
      // refund_application_fee returns Wynaxa's fee into the refund.
      const refund = await stripe.refunds.create({
        payment_intent: p.stripe_payment_intent_id,
        reverse_transfer: true,
        refund_application_fee: true,
      })

      await supabaseAdmin
        .from('booking_payments')
        .update({
          status: 'refunded',
          stripe_refund_id: refund.id,
          refunded_amount_pence: p.amount_pence,
          refunded_at: new Date().toISOString(),
        })
        .eq('id', p.id)

      result.refunded_count++
      result.refunded_total_pence += p.amount_pence
    } catch (err) {
      result.errors.push(
        p.stripe_payment_intent_id + ': ' + (err instanceof Error ? err.message : 'refund failed'),
      )
    }
  }

  return result
}
