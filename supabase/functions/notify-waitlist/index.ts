// notify-waitlist — scheduled scan. For each 'waiting' slot_waitlist entry whose
// desired slot now has a free court, push the player and mark it 'notified'.
// Past-dated entries are expired. Self-contained; touches no other function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const nowIso = new Date().toISOString()

  const { data: entries } = await supabase
    .from('slot_waitlist')
    .select('id, venue_id, user_id, date, start_time, duration_minutes')
    .eq('status', 'waiting')
    .limit(500)

  if (!entries || entries.length === 0) {
    return new Response(JSON.stringify({ scanned: 0, notified: 0, expired: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Cache courts + venue names per venue across entries.
  const courtsCache = new Map<string, string[]>()
  const venueNameCache = new Map<string, string>()

  async function courtsFor(venueId: string): Promise<string[]> {
    if (courtsCache.has(venueId)) return courtsCache.get(venueId)!
    const { data } = await supabase.from('courts').select('id').eq('venue_id', venueId).eq('status', 'active')
    const ids = (data ?? []).map((c: { id: string }) => c.id)
    courtsCache.set(venueId, ids)
    return ids
  }
  async function venueNameFor(venueId: string): Promise<string> {
    if (venueNameCache.has(venueId)) return venueNameCache.get(venueId)!
    const { data } = await supabase.from('padel_venues').select('venue_name').eq('venues_id', venueId).maybeSingle()
    const name = data?.venue_name ?? 'your venue'
    venueNameCache.set(venueId, name)
    return name
  }

  let notified = 0, expired = 0

  for (const e of entries) {
    // Bookings store start_at as wall-clock-as-UTC (`${date}T${time}+00:00`).
    const startAt = new Date(`${e.date}T${e.start_time}+00:00`)
    const endAt = new Date(startAt.getTime() + (e.duration_minutes ?? 90) * 60_000)

    if (endAt.getTime() < Date.now()) {
      await supabase.from('slot_waitlist').update({ status: 'expired' }).eq('id', e.id)
      expired++
      continue
    }

    const courtIds = await courtsFor(e.venue_id)
    if (courtIds.length === 0) continue

    const { data: overlaps } = await supabase
      .from('bookings')
      .select('court_id')
      .eq('venue_id', e.venue_id)
      .eq('reservation_state', 'active')
      .lt('start_at', endAt.toISOString())
      .gt('end_at', startAt.toISOString())

    const takenCourts = new Set((overlaps ?? []).map((b: { court_id: string | null }) => b.court_id))
    const hasFreeCourt = courtIds.some(id => !takenCourts.has(id))
    if (!hasFreeCourt) continue

    const venueName = await venueNameFor(e.venue_id)
    const timeLabel = e.start_time.slice(0, 5)
    try {
      await supabase.functions.invoke('send-push', {
        body: {
          user_ids: [e.user_id],
          title: 'A court just opened! 🎾',
          message: `${venueName} has a court free at ${timeLabel} on ${e.date}. Book it before it goes.`,
          url: '/community#venues',
          tag: `waitlist-${e.id}`,
        },
      })
    } catch (_err) {
      // Push failure shouldn't strand the entry as waiting forever; still mark notified.
    }
    await supabase.from('slot_waitlist').update({ status: 'notified', notified_at: nowIso }).eq('id', e.id)
    notified++
  }

  return new Response(JSON.stringify({ scanned: entries.length, notified, expired }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
