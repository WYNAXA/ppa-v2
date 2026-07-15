// Venue-event types & query helpers
// Tables live in the shared DB (created by VM): venue_events,
// venue_event_occurrences, venue_event_participants, products, order_items.

import { supabase } from './supabase'
import { calculateDistance } from './travelUtils'

// ── Types ────────────────────────────────────────────────────────────────────

export interface VenueEvent {
  id: string
  venue_id: string
  name: string
  description: string | null
  event_type: string | null
  level_min: number | null
  level_max: number | null
  price_pence: number | null
  payment_type: 'pay_at_venue' | 'pay_in_app'
  open_to_join: boolean
  visibility: 'public' | 'members'
  status: string
  image_url: string | null
  created_at: string
}

export interface VenueEventOccurrence {
  id: string
  event_id: string
  starts_at: string
  ends_at: string | null
  capacity: number
  spots_taken: number
  status: string
  created_at: string
}

export interface VenueEventParticipant {
  id: string
  occurrence_id: string
  user_id: string
  status: 'joined' | 'cancelled' | 'pending'
  created_at: string
}

/** Flattened row returned by the discover query (occurrence + parent event + venue). */
export interface DiscoverableEvent {
  occurrence_id: string
  starts_at: string
  ends_at: string | null
  capacity: number
  spots_taken: number
  event_id: string
  event_name: string
  event_description: string | null
  event_type: string | null
  level_min: number | null
  level_max: number | null
  price_pence: number | null
  payment_type: 'pay_at_venue' | 'pay_in_app'
  image_url: string | null
  venue_id: string
  venue_name: string
  venue_city: string | null
  venue_latitude: number | null
  venue_longitude: number | null
  // computed client-side
  distance_miles: number | null
}

// ── Venue display lookup ─────────────────────────────────────────────────────
// venue_events.venue_id → venues.id (the anchor).
// padel_venues.venues_id → venues.id (the display listing).
// PostgREST can't do a two-hop join, so we fetch padel_venues separately by
// matching venues_id to the set of venue_ids we got from venue_events.

async function resolveVenueDisplay(venueIds: string[]): Promise<Map<string, {
  venue_name: string
  city: string | null
  full_address: string | null
  latitude: number | null
  longitude: number | null
}>> {
  const map = new Map<string, { venue_name: string; city: string | null; full_address: string | null; latitude: number | null; longitude: number | null }>()
  if (venueIds.length === 0) return map

  const unique = [...new Set(venueIds)]
  const { data } = await supabase
    .from('padel_venues')
    .select('venues_id, venue_name, city, full_address, latitude, longitude')
    .in('venues_id', unique)

  for (const row of data ?? []) {
    map.set(row.venues_id, {
      venue_name: row.venue_name,
      city: row.city ?? null,
      full_address: row.full_address ?? null,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
    })
  }
  return map
}

// ── Discover query ───────────────────────────────────────────────────────────

/**
 * Fetch upcoming public, joinable venue-event occurrences.
 * Sorted by distance from the user's saved location (falls back to starts_at).
 */
export async function discoverVenueEvents(
  userLat: number | null,
  userLng: number | null,
): Promise<DiscoverableEvent[]> {
  const now = new Date().toISOString()

  // Step 1: occurrences → venue_events (one-hop; no padel_venues join)
  const { data, error } = await supabase
    .from('venue_event_occurrences')
    .select(`
      id,
      event_id,
      starts_at,
      ends_at,
      capacity,
      spots_taken,
      status,
      venue_events!inner (
        id,
        venue_id,
        name,
        description,
        event_type,
        level_min,
        level_max,
        price_pence,
        payment_type,
        open_to_join,
        visibility,
        status,
        image_url
      )
    `)
    .eq('venue_events.open_to_join', true)
    .eq('venue_events.visibility', 'public')
    .eq('venue_events.status', 'scheduled')
    .eq('status', 'scheduled')
    .gt('starts_at', now)
    .order('starts_at', { ascending: true })
    .limit(30)

  if (error) {
    console.error('discoverVenueEvents error:', error)
    return []
  }

  if (!data || data.length === 0) return []

  // Step 2: resolve venue display info via padel_venues.venues_id
  const venueIds = (data as any[]).map((occ: any) => occ.venue_events.venue_id as string)
  const venueMap = await resolveVenueDisplay(venueIds)

  const rows: DiscoverableEvent[] = (data as any[]).map((occ: any) => {
    const ev = occ.venue_events
    const v = venueMap.get(ev.venue_id)
    const vLat = v?.latitude ?? null
    const vLng = v?.longitude ?? null
    const dist =
      userLat != null && userLng != null && vLat != null && vLng != null
        ? calculateDistance(userLat, userLng, vLat, vLng)
        : null

    return {
      occurrence_id: occ.id,
      starts_at: occ.starts_at,
      ends_at: occ.ends_at,
      capacity: occ.capacity,
      spots_taken: occ.spots_taken,
      event_id: ev.id,
      event_name: ev.name,
      event_description: ev.description,
      event_type: ev.event_type,
      level_min: ev.level_min,
      level_max: ev.level_max,
      price_pence: ev.price_pence,
      payment_type: ev.payment_type ?? 'pay_at_venue',
      image_url: ev.image_url,
      venue_id: ev.venue_id,
      venue_name: v?.venue_name ?? 'Venue',
      venue_city: v?.city ?? null,
      venue_latitude: vLat,
      venue_longitude: vLng,
      distance_miles: dist,
    }
  })

  // Sort by distance (nearest first) when location available, otherwise by time
  rows.sort((a, b) => {
    if (a.distance_miles != null && b.distance_miles != null) {
      return a.distance_miles - b.distance_miles
    }
    if (a.distance_miles != null) return -1
    if (b.distance_miles != null) return 1
    return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
  })

  return rows
}

