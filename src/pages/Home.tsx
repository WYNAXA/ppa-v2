import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Bell, TrendingUp, TrendingDown, Minus,
  Calendar, MapPin, ChevronRight, Plus,
  Clock, Users, Trophy, BarChart3,
} from 'lucide-react'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { CreateMatchSheet } from '@/components/play/CreateMatchSheet'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGreeting(name: string): string {
  const h = new Date().getHours()
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  return `Good ${part}, ${name.split(' ')[0]}`
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function getCountdown(matchDate: string, matchTime: string | null): string {
  try {
    const diff = differenceInCalendarDays(parseISO(matchDate), new Date())
    if (diff === 0) return matchTime ? `Today at ${matchTime.slice(0, 5)}` : 'Today'
    if (diff === 1) return matchTime ? `Tomorrow at ${matchTime.slice(0, 5)}` : 'Tomorrow'
    if (diff > 1)  return `In ${diff} days`
  } catch { /* fall through */ }
  return matchDate
}

function timeAgo(dateStr: string): string {
  try {
    const diff = Date.now() - parseISO(dateStr).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1)  return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  } catch { return '' }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface NextMatch {
  id: string
  match_date: string
  match_time: string | null
  match_type: string | null
  status: string
  player_ids: string[]
  booked_venue_name: string | null
  players: Array<{ id: string; name: string; avatar_url: string | null }>
}

interface ActivePoll {
  id: string
  title: string
  group_id: string
  responseCount: number
  memberCount: number
}

interface QuickStats {
  weekMatches: number
  winRate: number
  streak: number
}

interface ActivityItem {
  id: string
  type: string
  message: string
  read: boolean
  created_at: string
  data: Record<string, unknown> | null
}

interface HomeRanking {
  rank: number
  trend: number
}

// ── Data hooks ────────────────────────────────────────────────────────────────

function useNextMatch(userId: string) {
  return useQuery<NextMatch | null>({
    queryKey: ['home-next-match', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: match } = await supabase
        .from('matches')
        .select('id, match_date, match_time, match_type, status, player_ids, booked_venue_name')
        .contains('player_ids', [userId])
        .gte('match_date', todayStr())
        .not('status', 'in', '("completed","cancelled")')
        .order('match_date', { ascending: true })
        .order('match_time', { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle()

      if (!match) return null

      const otherIds = (match.player_ids as string[]).filter((id) => id !== userId)
      let players: Array<{ id: string; name: string; avatar_url: string | null }> = []
      if (otherIds.length > 0) {
        const { data } = await supabase
          .from('profiles')
          .select('id, name, avatar_url')
          .in('id', otherIds)
        players = data ?? []
      }

      return { ...match, players }
    },
  })
}

function useHomeRanking(userId: string, currentRanking: number | undefined) {
  return useQuery<HomeRanking>({
    queryKey: ['home-ranking', userId, currentRanking],
    enabled: !!userId,
    queryFn: async () => {
      const [rankResult, trendData] = await Promise.all([
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .gt('internal_ranking', currentRanking ?? 0),
        supabase
          .from('ranking_changes')
          .select('points_change')
          .eq('player_id', userId)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      ])
      const rank  = (rankResult.count ?? 0) + 1
      const trend = (trendData.data ?? []).reduce((a, c) => a + (c.points_change as number), 0)
      return { rank, trend }
    },
  })
}

function useActivePoll(userId: string) {
  return useQuery<ActivePoll | null>({
    queryKey: ['home-active-poll', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId)
        .eq('status', 'approved')

      const groupIds = (memberships ?? []).map((m) => m.group_id)
      if (groupIds.length === 0) return null

      const { data: polls } = await supabase
        .from('polls')
        .select('id, title, group_id')
        .in('group_id', groupIds)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)

      const poll = polls?.[0]
      if (!poll) return null

      const [{ count: responseCount }, { count: memberCount }] = await Promise.all([
        supabase
          .from('poll_responses')
          .select('id', { count: 'exact', head: true })
          .eq('poll_id', poll.id),
        supabase
          .from('group_members')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', poll.group_id)
          .eq('status', 'approved'),
      ])

      return {
        id:            poll.id,
        title:         poll.title,
        group_id:      poll.group_id,
        responseCount: responseCount ?? 0,
        memberCount:   memberCount ?? 0,
      }
    },
  })
}

