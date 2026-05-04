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
      booker_id,
      player_id, // for split payments — could be a user_id or guest identifier
      booking_id,
      venue_name,
      match_date,
      start_time,
      guest_name,
    } = body

    // Validate amount is reasonable (£1–£50 per player)
    if (!amount_pence || amount_pence < 100 || amount_pence > 5000) {
      return Response.json({ error: 'Invalid amount' }, { status: 400 })
    }

    const metadata: Record<string, string> = {
      booker_id: booker_id ?? '',
      player_id: player_id ?? '',
      venue_name: venue_name ?? '',
      match_date: match_date ?? '',
      start_time: start_time ?? '',
    }
    if (booking_id) metadata.booking_id = booking_id
    if (guest_name) metadata.guest_name = guest_name

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount_pence,
      currency: 'gbp',
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
