// Deploy with: supabase functions deploy create-event-payment --no-verify-jwt
//
// Creates a Stripe PaymentIntent for a venue-event entry via the venue's
// Connect account. Also creates an order_items row (status 'pending') so the
// purchase is tracked before payment completes.
//
// MONEY: amount_minor is in the venue currency's minor units (pence for GBP,
// cents for EUR, whole units for JPY). Passed directly to Stripe — no *100.
//
// After the client confirms payment, the app calls the join_venue_event RPC
// with the order_item_id + stripe PI to atomically reserve the spot.

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

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  try {
    const body = await req.json()
    const { occurrence_id, venue_id, event_name, user_id } = body
    // amount_minor: price in the currency's minor units (already stored that way)
    const amount_minor: number = body.amount_minor ?? body.amount_pence ?? 0
    // currency: ISO 4217 code from the venue, default GBP
    const currency: string = (body.currency ?? 'GBP').toLowerCase()

    if (!occurrence_id || !venue_id || !amount_minor || !user_id) {
      return Response.json(
        { error: 'occurrence_id, venue_id, amount_minor, and user_id are required' },
        { status: 400, headers: cors },
      )
    }

    // Validate amount: positive integer, sane range (1–1_000_000 minor units)
    if (
      !Number.isInteger(amount_minor) ||
      amount_minor < 1 ||
      amount_minor > 1_000_000
    ) {
      return Response.json(
        { error: 'Invalid amount' },
        { status: 400, headers: cors },
      )
    }

    // ── Pre-flight capacity check (non-authoritative, the RPC is the truth) ──
    // capacity lives on venue_events, not occurrences — join to check
    const { data: occ } = await supabase
      .from('venue_event_occurrences')
      .select('spots_taken, venue_events!inner ( capacity )')
      .eq('id', occurrence_id)
      .maybeSingle()

    if (!occ) {
      return Response.json({ error: 'Occurrence not found' }, { status: 404, headers: cors })
    }
    const evCapacity = (occ as any).venue_events?.capacity
    if (evCapacity != null && occ.spots_taken >= evCapacity) {
      return Response.json({ error: 'Event is full' }, { status: 409, headers: cors })
    }

    // ── Look up venue's Stripe Connect account ──────────────────────────────
    const { data: acct } = await supabase
      .from('venue_stripe_accounts')
      .select('stripe_account_id, charges_enabled')
      .eq('venue_id', venue_id)
      .maybeSingle()

    if (!acct || !acct.charges_enabled || !acct.stripe_account_id) {
      return Response.json(
        { error: 'Venue is not set up to take payments' },
        { status: 400, headers: cors },
      )
    }

    // ── Find or create an event_entry product ───────────────────────────────
    let productId: string
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('venue_id', venue_id)
      .eq('product_type', 'event_entry')
      .eq('reference_id', occurrence_id)
      .maybeSingle()

    if (existing) {
      productId = existing.id
    } else {
      const { data: created, error: pErr } = await supabase
        .from('products')
        .insert({
          venue_id,
          product_type: 'event_entry',
          name: `Event entry: ${event_name ?? 'Venue event'}`,
          price_pence: amount_minor,
          reference_id: occurrence_id,
        })
        .select('id')
        .single()
      if (pErr || !created) {
        return Response.json({ error: 'Failed to create product' }, { status: 500, headers: cors })
      }
      productId = created.id
    }

    // ── Create order_items row (pending) ────────────────────────────────────
    const { data: orderItem, error: oiErr } = await supabase
      .from('order_items')
      .insert({
        product_id: productId,
        user_id,
        quantity: 1,
        amount_pence: amount_minor,
        currency: currency.toUpperCase(),
        status: 'pending',
      })
      .select('id')
      .single()

    if (oiErr || !orderItem) {
      return Response.json({ error: 'Failed to create order item' }, { status: 500, headers: cors })
    }

    // ── Create Stripe PaymentIntent (destination charge) ────────────────────
    const application_fee_amount = Math.round(amount_minor * 0.035) // 3.5% platform fee

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount_minor,
      currency,
      application_fee_amount,
      transfer_data: { destination: acct.stripe_account_id },
      metadata: {
        type: 'event_entry',
        occurrence_id,
        venue_id,
        user_id,
        order_item_id: orderItem.id,
        event_name: event_name ?? '',
      },
      automatic_payment_methods: { enabled: true },
    })

    // Update order_items with the PI id
    await supabase
      .from('order_items')
      .update({ stripe_pi_id: paymentIntent.id })
      .eq('id', orderItem.id)

    return Response.json(
      {
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        order_item_id: orderItem.id,
      },
      { headers: cors },
    )
  } catch (err) {
    console.error('create-event-payment error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Payment setup failed' },
      { status: 500, headers: cors },
    )
  }
})
