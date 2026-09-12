import { supabase } from '@/lib/supabase'

interface ConflictResult {
  conflicting_match_id: string
  conflicting_time: string | null
}

/**
 * Check if a user has an existing match on the same date within a 2-hour window.
 * Uses the DB function check_self_conflict for server-side validation.
 * Returns an array of conflicting matches (empty = no conflicts).
 */
export async function checkSelfConflict(
  userId: string,
  matchDate: string,
  matchTime: string | null,
  excludeMatchId?: string,
): Promise<ConflictResult[]> {
  // check_self_conflict(p_user_id uuid, p_match_date date, p_match_time time,
  // p_exclude_match_id uuid DEFAULT NULL) — p_match_time carries NO default, so
  // it is a required argument and cannot be omitted. The function looks for
  // matches within a 2-hour window of that time; with no time there is no
  // window, and therefore no time conflict to report.
  if (!matchTime) return []
  try {
    const { data, error } = await supabase.rpc('check_self_conflict', {
      p_user_id: userId,
      p_match_date: matchDate,
      p_match_time: matchTime,
      // Optional: undefined omits the key so Postgres applies its DEFAULT NULL.
      p_exclude_match_id: excludeMatchId ?? undefined,
    })
    if (error) {
      console.warn('[ConflictCheck] RPC error, skipping:', error.message)
      return []
    }
    return data ?? []
  } catch {
    console.warn('[ConflictCheck] RPC not available, skipping')
    return []
  }
}
