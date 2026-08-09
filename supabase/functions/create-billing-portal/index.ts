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

// Opens the Stripe customer portal so an owner can update card, change or cancel plan.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  try {
    const { venue_id, return_url } = await req.json()
    if (!venue_id) return Response.json({ error: 'venue_id required' }, { status: 400, headers: cors })

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

    const { data: v } = await admin.from('venues').select('stripe_customer_id').eq('id', venue_id).maybeSingle()
    if (!v?.stripe_customer_id) return Response.json({ error: 'no_subscription' }, { status: 400, headers: cors })

    const session = await stripe.billingPortal.sessions.create({
      customer: v.stripe_customer_id,
      return_url: (return_url as string) || 'https://hub.wynaxa.com/settings/billing',
    })
    return Response.json({ url: session.url }, { headers: cors })
  } catch (err) {
    console.error('create-billing-portal error:', err)
    return Response.json({ error: err instanceof Error ? err.message : 'Portal failed' }, { status: 500, headers: cors })
  }
})
