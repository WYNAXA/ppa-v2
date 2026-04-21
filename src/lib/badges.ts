import { supabase } from './supabase'

export interface BadgeAward {
  badge_key: string
  label: string
  emoji: string
}

export const BADGE_DEFINITIONS: Record<string, { label: string; emoji: string }> = {
  first_win:       { label: 'First Win',        emoji: '🏆' },
  on_fire:         { label: 'On Fire',           emoji: '🔥' },
  consistent:      { label: 'Consistent',        emoji: '💪' },
  league_champion: { label: 'League Champion',   emoji: '👑' },
  social:          { label: 'Social',            emoji: '🤝' },
  veteran:         { label: 'Veteran',           emoji: '⭐' },
  sharp_shooter:   { label: 'Sharp Shooter',     emoji: '🎯' },
}

/**
 * Check all badge conditions after a result submission and insert newly earned ones.
 * Returns the list of newly awarded badges (for the success screen animation).
 */
export async function checkAndAwardBadges(userId: string): Promise<BadgeAward[]> {
  try {
    // Fetch user's existing badges
    const { data: existingRows } = await supabase
      .from('user_badges')
      .select('badge_key')
      .eq('user_id', userId)
    const existing = new Set((existingRows ?? []).map((r) => r.badge_key as string))

    // Fetch match_results for this user
    const { data: allResults } = await supabase
      .from('match_results')
      .select('result_type, team1_players, team2_players')
      .or(`team1_players.cs.{${userId}},team2_players.cs.{${userId}}`)

    if (!allResults) return []

    const totalMatches = allResults.length
    const wins = allResults.filter((r) => {
      const inTeam1 = (r.team1_players as string[]).includes(userId)
      return (inTeam1 && r.result_type === 'team1_win') ||
             (!inTeam1 && r.result_type === 'team2_win')
    }).length
    const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0

    // Streak: count consecutive wins from most recent
    let streak = 0
    for (const r of allResults) {
      const inTeam1 = (r.team1_players as string[]).includes(userId)
      const won = (inTeam1 && r.result_type === 'team1_win') ||
                  (!inTeam1 && r.result_type === 'team2_win')
      if (won) streak++
      else break
    }

    // Group memberships for "social" badge
    const { count: groupCount } = await supabase
      .from('group_members')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'approved')

    const earned: string[] = []

    const conditions: Record<string, boolean> = {
      first_win:       wins >= 1,
      on_fire:         streak >= 3,
      consistent:      totalMatches >= 10,
      social:          (groupCount ?? 0) >= 3,
      veteran:         totalMatches >= 50,
      sharp_shooter:   totalMatches >= 10 && winRate >= 70,
    }

    for (const [key, met] of Object.entries(conditions)) {
      if (met && !existing.has(key)) earned.push(key)
    }

    if (earned.length === 0) return []

    await supabase.from('user_badges').insert(
      earned.map((badge_key) => ({ user_id: userId, badge_key }))
    )

    return earned.map((key) => ({
      badge_key: key,
      ...BADGE_DEFINITIONS[key],
    }))
  } catch {
    return []
  }
}
