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

// Wynaxa SaaS plans. Core is free (no subscription); Plus/Pro are monthly. Amounts
// in GBP minor units — the SaaS fee is billed in GBP (booking commission is separate
// and charged in the venue's own currency).
const PLANS: Record<string, { amount: number; name: string }> = {
  plus: { amount: 4900, name: 'Hub Plus' },
  pro: { amount: 17900, name: 'Hub Pro' },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  try {
    const { venue_id, plan, return_url } = await req.json()
    const planDef = PLANS[plan]
    if (!venue_id || !planDef) {
      return Response.json({ error: 'venue_id and a valid plan (plus|pro) are required' }, { status: 400, headers: cors })
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
          currency: 'gbp',
          product_data: { name: `Wynaxa ${planDef.name}` },
          unit_amount: planDef.amount,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      metadata: { venue_id, plan },
      subscription_data: { metadata: { venue_id, plan } },
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
