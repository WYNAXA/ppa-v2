// Deploy with: supabase functions deploy create-event-payment
// verify_jwt: true — user_id comes from the JWT, never the body.
//
// Creates a Stripe PaymentIntent for a venue-event entry. Amount is derived
// server-side from venue_events.price_per_player — the client cannot name
// the price.
//
// Idempotent per (user_id, occurrence_id): a second call reuses the existing
// pending order_item and its PI rather than creating a duplicate charge. The
// partial unique index order_items_one_pending_per_user_occurrence enforces
// this at the DB level; a 23505 on insert means the race loser re-reads the
// winner's row.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
}

/** Try to reuse an existing pending order_item's PI. */
async function reuseExisting(
  userId: string,
  occurrenceId: string,
): Promise<Response | null> {
  const { data: existing } = await admin
    .from('order_items')
    .select('id, stripe_payment_intent_id')
    .eq('user_id', userId)
    .eq('occurrence_id', occurrenceId)
    .eq('status', 'pending')
    .maybeSingle()

  if (!existing?.stripe_payment_intent_id) return null

  try {
    const existingPi = await stripe.paymentIntents.retrieve(existing.stripe_payment_intent_id)
    const reusable = ['requires_payment_method', 'requires_confirmation', 'requires_action']
    if (reusable.includes(existingPi.status)) {
      return Response.json(
        {
          client_secret: existingPi.client_secret,
          payment_intent_id: existingPi.id,
          order_item_id: existing.id,
        },
        { headers: cors },
      )
    }
    // PI is in a terminal state — cancel if possible and supersede the order item.
    if (existingPi.status !== 'canceled' && existingPi.status !== 'succeeded') {
      await stripe.paymentIntents.cancel(existingPi.id).catch(() => {})
    }
  } catch {
    // PI retrieval failed — fall through.
  }

  // Mark the stale order item superseded so the unique index slot is freed.
  await admin
    .from('order_items')
    .update({ status: 'superseded' })
    .eq('id', existing.id)
    .eq('status', 'pending')

  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  try {
    // ── Auth: user_id from the JWT, never the body ──────────────────────────
    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors })
    }
    const userId = user.id

    const body = await req.json()
    const { occurrence_id, venue_id, event_name } = body

    if (!occurrence_id || !venue_id) {
      return Response.json(
        { error: 'occurrence_id and venue_id are required' },
        { status: 400, headers: cors },
      )
    }

    // ── Idempotency: reuse existing pending order_item ──────────────────────
    const reused = await reuseExisting(userId, occurrence_id)
    if (reused) return reused

    // ── Derive amount SERVER-SIDE from venue_events.price_per_player ────────
    // Currency lives on venues, not venue_events.
    const { data: occ } = await admin
      .from('venue_event_occurrences')
      .select('spots_taken, event_id, venue_events!inner ( capacity, price_per_player )')
      .eq('id', occurrence_id)
      .maybeSingle()

    if (!occ) {
      return Response.json({ error: 'Occurrence not found' }, { status: 404, headers: cors })
    }

    const ev = (occ as any).venue_events
    const pricePence: number = ev?.price_per_player ?? 0

    if (pricePence < 1) {
      return Response.json({ error: 'This event is free — no payment needed' }, { status: 400, headers: cors })
    }

    // Pre-flight capacity check (non-authoritative, the RPC is the truth).
    if (ev?.capacity != null && occ.spots_taken >= ev.capacity) {
      return Response.json({ error: 'Event is full' }, { status: 409, headers: cors })
    }

    // ── Venue: currency and commission from the row, no defaults ────────────
    const { data: venueRow } = await admin
      .from('venues')
      .select('currency, commission_rate_bps')
      .eq('id', venue_id)
      .maybeSingle()

    if (!venueRow) {
      return Response.json({ error: 'Venue not found' }, { status: 404, headers: cors })
    }
    if (venueRow.commission_rate_bps == null) {
      return Response.json({ error: 'Venue has no commission rate configured' }, { status: 400, headers: cors })
    }

    const currency: string = (venueRow.currency ?? 'GBP').toLowerCase()
    const rate_bps: number = venueRow.commission_rate_bps

    // ── Stripe Connect account ──────────────────────────────────────────────
    const { data: acct } = await admin
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

    // ── Product: one per venue of type 'event_entry' ────────────────────────
    // price_pence is 0 — a placeholder. The real price is order_items.
    // unit_price_pence, which differs per event. Do not sum products.price_pence
    // as revenue; it is not revenue.
    let productId: string
    const { data: existingProduct } = await admin
      .from('products')
      .select('id')
      .eq('venue_id', venue_id)
      .eq('type', 'event_entry')
      .limit(1)
      .maybeSingle()

    if (existingProduct) {
      productId = existingProduct.id
    } else {
      const { data: created, error: pErr } = await admin
        .from('products')
        .insert({
          venue_id,
          type: 'event_entry',
          name: `Event entry: ${event_name ?? 'Venue event'}`,
          // Placeholder — real price is on order_items.unit_price_pence.
          // Do not treat this as revenue.
          price_pence: 0,
        })
        .select('id')
        .single()
      if (pErr || !created) {
        return Response.json({ error: 'Failed to create product' }, { status: 500, headers: cors })
      }
      productId = created.id
    }

    // ── Order item (pending) ────────────────────────────────────────────────
    // The partial unique index order_items_one_pending_per_user_occurrence
    // prevents a race: if two concurrent calls both pass the reuseExisting
    // check, the loser gets 23505 and retries.
    let orderItem: { id: string } | null = null
    const insertPayload = {
      product_id: productId,
      user_id: userId,
      venue_id,
      occurrence_id,
      quantity: 1,
      unit_price_pence: pricePence,
      total_pence: pricePence,
      status: 'pending',
    }

    const { data: inserted, error: oiErr } = await admin
      .from('order_items')
      .insert(insertPayload)
      .select('id')
      .single()

    if (oiErr && (oiErr as { code?: string }).code === '23505') {
      // Race loser: the winner's row exists. Reuse it.
      const retried = await reuseExisting(userId, occurrence_id)
      if (retried) return retried
      // If reuse still fails (PI cancelled between the two calls), error out.
      return Response.json({ error: 'Concurrent payment in progress — please retry' }, { status: 409, headers: cors })
    }

    if (oiErr || !inserted) {
      console.error('order_items insert error:', oiErr)
      return Response.json({ error: 'Failed to create order item' }, { status: 500, headers: cors })
    }
    orderItem = inserted

    // ── Stripe PaymentIntent ────────────────────────────────────────────────
    const application_fee_amount = Math.round(pricePence * rate_bps / 10000)

    const paymentIntent = await stripe.paymentIntents.create({
      amount: pricePence,
      currency,
      application_fee_amount,
      transfer_data: { destination: acct.stripe_account_id },
      metadata: {
        type: 'event_entry',
        occurrence_id,
        venue_id,
        user_id: userId,
        order_item_id: orderItem.id,
        event_name: event_name ?? '',
      },
      automatic_payment_methods: { enabled: true },
    })

    // Store the PI id on the order item.
    await admin
      .from('order_items')
      .update({ stripe_payment_intent_id: paymentIntent.id })
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
