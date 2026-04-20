import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeagueInfo {
  id: string
  name: string
  status: string
  league_type: string | null
  format: string | null
  start_date: string | null
  end_date: string | null
  linked_group_ids: string[] | null
}

interface Standing {
  id: string
  user_id: string
  rank: number
  played: number
  won: number
  lost: number
  drawn: number
  points: number
  profile?: { name: string; avatar_url: string | null }
}

interface FixtureMatch {
  id: string
  match_date: string
  match_time: string | null
  status: string
  booked_venue_name: string | null
}

interface ResultMatch {
  id: string
  match_date: string
  result: {
    team1_players: string[]
    team2_players: string[]
    team1_score: number
    team2_score: number
    result_type: string
  } | null
  profiles: Record<string, { name: string; avatar_url: string | null }>
}

type Tab = 'standings' | 'fixtures' | 'results'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'standings', label: 'Standings' },
  { id: 'fixtures',  label: 'Fixtures'  },
  { id: 'results',   label: 'Results'   },
]

// ── Data hooks ────────────────────────────────────────────────────────────────

function useLeague(id: string) {
  return useQuery({
    queryKey: ['league', id],
    enabled: !!id,
    queryFn: async (): Promise<LeagueInfo | null> => {
      const { data, error } = await supabase
        .from('leagues')
        .select('id, name, status, league_type, format, start_date, end_date, linked_group_ids')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
  })
}

function useStandings(leagueId: string) {
  return useQuery({
    queryKey: ['league-standings', leagueId],
    enabled: !!leagueId,
    queryFn: async (): Promise<Standing[]> => {
      const { data: rows, error } = await supabase
        .from('league_standings')
        .select('id, user_id, rank, played, won, lost, drawn, points')
        .eq('league_id', leagueId)
        .order('points', { ascending: false })

      if (error || !rows || rows.length === 0) return []

      const userIds = rows.map((r) => r.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', userIds)

      const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

      return rows.map((r, i) => ({
        id:      r.id,
        user_id: r.user_id,
        rank:    r.rank ?? i + 1,
        played:  r.played ?? 0,
        won:     r.won ?? 0,
        lost:    r.lost ?? 0,
        drawn:   r.drawn ?? 0,
        points:  r.points ?? 0,
        profile: profileMap[r.user_id],
      }))
    },
  })
}

function useFixtures(leagueId: string, groupIds: string[]) {
  return useQuery({
    queryKey: ['league-fixtures', leagueId],
    enabled: !!leagueId,
    queryFn: async (): Promise<FixtureMatch[]> => {
      if (groupIds.length === 0) return []
      const { data, error } = await supabase
        .from('matches')
        .select('id, match_date, match_time, status, booked_venue_name')
        .in('group_id', groupIds)
        .not('status', 'in', '("completed","cancelled")')
        .order('match_date', { ascending: true })
        .limit(20)
      if (error) return []
      return data ?? []
    },
  })
}

function useResults(leagueId: string, groupIds: string[]) {
  return useQuery({
    queryKey: ['league-results', leagueId],
    enabled: !!leagueId,
    queryFn: async (): Promise<ResultMatch[]> => {
      if (groupIds.length === 0) return []

      const { data: matches } = await supabase
        .from('matches')
        .select('id, match_date, player_ids')
        .in('group_id', groupIds)
        .eq('status', 'completed')
        .order('match_date', { ascending: false })
        .limit(20)

      if (!matches || matches.length === 0) return []

      const matchIds = matches.map((m) => m.id)
      const [{ data: resultRows }, { data: profiles }] = await Promise.all([
        supabase
          .from('match_results')
          .select('id, match_id, team1_players, team2_players, team1_score, team2_score, result_type')
          .in('match_id', matchIds),
        supabase
          .from('profiles')
          .select('id, name, avatar_url')
          .in('id', [...new Set(matches.flatMap((m) => m.player_ids ?? []))]),
      ])

      const resultMap = Object.fromEntries((resultRows ?? []).map((r) => [r.match_id, r]))
      const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

      return matches.map((m) => ({
        id:         m.id,
        match_date: m.match_date,
        result:     resultMap[m.id] ?? null,
        profiles:   profileMap,
      }))
    },
  })
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function TabSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
      ))}
    </div>
  )
}

