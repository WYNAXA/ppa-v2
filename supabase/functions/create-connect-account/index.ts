import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

// Service-role client for venue_stripe_accounts writes (bypasses RLS)
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

const MANAGER_URL =
  Deno.env.get('MANAGER_URL') ?? 'https://venue-manager-bay.vercel.app'

const COUNTRY_MAP: Record<string, string> = {
  'United Kingdom': 'GB',
  'Ireland': 'IE',
  'Spain': 'ES',
  'France': 'FR',
  'Italy': 'IT',
  'Portugal': 'PT',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      },
    })
  }

  try {
    const { venue_id } = await req.json()
    if (!venue_id) {
      return Response.json(
        { error: 'venue_id is required' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } },
      )
    }

    // Auth: create a client scoped to the caller's JWT
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()
    if (!user) {
      return Response.json(
        { error: 'Not authenticated' },
        { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } },
      )
    }

    // Verify caller is an active owner of this venue (service-role bypasses RLS)
    const { data: access } = await supabaseAdmin
      .from('venue_users')
      .select('id')
      .eq('venue_id', venue_id)
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .eq('status', 'active')
      .maybeSingle()

    if (!access) {
      return Response.json(
        { error: 'Only active venue owners can set up payments' },
        { status: 403, headers: { 'Access-Control-Allow-Origin': '*' } },
      )
    }

    // Look up venue country (service-role bypasses RLS)
    const { data: venue } = await supabaseAdmin
      .from('venues')
      .select('country')
      .eq('id', venue_id)
      .single()

    const countryIso = COUNTRY_MAP[venue?.country ?? ''] ?? 'GB'

    // Check for existing Stripe account
    const { data: existing } = await supabaseAdmin
      .from('venue_stripe_accounts')
      .select('stripe_account_id')
      .eq('venue_id', venue_id)
      .maybeSingle()

    let stripeAccountId = existing?.stripe_account_id ?? null

    if (!stripeAccountId) {
      // Create a new Stripe Express connected account
      const account = await stripe.accounts.create({
        type: 'express',
        country: countryIso,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { venue_id },
      })

      stripeAccountId = account.id

      // Upsert venue_stripe_accounts (service role to bypass RLS)
      const { error: upsertErr } = await supabaseAdmin
        .from('venue_stripe_accounts')
        .upsert(
          { venue_id, stripe_account_id: stripeAccountId },
          { onConflict: 'venue_id' },
        )

      if (upsertErr) {
        console.error('venue_stripe_accounts upsert error:', upsertErr)
        return Response.json(
          { error: upsertErr.message },
          { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } },
        )
      }
    }

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${MANAGER_URL}/settings/payments?refresh=1`,
      return_url: `${MANAGER_URL}/settings/payments?return=1`,
      type: 'account_onboarding',
    })

    return Response.json(
      { url: accountLink.url },
      { headers: { 'Access-Control-Allow-Origin': '*' } },
    )
  } catch (err) {
    console.error('create-connect-account error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to create connect account' },
      { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } },
    )
  }
})
