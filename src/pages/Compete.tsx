import { useState, useEffect } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, Trophy, Plus, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'
import { CreateLeagueSheet } from '@/components/compete/CreateLeagueSheet'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RankedProfile {
  id: string
  name: string
  avatar_url: string | null
  internal_ranking: number | null
  ranking_points: number | null
}

interface MyLeague {
  id: string
  name: string
  status: string
  league_type: string | null
  format: string | null
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
  trend:        number
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

      const trend = (trendData.data ?? []).reduce((acc, c) => acc + (c.points_change as number), 0)

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

function useGlobalLeaderboard() {
  return useQuery<RankedProfile[]>({
    queryKey: ['global-leaderboard'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, internal_ranking, ranking_points')
        .not('internal_ranking', 'is', null)
        .order('internal_ranking', { ascending: false })
        .limit(20)
      return data ?? []
    },
  })
}

function useGroupLeaderboard(userId: string) {
  return useQuery<RankedProfile[]>({
    queryKey: ['group-leaderboard', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId)
        .eq('status', 'approved')

      if (!memberships || memberships.length === 0) return []

      const groupIds = memberships.map((m) => m.group_id)
      const { data: members } = await supabase
        .from('group_members')
        .select('user_id')
        .in('group_id', groupIds)
        .eq('status', 'approved')

      if (!members) return []
      const userIds = [...new Set(members.map((m) => m.user_id))]

      const { data } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, internal_ranking, ranking_points')
        .in('id', userIds)
        .not('internal_ranking', 'is', null)
        .order('internal_ranking', { ascending: false })
        .limit(20)

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

      const [{ data: leagues }, { data: standings }] = await Promise.all([
        supabase
          .from('leagues')
          .select('id, name, status, league_type, format')
          .in('id', leagueIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('league_standings')
          .select('league_id, rank, played, points')
          .in('league_id', leagueIds)
          .eq('user_id', userId),
      ])

      const standingMap = Object.fromEntries(
        (standings ?? []).map((s) => [s.league_id, { rank: s.rank, played: s.played, points: s.points }])
      )
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
}: {
  profile: { name: string; avatar_url?: string | null; internal_ranking?: number } | null
  stats:   MyStats | undefined
  isLoading: boolean
}) {
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
                Ranked <span className="font-bold text-white">#{stats.rank}</span> of {stats.totalPlayers} players
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
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: 'Wins',   value: stats.wins,   color: 'text-green-300' },
                { label: 'Losses', value: stats.losses, color: 'text-red-300'   },
                { label: 'Draws',  value: stats.draws,  color: 'text-gray-300'  },
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
                <p className="text-teal-200 text-[10px] font-semibold uppercase tracking-wide mb-1">Win rate</p>
                <p className="text-white font-bold text-[16px]">{stats.winRate}%</p>
              </div>

              <div>
                <p className="text-teal-200 text-[10px] font-semibold uppercase tracking-wide mb-1">30d trend</p>
                <div className="flex items-center gap-1">
                  {stats.trend > 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-300" />
                  ) : stats.trend < 0 ? (
                    <TrendingDown className="h-4 w-4 text-red-300" />
                  ) : (
                    <Minus className="h-4 w-4 text-gray-300" />
                  )}
                  <span className={cn(
                    'text-[14px] font-bold',
                    stats.trend > 0 ? 'text-green-300' : stats.trend < 0 ? 'text-red-300' : 'text-gray-300'
                  )}>
                    {stats.trend > 0 ? '+' : ''}{stats.trend}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-teal-200 text-[10px] font-semibold uppercase tracking-wide mb-1.5">Recent form</p>
                <div className="flex gap-1.5">
                  {stats.recentForm.length > 0
                    ? stats.recentForm.map((r, i) => <FormDot key={i} result={r} />)
                    : <span className="text-teal-300 text-[11px]">No matches yet</span>
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
}: {
  profile: RankedProfile
  rank: number
  currentUserId: string
  index: number
}) {
  const isMe = profile.id === currentUserId
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl',
        isMe ? 'bg-teal-50 border border-teal-100' : 'bg-gray-50/60 border border-gray-100'
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
          {profile.name}{isMe ? ' (you)' : ''}
        </p>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className={cn('text-[13px] font-bold', isMe ? 'text-[#009688]' : 'text-gray-700')}>
          {(profile.internal_ranking ?? 0).toLocaleString()}
        </p>
        <p className="text-[10px] text-gray-400">ELO</p>
      </div>
    </motion.div>
  )
}

