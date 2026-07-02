// Deploy with: supabase functions deploy cancel-booking  (JWT verification ON)
// Booker-initiated "cancel the court, keep the match". Accepts booking_id OR match_id.
// Refunds via the shared helper (the retired cancel_booking RPC never refunded),
// then unbooks the match so it can be rebooked elsewhere, and notifies players.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cancelBookingWithRefund } from '../_shared/cancelBooking.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabaseAdmin = createClient(
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
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwtClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await jwtClient.auth.getUser()
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors })
    }

    const body = await req.json()
    let booking_id: string | undefined = body.booking_id
    const match_id: string | undefined = body.match_id
    if (!booking_id && !match_id) {
      return Response.json(
        { error: 'booking_id or match_id is required' },
        { status: 400, headers: cors },
      )
    }

    // Resolve match_id -> the active booking if only a match id was given.
    if (!booking_id && match_id) {
      const { data: mb } = await supabaseAdmin
        .from('court_bookings')
        .select('id')
        .eq('match_id', match_id)
        .in('status', ['held', 'confirmed', 'payment_pending'])
        .maybeSingle()
      if (!mb) {
        return Response.json({ error: 'No active booking for this match' }, { status: 404, headers: cors })
      }
      booking_id = mb.id
    }

    const { data: booking } = await supabaseAdmin
      .from('court_bookings')
      .select('id, booked_by, status, match_id')
      .eq('id', booking_id!)
      .maybeSingle()
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404, headers: cors })
    }
    if (booking.booked_by !== user.id) {
      return Response.json({ error: 'Only the booker can cancel' }, { status: 403, headers: cors })
    }
    if (['cancelled', 'released', 'completed'].includes(booking.status)) {
      return Response.json(
        { error: 'Booking is already ' + booking.status },
        { status: 409, headers: cors },
      )
    }

    const result = await cancelBookingWithRefund(supabaseAdmin, stripe, booking_id!, {
      cancelledBy: user.id,
      reason: 'booker_cancelled',
    })

    // Match-side unbooking: keep the match alive but return it to re-bookable state.
    const effectiveMatchId = booking.match_id ?? match_id
    if (effectiveMatchId) {
      const { data: matchRow } = await supabaseAdmin
        .from('matches')
        .select('player_ids')
        .eq('id', effectiveMatchId)
        .maybeSingle()

      const { data: unbooked } = await supabaseAdmin
        .from('matches')
        .update({
          booked_venue_name: null,
          booked_venue_id: null,
          booked_court_number: null,
          booking_reference: null,
          booked_at: null,
          booked_by: null,
          booking_status: 'not_booked',
          updated_at: new Date().toISOString(),
        })
        .eq('id', effectiveMatchId)
        .eq('booking_status', 'booked')
        .select('id')

      // Only notify if this call is what actually unbooked the match (no double-notify).
      const didUnbook = !!(unbooked && unbooked.length > 0)

      let bookerName = 'The booker'
      const { data: prof } = await supabaseAdmin
        .from('profiles').select('name').eq('id', user.id).maybeSingle()
      if (prof?.name) bookerName = prof.name

      const others = (matchRow?.player_ids ?? []).filter((pid: string) => pid && pid !== user.id)
      if (didUnbook && others.length > 0) {
        await supabaseAdmin.from('notifications').insert(
          others.map((uid: string) => ({
            user_id: uid,
            type: 'court_booking_cancelled',
            title: 'Booking cancelled',
            message: bookerName + ' cancelled the court booking. The match needs a new court.',
            related_id: effectiveMatchId,
            read: false,
          })),
        )
      }
    }

    return Response.json(
      {
        cancelled: result.cancelled,
        refunded: result.refunded,
        reason: result.beforeCutoff ? undefined : 'inside_cutoff',
        ...(result.refund ?? {}),
      },
      { headers: cors },
    )
  } catch (err) {
    console.error('cancel-booking error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Cancellation failed' },
      { status: 500, headers: cors },
    )
  }
})
