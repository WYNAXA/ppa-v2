import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
  TrendingUp, TrendingDown, Minus,
  Calendar, MapPin, ChevronRight, Plus,
  Clock, Users, Trophy, BarChart3, Search, Bell,
} from 'lucide-react'
import { NotificationBell } from '@/components/shared/NotificationBell'
import { format, parseISO, differenceInCalendarDays, addDays } from 'date-fns'
import { useDateLocale, getDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { guestPseudoProfilesForMatches } from '@/lib/guestPlayers'
import { useAuth } from '@/hooks/useAuth'
import { useUserMatchesSubscription, useNotificationsSubscription } from '@/hooks/useRealtimeSubscription'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { CreateMatchSheet } from '@/components/play/CreateMatchSheet'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────


function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function getCountdown(matchDate: string, matchTime: string | null, t: (key: string, opts?: Record<string, unknown>) => string): string {
  try {
    const diff = differenceInCalendarDays(parseISO(matchDate), new Date())
    if (diff === 0) return matchTime ? t('home.today_at', { time: matchTime.slice(0, 5) }) : t('home.today')
    if (diff === 1) return matchTime ? t('home.tomorrow_at', { time: matchTime.slice(0, 5) }) : t('home.tomorrow')
    if (diff > 1)  return t('home.in_days', { count: diff })
  } catch { /* fall through */ }
  return matchDate
}

function timeAgo(dateStr: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  try {
    const diff = Date.now() - parseISO(dateStr).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1)  return t('home.just_now')
    if (mins < 60) return t('home.mins_ago', { count: mins })
    const hours = Math.floor(mins / 60)
    if (hours < 24) return t('home.hours_ago', { count: hours })
    return t('home.days_ago', { count: Math.floor(hours / 24) })
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
  has_result: boolean
}

interface ActivePoll {
  id: string
  title: string
  group_id: string
  responseCount: number
  memberCount: number
  userHasResponded: boolean
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
  related_id: string | null
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

      const { count: resultCount } = await supabase
        .from('match_results')
        .select('id', { count: 'exact', head: true })
        .eq('match_id', match.id)

      // Guests are placeholder slots in player_ids — resolve their names so the
      // card shows them instead of a blank avatar.
      const guestsByMatch = await guestPseudoProfilesForMatches([match.id])
      return { ...match, players: [...players, ...(guestsByMatch[match.id] ?? [])], has_result: (resultCount ?? 0) > 0 }
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
    queryKey: ['polls', 'mine', userId],
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

      const [{ count: responseCount }, { count: memberCount }, { data: myResponse }] = await Promise.all([
        supabase
          .from('poll_responses')
          .select('id', { count: 'exact', head: true })
          .eq('poll_id', poll.id),
        supabase
          .from('group_members')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', poll.group_id)
          .eq('status', 'approved'),
        supabase
          .from('poll_responses')
          .select('id')
          .eq('poll_id', poll.id)
          .eq('user_id', userId)
          .maybeSingle(),
      ])

      return {
        id:               poll.id,
        title:            poll.title,
        group_id:         poll.group_id,
        responseCount:    responseCount ?? 0,
        memberCount:      memberCount ?? 0,
        userHasResponded: !!myResponse,
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
        .select('id, type, message, read, created_at, related_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) return []
      return (data ?? []) as ActivityItem[]
    },
  })
}


// ── Setup progress (first-run guidance) ──────────────────────────────────────

interface SetupProgress {
  /** 'none' | 'solo' | 'usable' */
  groupState: 'none' | 'solo' | 'usable'
  hasPollOrMatch: boolean
}