// ── Fetch single occurrence detail ───────────────────────────────────────────

export async function fetchOccurrenceDetail(occurrenceId: string) {
  // Step 1: occurrence → venue_event (one hop only)
  const { data, error } = await supabase
    .from('venue_event_occurrences')
    .select(`
      id,
      event_id,
      starts_at,
      ends_at,
      capacity,
      spots_taken,
      status,
      venue_events!inner (
        id,
        venue_id,
        name,
        description,
        event_type,
        level_min,
        level_max,
        price_pence,
        payment_type,
        open_to_join,
        visibility,
        status,
        image_url
      )
    `)
    .eq('id', occurrenceId)
    .maybeSingle()

  if (error || !data) return null

  const ev = (data as any).venue_events

  // Step 2: resolve venue display via padel_venues.venues_id
  const venueMap = await resolveVenueDisplay([ev.venue_id])
  const v = venueMap.get(ev.venue_id)

  return {
    occurrence: {
      id: data.id,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      capacity: data.capacity,
      spots_taken: data.spots_taken,
      status: data.status,
    },
    event: {
      id: ev.id,
      venue_id: ev.venue_id,
      name: ev.name,
      description: ev.description,
      event_type: ev.event_type,
      level_min: ev.level_min,
      level_max: ev.level_max,
      price_pence: ev.price_pence,
      payment_type: (ev.payment_type ?? 'pay_at_venue') as 'pay_at_venue' | 'pay_in_app',
      open_to_join: ev.open_to_join,
      visibility: ev.visibility,
      image_url: ev.image_url,
    },
    venue: {
      venue_id: ev.venue_id,
      venue_name: v?.venue_name ?? 'Venue',
      city: v?.city ?? null,
      full_address: v?.full_address ?? null,
      latitude: v?.latitude ?? null,
      longitude: v?.longitude ?? null,
    },
  }
}

// ── Fetch participants for an occurrence ─────────────────────────────────────

export async function fetchParticipants(occurrenceId: string) {
  const { data, error } = await supabase
    .from('venue_event_participants')
    .select('id, occurrence_id, user_id, status, created_at')
    .eq('occurrence_id', occurrenceId)
    .eq('status', 'joined')

  if (error) {
    console.error('fetchParticipants error:', error)
    return []
  }
  return data ?? []
}

// ── Connections helper ───────────────────────────────────────────────────────

/** Return Set of user IDs the viewer has an accepted connection with. */
export async function fetchConnectionIds(userId: string): Promise<Set<string>> {
  const [outgoing, incoming] = await Promise.all([
    supabase
      .from('player_connections')
      .select('connected_user_id')
      .eq('user_id', userId)
      .eq('status', 'accepted'),
    supabase
      .from('player_connections')
      .select('user_id')
      .eq('connected_user_id', userId)
      .eq('status', 'accepted'),
  ])

  const ids = new Set<string>()
  for (const r of outgoing.data ?? []) ids.add(r.connected_user_id)
  for (const r of incoming.data ?? []) ids.add(r.user_id)
  return ids
}

// ── Join / leave helpers ─────────────────────────────────────────────────────

/**
 * Join a pay_at_venue event (no payment required).
 * Uses the server-side RPC for atomic capacity enforcement.
 */
export async function joinVenueEvent(occurrenceId: string) {
  const { data, error } = await supabase.rpc('join_venue_event', {
    p_occurrence_id: occurrenceId,
  })
  if (error) throw error
  if (!(data as any)?.success) {
    throw new Error((data as any)?.error ?? 'Failed to join event')
  }
  return data
}

/**
 * Finalise a pay_in_app join after Stripe payment succeeds.
 * Uses the same atomic RPC but includes payment proof.
 */
export async function finaliseEventPayment(
  occurrenceId: string,
  orderItemId: string,
  stripePaymentIntentId: string,
) {
  const { data, error } = await supabase.rpc('join_venue_event', {
    p_occurrence_id: occurrenceId,
    p_order_item_id: orderItemId,
    p_stripe_pi_id: stripePaymentIntentId,
  })
  if (error) throw error
  if (!(data as any)?.success) {
    throw new Error((data as any)?.error ?? 'Failed to finalise payment')
  }
  return data
}

/**
 * Cancel participation — marks cancelled, decrements spots_taken.
 */
export async function leaveVenueEvent(occurrenceId: string) {
  const { data, error } = await supabase.rpc('leave_venue_event', {
    p_occurrence_id: occurrenceId,
  })
  if (error) throw error
  return data
}