function LeagueCard({ league, index }: { league: MyLeague; index: number }) {
  const navigate = useNavigate()

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
            {league.league_type && (
              <span className="text-[11px] text-gray-400 capitalize">{league.league_type}</span>
            )}
            {league.format && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-[11px] text-gray-400 capitalize">{league.format.replace('_', ' ')}</span>
              </>
            )}
          </div>
          {league.standing && (
            <div className="flex items-center gap-3 mt-2">
              {league.standing.rank != null && (
                <span className="text-[11px] text-gray-500">
                  Position <span className="font-bold text-[#009688]">#{league.standing.rank}</span>
                </span>
              )}
              <span className="text-[11px] text-gray-500">
                {league.standing.played} played
              </span>
              <span className="text-[11px] text-gray-500">
                <span className="font-bold text-gray-700">{league.standing.points}</span> pts
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
  const [searchParams] = useSearchParams()
  const userId       = profile?.id ?? ''
  const defaultGroupId = searchParams.get('group_id') ?? undefined

  const [leaderboardTab, setLeaderboardTab]   = useState<'global' | 'my_groups'>('global')
  const [showCreateLeague, setShowCreateLeague] = useState(
    location.pathname === '/compete/leagues/create'
  )

  // Auto-open sheet when navigated to /compete/leagues/create
  useEffect(() => {
    if (location.pathname === '/compete/leagues/create') {
      setShowCreateLeague(true)
    }
  }, [location.pathname])

  const { data: stats,            isLoading: loadingStats    } = useMyStats(userId, profile?.internal_ranking)
  const { data: globalBoard = [], isLoading: loadingGlobal   } = useGlobalLeaderboard()
  const { data: groupBoard  = [], isLoading: loadingGroup    } = useGroupLeaderboard(userId)
  const { data: myLeagues   = [], isLoading: loadingLeagues  } = useMyLeagues(userId)

  const leaderboard        = leaderboardTab === 'global' ? globalBoard : groupBoard
  const loadingLeaderboard = leaderboardTab === 'global' ? loadingGlobal : loadingGroup

  return (
    <div className="min-h-full bg-white pb-32">
      {/* Header */}
      <div className="px-5 pt-14 pb-4">
        <h1 className="text-[22px] font-bold text-gray-900">Compete</h1>
      </div>

      <div className="px-5 space-y-6">

        {/* ── My Ranking Card ── */}
        <RankingCard profile={profile} stats={stats} isLoading={loadingStats} />

        {/* ── Leaderboard ── */}
        <section>
          <h2 className="text-[16px] font-bold text-gray-900 mb-3">Leaderboard</h2>

          {/* Tab switcher */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-3">
            {(['global', 'my_groups'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setLeaderboardTab(tab)}
                className={cn(
                  'flex-1 rounded-lg py-2 text-[13px] font-semibold transition-colors',
                  leaderboardTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                )}
              >
                {tab === 'global' ? 'Global' : 'My Groups'}
              </button>
            ))}
          </div>

          {loadingLeaderboard ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
              <p className="text-[13px] font-semibold text-gray-500">
                {leaderboardTab === 'global' ? 'No ranked players yet' : 'No group members found'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {leaderboard.map((p, i) => (
                <LeaderboardRow
                  key={p.id}
                  profile={p}
                  rank={i + 1}
                  currentUserId={userId}
                  index={i}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── My Leagues ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[16px] font-bold text-gray-900">My Leagues</h2>
            <button
              onClick={() => setShowCreateLeague(true)}
              className="flex items-center gap-1 rounded-xl bg-[#009688] px-3 py-1.5 text-[12px] font-bold text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              Create
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
              <p className="text-[13px] font-semibold text-gray-600 mb-1">No active leagues</p>
              <p className="text-[12px] text-gray-400 mb-4">Create one or join a group league</p>
              <button
                onClick={() => setShowCreateLeague(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#009688] px-4 py-2.5 text-[13px] font-bold text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Create a league
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
                Create another league
              </button>
            </div>
          )}
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