function useSetupProgress(userId: string) {
  return useQuery<SetupProgress>({
    queryKey: ['setup-progress', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      // 1. User's approved group_ids
      const { data: memberships } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId)
        .eq('status', 'approved')
      const groupIds = (memberships ?? []).map((m) => m.group_id as string)

      let groupState: 'none' | 'solo' | 'usable' = 'none'
      if (groupIds.length > 0) {
        // 2. Are there other approved members in any of those groups?
        const { count } = await supabase
          .from('group_members')
          .select('id', { count: 'exact', head: true })
          .in('group_id', groupIds)
          .eq('status', 'approved')
          .neq('user_id', userId)
        groupState = (count ?? 0) > 0 ? 'usable' : 'solo'
      }

      // 3. Poll responses or matches
      const [pollResult, matchResult] = await Promise.all([
        supabase
          .from('poll_responses')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from('matches')
          .select('id', { count: 'exact', head: true })
          .contains('player_ids', [userId]),
      ])
      const hasPollOrMatch = ((pollResult.count ?? 0) > 0) || ((matchResult.count ?? 0) > 0)

      return { groupState, hasPollOrMatch }
    },
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, { key: string; className: string }> = {
  competitive: { key: 'home.type_competitive', className: 'bg-warn/25 text-warn-100 border-warn/30' },
  friendly:    { key: 'home.type_friendly',    className: 'bg-blue-400/20 text-blue-100 border-blue-300/20'     },
  casual:      { key: 'home.type_casual',      className: 'bg-white/20 text-white/80 border-white/20'           },
  group:       { key: 'home.type_group',       className: 'bg-white/20 text-white/80 border-white/20'           },
}

function NextMatchCard({
  match,
  onRecordResult,
}: {
  match: NextMatch
  onRecordResult: () => void
}) {
  const navigate   = useNavigate()
  const { t } = useTranslation()
  const locale = useDateLocale()
  const countdown  = getCountdown(match.match_date, match.match_time, t)
  const matchStart = match.match_time
    ? new Date(`${match.match_date}T${match.match_time}`)
    : new Date(`${match.match_date}T00:00:00`)
  const now = new Date()
  const isPastMatchTime = now > matchStart
  const withinWindow = now < new Date(matchStart.getTime() + 24 * 60 * 60 * 1000)
  const canRecord  = isPastMatchTime && withinWindow && match.status === 'scheduled' && match.player_ids.length === 4 && !match.has_result

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-panel bg-ink-surface"
    >
      {/* A padel court, drawn once, very quietly. It is where the palette gets
          its name and it stops the hero being a plain dark rectangle. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.13]"
        viewBox="0 0 390 210"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <g fill="none" stroke="var(--color-line)" strokeWidth="1.4">
          <rect x="26" y="18" width="338" height="174" rx="3" />
          <line x1="195" y1="18" x2="195" y2="192" />
          <line x1="26" y1="105" x2="364" y2="105" strokeDasharray="5 6" />
          <line x1="110" y1="18" x2="110" y2="192" />
          <line x1="280" y1="18" x2="280" y2="192" />
        </g>
      </svg>

      <div className="relative p-5">
        <div className="mb-3.5 flex items-center justify-between gap-2">
          {/* The single ball-yellow element on this screen. The hero is the only
              dark surface and the countdown is the only thing on it that is
              time-critical, so this is where the accent is spent. */}
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-ball px-3 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink">
            <Clock className="h-3 w-3" />
            {countdown}
          </span>
          {match.match_type && (
            <span className="inline-flex items-center rounded-pill border border-white/20 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-ink-4">
              {t((TYPE_BADGE[match.match_type ?? 'group'] ?? TYPE_BADGE.group).key)}
            </span>
          )}
        </div>

        <p className="text-[22px] font-extrabold leading-[26px] tracking-[-0.01em] text-white">
          {(() => { try { return format(parseISO(match.match_date), 'EEEE, d MMMM', { locale }) } catch { return match.match_date } })()}
        </p>

        {(match.match_time || match.booked_venue_name) && (
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-line" />
            <p className="truncate text-[13px] text-line">
              {match.match_time && <span className="num font-semibold">{match.match_time.slice(0, 5)}</span>}
              {match.match_time && match.booked_venue_name ? ' · ' : ''}
              {match.booked_venue_name}
            </p>
          </div>
        )}

        {match.players.length > 0 && (
          <div className="mt-3.5 flex items-center gap-2">
            <div className="flex -space-x-1.5">
              {match.players.map((p) => (
                <PlayerAvatar key={p.id} name={p.name} avatarUrl={p.avatar_url} size="sm" />
              ))}
            </div>
            <p className="truncate text-[13px] text-ink-4">
              {match.players.map((p) => p.name.split(' ')[0]).join(' & ')}
            </p>
          </div>
        )}

        <div className={cn('mt-4 grid gap-2', canRecord ? 'grid-cols-2' : 'grid-cols-1')}>
          <button
            onClick={() => navigate(`/matches/${match.id}`)}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-control bg-white text-[13px] font-bold text-ink"
          >
            {t('home.view_match')} <ChevronRight className="h-4 w-4" />
          </button>
          {canRecord && (
            <button
              onClick={onRecordResult}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-control border border-white/25 bg-white/10 text-[13px] font-bold text-white"
            >
              <Trophy className="h-3.5 w-3.5" />
              {t('home.record_result')}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function GettingStartedCard({ progress }: { progress: SetupProgress }) {
  const navigate = useNavigate()
  const groupDone = progress.groupState === 'usable'
  const playDone = progress.hasPollOrMatch
  const stepsComplete = 1 + (groupDone ? 1 : 0) + (playDone ? 1 : 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-court-100 bg-gradient-to-br from-court-50 to-white p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[16px]">🎾</span>
        <p className="text-[14px] font-bold text-ink">Getting started</p>
        <span className="ml-auto text-[11px] font-semibold text-ink-2">{stepsComplete} of 3</span>
      </div>

      <div className="space-y-2.5">
        {/* Step 1: Profile — always done */}
        <div className="flex items-center gap-3">
          <span className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center text-[12px] text-green-600 font-bold shrink-0">✓</span>
          <p className="text-[13px] text-ink-2 line-through">You're all set up</p>
        </div>

        {/* Step 2: Group */}
        <div className="flex items-start gap-3">
          {groupDone ? (
            <>
              <span className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center text-[12px] text-green-600 font-bold shrink-0">✓</span>
              <p className="text-[13px] text-ink-2 line-through">Create a group & invite friends</p>
            </>
          ) : (
            <>
              <span className="h-6 w-6 rounded-full bg-court-100 flex items-center justify-center text-[12px] text-court-700 font-bold shrink-0">2</span>
              <div className="flex-1 min-w-0">
                {progress.groupState === 'none' ? (
                  <>
                    <p className="text-[13px] font-semibold text-ink">Create a group & invite friends</p>
                    <p className="text-[11px] text-ink-2 mt-0.5">Groups let you find times to play and schedule matches</p>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => navigate('/community', { state: { openCreateGroup: true } })}
                        className="rounded-lg bg-court px-3 py-1.5 text-[12px] font-bold text-white"
                      >
                        Create a group
                      </button>
                      <button
                        onClick={() => navigate('/community')}
                        className="rounded-lg border border-hairline px-3 py-1.5 text-[12px] font-semibold text-ink-2"
                      >
                        Browse groups
                      </button>
                    </div>
                  </>
                ) : (
                  /* solo group — in progress */
                  <>
                    <p className="text-[13px] font-semibold text-warn">Group created — invite a friend to get started</p>
                    <p className="text-[11px] text-ink-2 mt-0.5">You need at least one other member to schedule matches</p>
                    <button
                      onClick={() => navigate('/community')}
                      className="mt-2 rounded-lg bg-warn px-3 py-1.5 text-[12px] font-bold text-white"
                    >
                      Invite friends
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Step 3: Play */}
        <div className="flex items-start gap-3">
          {playDone ? (
            <>
              <span className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center text-[12px] text-green-600 font-bold shrink-0">✓</span>
              <p className="text-[13px] text-ink-2 line-through">Find a time to play</p>
            </>
          ) : (
            <>
              <span className="h-6 w-6 rounded-full bg-hairline flex items-center justify-center text-[12px] text-ink-2 font-bold shrink-0">3</span>
              <div className="flex-1 min-w-0">
                <p className={cn('text-[13px] font-semibold', groupDone ? 'text-ink' : 'text-ink-2')}>Find a time to play</p>
                {groupDone && (
                  <>
                    <p className="text-[11px] text-ink-2 mt-0.5">Share your availability so your group can find a time</p>
                    <button
                      onClick={() => navigate('/play/availability')}
                      className="mt-2 rounded-lg border border-court px-3 py-1.5 text-[12px] font-bold text-court"
                    >
                      Check availability
                    </button>
                  </>
                )}
                {!groupDone && (
                  <p className="text-[11px] text-ink-2 mt-0.5">Complete step 2 first</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function EmptyMatchCard({ onCreateMatch, hasUsableGroup }: { onCreateMatch: () => void; hasUsableGroup: boolean }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-dashed border-hairline p-6 text-center"
    >
      <div className="h-12 w-12 rounded-2xl bg-hairline flex items-center justify-center mx-auto mb-3">
        <Calendar className="h-6 w-6 text-ink-2" />
      </div>
      <p className="text-[14px] font-bold text-ink-2 mb-1">{t('home.no_matches')}</p>
      <p className="text-[12px] text-ink-2 mb-4">
        {hasUsableGroup ? t('home.no_matches_sub') : 'Create or join a group to start scheduling matches'}
      </p>
      {hasUsableGroup ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => navigate('/play/availability')}
            className="rounded-xl border border-court py-2.5 text-[13px] font-bold text-court"
          >
            {t('home.find_my_game')}
          </button>
          <button
            onClick={onCreateMatch}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-court py-2.5 text-[13px] font-bold text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('home.create_match')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => navigate('/community', { state: { openCreateGroup: true } })}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-court py-2.5 text-[13px] font-bold text-white"
          >
            <Users className="h-3.5 w-3.5" />
            Create a group
          </button>
          <button
            onClick={() => navigate('/community')}
            className="rounded-xl border border-hairline py-2.5 text-[13px] font-semibold text-ink-2"
          >
            Browse groups
          </button>
        </div>
      )}
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
  const { t } = useTranslation()
  const elo      = profile?.internal_ranking

  return (
    <motion.button
      onClick={() => navigate('/compete')}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      whileTap={{ scale: 0.97 }}
      className="flex-1 rounded-panel border border-hairline bg-card p-4 text-left"
    >
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">{t('home.ranking')}</p>
      <div className="flex items-baseline gap-1.5">
        <p className="num text-[32px] font-extrabold leading-none tracking-[-0.02em] text-court">
          {elo != null ? elo.toLocaleString() : '—'}
        </p>
        {!isLoading && ranking && ranking.trend !== 0 && (
          ranking.trend > 0
            ? <TrendingUp className="h-4 w-4 text-court" />
            : <TrendingDown className="h-4 w-4 text-alert" />
        )}
      </div>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">ELO</p>

      {!isLoading && ranking && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <p className="text-[11px] text-ink-2">
            {t('home.ranked_globally', { rank: ranking.rank })}
          </p>
          {ranking.trend === 0 && <Minus className="h-3 w-3 text-ink-4" />}
        </div>
      )}
      <ChevronRight className="mt-2 h-3.5 w-3.5 text-ink-4" />
    </motion.button>
  )
}

function PollCard({ poll }: { poll: ActivePoll | null }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  return (
    <motion.button
      onClick={() => navigate(poll ? `/play/availability/${poll.id}` : '/play/availability')}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
      whileTap={{ scale: 0.97 }}
      className="flex-1 rounded-panel border border-hairline bg-card p-4 text-left"
    >
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">{t('home.availability')}</p>
      {poll ? (
        <>
          <p className="mb-1.5 line-clamp-2 text-[13px] font-bold leading-tight text-ink">
            {poll.title}
          </p>
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="h-3 w-3 text-ink-3" />
            <p className="text-[11px] text-ink-2">
              {t('home.responded', { count: poll.responseCount, total: poll.memberCount })}
            </p>
          </div>
          {poll.userHasResponded ? (
            <span className="inline-flex items-center rounded-xl bg-court-50 border border-court-100 px-2.5 py-1 text-[11px] font-bold text-court">
              {t('home.you_responded')}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-xl bg-court px-2.5 py-1 text-[11px] font-bold text-white">
              {t('home.add_yours')}
            </span>
          )}
        </>
      ) : (
        <>
          <p className="mb-2 text-[13px] text-ink-2">{t('home.no_polls')}</p>
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-court">
            {t('home.check_availability')} <ChevronRight className="h-3.5 w-3.5" />
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
  const { t } = useTranslation()

  function handleTap(item: ActivityItem) {
    if (!item.related_id) return
    if (item.type.includes('match')) navigate(`/matches/${item.related_id}`)
    else if (item.type.includes('league')) navigate(`/compete/leagues/${item.related_id}`)
    else if (item.type.includes('group')) navigate(`/community/groups/${item.related_id}`)
    else if (item.type.includes('poll')) navigate(`/play/availability/${item.related_id}`)
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
            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-surface transition-colors text-left"
          >
            <div className={cn(
              'h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
              item.read ? 'bg-hairline' : 'bg-court-50'
            )}>
              <Icon className={cn('h-3.5 w-3.5', item.read ? 'text-ink-2' : 'text-court')} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn('text-[13px] leading-snug', item.read ? 'text-ink-2' : 'font-semibold text-ink')}>
                {item.message}
              </p>
              <p className="text-[11px] text-ink-2 mt-0.5">{timeAgo(item.created_at, t)}</p>
            </div>
            {!item.read && (
              <div className="h-2 w-2 rounded-full bg-court flex-shrink-0 mt-2" />
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

function QuickStatsRow({ stats }: { stats: QuickStats | undefined }) {
  const { t } = useTranslation()
  const items = [
    {
      value:    stats ? `${stats.weekMatches}` : '—',
      label:    t('home.matches_this_week'),
      subtitle: t('home.this_week'),
    },
    {
      value:    stats ? `${stats.winRate}%` : '—',
      label:    t('home.win_rate'),
      subtitle: t('home.all_time'),
    },
    {
      value:    stats ? `${stats.streak}` : '—',
      label:    t('home.win_streak'),
      subtitle: t('home.last_5'),
    },
  ]
  return (
    <div className="flex gap-2">
      {items.map(({ value, label, subtitle }, i) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.04 }}
          className="flex-1 rounded-card border border-hairline bg-card px-3 py-2.5 text-center"
        >
          <p className="num text-[19px] font-extrabold leading-none text-ink">{value}</p>
          <p className="mt-1 text-[11px] font-semibold text-ink-2">{label}</p>
          <p className="text-[11px] leading-tight text-ink-3">{subtitle}</p>
        </motion.div>
      ))}
    </div>
  )
}

// ── Group opportunities (matches user is NOT in) ────────────────────────────

function useGroupOpportunities(userId: string) {
  return useQuery<Array<{ id: string; match_date: string; match_time: string | null; booked_venue_name: string | null; player_ids: string[]; group_name: string | null; spots: number }>>({
    queryKey: ['home-group-opps', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from('group_members').select('group_id').eq('user_id', userId).eq('status', 'approved')
      if (!memberships || memberships.length === 0) return []
      const groupIds = memberships.map((m) => m.group_id)
      const today = format(new Date(), 'yyyy-MM-dd', { locale: getDateLocale() })
      const weekEnd = format(addDays(new Date(), 7), 'yyyy-MM-dd', { locale: getDateLocale() })
      const { data: matches } = await supabase
        .from('matches')
        .select('id, match_date, match_time, booked_venue_name, player_ids, group_id')
        .in('group_id', groupIds)
        .gte('match_date', today).lte('match_date', weekEnd)
        .not('status', 'in', '(cancelled,completed)')
        .order('match_date', { ascending: true })
        .limit(10)
      if (!matches) return []
      // Only matches user is NOT in and has open slots
      const opps = matches
        .filter((m) => !(m.player_ids as string[]).includes(userId) && (m.player_ids as string[]).length < 4)
        .slice(0, 3)
      if (opps.length === 0) return []
      const gIds = [...new Set(opps.map((m) => m.group_id).filter(Boolean))]
      const { data: groups } = gIds.length > 0
        ? await supabase.from('groups').select('id, name').in('id', gIds)
        : { data: [] }
      const gMap = Object.fromEntries((groups ?? []).map((g) => [g.id, g]))
      return opps.map((m) => ({
        id: m.id,
        match_date: m.match_date,
        match_time: m.match_time,
        booked_venue_name: m.booked_venue_name,
        player_ids: (m.player_ids as string[]) ?? [],
        group_name: m.group_id ? gMap[m.group_id]?.name ?? null : null,
        spots: 4 - ((m.player_ids as string[]) ?? []).length,
      }))
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function HomePage() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const userId      = profile?.id ?? ''
  const { t } = useTranslation()

  const locale = useDateLocale()
  const [createMatchOpen, setCreateMatchOpen] = useState(false)

  // Realtime: auto-refresh when matches or notifications change
  useUserMatchesSubscription(userId)
  useNotificationsSubscription(userId)

  const { data: nextMatch,  isLoading: loadingMatch    } = useNextMatch(userId)
  const { data: ranking,    isLoading: loadingRanking  } = useHomeRanking(userId, profile?.internal_ranking)
  const { data: activePoll, isLoading: loadingPoll     } = useActivePoll(userId)
  const { data: quickStats                             } = useQuickStats(userId)
  const { data: activity = []                          } = useRecentActivity(userId)
  const { data: groupOpps = [] } = useGroupOpportunities(userId)
  const { data: setupProgress } = useSetupProgress(userId)

  const setupComplete = setupProgress
    ? setupProgress.groupState === 'usable' && setupProgress.hasPollOrMatch
    : true // hide card while loading (avoids flash)

  const today = new Date()
  const dateLabel = (() => {
    try { return format(today, 'EEEE, d MMMM', { locale }) } catch { return '' }
  })()

  return (
    <div className="min-h-full bg-surface pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-hairline bg-surface/95 px-5 pb-5 pt-14 backdrop-blur-sm">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">{dateLabel}</p>
          <h1 className="mt-1 text-[24px] font-extrabold leading-[26px] tracking-[-0.01em] text-ink">
            {profile?.name
              ? (() => {
                  const h = new Date().getHours()
                  const key = h < 12 ? 'home.greeting_morning' : h < 17 ? 'home.greeting_afternoon' : 'home.greeting_evening'
                  return `${t(key)}, ${profile.name.split(' ')[0]}`
                })()
              : t('home.greeting_morning')}
          </h1>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <NotificationBell />
        </div>
      </div>

      <div className="px-5 space-y-5">

        {/* ── Search (prominent, so venues are easy to find) ── */}
        <button
          onClick={() => navigate('/search')}
          className="flex h-12 w-full items-center gap-2.5 rounded-control border border-hairline bg-card px-4 text-left transition-transform active:scale-[0.99]"
        >
          <Search className="h-4 w-4 flex-shrink-0 text-ink-3" />
          <span className="text-[13px] text-ink-3">{t('home.search_placeholder')}</span>
        </button>

        {/* ── Getting Started (self-dismissing) ── */}
        {!setupComplete && setupProgress && (
          <section>
            <GettingStartedCard progress={setupProgress} />
          </section>
        )}

        {/* ── Next Match ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">{t('home.next_match')}</h2>
            <button
              onClick={() => navigate('/matches')}
              className="text-[13px] font-semibold text-court"
            >
              {t('home.all_matches')}
            </button>
          </div>

          {loadingMatch ? (
            <div className="h-44 animate-pulse rounded-panel bg-hairline/60" />
          ) : nextMatch ? (
            <NextMatchCard
              match={nextMatch}
              onRecordResult={() => navigate(`/matches/${nextMatch.id}`)}
            />
          ) : (
            <EmptyMatchCard onCreateMatch={() => setCreateMatchOpen(true)} hasUsableGroup={setupProgress?.groupState === 'usable'} />
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
            <div className="h-32 flex-1 animate-pulse rounded-panel bg-hairline/60" />
          ) : (
            <PollCard poll={activePoll ?? null} />
          )}
        </div>

        {/* ── Quick Stats ── */}
        <QuickStatsRow stats={quickStats} />

        {/* ── Group opportunities ── */}
        {groupOpps.length > 0 && (
          <section>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">{t('home.in_your_groups_week')}</h2>
            <div className="space-y-2">
              {groupOpps.map((m) => (
                <button
                  key={m.id}
                  onClick={() => navigate(`/matches/${m.id}`)}
                  className="w-full text-left rounded-2xl border border-warn-100 bg-warn-50/50 px-4 py-3 active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-ink">
                        {(() => { try { return format(parseISO(m.match_date), 'EEE d MMM', { locale }) } catch { return m.match_date } })()}
                        {m.match_time && ` · ${m.match_time.slice(0, 5)}`}
                      </p>
                      {m.booked_venue_name && (
                        <p className="text-[11px] text-ink-2 mt-0.5 truncate">{m.booked_venue_name}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1">
                        {m.group_name && (
                          <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 rounded-full px-1.5 py-0.5">{m.group_name}</span>
                        )}
                        <span className="text-[11px] font-bold text-warn">{m.spots === 1 ? t('home.spots_open_one', { count: 1 }) : t('home.spots_open', { count: m.spots })}</span>
                      </div>
                    </div>
                    <span className="rounded-xl bg-court px-3 py-1.5 text-[11px] font-bold text-white flex-shrink-0">
                      {t('home.join')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Recent Activity ── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">{t('home.recent_activity')}</h2>
            <button
              onClick={() => navigate('/notifications')}
              className="text-[13px] font-semibold text-court"
            >
              {t('home.see_all')}
            </button>
          </div>

          {activity.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline p-5 text-center">
              <p className="text-[13px] font-semibold text-ink-2">{t('home.no_activity')}</p>
              <p className="text-[12px] text-ink-3 mt-1">{t('home.no_activity_sub')}</p>
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
