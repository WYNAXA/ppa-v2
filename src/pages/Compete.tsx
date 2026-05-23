import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, Trophy, Plus, ChevronRight, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { BADGE_DEFINITIONS } from '@/lib/achievements'
import { cn } from '@/lib/utils'
import { CreateLeagueSheet } from '@/components/compete/CreateLeagueSheet'
import { EloHistoryChart } from '@/components/compete/EloHistoryChart'
import BadgeInfoModal from '@/components/shared/BadgeInfoModal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RankedProfile {
  id: string
  name: string
  avatar_url: string | null
  internal_ranking: number | null
  ranking_points: number | null
  is_provisional?: boolean | null
  matches_played?: number | null
}

interface MyLeague {
  id: string
  name: string
  status: string
  match_type: string | null
  city: string | null
  role: string
  standing: { rank: number | null; played: number; points: number } | null
}

interface MyStats {
  rank:         number
  totalPlayers: number
  wins:         number
  losses:       number
  draws:        number
  totalMatches: number
  winRate:      number
  recentForm:   Array<'win' | 'loss' | 'draw'>
  trend:        number | null
}

// ── Data hooks ────────────────────────────────────────────────────────────────

function useMyStats(userId: string, currentRanking: number | undefined) {
  return useQuery<MyStats>({
    queryKey: ['compete-stats', userId, currentRanking],
    enabled: !!userId,
    queryFn: async () => {
      const [rankResult, resultsData, trendData, totalResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .gt('internal_ranking', currentRanking ?? 0),
        supabase
          .from('match_results')
          .select('result_type, team1_players, team2_players, created_at')
          .or(`team1_players.cs.{${userId}},team2_players.cs.{${userId}}`)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('ranking_changes')
          .select('points_change')
          .eq('player_id', userId)
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true }),
      ])

      const rank        = (rankResult.count ?? 0) + 1
      const totalPlayers = totalResult.count ?? 0
      const results     = resultsData.data ?? []

      let wins = 0, losses = 0, draws = 0

      for (const r of results) {
        const inTeam1 = (r.team1_players as string[]).includes(userId)
        if (r.result_type === 'draw') {
          draws++
        } else if (
          (inTeam1 && r.result_type === 'team1_win') ||
          (!inTeam1 && r.result_type === 'team2_win')
        ) {
          wins++
        } else {
          losses++
        }
      }

      const recentForm = results.slice(0, 5).map((r): 'win' | 'loss' | 'draw' => {
        const inTeam1 = (r.team1_players as string[]).includes(userId)
        if (r.result_type === 'draw') return 'draw'
        if (
          (inTeam1 && r.result_type === 'team1_win') ||
          (!inTeam1 && r.result_type === 'team2_win')
        ) return 'win'
        return 'loss'
      })

      // Calculate 30-day trend: sum points changes, or fallback to null if no data
      const trendRows = trendData.data ?? []
      const trend = trendRows.length > 0
        ? trendRows.reduce((acc, c) => acc + (c.points_change as number), 0)
        : null  // null = no history (new player)

      return {
        rank,
        totalPlayers,
        wins,
        losses,
        draws,
        totalMatches: results.length,
        winRate: results.length > 0 ? Math.round((wins / results.length) * 100) : 0,
        recentForm,
        trend,
      }
    },
  })
}

function useAchievementCount(userId: string) {
  return useQuery<number>({
    queryKey: ['achievement-count', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { count } = await supabase
        .from('user_badges')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
      return count ?? 0
    },
    staleTime: 5 * 60 * 1000,
  })
}

