// Deploy with: supabase functions deploy stripe-connect-webhook --no-verify-jwt
// Stripe calls this directly — no Supabase JWT auth required.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type, stripe-signature',
      },
    })
  }

  // Read raw body BEFORE parsing — required for signature verification
  const rawBody = await req.text()
  const signature = req.headers.get('Stripe-Signature')

  if (!signature) {
    return Response.json(
      { error: 'Missing Stripe-Signature header' },
      { status: 400 },
    )
  }

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET') ?? '',
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return Response.json(
      { error: 'Invalid signature' },
      { status: 400 },
    )
  }

  // Handle account.updated — sync status into venue_stripe_accounts
  if (event.type === 'account.updated') {
    const acct = event.data.object as Stripe.Account

    console.log(
      `account.updated: ${acct.id} charges=${acct.charges_enabled} payouts=${acct.payouts_enabled} details=${acct.details_submitted}`,
    )

    // Build the update payload
    const update: Record<string, unknown> = {
      charges_enabled: acct.charges_enabled,
      payouts_enabled: acct.payouts_enabled,
      details_submitted: acct.details_submitted,
    }

    // Set onboarded_at only when charges become enabled and it hasn't been set yet
    if (acct.charges_enabled) {
      // First check if onboarded_at is already set
      const { data: existing } = await supabaseAdmin
        .from('venue_stripe_accounts')
        .select('onboarded_at')
        .eq('stripe_account_id', acct.id)
        .maybeSingle()

      if (existing && !existing.onboarded_at) {
        update.onboarded_at = new Date().toISOString()
      }
    }

    const { data, error } = await supabaseAdmin
      .from('venue_stripe_accounts')
      .update(update)
      .eq('stripe_account_id', acct.id)
      .select('venue_id')
      .maybeSingle()

    if (error) {
      console.error('venue_stripe_accounts update error:', error)
    } else if (!data) {
      console.log(`No venue_stripe_accounts row for stripe account ${acct.id} — ignoring`)
    } else {
      console.log(`Updated venue_stripe_accounts for venue ${data.venue_id}`)
    }
  } else {
    console.log(`Ignoring event type: ${event.type}`)
  }

  return Response.json({ received: true })
})
