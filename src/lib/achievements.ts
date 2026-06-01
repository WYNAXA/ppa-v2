import { supabase } from './supabase'
import i18n from '@/i18n'

// ── Achievement Library ──────────────────────────────────────────────────────

export interface AchievementDef {
  name: string
  emoji: string
  description: string
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'special'
  permanent: boolean
  scope: 'global' | 'league' | 'match'
  canEarnMultiple?: boolean
  peerVoted?: boolean
}

export const ACHIEVEMENT_LIBRARY: Record<string, AchievementDef> = {
  // Global career (permanent)
  first_win:       { name: 'First Victory',      emoji: '🏆', description: 'Won your first match',               rarity: 'common',   permanent: true,  scope: 'global' },
  on_fire:         { name: 'On Fire',             emoji: '🔥', description: '3 wins in a row',                    rarity: 'uncommon', permanent: true,  scope: 'global' },
  consistent:      { name: 'Consistent',          emoji: '⚡', description: 'Played 10 matches',                  rarity: 'common',   permanent: true,  scope: 'global' },
  sharp_shooter:   { name: 'Sharp Shooter',       emoji: '🎯', description: '70%+ win rate (10+ matches)',        rarity: 'rare',     permanent: true,  scope: 'global' },
  social:          { name: 'Social Butterfly',     emoji: '👥', description: 'Member of 3+ groups',               rarity: 'uncommon', permanent: true,  scope: 'global' },
  veteran:         { name: 'Veteran',             emoji: '🌟', description: '50+ matches played',                 rarity: 'rare',     permanent: true,  scope: 'global' },
  league_champion: { name: 'League Champion',     emoji: '👑', description: 'Won a league season',                rarity: 'epic',     permanent: true,  scope: 'global' },
  // League/match (earnable multiple times)
  perfectionist:   { name: 'Perfectionist',       emoji: '💎', description: 'Won 6-0, 6-0',                      rarity: 'rare',     permanent: false, scope: 'league', canEarnMultiple: true },
  giant_slayer:    { name: 'Giant Slayer',         emoji: '🗡️', description: 'Beat someone 200+ ELO above',       rarity: 'epic',     permanent: false, scope: 'league', canEarnMultiple: true },
  escape_artist:   { name: 'Escape Artist',        emoji: '🔄', description: 'Won after losing first set',        rarity: 'rare',     permanent: false, scope: 'league', canEarnMultiple: true },
  rampage:         { name: 'Rampage',             emoji: '⚡', description: '5 win streak in a league',           rarity: 'epic',     permanent: false, scope: 'league', canEarnMultiple: true },
  phoenix_rising:  { name: 'Phoenix Rising',       emoji: '🦅', description: 'Won after 5-loss streak',           rarity: 'rare',     permanent: false, scope: 'league', canEarnMultiple: true },
  most_improved:   { name: 'Most Improved',        emoji: '📈', description: 'Biggest ELO gain in a week',        rarity: 'uncommon', permanent: false, scope: 'league', canEarnMultiple: true },
  scoreline_specialist: { name: 'Scoreline Specialist', emoji: '🎭', description: '3 wins with identical scores', rarity: 'rare', permanent: false, scope: 'league', canEarnMultiple: true },
  // Peer voted (per match)
  shot_of_match:   { name: 'Shot of the Match',   emoji: '🎾', description: 'Voted best shot',           rarity: 'special', permanent: false, scope: 'match', peerVoted: true },
  tactical_genius: { name: 'Tactical Genius',      emoji: '🧠', description: 'Voted smartest play',       rarity: 'special', permanent: false, scope: 'match', peerVoted: true },
  // TODO (v1.1): best_teammate returns as a monthly "best partner" ceremony.
  best_recovery_shot: { name: 'Best Recovery Shot', emoji: '🪃', description: 'Kept the ball in play when the other team thought they\'d won the point.', rarity: 'special', permanent: false, scope: 'match', peerVoted: true },
  comedy_gold:     { name: 'Comedy Gold',          emoji: '😂', description: 'Voted funniest moment',     rarity: 'special', permanent: false, scope: 'match', peerVoted: true },
  hustle_award:    { name: 'Hustle Award',         emoji: '💪', description: 'Voted most effort',         rarity: 'special', permanent: false, scope: 'match', peerVoted: true },
}

