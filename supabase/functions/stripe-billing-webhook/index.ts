import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

// Commission and tier are NOT defined here. The venue's active contract is the single
// source of truth — it is what create_standard_contract(), change_plan_contract() and
// grant_founder_contract() write, and what create-subscription-checkout bills from.
// Stripe decides only ONE thing: whether the venue is currently paying. Everything
// commercial comes from the contract, so a per-country or per-deal commission can never
// be silently overwritten here.
const ACTIVEISH = ['active', 'trialing', 'past_due']

type ActiveContract = { id: string; plan_tier: string; commission_rate_bps: number }

async function activeContract(venueId: string): Promise<ActiveContract> {
  const { data, error } = await admin
    .from('venue_contracts')
    .select('id, plan_tier, commission_rate_bps')
    .eq('venue_id', venueId).eq('status', 'active')
  if (error) throw new Error(`contract_read_failed venue=${venueId}: ${error.message}`)
  if (!data || data.length === 0) throw new Error(`no_active_contract venue=${venueId}`)
  if (data.length > 1) throw new Error(`multiple_active_contracts venue=${venueId}`)
  return data[0] as ActiveContract
}

// The lapsed-subscription fallback tier, read from standard_plans rather than hardcoded,
// so changing the Core commission is a data change and not a redeploy.
async function corePlan(): Promise<{ key: string; commission_rate_bps: number }> {
  const { data, error } = await admin
    .from('standard_plans')
    .select('key, commission_rate_bps')
    .eq('key', 'core')
    .maybeSingle()
  if (error) throw new Error(`core_plan_read_failed: ${error.message}`)
  if (!data) throw new Error('core_plan_missing')
  return data as { key: string; commission_rate_bps: number }
}

async function applyPlan(venueId: string, sub: Stripe.Subscription, metadataPlan?: string | null) {
  const contract = await activeContract(venueId)

  // Cross-check only. The contract is authoritative either way — this exists so a
  // subscription created against a tier the venue is not contracted on is surfaced
  // loudly instead of quietly reconciled.
  if (metadataPlan && metadataPlan !== contract.plan_tier) {
    throw new Error(
      `plan_mismatch venue=${venueId} stripe_plan=${metadataPlan} contract_plan=${contract.plan_tier} contract=${contract.id}`,
    )
  }

  // Paying → the venue gets exactly what it contracted. Not paying → it falls back to
  // Core's terms, which is a downgrade of ENTITLEMENT and does not alter the contract.
  const paying = ACTIVEISH.includes(sub.status)
  const core = paying ? null : await corePlan()
  const tier = paying ? contract.plan_tier : core!.key
  const rate = paying ? contract.commission_rate_bps : core!.commission_rate_bps

  const { error } = await admin.from('venues').update({
    plan_tier: tier,
    commission_rate_bps: rate,
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    subscription_current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
  }).eq('id', venueId)
  if (error) throw new Error(`venue_update_failed venue=${venueId}: ${error.message}`)
}

// Resolve the venue for a subscription: prefer metadata, else look up by stored id.
async function venueIdForSub(sub: Stripe.Subscription): Promise<string> {
  if (sub.metadata?.venue_id) return sub.metadata.venue_id
  const { data, error } = await admin.from('venues').select('id')
    .or(`stripe_subscription_id.eq.${sub.id},stripe_customer_id.eq.${sub.customer}`)
  if (error) throw new Error(`venue_lookup_failed sub=${sub.id}: ${error.message}`)
  if (!data || data.length === 0) throw new Error(`venue_unresolved sub=${sub.id} customer=${sub.customer}`)
  if (data.length > 1) throw new Error(`venue_ambiguous sub=${sub.id} customer=${sub.customer}`)
  return data[0].id as string
}

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature')
  const secret = Deno.env.get('STRIPE_BILLING_WEBHOOK_SECRET')
  const body = await req.text()

  let event: Stripe.Event
  try {
    if (!sig || !secret) throw new Error('missing signature or secret')
    event = await stripe.webhooks.constructEventAsync(body, sig, secret)
  } catch (err) {
    console.error('billing webhook signature error:', err)
    return new Response('bad signature', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session
        if (s.mode !== 'subscription' || !s.subscription) break
        const venueId = s.metadata?.venue_id
        // No default. A subscription checkout that reaches here without a venue is a
        // real failure: fail the delivery so it retries and shows in Stripe, rather
        // than 200-ing and losing the venue's plan state forever.
        if (!venueId) {
          throw new Error(`checkout_session_missing_venue_id session=${s.id}`)
        }
        const sub = await stripe.subscriptions.retrieve(s.subscription as string)
        await applyPlan(venueId, sub, s.metadata?.plan ?? null)
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const venueId = await venueIdForSub(sub)
        await applyPlan(venueId, sub, sub.metadata?.plan ?? null)
        break
      }
      default:
        break
    }
    return Response.json({ received: true })
  } catch (err) {
    console.error('billing webhook handler error:', event.type, err)
    return new Response('handler error', { status: 500 })
  }
})
