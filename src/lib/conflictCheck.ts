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
  try {
    const { data, error } = await supabase.rpc('check_self_conflict', {
      p_user_id: userId,
      p_match_date: matchDate,
      p_match_time: matchTime,
      p_exclude_match_id: excludeMatchId ?? null,
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
