import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

// Commission (basis points) per plan. Founding venues always get the lowest (225).
const RATE_BY_TIER: Record<string, number> = { core: 325, plus: 275, pro: 225 }

async function applyPlan(venueId: string, plan: string, sub: Stripe.Subscription) {
  // Active-ish states keep the paid plan; anything else falls back to Core.
  const activeish = ['active', 'trialing', 'past_due'].includes(sub.status)
  const tier = activeish && (plan === 'plus' || plan === 'pro') ? plan : 'core'

  const { data: v } = await admin.from('venues').select('is_founding_venue').eq('id', venueId).maybeSingle()
  const rate = v?.is_founding_venue ? 225 : (RATE_BY_TIER[tier] ?? 325)

  await admin.from('venues').update({
    plan_tier: tier,
    commission_rate_bps: rate,
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    subscription_current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
  }).eq('id', venueId)
}

// Resolve the venue for a subscription: prefer metadata, else look up by stored id.
async function venueIdForSub(sub: Stripe.Subscription): Promise<string | null> {
  if (sub.metadata?.venue_id) return sub.metadata.venue_id
  const { data } = await admin.from('venues').select('id')
    .or(`stripe_subscription_id.eq.${sub.id},stripe_customer_id.eq.${sub.customer}`)
    .maybeSingle()
  return data?.id ?? null
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
        const plan = s.metadata?.plan ?? 'plus'
        if (!venueId) break
        const sub = await stripe.subscriptions.retrieve(s.subscription as string)
        await applyPlan(venueId, plan, sub)
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const venueId = await venueIdForSub(sub)
        if (!venueId) break
        await applyPlan(venueId, sub.metadata?.plan ?? 'core', sub)
        break
      }
      default:
        break
    }
    return Response.json({ received: true })
  } catch (err) {
    console.error('billing webhook handler error:', err)
    return new Response('handler error', { status: 500 })
  }
})
