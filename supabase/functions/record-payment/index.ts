// Deploy with: supabase functions deploy record-payment --no-verify-jwt
// Records a successful booking payment into booking_payments (the refund ledger),
// then flips held -> confirmed once the ledger shows all shares paid.
// Authorization is by proof-of-payment (matching PI), not session — so guests
// paying via links work too. Amount/fee are read from Stripe, never trusted from client.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PLAYERS_PER_COURT = 4

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  try {
    const { booking_id, payment_intent_id, covered_player_ids, payer_id } = await req.json()
    if (!booking_id || !payment_intent_id) {
      return Response.json(
        { error: 'booking_id and payment_intent_id are required' },
        { status: 400, headers: cors },
      )
    }

    const { data: booking } = await supabaseAdmin
      .from('court_bookings')
      .select('id, booker_stripe_pi_id')
      .eq('id', booking_id)
      .maybeSingle()
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404, headers: cors })
    }

    const { data: existing } = await supabaseAdmin
      .from('booking_payments')
      .select('id')
      .eq('stripe_payment_intent_id', payment_intent_id)
      .maybeSingle()
    if (!existing) {
      const pi = await stripe.paymentIntents.retrieve(payment_intent_id)
      if (pi.status !== 'succeeded') {
        return Response.json(
          { error: 'Payment not completed (status: ' + pi.status + ')' },
          { status: 400, headers: cors },
        )
      }

      const metaBookingId = pi.metadata?.booking_id
      const isLinkPayment = !!metaBookingId && metaBookingId === booking_id
      const isBookerPayment = booking.booker_stripe_pi_id === payment_intent_id
      if (!isLinkPayment && !isBookerPayment) {
        return Response.json(
          { error: 'Payment does not belong to this booking' },
          { status: 403, headers: cors },
        )
      }

      const covered = Array.isArray(covered_player_ids) ? covered_player_ids : []
      const parsedShare = pi.metadata?.share_count ? parseInt(pi.metadata.share_count, 10) : NaN
      const shareCount = Number.isFinite(parsedShare) && parsedShare >= 1
        ? parsedShare
        : (covered.length || 1)

      const { error: insErr } = await supabaseAdmin
        .from('booking_payments')
        .insert({
          booking_id,
          stripe_payment_intent_id: payment_intent_id,
          payer_id: payer_id ?? pi.metadata?.player_id ?? pi.metadata?.booker_id ?? null,
          amount_pence: pi.amount,
          application_fee_pence: pi.application_fee_amount ?? 0,
          covered_player_ids: covered,
          share_count: shareCount,
          status: 'paid',
        })

      if (insErr && (insErr as { code?: string }).code !== '23505') {
        console.error('booking_payments insert error:', insErr)
        return Response.json({ error: insErr.message }, { status: 400, headers: cors })
      }
    }

    // Flip held -> confirmed once the ledger shows all shares paid (money-truth).
    const { data: paidRows } = await supabaseAdmin
      .from('booking_payments')
      .select('share_count')
      .eq('booking_id', booking_id)
      .eq('status', 'paid')
    const paidShares = (paidRows ?? []).reduce(
      (sum: number, r: { share_count: number | null }) => sum + (r.share_count ?? 0),
      0,
    )
    let confirmed = false
    if (paidShares >= PLAYERS_PER_COURT) {
      const { data: flipped } = await supabaseAdmin
        .from('court_bookings')
        .update({ status: 'confirmed' })
        .eq('id', booking_id)
        .eq('status', 'held')
        .select('id')
      confirmed = !!(flipped && flipped.length > 0)
    }

    return Response.json({ recorded: true, paid_shares: paidShares, confirmed }, { headers: cors })
  } catch (err) {
    console.error('record-payment error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to record payment' },
      { status: 500, headers: cors },
    )
  }
})
