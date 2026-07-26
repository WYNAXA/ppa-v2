import { supabase } from './supabase'
import { sendNotification, sendNotifications } from '@/lib/notifications'
import { fetchSetStats } from '@/lib/setStats'
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
  court_time:      { name: 'Court Time',          emoji: '🎾', description: 'Sets logged over your padel journey', rarity: 'common',  permanent: true,  scope: 'global' },
  sharp_shooter:   { name: 'Sharp Shooter',       emoji: '🎯', description: '70%+ win rate over 20+ sets',       rarity: 'rare',     permanent: true,  scope: 'global' },
  social:          { name: 'Social Butterfly',     emoji: '👥', description: 'Member of 3+ groups',               rarity: 'uncommon', permanent: true,  scope: 'global' },
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

// ── Court Time tiers ────────────────────────────────────────────────

export const COURT_TIME_TIERS = [
  { tier: 'bronze',   minSets: 20 },
  { tier: 'silver',   minSets: 50 },
  { tier: 'gold',     minSets: 100 },
  { tier: 'platinum', minSets: 200 },
  { tier: 'diamond',  minSets: 400 },
] as const

export function courtTimeTier(totalSets: number): string | null {
  let result: string | null = null
  for (const t of COURT_TIME_TIERS) {
    if (totalSets >= t.minSets) result = t.tier
  }
  return result
}

// ── Tier rank (shared) ──────────────────────────────────────────────

export function tierRank(t: string | null): number {
  switch (t) {
    case 'diamond':  return 5
    case 'platinum': return 4
    case 'gold':     return 3
    case 'silver':   return 2
    case 'bronze':   return 1
    default:         return 0
  }
}

