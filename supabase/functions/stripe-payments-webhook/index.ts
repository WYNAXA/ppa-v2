// Deploy with: supabase functions deploy stripe-payments-webhook
// verify_jwt: false — Stripe sends the request, not a user.
//
// The authority. If the client callback in confirm-event-payment fails (phone
// drops signal, browser crashes), this webhook is what reconciles: Stripe has
// the money, so it calls us, and we write the row.
//
// Signature handling copied verbatim from stripe-billing-webhook. Uses its own
// secret STRIPE_PAYMENTS_WEBHOOK_SECRET so the two endpoints are independently
// rotatable.

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

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature')
  const secret = Deno.env.get('STRIPE_PAYMENTS_WEBHOOK_SECRET')
  const body = await req.text()

  let event: Stripe.Event
  try {
    if (!sig || !secret) throw new Error('missing signature or secret')
    event = await stripe.webhooks.constructEventAsync(body, sig, secret)
  } catch (err) {
    console.error('payments webhook signature error:', err)
    return new Response('bad signature', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent

        // Only handle event_entry PIs. Court bookings go through record-payment.
        if (pi.metadata?.type !== 'event_entry') break

        const result = await verifyAndFulfilEventPayment(stripe, admin, pi.id)
        if (!result.success) {
          // Throw to 500 so Stripe retries. Same pattern as billing webhook.
          throw new Error(`fulfilment failed: ${result.error}`)
        }
        break
      }
      default:
        break
    }
    return Response.json({ received: true })
  } catch (err) {
    console.error('payments webhook handler error:', event.type, err)
    return new Response('handler error', { status: 500 })
  }
})
