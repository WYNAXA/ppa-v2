import { supabase } from './supabase'

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
  matchId: string,
  playerIds: string[],
  pollId?: string | null,
): Promise<MatchTravelInfo | null> {
  if (playerIds.length === 0) return null

  // Find who can drive from poll responses
  let canDriveIds: string[] = []
  if (pollId) {
    const { data: responses } = await supabase
      .from('poll_responses')
      .select('user_id, additional_responses')
      .eq('poll_id', pollId)
      .in('user_id', playerIds)

    canDriveIds = (responses ?? [])
      .filter((r) => r.additional_responses?.['I can drive'] === true)
      .map((r) => r.user_id)
  }

  // Fetch player profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, avatar_url, latitude, longitude, can_drive, max_passengers')
    .in('id', playerIds)

  if (!profiles || profiles.length === 0) return null

  const players: TravelPlayer[] = profiles.map((p) => ({
    id: p.id,
    name: p.name,
    avatar_url: p.avatar_url ?? null,
    latitude: p.latitude ?? null,
    longitude: p.longitude ?? null,
    can_drive: canDriveIds.includes(p.id) || !!p.can_drive,
    max_passengers: p.max_passengers ?? 3,
  }))

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
