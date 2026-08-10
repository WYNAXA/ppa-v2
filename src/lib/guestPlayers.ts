import { supabase } from './supabase'

// Guests are stored as placeholder slot UUIDs inside a match's player_ids, with
// their real names living in match_guest_invites (keyed by slot_player_id). List
// and card views resolve player_ids against a `players` array of profiles — which
// naturally has no row for a guest slot, so the guest would render blank.
//
// This helper batch-fetches the guest names for a set of matches and returns
// "pseudo-profiles" ({ id: slotUUID, name, avatar_url: null }) that callers merge
// into each match's `players` list, so guests show up by name everywhere.

export interface GuestPseudoProfile {
  id: string
  name: string
  avatar_url: null
}

/** slot_player_id → guest name, for the given match ids (excludes cancelled invites). */
export async function guestPseudoProfilesForMatches(
  matchIds: string[],
): Promise<Record<string, GuestPseudoProfile[]>> {
  const ids = [...new Set(matchIds.filter(Boolean))]
  if (ids.length === 0) return {}
  // Only 'pending' invites still occupy a slot in player_ids. Once a guest
  // accepts, their slot is replaced by their real user id (and they resolve as a
  // normal player), so including accepted/cancelled here would double-render them.
  const { data, error } = await supabase
    .from('match_guest_invites')
    .select('match_id, slot_player_id, guest_name, status')
    .in('match_id', ids)
    .eq('status', 'pending')
  if (error || !data) return {}
  const byMatch: Record<string, GuestPseudoProfile[]> = {}
  for (const r of data as Array<{ match_id: string; slot_player_id: string; guest_name: string }>) {
    ;(byMatch[r.match_id] ??= []).push({ id: r.slot_player_id, name: r.guest_name, avatar_url: null })
  }
  return byMatch
}

/**
 * Merge guest pseudo-profiles into a list of matches' `players` arrays in one
 * batched query. Each match keeps its real player profiles and gains a profile
 * for every guest slot, so `players.find(p => p.id === pid)` resolves guests too.
 */
export async function attachGuestPlayers<
  T extends { id: string; players?: Array<{ id: string; name: string; avatar_url?: string | null }> },
>(matches: T[]): Promise<T[]> {
  if (matches.length === 0) return matches
  const byMatch = await guestPseudoProfilesForMatches(matches.map((m) => m.id))
  return matches.map((m) => {
    const guests = byMatch[m.id]
    if (!guests?.length) return m
    const existing = m.players ?? []
    const seen = new Set(existing.map((p) => p.id))
    return { ...m, players: [...existing, ...guests.filter((g) => !seen.has(g.id))] }
  })
}