function useMyBadges(userId: string) {
  return useQuery<Array<{ id: string; badge_key: string; earned_at: string }>>({
    queryKey: ['my-badges-compete', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('user_badges')
        .select('id, badge_key, earned_at')
        .eq('user_id', userId)
        .order('earned_at', { ascending: false })
        .limit(6)
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}

function useGlobalLeaderboard(limit: number, search: string) {
  return useQuery<RankedProfile[]>({
    queryKey: ['global-leaderboard', limit, search],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('id, name, avatar_url, internal_ranking, ranking_points, is_provisional, matches_played')
        .not('internal_ranking', 'is', null)
        .order('internal_ranking', { ascending: false })
      if (search.trim().length >= 2) {
        query = query.ilike('name', `%${search.trim()}%`)
      }
      const { data } = await query.limit(limit)
      return data ?? []
    },
  })
}

function useUserGroups(userId: string) {
  return useQuery<Array<{ group_id: string; name: string }>>({
    queryKey: ['user-groups-compete', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('group_members')
        .select('group_id, groups:group_id(id, name)')
        .eq('user_id', userId).eq('status', 'approved')
      return (data ?? []).map(m => ({
        group_id: (m.groups as any)?.id ?? m.group_id,
        name: (m.groups as any)?.name ?? 'Group',
      }))
    },
  })
}

function useGroupLeaderboard(userId: string, selectedGroupId: string) {
  return useQuery<RankedProfile[]>({
    queryKey: ['group-leaderboard', userId, selectedGroupId],
    enabled: !!userId,
    queryFn: async () => {
      let groupIds: string[]
      if (selectedGroupId) {
        groupIds = [selectedGroupId]
      } else {
        const { data: memberships } = await supabase
          .from('group_members').select('group_id')
          .eq('user_id', userId).eq('status', 'approved')
        if (!memberships || memberships.length === 0) return []
        groupIds = memberships.map(m => m.group_id)
      }

      const { data: members } = await supabase
        .from('group_members').select('user_id')
        .in('group_id', groupIds).eq('status', 'approved')
      if (!members) return []
      const userIds = [...new Set(members.map(m => m.user_id))]

      const { data } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, internal_ranking, ranking_points, is_provisional, matches_played')
        .in('id', userIds)
        .not('internal_ranking', 'is', null)
        .order('internal_ranking', { ascending: false })
        .limit(50)

      return data ?? []
    },
  })
}

function useMyLeagues(userId: string) {
  return useQuery<MyLeague[]>({
    queryKey: ['my-leagues-compete', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from('league_members')
        .select('league_id, role')
        .eq('user_id', userId)
        .eq('status', 'active')

      if (!memberships || memberships.length === 0) return []
      const leagueIds = memberships.map((m) => m.league_id)

      const [{ data: leagues }, { data: allStandings }] = await Promise.all([
        supabase
          .from('leagues')
          .select('id, name, status, match_type, city')
          .in('id', leagueIds)
          .order('created_at', { ascending: false }),
        // Fetch all standings for these leagues so we can calculate rank client-side
        // (avoids relying on a 'rank' column that may not exist)
        supabase
          .from('league_standings')
          .select('league_id, user_id, matches_played, ranking_points, wins, losses')
          .in('league_id', leagueIds)
          .order('ranking_points', { ascending: false }),
      ])

      // Calculate position for current user per league
      const standingMap: Record<string, { rank: number | null; played: number; points: number }> = {}
      type StandingRow = NonNullable<typeof allStandings>[number]
      const byLeague: Record<string, StandingRow[]> = {}
      for (const s of allStandings ?? []) {
        if (!byLeague[s.league_id]) byLeague[s.league_id] = []
        byLeague[s.league_id].push(s)
      }
      for (const [leagueId, rows] of Object.entries(byLeague)) {
        const sorted = (rows ?? []).slice().sort((a, b) => ((b.ranking_points ?? 0) as number) - ((a.ranking_points ?? 0) as number))
        const idx    = sorted.findIndex((r) => r.user_id === userId)
        const mine   = sorted[idx]
        if (mine) {
          standingMap[leagueId] = {
            rank:   idx + 1,
            played: (mine.matches_played ?? 0) as number,
            points: (mine.ranking_points ?? 0) as number,
          }
        }
      }
      const roleMap = Object.fromEntries(memberships.map((m) => [m.league_id, m.role]))

      return (leagues ?? []).map((l) => ({
        ...l,
        standing: standingMap[l.id] ?? null,
        role:     roleMap[l.id] ?? 'member',
      }))
    },
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FormDot({ result }: { result: 'win' | 'loss' | 'draw' }) {
  return (
    <div className={cn(
      'h-2.5 w-2.5 rounded-full',
      result === 'win'  ? 'bg-green-400' :
      result === 'loss' ? 'bg-red-400'   : 'bg-gray-400'
    )} />
  )
}

function RankingCard({
  profile,
  stats,
  isLoading,
  achievementCount,
}: {
  profile: { name: string; avatar_url?: string | null; internal_ranking?: number } | null
  stats:   MyStats | undefined
  isLoading: boolean
  achievementCount: number
}) {
  const { t } = useTranslation()
  const elo = profile?.internal_ranking ?? 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #009688 0%, #004d44 100%)' }}
    >
      <div className="p-5">
        {/* Top row: avatar + name + ELO */}
        <div className="flex items-center gap-3 mb-4">
          <PlayerAvatar name={profile?.name} avatarUrl={profile?.avatar_url} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-[16px] truncate">{profile?.name ?? '—'}</p>
            {!isLoading && stats && (
              <p className="text-teal-200 text-[12px] mt-0.5">
                {t('compete.ranked_of', { rank: stats.rank, total: stats.totalPlayers })}
              </p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[28px] font-black text-white leading-none">{elo.toLocaleString()}</p>
            <p className="text-teal-300 text-[10px] font-semibold mt-0.5">ELO</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 rounded bg-white/10 animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-white/10 animate-pulse" />
          </div>
        ) : stats ? (
          <>
            {/* Win/loss row */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: t('compete.wins'),   value: stats.wins,   color: 'text-green-300' },
                { label: t('compete.losses'), value: stats.losses, color: 'text-red-300'   },
                { label: t('compete.draws'),  value: stats.draws,  color: 'text-gray-300'  },
                { label: t('compete.my_badges'), value: achievementCount, color: 'text-yellow-300' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white/10 rounded-xl py-2.5 text-center">
                  <p className={cn('text-[18px] font-black', color)}>{value}</p>
                  <p className="text-teal-200 text-[10px] mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Win rate + trend + form */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-teal-200 text-[10px] font-semibold uppercase tracking-wide mb-1">{t('compete.win_rate')}</p>
                <p className="text-white font-bold text-[16px]">{stats.winRate}%</p>
              </div>

              <div>
                <p className="text-teal-200 text-[10px] font-semibold uppercase tracking-wide mb-1">{t('compete.trend_30d')}</p>
                <div className="flex items-center gap-1">
                  {stats.trend === null ? (
                    <span className="text-[13px] font-semibold text-gray-300">New</span>
                  ) : stats.trend > 0 ? (
                    <>
                      <TrendingUp className="h-4 w-4 text-green-300" />
                      <span className="text-[14px] font-bold text-green-300">+{stats.trend}</span>
                    </>
                  ) : stats.trend < 0 ? (
                    <>
                      <TrendingDown className="h-4 w-4 text-red-300" />
                      <span className="text-[14px] font-bold text-red-300">{stats.trend}</span>
                    </>
                  ) : (
                    <>
                      <Minus className="h-4 w-4 text-gray-300" />
                      <span className="text-[14px] font-bold text-gray-300">0</span>
                    </>
                  )}
                </div>
              </div>

              <div>
                <p className="text-teal-200 text-[10px] font-semibold uppercase tracking-wide mb-1.5">{t('compete.recent_form')}</p>
                <div className="flex gap-1.5">
                  {stats.recentForm.length > 0
                    ? stats.recentForm.map((r, i) => <FormDot key={i} result={r} />)
                    : <span className="text-teal-300 text-[11px]">{t('compete.no_matches_yet')}</span>
                  }
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </motion.div>
  )
}

function LeaderboardRow({
  profile,
  rank,
  currentUserId,
  index,
  rowRef,
}: {
  profile: RankedProfile
  rank: number
  currentUserId: string
  index: number
  rowRef?: React.RefObject<HTMLDivElement | null>
}) {
  const { t } = useTranslation()
  const isMe = profile.id === currentUserId
  return (
    <motion.div
      ref={rowRef}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl',
        isMe ? 'bg-teal-50 border border-teal-200' : 'bg-gray-50/60 border border-gray-100'
      )}
    >
      <span className={cn(
        'w-6 text-center text-[12px] font-bold flex-shrink-0',
        rank === 1 ? 'text-yellow-500' : rank === 2 ? 'text-gray-400' : rank === 3 ? 'text-orange-400' : isMe ? 'text-[#009688]' : 'text-gray-400'
      )}>
        {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
      </span>
      <PlayerAvatar name={profile.name} avatarUrl={profile.avatar_url} size="sm" />
      <div className="flex-1 min-w-0">
        <p className={cn('text-[13px] font-semibold truncate', isMe ? 'text-[#009688]' : 'text-gray-800')}>
          {profile.name}{isMe ? ` ${t('compete.you_suffix')}` : ''}
        </p>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className={cn('text-[13px] font-bold', isMe ? 'text-[#009688]' : 'text-gray-700')}>
          {(profile.internal_ranking ?? 0).toLocaleString()}
        </p>
        <p className="text-[10px] text-gray-400">
          {profile.is_provisional ? t('compete.elo_provisional') : t('compete.elo')}
        </p>
      </div>
    </motion.div>
  )
}

function LeagueCard({ league, index }: { league: MyLeague; index: number }) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const STATUS_STYLE: Record<string, string> = {
    active:    'bg-green-50 text-green-600 border-green-100',
    upcoming:  'bg-blue-50 text-blue-600 border-blue-100',
    completed: 'bg-gray-100 text-gray-500 border-gray-200',
  }

  return (
    <motion.button
      onClick={() => navigate(`/compete/leagues/${league.id}`)}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileTap={{ scale: 0.985 }}
      className="w-full text-left rounded-2xl border border-gray-100 bg-white px-4 py-3.5 hover:border-teal-200 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-gray-900 truncate">{league.name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {league.match_type && (
              <span className="text-[11px] text-gray-400 capitalize">{league.match_type.replace('_', ' ')}</span>
            )}
            {league.city && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-[11px] text-gray-400">{league.city}</span>
              </>
            )}
          </div>
          {league.standing && (
            <div className="flex items-center gap-3 mt-2">
              {league.standing.rank != null && (
                <span className="text-[11px] text-gray-500">
                  {t('compete.position')} <span className="font-bold text-[#009688]">#{league.standing.rank}</span>
                </span>
              )}
              <span className="text-[11px] text-gray-500">
                {league.standing.played} {t('compete.played')}
              </span>
              <span className="text-[11px] text-gray-500">
                <span className="font-bold text-gray-700">{league.standing.points}</span> {t('compete.pts')}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn(
            'rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize',
            STATUS_STYLE[league.status] ?? 'bg-gray-100 text-gray-500 border-gray-200'
          )}>
            {league.status}
          </span>
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </div>
      </div>
    </motion.button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function CompetePage() {
  const { profile }  = useAuth()
  const navigate     = useNavigate()
  const location     = useLocation()
  const { t }        = useTranslation()
  const [searchParams] = useSearchParams()
  const userId       = profile?.id ?? ''
  const defaultGroupId = searchParams.get('group_id') ?? undefined

  const [selectedBadge, setSelectedBadge] = useState<string | null>(null)
  const [leaderboardTab, setLeaderboardTab]   = useState<'global' | 'my_groups'>('global')
  const [showCreateLeague, setShowCreateLeague] = useState(
    location.pathname === '/compete/leagues/create'
  )

  // Auto-open sheet when navigated to /compete/leagues/create or ?createLeague=true
  useEffect(() => {
    if (location.pathname === '/compete/leagues/create' || searchParams.get('createLeague') === 'true') {
      setShowCreateLeague(true)
    }
  }, [location.pathname])

  const [leaderboardSearch, setLeaderboardSearch] = useState('')
  const [leaderboardLimit, setLeaderboardLimit]   = useState(50)
  const [selectedGroupId, setSelectedGroupId]     = useState('')
  const myRowRef = useRef<HTMLDivElement>(null)

  const { data: stats,            isLoading: loadingStats    } = useMyStats(userId, profile?.internal_ranking)
  const { data: achievementCount = 0 }                        = useAchievementCount(userId)
  const { data: myBadges = [] }                               = useMyBadges(userId)
  const { data: userGroups = [] }                              = useUserGroups(userId)
  const { data: globalBoard = [], isLoading: loadingGlobal   } = useGlobalLeaderboard(leaderboardLimit, leaderboardSearch)
  const { data: groupBoard  = [], isLoading: loadingGroup    } = useGroupLeaderboard(userId, selectedGroupId)
  const { data: myLeagues   = [], isLoading: loadingLeagues  } = useMyLeagues(userId)

  // Auto-select first group
  useEffect(() => {
    if (userGroups.length > 0 && !selectedGroupId) setSelectedGroupId(userGroups[0].group_id)
  }, [userGroups, selectedGroupId])

  const rawLeaderboard     = leaderboardTab === 'global' ? globalBoard : groupBoard
  const loadingLeaderboard = leaderboardTab === 'global' ? loadingGlobal : loadingGroup
  // For group leaderboard filter client-side; global already filtered server-side
  const leaderboard        = leaderboardTab === 'my_groups' && leaderboardSearch.trim()
    ? rawLeaderboard.filter((p) => p.name.toLowerCase().includes(leaderboardSearch.toLowerCase()))
    : rawLeaderboard

  const myGlobalRank = rawLeaderboard.findIndex((p) => p.id === userId) + 1

  return (
    <div className="min-h-full bg-white pb-32">
      {/* Header */}
      <div className="px-5 pt-14 pb-4 sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-gray-50 flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-gray-900">{t('compete.title')}</h1>
        <button
          onClick={() => setShowCreateLeague(true)}
          className="h-9 w-9 rounded-full bg-[#009688] flex items-center justify-center shadow-sm"
        >
          <Plus className="h-5 w-5 text-white" />
        </button>
      </div>

      <div className="px-5 space-y-6">

        {/* ── My Ranking Card ── */}
        <RankingCard profile={profile} stats={stats} isLoading={loadingStats} achievementCount={achievementCount} />

        {/* ── ELO History Chart ── */}
        {userId && (
          <section>
            <h2 className="text-[16px] font-bold text-gray-900 mb-2">{t('compete.your_elo_journey')}</h2>
            <EloHistoryChart userId={userId} compact />
          </section>
        )}

        {/* ── My Badges ── */}
        {myBadges.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[16px] font-bold text-gray-900">{t('compete.my_badges')}</h2>
              <span className="rounded-full bg-yellow-50 border border-yellow-100 px-2 py-0.5 text-[11px] font-bold text-yellow-600">
                {t('compete.earned', { count: achievementCount })}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {myBadges.map((b) => {
                const meta = {
                  label: t(`achievements.${b.badge_key}`, { defaultValue: BADGE_DEFINITIONS[b.badge_key]?.label ?? b.badge_key }),
                  emoji: BADGE_DEFINITIONS[b.badge_key]?.emoji ?? '🏅',
                }
                return (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBadge(b.badge_key)}
                    className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center active:scale-95 transition-transform"
                  >
                    <p className="text-[22px] leading-none mb-1">{meta.emoji}</p>
                    <p className="text-[11px] font-semibold text-gray-700 leading-tight">{meta.label}</p>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <BadgeInfoModal badgeKey={selectedBadge} onClose={() => setSelectedBadge(null)} />

        {/* ── Leaderboard ── */}
        <section>
          <h2 className="text-[16px] font-bold text-gray-900 mb-3">{t('compete.leaderboard')}</h2>

          {/* Tab switcher */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-3">
            {(['global', 'my_groups'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => { setLeaderboardTab(tab); setLeaderboardSearch(''); setLeaderboardLimit(50) }}
                className={cn(
                  'flex-1 rounded-lg py-2 text-[13px] font-semibold transition-colors',
                  leaderboardTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                )}
              >
                {tab === 'global' ? t('compete.global') : t('compete.my_groups')}
              </button>
            ))}
          </div>

          {/* Group selector — shown in My Groups tab */}
          {leaderboardTab === 'my_groups' && userGroups.length > 1 && (
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-900 mb-3 focus:outline-none focus:border-teal-500 bg-white"
            >
              {userGroups.map((g) => (
                <option key={g.group_id} value={g.group_id}>{g.name}</option>
              ))}
            </select>
          )}

          {/* Search bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={leaderboardSearch}
              onChange={(e) => setLeaderboardSearch(e.target.value)}
              placeholder={t('compete.search_players')}
              className="w-full rounded-xl border border-gray-200 pl-8 pr-3 py-2 text-[13px] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {/* Your rank card — shown at top when ranked */}
          {myGlobalRank > 0 && !loadingLeaderboard && !leaderboardSearch && (
            <div className="rounded-2xl bg-[#009688] px-4 py-3.5 mb-2 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-white/70 font-medium mb-0.5">{t('compete.your_ranking')}</p>
                <p className="text-[20px] font-black text-white">{t('compete.ranked_of', { rank: myGlobalRank, total: rawLeaderboard.length })}</p>
              </div>
              <div className="text-right">
                <p className="text-[20px] font-black text-white">{(profile?.internal_ranking ?? 0).toLocaleString()} ELO</p>
                <button
                  onClick={() => myRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  className="text-[11px] text-white/70 underline underline-offset-2"
                >
                  {t('compete.jump_to_me')}
                </button>
              </div>
            </div>
          )}

          {loadingLeaderboard ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
              <p className="text-[13px] font-semibold text-gray-500">
                {leaderboardSearch ? t('compete.no_search_results') : leaderboardTab === 'global' ? t('compete.no_ranked') : t('compete.no_group_members')}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                {leaderboard.map((p, i) => (
                  <LeaderboardRow
                    key={p.id}
                    profile={p}
                    rank={i + 1}
                    currentUserId={userId}
                    index={i}
                    rowRef={p.id === userId ? myRowRef : undefined}
                  />
                ))}
              </div>
              {leaderboardTab === 'global' && leaderboard.length >= leaderboardLimit && !leaderboardSearch && (
                <button
                  onClick={() => setLeaderboardLimit((l) => l + 50)}
                  className="mt-3 w-full rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {t('compete.load_more')}
                </button>
              )}
            </>
          )}
        </section>

        {/* ── My Leagues ── */}
        <section>
          {/* Prominent Create League CTA — always visible */}
          <motion.button
            onClick={() => setShowCreateLeague(true)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.98 }}
            className="w-full rounded-2xl bg-gradient-to-r from-[#009688] to-[#00796b] p-4 mb-4 text-left flex items-center gap-3"
          >
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Trophy className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-white">{t('compete.create_league_cta')}</p>
              <p className="text-[12px] text-white/70 mt-0.5">{t('compete.no_leagues_sub')}</p>
            </div>
            <Plus className="h-5 w-5 text-white/80 flex-shrink-0" />
          </motion.button>

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[16px] font-bold text-gray-900">{t('compete.my_leagues')}</h2>
            <button
              onClick={() => setShowCreateLeague(true)}
              className="flex items-center gap-1 rounded-xl bg-[#009688] px-3 py-1.5 text-[12px] font-bold text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('compete.create_league')}
            </button>
          </div>

          {loadingLeagues ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : myLeagues.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
              <div className="h-10 w-10 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <Trophy className="h-5 w-5 text-gray-400" />
              </div>
              <p className="text-[13px] font-semibold text-gray-600 mb-1">{t('compete.no_leagues')}</p>
              <p className="text-[12px] text-gray-400 mb-4">{t('compete.no_leagues_sub')}</p>
              <button
                onClick={() => setShowCreateLeague(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#009688] px-4 py-2.5 text-[13px] font-bold text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('compete.create_league_cta')}
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {myLeagues.map((league, i) => (
                <LeagueCard key={league.id} league={league} index={i} />
              ))}
              <button
                onClick={() => navigate('/compete/leagues/create')}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 py-3 text-[13px] text-gray-500 hover:border-teal-300 hover:text-teal-600 transition-colors"
              >
                <Plus className="h-4 w-4" />
                {t('compete.create_another_league')}
              </button>
            </div>
          )}
          <button
            onClick={() => navigate('/leagues')}
            className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 border border-gray-100 py-2.5 text-[12px] font-semibold text-[#009688]"
          >
            <Search className="h-3.5 w-3.5" />
            {t('compete.find_open_leagues')}
          </button>
        </section>
      </div>

      <CreateLeagueSheet
        open={showCreateLeague}
        defaultGroupId={defaultGroupId}
        onClose={() => {
          setShowCreateLeague(false)
          if (location.pathname === '/compete/leagues/create') navigate('/compete', { replace: true })
        }}
      />
    </div>
  )
}