function EmptyTab({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
      <p className="text-[13px] font-semibold text-gray-500">{message}</p>
    </div>
  )
}

const STATUS_BADGE: Record<string, string> = {
  scheduled: 'bg-green-50 text-green-700 border-green-100',
  pending:   'bg-yellow-50 text-yellow-700 border-yellow-100',
  completed: 'bg-gray-50 text-gray-500 border-gray-100',
  cancelled: 'bg-red-50 text-red-500 border-red-100',
}

const LEAGUE_STATUS_STYLE: Record<string, string> = {
  active:    'bg-green-50 text-green-600 border-green-100',
  upcoming:  'bg-blue-50 text-blue-600 border-blue-100',
  completed: 'bg-gray-100 text-gray-500 border-gray-200',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function LeagueDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate    = useNavigate()
  const { profile } = useAuth()
  const currentUserId = profile?.id ?? ''
  const [activeTab, setActiveTab] = useState<Tab>('standings')

  const { data: league, isLoading: loadingLeague } = useLeague(id)
  const groupIds = league?.linked_group_ids ?? []

  const { data: standings = [], isLoading: loadingStandings } = useStandings(id)
  const { data: fixtures  = [], isLoading: loadingFixtures  } = useFixtures(id, groupIds)
  const { data: results   = [], isLoading: loadingResults   } = useResults(id, groupIds)

  if (loadingLeague) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
      </div>
    )
  }

  if (!league) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <p className="text-[14px] text-gray-500">League not found</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-[13px] text-teal-600 font-semibold">Go back</button>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-white">
      {/* Header */}
      <div className="px-5 pt-14 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[20px] font-bold text-gray-900 truncate">{league.name}</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {league.league_type && (
                <span className="text-[11px] text-gray-400 capitalize">{league.league_type}</span>
              )}
              {league.format && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-[11px] text-gray-400 capitalize">{league.format.replace('_', ' ')}</span>
                </>
              )}
              <span className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize',
                LEAGUE_STATUS_STYLE[league.status] ?? 'bg-gray-100 text-gray-500 border-gray-200'
              )}>
                {league.status}
              </span>
            </div>
          </div>
        </div>
        {(league.start_date || league.end_date) && (
          <p className="text-[12px] text-gray-400 ml-12">
            {league.start_date
              ? (() => { try { return format(parseISO(league.start_date), 'd MMM yyyy') } catch { return league.start_date } })()
              : ''}
            {league.start_date && league.end_date ? ' – ' : ''}
            {league.end_date
              ? (() => { try { return format(parseISO(league.end_date), 'd MMM yyyy') } catch { return league.end_date } })()
              : ''}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="px-5 border-b border-gray-100">
        <div className="flex gap-5">
          {TABS.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative pb-3 text-[13px] font-semibold flex-shrink-0 transition-colors',
                  active ? 'text-[#009688]' : 'text-gray-400'
                )}
              >
                {tab.label}
                {active && (
                  <motion.div
                    layoutId="league-tab-underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#009688] rounded-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="px-5 pt-4 pb-32"
        >

          {/* ── Standings ── */}
          {activeTab === 'standings' && (
            loadingStandings ? <TabSkeleton /> :
            standings.length === 0 ? <EmptyTab message="No standings yet" /> : (
              <div className="rounded-2xl border border-gray-100 overflow-hidden">
                <div className="grid grid-cols-[28px_1fr_36px_36px_36px_40px] gap-1 px-3 py-2 bg-gray-50 border-b border-gray-100">
                  {['#', 'Player', 'P', 'W', 'L', 'Pts'].map((h) => (
                    <span key={h} className="text-[10px] font-bold text-gray-400 text-center first:text-left">{h}</span>
                  ))}
                </div>
                {standings.map((row, i) => {
                  const isMe = row.user_id === currentUserId
                  return (
                    <div
                      key={row.id}
                      className={cn(
                        'grid grid-cols-[28px_1fr_36px_36px_36px_40px] gap-1 items-center px-3 py-2.5',
                        i < standings.length - 1 && 'border-b border-gray-50',
                        isMe && 'bg-teal-50/60'
                      )}
                    >
                      <span className={cn('text-[12px] font-bold', isMe ? 'text-[#009688]' : 'text-gray-400')}>
                        {row.rank}
                      </span>
                      <div className="flex items-center gap-2 min-w-0">
                        <PlayerAvatar name={row.profile?.name} avatarUrl={row.profile?.avatar_url} size="sm" />
                        <span className={cn('text-[12px] font-semibold truncate', isMe ? 'text-[#009688]' : 'text-gray-800')}>
                          {row.profile?.name ?? 'Unknown'}{isMe ? ' (you)' : ''}
                        </span>
                      </div>
                      <span className="text-[12px] text-gray-500 text-center">{row.played}</span>
                      <span className="text-[12px] text-gray-500 text-center">{row.won}</span>
                      <span className="text-[12px] text-gray-500 text-center">{row.lost}</span>
                      <span className={cn('text-[12px] font-bold text-center', isMe ? 'text-[#009688]' : 'text-gray-800')}>
                        {row.points}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {/* ── Fixtures ── */}
          {activeTab === 'fixtures' && (
            loadingFixtures ? <TabSkeleton /> :
            fixtures.length === 0 ? <EmptyTab message="No upcoming fixtures" /> : (
              <div className="space-y-2">
                {fixtures.map((match) => (
                  <button
                    key={match.id}
                    onClick={() => navigate(`/matches/${match.id}`)}
                    className="w-full text-left rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 hover:border-teal-200 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-semibold text-gray-900">
                          {(() => { try { return format(parseISO(match.match_date), 'EEE d MMM') } catch { return match.match_date } })()}
                          {match.match_time ? ` · ${match.match_time.slice(0, 5)}` : ''}
                        </p>
                        {match.booked_venue_name && (
                          <p className="text-[11px] text-gray-400 mt-0.5">{match.booked_venue_name}</p>
                        )}
                      </div>
                      <span className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-semibold flex-shrink-0 capitalize',
                        STATUS_BADGE[match.status] ?? 'bg-gray-50 text-gray-500 border-gray-100'
                      )}>
                        {match.status}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {/* ── Results ── */}
          {activeTab === 'results' && (
            loadingResults ? <TabSkeleton /> :
            results.length === 0 ? <EmptyTab message="No results yet" /> : (
              <div className="space-y-2">
                {results.map((match) => {
                  const r = match.result
                  return (
                    <button
                      key={match.id}
                      onClick={() => navigate(`/matches/${match.id}`)}
                      className="w-full text-left rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 hover:border-teal-200 transition-colors"
                    >
                      <p className="text-[11px] text-gray-400 mb-1.5">
                        {(() => { try { return format(parseISO(match.match_date), 'EEE d MMM yyyy') } catch { return match.match_date } })()}
                      </p>
                      {r ? (
                        <div className="flex items-center justify-between gap-2">
                          <p className="flex-1 text-right text-[12px] font-semibold text-gray-700 truncate">
                            {r.team1_players.map((pid: string) => match.profiles[pid]?.name?.split(' ')[0] ?? '?').join(' & ')}
                          </p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className={cn('text-[16px] font-black', r.result_type === 'team1_win' ? 'text-teal-700' : 'text-gray-400')}>
                              {r.team1_score}
                            </span>
                            <span className="text-gray-300 text-xs">–</span>
                            <span className={cn('text-[16px] font-black', r.result_type === 'team2_win' ? 'text-orange-600' : 'text-gray-400')}>
                              {r.team2_score}
                            </span>
                          </div>
                          <p className="flex-1 text-[12px] font-semibold text-gray-700 truncate">
                            {r.team2_players.map((pid: string) => match.profiles[pid]?.name?.split(' ')[0] ?? '?').join(' & ')}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[12px] text-gray-400">No result recorded</p>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  )
}