// ────────────────────────────────────────────────────────────────────
// Jersey types. Blue (Entertainer) is awarded weekly by cron.
// Yellow/black are defined but not scheduled (Phase 2).
// ────────────────────────────────────────────────────────────────────
export const JERSEY_LIBRARY: Record<string, { emoji: string; name: string; description: string }> = {
  yellow: { emoji: '🟡', name: 'League Leader',  description: 'Top of the standings' },
  green:  { emoji: '🟢', name: 'Underdog',        description: 'Beat a much stronger team' },
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

    // Set-level stats for career badges (verified, non-friendly only)
    const setStats = await fetchSetStats(userId)

    // Streak: count consecutive match-level wins (most recent first)
    const { data: allResults } = await supabase
      .from('match_results')
      .select('result_type, team1_players, team2_players, sets_data')
      .eq('verification_status', 'verified')
      .not('is_friendly', 'is', true)
      .or(`team1_players.cs.{${userId}},team2_players.cs.{${userId}}`)
      .order('created_at', { ascending: false })

    let streak = 0
    for (const r of (allResults ?? [])) {
      const inTeam1 = (r.team1_players as string[]).includes(userId)
      const won = (inTeam1 && r.result_type === 'team1_win') || (!inTeam1 && r.result_type === 'team2_win')
      if (won) streak++; else break
    }

    const { count: groupCount } = await supabase
      .from('group_members').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('status', 'approved')

    const earned: string[] = []
    const conditions: Record<string, boolean> = {
      first_win: setStats.wins >= 1,
      on_fire: streak >= 3,
      social: (groupCount ?? 0) >= 3,
      sharp_shooter: setStats.totalSets >= 20 && setStats.winRate >= 70,
    }
    for (const [key, met] of Object.entries(conditions)) {
      if (met && !existing.has(key)) earned.push(key)
    }

    // Check perfectionist on most recent result
    if (allResults && allResults.length > 0) {
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
    if (allResults && allResults.length > 0 && streak >= 1) {
      const latest = allResults[0]
      const inTeam1 = (latest.team1_players as string[]).includes(userId)
      const opponentIds = inTeam1 ? latest.team2_players as string[] : latest.team1_players as string[]
      const { data: opponents } = await supabase.from('profiles').select('internal_ranking').in('id', opponentIds)
      const { data: me } = await supabase.from('profiles').select('internal_ranking').eq('id', userId).single()
      const avgOpp = (opponents ?? []).reduce((s, p) => s + ((p.internal_ranking as number) ?? 1500), 0) / Math.max(opponentIds.length, 1)
      if (avgOpp - ((me?.internal_ranking as number) ?? 1500) >= 200) earned.push('giant_slayer')
    }

    const awards: BadgeAward[] = []

    if (earned.length > 0) {
      // Insert into user_badges (for backwards compat)
      await supabase.from('user_badges').insert(earned.map(badge_key => ({ user_id: userId, badge_key })))

      // Send notification for each earned achievement
      sendNotifications(
        earned.map(key => ({
          user_id: userId,
          type: 'achievement',
          title: `${ACHIEVEMENT_LIBRARY[key]?.emoji ?? '🏆'} ${ACHIEVEMENT_LIBRARY[key]?.name ?? key} earned!`,
          message: ACHIEVEMENT_LIBRARY[key]?.description ?? 'New achievement unlocked',
          related_id: userId,
        }))
      )

      for (const key of earned) {
        awards.push({
          badge_key: key,
          label: ACHIEVEMENT_LIBRARY[key]?.name ?? key,
          emoji: ACHIEVEMENT_LIBRARY[key]?.emoji ?? '🏅',
        })
      }
    }

    // ── Court Time tiered badge ────────────────────────────────────────
    const ctTier = courtTimeTier(setStats.totalSets)
    if (ctTier) {
      const { data: ctRow } = await supabase
        .from('user_badges')
        .select('tier')
        .eq('user_id', userId)
        .eq('badge_key', 'court_time')
        .maybeSingle()

      const currentTier = (ctRow?.tier as string) ?? null

      if (tierRank(currentTier) < tierRank(ctTier)) {
        if (currentTier != null) {
          await supabase
            .from('user_badges')
            .update({ tier: ctTier, earned_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('badge_key', 'court_time')
        } else {
          await supabase
            .from('user_badges')
            .insert({ user_id: userId, badge_key: 'court_time', tier: ctTier })
        }

        const def = ACHIEVEMENT_LIBRARY['court_time']
        const tierLabel = ctTier.charAt(0).toUpperCase() + ctTier.slice(1)
        awards.push({
          badge_key: 'court_time',
          label: `${def?.name ?? 'Court Time'} (${tierLabel})`,
          emoji: def?.emoji ?? '🎾',
        })

        sendNotification({
          user_id: userId,
          type: 'achievement',
          title: `${def?.emoji ?? '🎾'} ${tierLabel} ${def?.name ?? 'Court Time'}!`,
          message: def?.description ?? 'Sets logged over your padel journey',
          related_id: userId,
        })
      }
    }

    return awards
  } catch { return [] }
}

// ── Peer Vote Tiered Badges ──────────────────────────────────────────────────
// Tiers per category by lifetime VERIFIED votes RECEIVED:
//   bronze ≥ 5, silver ≥ 15, gold ≥ 40

const VOTE_BADGE_TIERS = [
  { tier: 'gold',   threshold: 40 },
  { tier: 'silver', threshold: 15 },
  { tier: 'bronze', threshold: 5 },
] as const

const PEER_VOTE_CATEGORY_IDS = PEER_VOTE_CATEGORIES.map(c => c.id)

/**
 * @deprecated Server-side trigger trg_peer_vote_badges_on_verify now handles
 * badge awarding on result verification. Kept as reference implementation.
 */
export async function checkAndAwardPeerVoteBadges(playerIds: string[]): Promise<BadgeAward[]> {
  if (playerIds.length === 0) return []
  try {
    const allAwarded: BadgeAward[] = []

    for (const userId of playerIds) {
      // 1. Get current verified vote counts from RPC
      const { data: counts } = await supabase.rpc('get_verified_peer_vote_counts', { p_user_id: userId })
      if (!counts || counts.length === 0) continue

      // 2. Get existing peer-vote badges for this user
      const { data: existingRows } = await supabase
        .from('user_badges')
        .select('badge_key, tier')
        .eq('user_id', userId)
        .in('badge_key', PEER_VOTE_CATEGORY_IDS)
      const existingMap = new Map<string, string | null>()
      for (const r of existingRows ?? []) {
        existingMap.set(r.badge_key as string, (r.tier as string) ?? null)
      }

      // 3. For each category, determine highest tier reached
      for (const row of counts) {
        const category = row.vote_category as string
        if (!PEER_VOTE_CATEGORY_IDS.includes(category)) continue
        const count = Number(row.vote_count)
        const currentTier = existingMap.get(category)

        // Find highest qualifying tier
        let newTier: string | null = null
        for (const { tier, threshold } of VOTE_BADGE_TIERS) {
          if (count >= threshold) { newTier = tier; break }
        }
        if (!newTier) continue

        // Skip if already at this tier or higher
        if (tierRank(currentTier ?? null) >= tierRank(newTier)) continue

        // 4. Upsert the badge row
        if (currentTier != null) {
          // Upgrade existing badge
          await supabase
            .from('user_badges')
            .update({ tier: newTier, earned_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('badge_key', category)
        } else {
          // New badge
          await supabase
            .from('user_badges')
            .insert({ user_id: userId, badge_key: category, tier: newTier })
        }

        const def = ACHIEVEMENT_LIBRARY[category]
        const tierLabel = newTier.charAt(0).toUpperCase() + newTier.slice(1)
        const award: BadgeAward = {
          badge_key: category,
          label: `${def?.name ?? category} (${tierLabel})`,
          emoji: def?.emoji ?? '🏅',
        }
        allAwarded.push(award)

        // 5. Notify the player
        sendNotification({
          user_id: userId,
          type: 'achievement',
          title: `${def?.emoji ?? '🏅'} ${tierLabel} ${def?.name ?? category}!`,
          message: `You've received ${count} verified votes — ${tierLabel} tier unlocked.`,
          related_id: userId,
        })
      }
    }

    return allAwarded
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