function useQuickStats(userId: string) {
  return useQuery<QuickStats>({
    queryKey: ['home-quick-stats', userId],
    enabled: !!userId,
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const { data: results } = await supabase
        .from('match_results')
        .select('result_type, team1_players, team2_players, created_at')
        .or(`team1_players.cs.{${userId}},team2_players.cs.{${userId}}`)
        .order('created_at', { ascending: false })
        .limit(50)

      const all = results ?? []

      // Week stats
      const weekResults = all.filter((r) => r.created_at >= sevenDaysAgo)
      let weekWins = 0
      for (const r of weekResults) {
        const inTeam1 = (r.team1_players as string[]).includes(userId)
        if (
          (inTeam1 && r.result_type === 'team1_win') ||
          (!inTeam1 && r.result_type === 'team2_win')
        ) weekWins++
      }

      // Current streak (from most recent backwards)
      let streak = 0
      for (const r of all) {
        const inTeam1 = (r.team1_players as string[]).includes(userId)
        const isWin =
          (inTeam1 && r.result_type === 'team1_win') ||
          (!inTeam1 && r.result_type === 'team2_win')
        if (isWin) streak++
        else break
      }

      const winRate = all.length > 0
        ? Math.round((all.filter((r) => {
            const inTeam1 = (r.team1_players as string[]).includes(userId)
            return (inTeam1 && r.result_type === 'team1_win') ||
                   (!inTeam1 && r.result_type === 'team2_win')
          }).length / all.length) * 100)
        : 0

      return {
        weekMatches: weekResults.length,
        winRate,
        streak,
      }
    },
  })
}

function useRecentActivity(userId: string) {
  return useQuery<ActivityItem[]>({
    queryKey: ['home-activity', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, message, read, created_at, data')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) return []
      return (data ?? []).map((n) => ({
        ...n,
        data: (n.data as Record<string, unknown> | null) ?? null,
      }))
    },
  })
}

