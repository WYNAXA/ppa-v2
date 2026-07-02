// Deploy: supabase functions deploy process-booking-deadlines --no-verify-jwt
// Cron-invoked. Resolves held bookings past their payment deadline:
//  - fully paid but still held -> confirmed (backstop for record-payment)
//  - short, before cutoff, not yet reminded -> nudge booker to top up (once)
//  - short, past cutoff -> release (refund partial payers) + status 'released'
// Guarded by the x-cron-secret header.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { refundBooking } from '../_shared/refundBooking.ts'

const PLAYERS_PER_COURT = 4
const DEFAULT_CUTOFF_HOURS = 24

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

Deno.serve(async (req: Request) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const summary = { confirmed: 0, reminded: 0, released: 0, errors: [] as string[] }

  try {
    const nowMs = Date.now()
    const nowIso = new Date(nowMs).toISOString()

    const { data: bookings, error } = await supabaseAdmin
      .from('court_bookings')
      .select('id, booked_by, venue_id, start_at, player_ids, deadline_reminder_sent')
      .eq('status', 'held')
      .lt('payment_deadline', nowIso)
    if (error) {
      summary.errors.push('booking query failed: ' + error.message)
      return Response.json(summary, { status: 500 })
    }
    if (!bookings || bookings.length === 0) return Response.json(summary)

    const cutoffCache = new Map<string, number>()
    async function cutoffHoursFor(venueId: string): Promise<number> {
      if (cutoffCache.has(venueId)) return cutoffCache.get(venueId)!
      const { data: s } = await supabaseAdmin
        .from('court_availability_settings')
        .select('cancellation_notice_hours')
        .eq('venue_id', venueId)
        .maybeSingle()
      const hours = s?.cancellation_notice_hours ?? DEFAULT_CUTOFF_HOURS
      cutoffCache.set(venueId, hours)
      return hours
    }

    for (const b of bookings) {
      try {
        const { data: paidRows } = await supabaseAdmin
          .from('booking_payments')
          .select('share_count')
          .eq('booking_id', b.id)
          .eq('status', 'paid')
        const paidShares = (paidRows ?? []).reduce(
          (sum: number, r: { share_count: number | null }) => sum + (r.share_count ?? 0),
          0,
        )

        if (paidShares >= PLAYERS_PER_COURT) {
          const { data: flipped } = await supabaseAdmin
            .from('court_bookings')
            .update({ status: 'confirmed' })
            .eq('id', b.id)
            .eq('status', 'held')
            .select('id')
          if (flipped && flipped.length > 0) summary.confirmed++
          continue
        }

        const cutoffHours = await cutoffHoursFor(b.venue_id)
        const cutoffMs = new Date(b.start_at).getTime() - cutoffHours * 60 * 60 * 1000

        if (nowMs >= cutoffMs) {
          const refund = await refundBooking(supabaseAdmin, stripe, b.id)
          const { data: released } = await supabaseAdmin
            .from('court_bookings')
            .update({
              status: 'released',
              cancelled_at: nowIso,
              cancellation_reason: 'auto_released_unpaid',
              paid_player_ids: [],
            })
            .eq('id', b.id)
            .eq('status', 'held')
            .select('id')
          if (released && released.length > 0) {
            summary.released++
            const recipients: string[] = Array.isArray(b.player_ids) && b.player_ids.length > 0
              ? b.player_ids
              : [b.booked_by]
            await supabaseAdmin.from('notifications').insert(
              recipients.map((uid) => ({
                user_id: uid,
                type: 'booking_released',
                title: 'Court released',
                message: 'Your held court was released because the group did not pay in time. Any payments have been refunded.',
                related_id: b.id,
                read: false,
              })),
            )
          }
          if (refund.errors.length > 0) {
            summary.errors.push('refund ' + b.id + ': ' + refund.errors.join('; '))
          }
        } else {
          if (!b.deadline_reminder_sent) {
            await supabaseAdmin.from('notifications').insert({
              user_id: b.booked_by,
              type: 'booking_topup_reminder',
              title: 'Payment deadline passed',
              message: 'Your group has not fully paid. Top up the remaining shares before the cutoff or the court will be released.',
              related_id: b.id,
              read: false,
            })
            await supabaseAdmin
              .from('court_bookings')
              .update({ deadline_reminder_sent: true })
              .eq('id', b.id)
            summary.reminded++
          }
        }
      } catch (err) {
        summary.errors.push(b.id + ': ' + (err instanceof Error ? err.message : 'failed'))
      }
    }

    return Response.json(summary)
  } catch (err) {
    console.error('process-booking-deadlines error:', err)
    summary.errors.push(err instanceof Error ? err.message : 'fatal')
    return Response.json(summary, { status: 500 })
  }
})