// Keep backwards compat with old BADGE_DEFINITIONS
export const BADGE_DEFINITIONS: Record<string, { label: string; emoji: string }> = Object.fromEntries(
  Object.entries(ACHIEVEMENT_LIBRARY).map(([key, def]) => [key, { label: def.name, emoji: def.emoji }])
)

// ────────────────────────────────────────────────────────────────────
// TODO (v1.1): Jersey rendering UI not yet built.
// JERSEY_LIBRARY data structure is defined below but no callsite renders
// it. When the weekly jersey gamification UI is built (likely in Compete
// page or group leaderboards), translate these labels via
// `t('jerseys.<color>_name')` and `t('jerseys.<color>_description')`
// — keys to be added then.
// ────────────────────────────────────────────────────────────────────
export const JERSEY_LIBRARY: Record<string, { emoji: string; name: string; description: string }> = {
  yellow: { emoji: '🟡', name: 'League Leader',  description: 'Top of the standings' },
  green:  { emoji: '🟢', name: 'Giant Killer',   description: 'Beat the highest ranked opponent' },
  red:    { emoji: '🔴', name: 'Most Improved',  description: 'Biggest ELO gain this week' },
  blue:   { emoji: '🔵', name: 'Entertainer',    description: 'Most peer votes this week' },
  black:  { emoji: '⚫', name: 'Wooden Spoon',   description: 'Bottom of standings' },
}

export const RARITY_COLORS: Record<string, string> = {
  common: '#9CA3AF', uncommon: '#009688', rare: '#7C3AED', epic: '#D97706', special: '#EC4899',
}

export const PEER_VOTE_CATEGORIES = [
  { id: 'shot_of_match',   emoji: '🎾', name: 'Shot of the Match', desc: 'Best single shot' },
  { id: 'tactical_genius',  emoji: '🧠', name: 'Tactical Genius',   desc: 'Smartest play' },
  { id: 'best_recovery_shot', emoji: '🪃', name: 'Best Recovery Shot', desc: 'Kept the ball alive when it looked lost' },
  { id: 'comedy_gold',      emoji: '😂', name: 'Comedy Gold',       desc: 'Funniest moment' },
  { id: 'hustle_award',     emoji: '💪', name: 'Hustle Award',      desc: 'Most effort' },
]

// ── Badge Award Type ─────────────────────────────────────────────────────────

export interface BadgeAward {
  badge_key: string
  label: string
  emoji: string
}

// ── Achievement Checker ──────────────────────────────────────────────────────