function useUnreadCount(userId: string) {
  return useQuery<number>({
    queryKey: ['unread-count', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false)
      if (error) return 0
      return count ?? 0
    },
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  competitive: { label: 'Competitive', className: 'bg-orange-400/20 text-orange-100 border-orange-300/20' },
  friendly:    { label: 'Friendly',    className: 'bg-blue-400/20 text-blue-100 border-blue-300/20'     },
  casual:      { label: 'Casual',      className: 'bg-white/20 text-white/80 border-white/20'           },
  group:       { label: 'Group',       className: 'bg-white/20 text-white/80 border-white/20'           },
}

function NextMatchCard({
  match,
  userId,
  onRecordResult,
}: {
  match: NextMatch
  userId: string
  onRecordResult: () => void
}) {
  const navigate   = useNavigate()
  const countdown  = getCountdown(match.match_date, match.match_time)
  const isToday    = match.match_date === todayStr()
  const canRecord  = isToday && match.status === 'scheduled' && match.player_ids.length === 4
  const typeStyle  = TYPE_BADGE[match.match_type ?? 'group'] ?? TYPE_BADGE.group

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #009688 0%, #004d44 100%)' }}
    >
      <div className="p-5">
        {/* Countdown badge */}
        <div className="flex items-center justify-between mb-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold text-white">
            <Clock className="h-3 w-3" />
            {countdown}
          </span>
          {match.match_type && (
            <span className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold capitalize',
              typeStyle.className
            )}>
              {typeStyle.label}
            </span>
          )}
        </div>

        {/* Date */}
        <p className="text-white font-bold text-[18px] leading-tight mb-1">
          {(() => { try { return format(parseISO(match.match_date), 'EEEE, d MMMM') } catch { return match.match_date } })()}
          {match.match_time ? ` · ${match.match_time.slice(0, 5)}` : ''}
        </p>

        {/* Venue */}
        {match.booked_venue_name && (
          <div className="flex items-center gap-1.5 mb-3">
            <MapPin className="h-3.5 w-3.5 text-teal-200 flex-shrink-0" />
            <p className="text-teal-100 text-[13px] truncate">{match.booked_venue_name}</p>
          </div>
        )}

        {/* Players */}
        {match.players.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <div className="flex -space-x-1.5">
              {match.players.map((p) => (
                <PlayerAvatar key={p.id} name={p.name} avatarUrl={p.avatar_url} size="sm" />
              ))}
            </div>
            <p className="text-teal-100 text-[13px]">
              {match.players.map((p) => p.name.split(' ')[0]).join(' & ')}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className={cn('grid gap-2', canRecord ? 'grid-cols-2' : 'grid-cols-1')}>
          <button
            onClick={() => navigate(`/matches/${match.id}`)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-[13px] font-bold text-[#009688]"
          >
            View match <ChevronRight className="h-4 w-4" />
          </button>
          {canRecord && (
            <button
              onClick={onRecordResult}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-white/20 py-2.5 text-[13px] font-bold text-white border border-white/30"
            >
              <Trophy className="h-3.5 w-3.5" />
              Record result
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function EmptyMatchCard({ onCreateMatch }: { onCreateMatch: () => void }) {
  const navigate = useNavigate()
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-dashed border-gray-200 p-6 text-center"
    >
      <div className="h-12 w-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
        <Calendar className="h-6 w-6 text-gray-400" />
      </div>
      <p className="text-[14px] font-bold text-gray-700 mb-1">No matches coming up</p>
      <p className="text-[12px] text-gray-400 mb-4">Find a time that works or create a match</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => navigate('/play/availability')}
          className="rounded-xl border border-[#009688] py-2.5 text-[13px] font-bold text-[#009688]"
        >
          Find my game
        </button>
        <button
          onClick={onCreateMatch}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-[#009688] py-2.5 text-[13px] font-bold text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          Create match
        </button>
      </div>
    </motion.div>
  )
}

function RankingCard({
  profile,
  ranking,
  isLoading,
}: {
  profile: { internal_ranking?: number | null } | null
  ranking: HomeRanking | undefined
  isLoading: boolean
}) {
  const navigate = useNavigate()
  const elo      = profile?.internal_ranking ?? 0

  return (
    <motion.button
      onClick={() => navigate('/compete')}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      whileTap={{ scale: 0.97 }}
      className="flex-1 rounded-2xl bg-gray-50 border border-gray-100 p-4 text-left"
    >
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">My ranking</p>
      <p className="text-[26px] font-black text-[#009688] leading-none">{elo.toLocaleString()}</p>
      <p className="text-[11px] text-gray-500 mt-0.5 font-medium">ELO</p>

      {!isLoading && ranking && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <p className="text-[11px] text-gray-500">
            Ranked <span className="font-bold text-gray-700">#{ranking.rank}</span> globally
          </p>
          {ranking.trend > 0 ? (
            <TrendingUp className="h-3 w-3 text-green-500" />
          ) : ranking.trend < 0 ? (
            <TrendingDown className="h-3 w-3 text-red-400" />
          ) : (
            <Minus className="h-3 w-3 text-gray-300" />
          )}
        </div>
      )}
      <ChevronRight className="h-3.5 w-3.5 text-gray-300 mt-2" />
    </motion.button>
  )
}

function PollCard({ poll }: { poll: ActivePoll | null }) {
  const navigate = useNavigate()
  return (
    <motion.button
      onClick={() => navigate(poll ? `/play/availability/${poll.id}` : '/play/availability')}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
      whileTap={{ scale: 0.97 }}
      className="flex-1 rounded-2xl bg-gray-50 border border-gray-100 p-4 text-left"
    >
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Availability</p>
      {poll ? (
        <>
          <p className="text-[13px] font-bold text-gray-900 leading-tight line-clamp-2 mb-1.5">
            {poll.title}
          </p>
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="h-3 w-3 text-gray-400" />
            <p className="text-[11px] text-gray-500">
              <span className="font-bold text-gray-700">{poll.responseCount}</span>
              /{poll.memberCount} responded
            </p>
          </div>
          <span className="inline-flex items-center rounded-xl bg-[#009688] px-2.5 py-1 text-[11px] font-bold text-white">
            Add yours
          </span>
        </>
      ) : (
        <>
          <p className="text-[12px] text-gray-500 mb-2">No open polls right now</p>
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#009688]">
            Check availability <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </>
      )}
    </motion.button>
  )
}

const ACTIVITY_ICON: Record<string, typeof Trophy> = {
  match_result:   Trophy,
  player_joined:  Users,
  league_update:  BarChart3,
  new_match:      Calendar,
  poll:           Clock,
}

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const navigate = useNavigate()

  function handleTap(item: ActivityItem) {
    if (!item.data) return
    const d = item.data
    if (d.match_id)  navigate(`/matches/${d.match_id}`)
    else if (d.league_id) navigate(`/compete/leagues/${d.league_id}`)
    else if (d.group_id)  navigate(`/community/groups/${d.group_id}`)
    else if (d.poll_id)   navigate(`/play/availability/${d.poll_id}`)
  }

  return (
    <div className="space-y-1">
      {items.map((item, i) => {
        const Icon = ACTIVITY_ICON[item.type] ?? Bell
        return (
          <motion.button
            key={item.id}
            onClick={() => handleTap(item)}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left"
          >
            <div className={cn(
              'h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
              item.read ? 'bg-gray-100' : 'bg-teal-50'
            )}>
              <Icon className={cn('h-3.5 w-3.5', item.read ? 'text-gray-400' : 'text-[#009688]')} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn('text-[13px] leading-snug', item.read ? 'text-gray-600' : 'font-semibold text-gray-800')}>
                {item.message}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(item.created_at)}</p>
            </div>
            {!item.read && (
              <div className="h-2 w-2 rounded-full bg-[#009688] flex-shrink-0 mt-2" />
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

function QuickStatsRow({ stats }: { stats: QuickStats | undefined }) {
  const items = [
    { label: 'This week',      value: stats ? `${stats.weekMatches} matches` : '—' },
    { label: 'Win rate',       value: stats ? `${stats.winRate}%` : '—'            },
    { label: 'Current streak', value: stats ? `${stats.streak}W` : '—'            },
  ]
  return (
    <div className="flex gap-2">
      {items.map(({ label, value }, i) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.04 }}
          className="flex-1 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5 text-center"
        >
          <p className="text-[13px] font-bold text-gray-800">{value}</p>
          <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{label}</p>
        </motion.div>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function HomePage() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const userId      = profile?.id ?? ''

  const [createMatchOpen, setCreateMatchOpen] = useState(false)

  const { data: nextMatch,  isLoading: loadingMatch    } = useNextMatch(userId)
  const { data: ranking,    isLoading: loadingRanking  } = useHomeRanking(userId, profile?.internal_ranking)
  const { data: activePoll, isLoading: loadingPoll     } = useActivePoll(userId)
  const { data: quickStats                             } = useQuickStats(userId)
  const { data: activity = []                          } = useRecentActivity(userId)
  const { data: unreadCount = 0                        } = useUnreadCount(userId)

  const today = new Date()
  const dateLabel = (() => {
    try { return format(today, 'EEEE, d MMMM') } catch { return '' }
  })()

  return (
    <div className="min-h-full bg-white pb-32">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-14 pb-5">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 leading-tight">
            {profile?.name ? getGreeting(profile.name) : 'Good day'}
          </h1>
          <p className="text-[13px] text-gray-400 mt-0.5">{dateLabel}</p>
        </div>
        <button
          onClick={() => navigate('/notifications')}
          className="relative h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-1"
        >
          <Bell className="h-5 w-5 text-gray-600" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-[#009688] text-[9px] font-bold text-white flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      <div className="px-5 space-y-5">

        {/* ── Next Match ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-bold text-gray-400 uppercase tracking-wide">Next match</h2>
            <button
              onClick={() => navigate('/matches')}
              className="text-[12px] text-[#009688] font-semibold"
            >
              All matches
            </button>
          </div>

          {loadingMatch ? (
            <div className="h-44 rounded-2xl bg-gray-100 animate-pulse" />
          ) : nextMatch ? (
            <NextMatchCard
              match={nextMatch}
              userId={userId}
              onRecordResult={() => navigate(`/matches/${nextMatch.id}`)}
            />
          ) : (
            <EmptyMatchCard onCreateMatch={() => setCreateMatchOpen(true)} />
          )}
        </section>

        {/* ── Ranking + Poll (side by side) ── */}
        <div className="flex gap-3">
          <RankingCard
            profile={profile}
            ranking={ranking}
            isLoading={loadingRanking}
          />
          {loadingPoll ? (
            <div className="flex-1 h-32 rounded-2xl bg-gray-100 animate-pulse" />
          ) : (
            <PollCard poll={activePoll ?? null} />
          )}
        </div>

        {/* ── Quick Stats ── */}
        <QuickStatsRow stats={quickStats} />

        {/* ── Recent Activity ── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[13px] font-bold text-gray-400 uppercase tracking-wide">Recent activity</h2>
            <button
              onClick={() => navigate('/notifications')}
              className="text-[12px] text-[#009688] font-semibold"
            >
              See all
            </button>
          </div>

          {activity.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-center">
              <p className="text-[13px] font-semibold text-gray-400">No recent activity</p>
              <p className="text-[12px] text-gray-300 mt-1">Play a match to get started</p>
            </div>
          ) : (
            <ActivityFeed items={activity} />
          )}
        </section>

      </div>

      <CreateMatchSheet
        open={createMatchOpen}
        onClose={() => setCreateMatchOpen(false)}
      />
    </div>
  )
}
