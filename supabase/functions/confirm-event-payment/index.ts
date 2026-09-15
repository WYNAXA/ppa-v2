// Deploy with: supabase functions deploy confirm-event-payment
// verify_jwt: true — called by the client after stripe.confirmPayment() returns.
//
// Fast path: verifies the PI with Stripe and marks the order_item paid.
// The webhook is the authority; this is the accelerator that keeps UX sub-2s.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyAndFulfilEventPayment } from '../_shared/eventPayment.ts'

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  try {
    const { payment_intent_id } = await req.json()
    if (!payment_intent_id) {
      return Response.json({ error: 'payment_intent_id is required' }, { status: 400, headers: cors })
    }

    const result = await verifyAndFulfilEventPayment(stripe, admin, payment_intent_id)
    return Response.json(result, { status: result.success ? 200 : 400, headers: cors })
  } catch (err) {
    console.error('confirm-event-payment error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Confirmation failed' },
      { status: 500, headers: cors },
    )
  }
})
