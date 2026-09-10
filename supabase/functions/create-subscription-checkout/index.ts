import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// Display names only. Price and currency are NOT hardcoded here — they come from
// the venue's active contract, which create_standard_contract()/change_plan_contract()
// set server-side from the venue's country (regional pricing). Amounts in the DB are
// already in the currency's smallest unit, which is exactly what Stripe's unit_amount
// wants, so there is no conversion to do here and none should be added.
const PLAN_NAMES: Record<string, string> = { plus: 'Hub Plus', pro: 'Hub Pro' }
const BILLABLE_TIERS = new Set(['plus', 'pro'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  try {
    // `expected_plan` is the tier the client BELIEVES it is buying. It is never used
    // to price anything — it exists only so a stale UI is rejected instead of
    // silently charging the customer for a different tier than the one they clicked.
    const { venue_id, expected_plan, return_url } = await req.json()
    if (!venue_id) {
      return Response.json({ error: 'venue_id is required' }, { status: 400, headers: cors })
    }

    // Identify the caller and verify they own this venue.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return Response.json({ error: 'not_authenticated' }, { status: 401, headers: cors })

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const { data: owns } = await admin
      .from('venue_users')
      .select('venue_id')
      .eq('venue_id', venue_id).eq('user_id', user.id).eq('status', 'active').eq('role', 'owner')
      .maybeSingle()
    if (!owns) return Response.json({ error: 'not_authorised' }, { status: 403, headers: cors })

    // Price is whatever the venue's ACTIVE contract says — server-side, in the venue's
    // own currency. The client cannot influence the amount, the currency or the tier.
    //
    // A partial unique index (venue_contracts_one_active_per_venue) guarantees at most
    // one active row. The count is still checked explicitly so that a future schema
    // change surfaces a named error here instead of a raw PostgREST 500 on the money path.
    const { data: contracts, error: contractErr } = await admin
      .from('venue_contracts')
      .select('id, plan_tier, currency, monthly_price_pence, subscription_free_until')
      .eq('venue_id', venue_id).eq('status', 'active')
    if (contractErr) {
      console.error('create-subscription-checkout contract read failed:', contractErr)
      return Response.json({ error: 'contract_read_failed' }, { status: 500, headers: cors })
    }
    if (!contracts || contracts.length === 0) {
      return Response.json({ error: 'no_active_contract' }, { status: 409, headers: cors })
    }
    if (contracts.length > 1) {
      console.error('create-subscription-checkout: multiple active contracts for venue', venue_id)
      return Response.json({ error: 'multiple_active_contracts' }, { status: 409, headers: cors })
    }

    const contract = contracts[0]
    const tier = contract.plan_tier as string
    const amount = contract.monthly_price_pence as number
    const currency = (contract.currency as string | null)?.toLowerCase()

    // A stale picker must not be able to buy a tier the venue is not contracted on.
    if (expected_plan && expected_plan !== tier) {
      return Response.json(
        { error: 'plan_mismatch', contracted_plan: tier },
        { status: 409, headers: cors },
      )
    }

    // Core carries no subscription at all.
    if (!BILLABLE_TIERS.has(tier)) {
      return Response.json({ error: 'plan_not_billable', contracted_plan: tier }, { status: 409, headers: cors })
    }

    // A waived fee is a deliberate commercial term (founder deals, free periods), not
    // bad data. It must NOT be reported as an invalid price — the two are different
    // outcomes and the owner sees this string.
    const freeUntil = contract.subscription_free_until as string | null
    if (freeUntil && new Date(freeUntil) > new Date()) {
      return Response.json(
        { error: 'subscription_not_required', free_until: freeUntil },
        { status: 409, headers: cors },
      )
    }
    if (amount === 0) {
      return Response.json({ error: 'subscription_not_required' }, { status: 409, headers: cors })
    }

    // Anything else that is not a positive integer minor amount in a named currency is
    // genuinely broken data. Surface it; do not fall back to a default price or currency.
    if (!currency || !Number.isInteger(amount) || amount < 0) {
      console.error('create-subscription-checkout: unusable contract price', {
        venue_id, contract_id: contract.id, currency: contract.currency, amount,
      })
      return Response.json({ error: 'contract_price_invalid' }, { status: 409, headers: cors })
    }

    // Reuse or create the venue's Stripe customer (platform account).
    const { data: v } = await admin.from('venues').select('stripe_customer_id, name').eq('id', venue_id).maybeSingle()
    let customerId = v?.stripe_customer_id as string | null
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: v?.name ?? undefined, metadata: { venue_id } })
      customerId = customer.id
      await admin.from('venues').update({ stripe_customer_id: customerId }).eq('id', venue_id)
    }

    const base = (return_url as string) || 'https://hub.wynaxa.com/settings/billing'
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{
        price_data: {
          currency,
          product_data: { name: `Wynaxa ${PLAN_NAMES[tier] ?? tier}` },
          unit_amount: amount,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      // plan is server-derived from the contract, so stripe-billing-webhook's applyPlan
      // cannot be driven to a tier the venue is not actually contracted on.
      metadata: { venue_id, plan: tier, contract_id: contract.id },
      subscription_data: { metadata: { venue_id, plan: tier, contract_id: contract.id } },
      success_url: `${base}?sub=success`,
      cancel_url: `${base}?sub=cancel`,
      allow_promotion_codes: true,
    })

    return Response.json({ url: session.url }, { headers: cors })
  } catch (err) {
    console.error('create-subscription-checkout error:', err)
    return Response.json({ error: err instanceof Error ? err.message : 'Checkout failed' }, { status: 500, headers: cors })
  }
})
