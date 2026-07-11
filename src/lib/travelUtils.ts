import { supabase } from './supabase'
import { POLL_OPTION_DRIVE } from './pollUtils'

// ── Haversine distance (miles) ────────────────────────────────────────────────

export function calculateDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 3959 // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function driveMinutes(miles: number): number {
  return Math.round(miles * 2.5)
}

export function walkMinutes(miles: number): number {
  return Math.round(miles * 20)
}

export function formatDistance(miles: number): string {
  if (miles < 0.1) return 'nearby'
  return `${miles.toFixed(1)} mi`
}

// ── Travel info for a match ───────────────────────────────────────────────────

export interface TravelPlayer {
  id: string
  name: string
  avatar_url: string | null
  latitude: number | null
  longitude: number | null
  can_drive: boolean
  offering_lifts: boolean
  max_passengers: number
}

export interface LiftSuggestion {
  passenger: TravelPlayer
  driver: TravelPlayer
  distanceMiles: number
}

export interface MatchTravelInfo {
  drivers: TravelPlayer[]
  needsLift: TravelPlayer[]
  suggestions: LiftSuggestion[]
  hasLocationData: boolean
}

export async function getMatchTravelInfo(
  _matchId: string,
  playerIds: string[],
  pollId?: string | null,
): Promise<MatchTravelInfo | null> {
  if (playerIds.length === 0) return null

  // Find who can drive from poll responses AND match_drivers table
  let canDriveIds: string[] = []
  const matchDriverSeats = new Map<string, number>()

  const [pollDriveResult, matchDriversResult] = await Promise.all([
    pollId
      ? supabase.from('poll_responses').select('user_id, additional_responses').eq('poll_id', pollId).in('user_id', playerIds)
      : { data: [] },
    supabase.from('match_drivers').select('driver_id, seats_available, offering_lifts').eq('match_id', _matchId),
  ])

  // Poll answer drivers
  canDriveIds = (pollDriveResult.data ?? [])
    .filter((r: any) => r.additional_responses?.[POLL_OPTION_DRIVE] === true)
    .map((r: any) => r.user_id)

  // Committed match_drivers (override seats if present)
  const offeringLiftsSet = new Set<string>()
  for (const md of matchDriversResult.data ?? []) {
    if (!canDriveIds.includes(md.driver_id)) canDriveIds.push(md.driver_id)
    matchDriverSeats.set(md.driver_id, md.seats_available)
    if (md.offering_lifts) offeringLiftsSet.add(md.driver_id)
  }

  // Count accepted riders per driver (for seat decrement)
  const { data: acceptedRequests } = await supabase
    .from('travel_requests')
    .select('driver_id')
    .eq('match_id', _matchId)
    .eq('status', 'accepted')

  const acceptedPerDriver = new Map<string, number>()
  for (const r of acceptedRequests ?? []) {
    acceptedPerDriver.set(r.driver_id, (acceptedPerDriver.get(r.driver_id) ?? 0) + 1)
  }

  // Fetch player profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, avatar_url, latitude, longitude, can_drive, max_passengers')
    .in('id', playerIds)

  if (!profiles || profiles.length === 0) return null

  const players: TravelPlayer[] = profiles.map((p) => {
    const totalSeats = matchDriverSeats.get(p.id) ?? p.max_passengers ?? 3
    const taken = acceptedPerDriver.get(p.id) ?? 0
    return {
      id: p.id,
      name: p.name,
      avatar_url: p.avatar_url ?? null,
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      can_drive: canDriveIds.includes(p.id),
      offering_lifts: offeringLiftsSet.has(p.id),
      max_passengers: Math.max(0, totalSeats - taken),
    }
  })

  const drivers = players.filter((p) => p.can_drive)
  const needsLift = players.filter((p) => !p.can_drive)
  const hasLocationData = players.some((p) => p.latitude != null && p.longitude != null)

  // Build suggestions: match each passenger to nearest driver
  const suggestions: LiftSuggestion[] = needsLift
    .map((passenger) => {
      if (passenger.latitude == null || passenger.longitude == null) return null

      const ranked = drivers
        .filter((d) => d.latitude != null && d.longitude != null)
        .map((driver) => ({
          driver,
          distanceMiles: calculateDistance(
            passenger.latitude!,
            passenger.longitude!,
            driver.latitude!,
            driver.longitude!,
          ),
        }))
        .sort((a, b) => a.distanceMiles - b.distanceMiles)

      if (ranked.length === 0) return null
      return { passenger, driver: ranked[0].driver, distanceMiles: ranked[0].distanceMiles }
    })
    .filter((s): s is LiftSuggestion => s != null)

  return { drivers, needsLift, suggestions, hasLocationData }
}
