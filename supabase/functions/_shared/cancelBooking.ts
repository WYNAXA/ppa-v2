// Shared cancellation core, used by cancel-booking (booker path) and cancel-match
// (match-cancel path). Applies the venue cutoff: before cutoff => full refund via
// refundBooking; inside cutoff => cancel with no refund (forfeit). One source of truth.

import type Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { refundBooking, type RefundResult } from './refundBooking.ts'

const DEFAULT_CUTOFF_HOURS = 24

export interface CancelResult {
  cancelled: boolean
  refunded: boolean
  beforeCutoff: boolean
  status: string
  refund?: RefundResult
}

export async function cancelBookingWithRefund(
  supabaseAdmin: SupabaseClient,
  stripe: Stripe,
  bookingId: string,
  opts: { cancelledBy?: string | null; reason: string },
): Promise<CancelResult> {
  const { data: booking } = await supabaseAdmin
    .from('court_bookings')
    .select('id, status, start_at, venue_id')
    .eq('id', bookingId)
    .maybeSingle()
  if (!booking) {
    return { cancelled: false, refunded: false, beforeCutoff: false, status: 'not_found' }
  }
  if (['cancelled', 'released', 'completed'].includes(booking.status)) {
    return { cancelled: false, refunded: false, beforeCutoff: false, status: booking.status }
  }

  const { data: settings } = await supabaseAdmin
    .from('court_availability_settings')
    .select('cancellation_notice_hours')
    .eq('venue_id', booking.venue_id)
    .maybeSingle()
  const cutoffHours = settings?.cancellation_notice_hours ?? DEFAULT_CUTOFF_HOURS
  const cutoffMs = new Date(booking.start_at).getTime() - cutoffHours * 60 * 60 * 1000
  const beforeCutoff = Date.now() < cutoffMs
  const nowIso = new Date().toISOString()

  let refund: RefundResult | undefined
  const update: Record<string, unknown> = {
    status: 'cancelled',
    cancelled_at: nowIso,
    cancelled_by: opts.cancelledBy ?? null,
    cancellation_reason: opts.reason,
  }
  if (beforeCutoff) {
    refund = await refundBooking(supabaseAdmin, stripe, bookingId)
    update.paid_player_ids = []
  }

  const { data: done } = await supabaseAdmin
    .from('court_bookings')
    .update(update)
    .eq('id', bookingId)
    .in('status', ['held', 'confirmed', 'payment_pending'])
    .select('id')

  const cancelled = !!(done && done.length > 0)
  return { cancelled, refunded: beforeCutoff && cancelled, beforeCutoff, status: 'cancelled', refund }
}
