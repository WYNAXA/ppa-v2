import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  try {
    const body = await req.json()
    const {
      amount_pence,
      venue_id,
      booker_id,
      player_id,
      booking_id,
      venue_name,
      match_date,
      start_time,
      guest_name,
      share_count: rawShareCount,
    } = body

    // venue_id is required for destination charges
    if (!venue_id) {
      return Response.json(
        { error: 'venue_id required' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } },
      )
    }

    const share_count = typeof rawShareCount === 'number' && Number.isInteger(rawShareCount)
      ? rawShareCount
      : 1

    // Validate share_count (1–8 players)
    if (share_count < 1 || share_count > 8) {
      return Response.json(
        { error: 'Invalid amount' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } },
      )
    }

    // Validate amount: must be positive integer, per-share between £1–£50,
    // and total capped at £400
    if (
      !amount_pence ||
      !Number.isInteger(amount_pence) ||
      amount_pence <= 0 ||
      amount_pence > 40000 ||
      Math.floor(amount_pence / share_count) < 100 ||
      Math.floor(amount_pence / share_count) > 5000
    ) {
      return Response.json(
        { error: 'Invalid amount' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } },
      )
    }

    // Look up the venue's connected Stripe account
    const { data: acct } = await supabase
      .from('venue_stripe_accounts')
      .select('stripe_account_id, charges_enabled')
      .eq('venue_id', venue_id)
      .maybeSingle()

    if (!acct || !acct.charges_enabled || !acct.stripe_account_id) {
      return Response.json(
        { error: 'Venue is not set up to take payments' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } },
      )
    }

    // 3.5% platform fee (Wynaxa keeps this; Wynaxa bears Stripe fees + disputes)
    const application_fee_amount = Math.round(amount_pence * 0.035)

    const metadata: Record<string, string> = {
      booker_id: booker_id ?? '',
      player_id: player_id ?? '',
      venue_id: venue_id,
      venue_name: venue_name ?? '',
      match_date: match_date ?? '',
      start_time: start_time ?? '',
      share_count: String(share_count),
    }
    if (booking_id) metadata.booking_id = booking_id
    if (guest_name) metadata.guest_name = guest_name

    // Destination charge: full amount charged to customer, venue receives
    // amount minus application_fee_amount, Wynaxa is merchant of record
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount_pence,
      currency: 'gbp',
      application_fee_amount,
      transfer_data: {
        destination: acct.stripe_account_id,
      },
      metadata,
      automatic_payment_methods: { enabled: true },
    })

    return Response.json(
      { client_secret: paymentIntent.client_secret, payment_intent_id: paymentIntent.id },
      { headers: { 'Access-Control-Allow-Origin': '*' } },
    )
  } catch (err) {
    console.error('create-booking-payment error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Payment setup failed' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } },
    )
  }
})
