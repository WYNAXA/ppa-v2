// Deploy with: supabase functions deploy cancel-match  (JWT verification ON)
// Kills a match AND cancels/refunds its linked court booking via the shared helper.
// Auth: any match participant (in player_ids) or the creator. Cutoff/refund policy
// is identical to a booker cancel (handled inside cancelBookingWithRefund).

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

    const { match_id } = await req.json()
    if (!match_id) {
      return Response.json({ error: 'match_id is required' }, { status: 400, headers: cors })
    }

    const { data: match } = await supabaseAdmin
      .from('matches')
      .select('id, status, created_by, player_ids, match_date')
      .eq('id', match_id)
      .maybeSingle()
    if (!match) {
      return Response.json({ error: 'Match not found' }, { status: 404, headers: cors })
    }

    // Permission: any participant or the creator (created_by, or first player as fallback).
    const players: string[] = match.player_ids ?? []
    const creatorId = match.created_by ?? (players.length > 0 ? players[0] : null)
    const allowed = players.includes(user.id) || creatorId === user.id
    if (!allowed) {
      return Response.json({ error: 'Not allowed to cancel this match' }, { status: 403, headers: cors })
    }

    if (['cancelled', 'completed'].includes(match.status)) {
      return Response.json({ error: 'Match is already ' + match.status }, { status: 409, headers: cors })
    }

    // Cancel + refund the linked booking FIRST, so a refund failure aborts before
    // the match is killed (never leave a cancelled match with a paid, live booking).
    let bookingResult = null
    const { data: bk } = await supabaseAdmin
      .from('court_bookings')
      .select('id')
      .eq('match_id', match_id)
      .in('status', ['held', 'confirmed', 'payment_pending'])
      .maybeSingle()
    if (bk) {
      bookingResult = await cancelBookingWithRefund(supabaseAdmin, stripe, bk.id, {
        cancelledBy: user.id,
        reason: 'match_cancelled',
      })
      const refundErrors = bookingResult.refund?.errors ?? []
      if (refundErrors.length > 0) {
        return Response.json(
          { error: 'Refund failed; match not cancelled', refund_errors: refundErrors },
          { status: 502, headers: cors },
        )
      }
    }

    // Booking settled — now kill the match (guarded so a concurrent cancel is a no-op).
    const { data: killed } = await supabaseAdmin
      .from('matches')
      .update({
        status: 'cancelled',
        is_open: false,
        open_elo_min: null,
        open_elo_max: null,
        booked_venue_name: null,
        booked_venue_id: null,
        booked_court_number: null,
        booking_reference: null,
        booked_at: null,
        booked_by: null,
        booking_status: 'not_booked',
      })
      .eq('id', match_id)
      .neq('status', 'cancelled')
      .select('id')
    if (!killed || killed.length === 0) {
      return Response.json({ error: 'Match is already cancelled' }, { status: 409, headers: cors })
    }

    // Notify the other real participants.
    const others = players.filter((pid) => pid && pid !== user.id)
    if (others.length > 0) {
      const { data: realProfiles } = await supabaseAdmin
        .from('profiles').select('id').in('id', others)
      const validIds = (realProfiles ?? []).map((p: { id: string }) => p.id)
      if (validIds.length > 0) {
        let dateStr = match.match_date as string
        try {
          dateStr = new Date(match.match_date + 'T00:00:00Z').toLocaleDateString('en-GB', {
            weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
          })
        } catch { /* keep raw date */ }

        let cancellerName = 'A player'
        const { data: prof } = await supabaseAdmin
          .from('profiles').select('name').eq('id', user.id).maybeSingle()
        if (prof?.name) cancellerName = prof.name

        await supabaseAdmin.from('notifications').insert(
          validIds.map((uid: string) => ({
            user_id: uid,
            type: 'match_cancelled',
            title: 'Match cancelled',
            message: cancellerName + ' cancelled the match on ' + dateStr,
            related_id: match_id,
            read: false,
          })),
        )
      }
    }

    return Response.json(
      { cancelled: true, booking: bookingResult },
      { headers: cors },
    )
  } catch (err) {
    console.error('cancel-match error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Cancellation failed' },
      { status: 500, headers: cors },
    )
  }
})