export async function checkAndAwardBadges(userId: string): Promise<BadgeAward[]> {
  try {
    const { data: existingRows } = await supabase
      .from('user_badges').select('badge_key').eq('user_id', userId)
    const existing = new Set((existingRows ?? []).map(r => r.badge_key as string))

    // Only count verified results — unverified/disputed results must not affect badges
    const { data: allResults } = await supabase
      .from('match_results')
      .select('result_type, team1_players, team2_players, sets_data')
      .eq('verification_status', 'verified')
      .or(`team1_players.cs.{${userId}},team2_players.cs.{${userId}}`)
      .order('created_at', { ascending: false })
    if (!allResults) return []

    const totalMatches = allResults.length
    const wins = allResults.filter(r => {
      const inTeam1 = (r.team1_players as string[]).includes(userId)
      return (inTeam1 && r.result_type === 'team1_win') || (!inTeam1 && r.result_type === 'team2_win')
    }).length
    const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0

    // Streak
    let streak = 0
    for (const r of allResults) {
      const inTeam1 = (r.team1_players as string[]).includes(userId)
      const won = (inTeam1 && r.result_type === 'team1_win') || (!inTeam1 && r.result_type === 'team2_win')
      if (won) streak++; else break
    }

    const { count: groupCount } = await supabase
      .from('group_members').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('status', 'approved')

    const earned: string[] = []
    const conditions: Record<string, boolean> = {
      first_win: wins >= 1,
      on_fire: streak >= 3,
      consistent: totalMatches >= 10,
      social: (groupCount ?? 0) >= 3,
      veteran: totalMatches >= 50,
      sharp_shooter: totalMatches >= 10 && winRate >= 70,
    }
    for (const [key, met] of Object.entries(conditions)) {
      if (met && !existing.has(key)) earned.push(key)
    }

    // Check perfectionist on most recent result
    if (allResults.length > 0) {
      const latest = allResults[0]
      const inTeam1 = (latest.team1_players as string[]).includes(userId)
      const won = (inTeam1 && latest.result_type === 'team1_win') || (!inTeam1 && latest.result_type === 'team2_win')
      if (won && latest.sets_data) {
        const sets = Array.isArray(latest.sets_data) ? latest.sets_data : (() => { try { return JSON.parse(latest.sets_data as unknown as string) } catch { return [] } })()
        const isPerfect = sets.length >= 2 && sets.every((s: any) => {
          const my = inTeam1 ? (s.team1 ?? s.team1_score ?? 0) : (s.team2 ?? s.team2_score ?? 0)
          const their = inTeam1 ? (s.team2 ?? s.team2_score ?? 0) : (s.team1 ?? s.team1_score ?? 0)
          return Number(my) === 6 && Number(their) === 0
        })
        if (isPerfect) earned.push('perfectionist')
      }
    }

    // Giant slayer on most recent win
    if (allResults.length > 0 && streak >= 1) {
      const latest = allResults[0]
      const inTeam1 = (latest.team1_players as string[]).includes(userId)
      const opponentIds = inTeam1 ? latest.team2_players as string[] : latest.team1_players as string[]
      const { data: opponents } = await supabase.from('profiles').select('internal_ranking').in('id', opponentIds)
      const { data: me } = await supabase.from('profiles').select('internal_ranking').eq('id', userId).single()
      const avgOpp = (opponents ?? []).reduce((s, p) => s + ((p.internal_ranking as number) ?? 1500), 0) / Math.max(opponentIds.length, 1)
      if (avgOpp - ((me?.internal_ranking as number) ?? 1500) >= 200) earned.push('giant_slayer')
    }

    if (earned.length === 0) return []

    // Insert into user_badges (for backwards compat)
    await supabase.from('user_badges').insert(earned.map(badge_key => ({ user_id: userId, badge_key })))

    // Send notification for each earned achievement
    await supabase.from('notifications').insert(
      earned.map(key => ({
        user_id: userId,
        type: 'achievement',
        title: `${ACHIEVEMENT_LIBRARY[key]?.emoji ?? '🏆'} ${ACHIEVEMENT_LIBRARY[key]?.name ?? key} earned!`,
        message: ACHIEVEMENT_LIBRARY[key]?.description ?? 'New achievement unlocked',
        related_id: userId,
        read: false,
      }))
    )

    return earned.map(key => ({
      badge_key: key,
      label: ACHIEVEMENT_LIBRARY[key]?.name ?? key,
      emoji: ACHIEVEMENT_LIBRARY[key]?.emoji ?? '🏅',
    }))
  } catch { return [] }
}

// ── Display helpers (non-reactive, for one-shot reads) ──────────────────────

export function getAchievementLabel(key: string): string {
  return i18n.t(`achievements.${key}`, { defaultValue: ACHIEVEMENT_LIBRARY[key]?.name ?? key })
}

export function getAchievementDescription(key: string): string {
  return i18n.t(`achievements.${key}_desc`, { defaultValue: ACHIEVEMENT_LIBRARY[key]?.description ?? '' })
}

export function getAchievementHowTo(key: string): string {
  return i18n.t(`achievements.${key}_howto`, { defaultValue: '' })
}
