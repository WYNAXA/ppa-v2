import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Reconcile a venue's live Stripe subscription with its active contract.
//
// Called from the Hub after change_plan_contract succeeds, and on Billing page
// load as a drift-check that self-heals a missed reconciliation.
//
// Idempotent: if the subscription already matches the contract (amount, currency,
// metadata.contract_id) it no-ops and returns reconciled: true. Only updates
// Stripe when there is a real difference.
//
// Does NOT create subscriptions (that is create-subscription-checkout's job) and
// does NOT handle card/payment-method changes (that is the billing portal's job).

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const PLAN_NAMES: Record<string, string> = { plus: 'Hub Plus', pro: 'Hub Pro' }
const DEAD_STATUSES = new Set(['canceled', 'incomplete_expired'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  try {
    const { venue_id } = await req.json()
    if (!venue_id) {
      return Response.json({ error: 'venue_id is required' }, { status: 400, headers: cors })
    }

    // Authenticate caller and verify ownership.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return Response.json({ error: 'not_authenticated' }, { status: 401, headers: cors })

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const { data: owns } = await admin
      .from('venue_users').select('venue_id')
      .eq('venue_id', venue_id).eq('user_id', user.id).eq('status', 'active').eq('role', 'owner')
      .maybeSingle()
    if (!owns) return Response.json({ error: 'not_authorised' }, { status: 403, headers: cors })

    // ── Read the venue's active contract ────────────────────────────────────

    const { data: contracts, error: cErr } = await admin
      .from('venue_contracts')
      .select('id, plan_tier, currency, monthly_price_pence, subscription_free_until')
      .eq('venue_id', venue_id).eq('status', 'active')
    if (cErr) {
      console.error('reconcile-subscription contract read failed:', cErr)
      return Response.json({ error: 'contract_read_failed' }, { status: 500, headers: cors })
    }
    if (!contracts || contracts.length === 0) {
      return Response.json({ error: 'no_active_contract' }, { status: 409, headers: cors })
    }
    if (contracts.length > 1) {
      console.error('reconcile-subscription: multiple active contracts for venue', venue_id)
      return Response.json({ error: 'multiple_active_contracts' }, { status: 409, headers: cors })
    }

    const contract = contracts[0]
    const tier = contract.plan_tier as string
    const amount = contract.monthly_price_pence as number
    const currency = (contract.currency as string | null)?.toLowerCase() ?? null

    // ── Nothing to bill? ────────────────────────────────────────────────────

    const freeUntil = contract.subscription_free_until as string | null
    if (freeUntil && new Date(freeUntil) > new Date()) {
      return Response.json(
        { reconciled: false, reason: 'subscription_not_required' },
        { headers: cors },
      )
    }

    // ── Read the venue's existing Stripe subscription ───────────────────────

    const { data: v } = await admin
      .from('venues')
      .select('stripe_subscription_id, stripe_customer_id')
      .eq('id', venue_id).maybeSingle()

    const subId = v?.stripe_subscription_id as string | null
    if (!subId) {
      return Response.json(
        { reconciled: false, reason: 'no_subscription' },
        { headers: cors },
      )
    }

    const sub = await stripe.subscriptions.retrieve(subId, { expand: ['items'] })

    if (DEAD_STATUSES.has(sub.status)) {
      // Stale reference — clear it so checkout can create a fresh one.
      await admin.from('venues')
        .update({ stripe_subscription_id: null, subscription_status: sub.status })
        .eq('id', venue_id)
      return Response.json(
        { reconciled: false, reason: 'subscription_dead', status: sub.status },
        { headers: cors },
      )
    }

    // ── Guard: exactly one line item ────────────────────────────────────────

    if (sub.items.data.length !== 1) {
      console.error('reconcile-subscription: unexpected item count', {
        venue_id, sub_id: sub.id, items: sub.items.data.length,
      })
      return Response.json(
        { error: 'unexpected_item_count', count: sub.items.data.length },
        { status: 409, headers: cors },
      )
    }

    const item = sub.items.data[0]
    const liveCurrency = item.price.currency  // Stripe stores lowercase
    const liveAmount = item.price.unit_amount ?? 0

    // ── Downgrade to Core (amount = 0): cancel the subscription ─────────

    if (amount === 0 || tier === 'core') {
      await stripe.subscriptions.cancel(sub.id)
      await admin.from('venues').update({
        stripe_subscription_id: null,
        subscription_status: 'canceled',
      }).eq('id', venue_id)
      return Response.json(
        { reconciled: true, action: 'canceled', reason: 'plan_is_free' },
        { headers: cors },
      )
    }

    // ── Currency mismatch: cancel old sub, clear reference ──────────────
    // Stripe does not allow changing the currency on an existing subscription.
    // Leaving the old sub live would bill in the wrong currency, so cancel it
    // and let the owner go through a fresh checkout.

    if (currency && liveCurrency !== currency) {
      await stripe.subscriptions.cancel(sub.id)
      await admin.from('venues').update({
        stripe_subscription_id: null,
        subscription_status: 'canceled',
      }).eq('id', venue_id)
      return Response.json(
        { reconciled: false, reason: 'currency_changed', old: liveCurrency, new: currency },
        { headers: cors },
      )
    }

    // ── Idempotency check ───────────────────────────────────────────────
    // If the subscription already matches the contract on all three
    // dimensions (amount, currency, contract_id), there is nothing to do.

    const alreadyMatches =
      liveAmount === amount &&
      liveCurrency === currency &&
      sub.metadata?.contract_id === contract.id

    if (alreadyMatches) {
      return Response.json(
        { reconciled: true, action: 'already_current' },
        { headers: cors },
      )
    }

    // ── Update the subscription in place ────────────────────────────────

    if (!currency || !Number.isInteger(amount) || amount <= 0) {
      console.error('reconcile-subscription: unusable contract price', {
        venue_id, contract_id: contract.id, currency: contract.currency, amount,
      })
      return Response.json({ error: 'contract_price_invalid' }, { status: 409, headers: cors })
    }

    await stripe.subscriptions.update(sub.id, {
      items: [{
        id: item.id,
        price_data: {
          currency,
          product_data: { name: `Wynaxa ${PLAN_NAMES[tier] ?? tier}` },
          unit_amount: amount,
          recurring: { interval: 'month' },
        },
      }],
      proration_behavior: 'create_prorations',
      metadata: {
        venue_id,
        plan: tier,
        contract_id: contract.id,
      },
    })

    // Write the updated state so the venues row is immediately consistent,
    // rather than waiting for the webhook to fire and propagate.
    await admin.from('venues').update({
      plan_tier: tier,
      subscription_status: 'active',
    }).eq('id', venue_id)

    return Response.json(
      { reconciled: true, action: 'updated', plan: tier, amount, currency },
      { headers: cors },
    )
  } catch (err) {
    console.error('reconcile-subscription error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Reconciliation failed' },
      { status: 500, headers: cors },
    )
  }
})
