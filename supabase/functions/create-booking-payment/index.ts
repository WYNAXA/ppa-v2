import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const MAX_SHARES = 8
const PLAYERS_PER_COURT = 4

function fail(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return Response.json({ error, ...extra }, { status, headers: cors })
}

async function venueCurrency(venueId: string): Promise<string | null> {
  const { data } = await supabase
    .from('padel_venues').select('currency').eq('venues_id', venueId).maybeSingle()
  return (data?.currency as string | null)?.toLowerCase() ?? null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  try {
    const body = await req.json()
    const {
      booking_id,
      player_ids: rawPlayerIds,
      share_count: rawShareCount,
      amount_pence: clientAmount,
      venue_id: rawVenueId,
      court_id, match_date, start_time, duration_minutes,
      booker_id, player_id, venue_name, guest_name,
    } = body

    // The amount is NEVER taken from the client. It is derived here, either from the
    // booking row (paying a share of an existing booking) or from resolve_court_price,
    // the same server-side pricing engine the booking screen reads.
    //
    // Before this, the function charged whatever amount_pence the browser sent, bounded
    // only by hardcoded GBP limits -- so a player could pay 1.00 instead of their real
    // share, and those same limits rejected legitimate bookings in nine countries
    // because they compared raw minor units of INR, SEK, AED, NOK, DKK, MXN, ZAR, SAR
    // and ARS against numbers that meant pounds.

    let venueId: string | null = null
    let perShare: number | null = null
    let currency: string | null = null
    let knownIds: Set<string> | null = null
    let paidIds = new Set<string>()

    if (booking_id) {
      // ── Paying a share of a booking that already exists ──────────────────────
      const { data: booking, error: bErr } = await supabase
        .from('court_bookings')
        .select('id, venue_id, status, price_per_player_pence, price_currency, player_ids, guest_players, paid_player_ids')
        .eq('id', booking_id)
        .maybeSingle()

      if (bErr) {
        console.error('create-booking-payment booking read failed:', bErr)
        return fail('booking_read_failed', 500)
      }
      if (!booking) return fail('booking_not_found', 404)
      if (booking.status === 'cancelled') return fail('booking_cancelled', 409)

      const p = booking.price_per_player_pence as number | null
      if (!Number.isInteger(p) || (p as number) <= 0) {
        console.error('create-booking-payment: booking has no usable per-player price', {
          booking_id, price_per_player_pence: p,
        })
        return fail('booking_price_invalid', 409)
      }

      venueId = booking.venue_id as string
      perShare = p as number
      currency = (booking.price_currency as string | null)?.toLowerCase() ?? await venueCurrency(venueId)

      const bookingPlayerIds = (booking.player_ids as string[] | null) ?? []
      const guestIds = ((booking.guest_players as { id?: string }[] | null) ?? [])
        .map((g) => g?.id).filter((x): x is string => !!x)
      knownIds = new Set([...bookingPlayerIds, ...guestIds])
      paidIds = new Set(((booking.paid_player_ids as string[] | null) ?? []))
    } else {
      // ── Deposit taken before the booking row exists (the booking screen) ─────
      // The price comes from the pricing engine, not from the browser.
      if (!rawVenueId) return fail('venue_id required')
      if (!match_date || !start_time || !duration_minutes) {
        return fail('match_date, start_time and duration_minutes required')
      }
      venueId = rawVenueId as string

      const { data: priced, error: pErr } = await supabase.rpc('resolve_court_price', {
        p_venue_id: venueId,
        p_court_id: court_id ?? null,
        p_date: match_date,
        p_start_time: String(start_time).length === 5 ? `${start_time}:00` : start_time,
        p_duration_minutes: duration_minutes,
        p_play_type: null,
        p_user_id: player_id ?? booker_id ?? null,
      })
      if (pErr) {
        console.error('create-booking-payment pricing failed:', pErr)
        return fail('pricing_failed', 500)
      }
      const result = priced as { status?: string; price_pence?: number | null; currency?: string | null } | null
      if (!result || result.status === 'not_configured' || result.price_pence == null) {
        return fail('pricing_unavailable', 409)
      }
      perShare = Math.round(result.price_pence / PLAYERS_PER_COURT)
      if (!Number.isInteger(perShare) || perShare <= 0) return fail('pricing_unavailable', 409)
      // The pricing engine returns the currency of the rule it resolved, which is more
      // authoritative than the venue's current setting for the price just quoted.
      currency = result.currency?.toLowerCase() ?? await venueCurrency(venueId)
    }

    // How many shares are being paid for.
    let shareCount: number
    if (Array.isArray(rawPlayerIds)) {
      const ids = [...new Set(rawPlayerIds as string[])]
      const payingFor = knownIds
        ? ids.filter((id) => knownIds!.has(id) && !paidIds.has(id))
        : ids
      if (payingFor.length === 0) return fail('nothing_to_pay_for', 409)
      shareCount = payingFor.length
    } else if (Number.isInteger(rawShareCount) && (rawShareCount as number) > 0) {
      shareCount = rawShareCount as number
    } else {
      return fail('player_ids or share_count required')
    }
    if (shareCount > MAX_SHARES) return fail('too_many_shares', 400, { max: MAX_SHARES })

    const amount = perShare * shareCount

    // A stale tab showing a price that has since changed must not pay the old figure
    // silently. Surface the disagreement rather than quietly charging either number.
    if (clientAmount != null && clientAmount !== amount) {
      return fail('amount_mismatch', 409, { expected_amount_minor: amount })
    }

    // There is no GBP fallback: if we cannot establish the currency we refuse rather
    // than charging a worldwide venue in pounds.
    if (!currency) {
      console.error('create-booking-payment: no currency', { booking_id, venue_id: venueId })
      return fail('currency_unknown', 409)
    }

    const { data: acct } = await supabase
      .from('venue_stripe_accounts')
      .select('stripe_account_id, charges_enabled')
      .eq('venue_id', venueId)
      .maybeSingle()

    if (!acct || !acct.charges_enabled || !acct.stripe_account_id) {
      return fail('venue_not_set_up_for_payments')
    }

    // Per-venue platform commission in basis points. Wynaxa keeps this and bears
    // Stripe fees + disputes; tier/founding venues pay less.
    const { data: venueRate } = await supabase
      .from('venues').select('commission_rate_bps').eq('id', venueId).maybeSingle()
    const rate_bps = venueRate?.commission_rate_bps ?? 350
    const application_fee_amount = Math.round(amount * rate_bps / 10000)

    const metadata: Record<string, string> = {
      booker_id: booker_id ?? '',
      player_id: player_id ?? '',
      venue_id: venueId,
      venue_name: venue_name ?? '',
      match_date: match_date ?? '',
      start_time: start_time ?? '',
      share_count: String(shareCount),
    }
    if (booking_id) metadata.booking_id = booking_id
    if (guest_name) metadata.guest_name = guest_name

    // Destination charge: full amount charged to customer, venue receives
    // amount minus application_fee_amount, Wynaxa is merchant of record.
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      application_fee_amount,
      transfer_data: { destination: acct.stripe_account_id },
      metadata,
      automatic_payment_methods: { enabled: true },
    })

    return Response.json(
      {
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        amount_minor: amount,
        currency: currency.toUpperCase(),
      },
      { headers: cors },
    )
  } catch (err) {
    console.error('create-booking-payment error:', err)
    return fail(err instanceof Error ? err.message : 'Payment setup failed', 500)
  }
})
