// Deploy with: supabase functions deploy cancel-booking  (JWT verification ON)
// Booker-initiated cancellation. Before the venue cutoff => full refund + 'cancelled'.
// Inside the cutoff => 'cancelled' with NO refund (forfeit, per the payment model).

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { refundBooking } from '../_shared/refundBooking.ts'

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

    const { booking_id } = await req.json()
    if (!booking_id) {
      return Response.json({ error: 'booking_id is required' }, { status: 400, headers: cors })
    }

    const { data: booking } = await supabaseAdmin
      .from('court_bookings')
      .select('id, booked_by, status, start_at, venue_id')
      .eq('id', booking_id)
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

    const { data: settings } = await supabaseAdmin
      .from('court_availability_settings')
      .select('cancellation_notice_hours')
      .eq('venue_id', booking.venue_id)
      .maybeSingle()
    const cutoffHours = settings?.cancellation_notice_hours ?? 24

    const startMs = new Date(booking.start_at).getTime()
    const cutoffMs = startMs - cutoffHours * 60 * 60 * 1000
    const beforeCutoff = Date.now() < cutoffMs

    const nowIso = new Date().toISOString()

    if (beforeCutoff) {
      const refund = await refundBooking(supabaseAdmin, stripe, booking_id)
      await supabaseAdmin
        .from('court_bookings')
        .update({
          status: 'cancelled',
          cancelled_at: nowIso,
          cancelled_by: user.id,
          cancellation_reason: 'booker_cancelled',
          paid_player_ids: [],
        })
        .eq('id', booking_id)

      return Response.json({ cancelled: true, refunded: true, ...refund }, { headers: cors })
    }

    await supabaseAdmin
      .from('court_bookings')
      .update({
        status: 'cancelled',
        cancelled_at: nowIso,
        cancelled_by: user.id,
        cancellation_reason: 'booker_cancelled_inside_cutoff',
      })
      .eq('id', booking_id)

    return Response.json(
      { cancelled: true, refunded: false, reason: 'inside_cutoff' },
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
