import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
  Calendar, Plus,
  Clock, Users, Trophy, BarChart3, Search, Bell,
  Check, UserPlus, AlertTriangle,
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

/** Short relative label for the hero pill — "Today", "Tomorrow", "2 days". */
function getShortCountdown(matchDate: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  try {
    const diff = differenceInCalendarDays(parseISO(matchDate), new Date())
    if (diff <= 0) return t('home.today')
    if (diff === 1) return t('home.tomorrow')
    return t('home.in_days_short', { count: diff })
  } catch {
    return matchDate
  }
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
  booked_court_number: number | null
  players: Array<{ id: string; name: string; avatar_url: string | null }>
  has_result: boolean
}



interface ActivityItem {
  id: string
  type: string
  message: string
  read: boolean
  created_at: string
  related_id: string | null
}


// ── Data hooks ────────────────────────────────────────────────────────────────

function useNextMatch(userId: string) {
  return useQuery<NextMatch | null>({
    queryKey: ['home-next-match', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: match } = await supabase
        .from('matches')
        .select('id, match_date, match_time, match_type, status, player_ids, booked_venue_name, booked_court_number')
        .contains('player_ids', [userId])
        .gte('match_date', todayStr())
        .not('status', 'in', '("completed","cancelled","open")')
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


// ── NEEDS YOU ─────────────────────────────────────────────────────────────────
// The signed-off Today screen leads with a triage stack, not a dashboard. Three
// sources feed it — a result waiting on your confirmation, a match in your
// group short of players, an availability poll you have not answered — and each
// row carries the action inline so the screen is answerable without leaving it.
// This is what replaced the ranking / poll / stats tiles: those are Me's job.

/** How far back a result can be and still count as something to act on. */
const RESULT_WINDOW_DAYS = 14

export type NeedsYouItem = {
  id: string
  tone: 'court' | 'alert'
  icon: 'check' | 'user-plus' | 'calendar' | 'alert'
  title: string
  detail: string
  cta: string
  /** Dark CTA reads as "commit"; court reads as "confirm". Matches the board. */
  ctaTone: 'court' | 'ink'
  to: string
}

function useNeedsYou(userId: string, t: (k: string, o?: Record<string, unknown>) => string) {
  return useQuery<NeedsYouItem[]>({
    queryKey: ['home-needs-you', userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const items: NeedsYouItem[] = []
      const today = todayStr()

      // (a) Results still awaiting verification.
      //
      // THREE RULES, ALL LEARNED THE HARD WAY IN UAT:
      //   1. Bounded to 14 days. Without a window this surfaced disputes from
      //      March under the words "last night's result".
      //   2. Only the OPPOSING team is asked to confirm. A teammate submitting
      //      the score is not something you verify — you were there, on that
      //      side of the net. The old filter only excluded the submitter, so
      //      your own partner's submission came back to you as a task.
      //   3. Disputed is not pending. It is a different state, with different
      //      words and a different button.
      const since = format(addDays(new Date(), -RESULT_WINDOW_DAYS), 'yyyy-MM-dd', { locale: getDateLocale() })
      const { data: pending } = await supabase
        .from('match_results')
        .select('id, match_id, verification_status, submitted_by, team1_players, team2_players, team1_score, team2_score, created_at')
        .neq('verification_status', 'verified')
        .neq('submitted_by', userId)
        .gte('created_at', `${since}T00:00:00Z`)
        .order('created_at', { ascending: false })
        .limit(12)

      if (pending && pending.length > 0) {
        const ids = pending.map((r) => r.match_id)
        const { data: mine } = await supabase
          .from('matches')
          .select('id, player_ids, match_date')
          .in('id', ids)
        const matchById = new Map(
          (mine ?? [])
            .filter((m) => ((m.player_ids as string[]) ?? []).includes(userId))
            .map((m) => [m.id as string, m]),
        )

        for (const r of pending) {
          const match = matchById.get(r.match_id)
          if (!match) continue

          // Rule 2 — skip anything my own side submitted.
          const t1 = (r.team1_players as string[]) ?? []
          const t2 = (r.team2_players as string[]) ?? []
          const myTeam = t1.includes(userId) ? t1 : t2.includes(userId) ? t2 : null
          if (myTeam && myTeam.includes(r.submitted_by as string)) continue

          const disputed = r.verification_status === 'disputed'
          const score = r.team1_score != null && r.team2_score != null
            ? `${r.team1_score}–${r.team2_score}`
            : ''
          const when = (() => {
            try {
              const d = differenceInCalendarDays(new Date(), parseISO(match.match_date as string))
              if (d <= 1) return t('home.needs_last_night')
              return format(parseISO(match.match_date as string), 'EEEE d MMM', { locale: getDateLocale() })
            } catch { return '' }
          })()

          items.push({
            id: `result-${r.id}`,
            tone: disputed ? 'alert' : 'court',
            icon: disputed ? 'alert' : 'check',
            title: disputed ? t('home.needs_disputed_title') : t('home.needs_confirm_result'),
            detail: [when, score].filter(Boolean).join(' · '),
            cta: disputed ? t('home.needs_review') : t('home.needs_confirm'),
            ctaTone: disputed ? 'ink' : 'court',
            to: `/matches/${r.match_id}`,
          })
          if (items.length >= 2) break
        }
      }

      // (b) A match in one of your groups that is short of players.
      const { data: memberships } = await supabase
        .from('group_members').select('group_id').eq('user_id', userId).eq('status', 'approved')
      const groupIds = (memberships ?? []).map((m) => m.group_id)

      if (groupIds.length > 0) {
        const weekEnd = format(addDays(new Date(), 7), 'yyyy-MM-dd', { locale: getDateLocale() })
        const { data: matches } = await supabase
          .from('matches')
          .select('id, match_date, match_time, booked_venue_name, player_ids')
          .in('group_id', groupIds)
          .gte('match_date', today).lte('match_date', weekEnd)
          .not('status', 'in', '(cancelled,completed)')
          .order('match_date', { ascending: true })
          .limit(10)
        const short = (matches ?? []).filter(
          (m) => !((m.player_ids as string[]) ?? []).includes(userId)
            && ((m.player_ids as string[]) ?? []).length < 4,
        )
        for (const m of short.slice(0, 2)) {
          const spots = 4 - ((m.player_ids as string[]) ?? []).length
          const day = (() => {
            try { return format(parseISO(m.match_date), 'EEEE', { locale: getDateLocale() }) }
            catch { return m.match_date }
          })()
          items.push({
            id: `spot-${m.id}`,
            tone: 'alert',
            icon: 'user-plus',
            title: t('home.needs_spots', { day, count: spots }),
            detail: [m.match_time?.slice(0, 5), m.booked_venue_name].filter(Boolean).join(' · '),
            cta: t('home.needs_im_in'),
            ctaTone: 'ink',
            to: `/matches/${m.id}`,
          })
        }

        // (c) An open availability poll you have not answered.
        const { data: polls } = await supabase
          .from('polls')
          .select('id, title, group_id')
          .in('group_id', groupIds)
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(3)
        for (const poll of polls ?? []) {
          const [{ data: mineResp }, { count: responded }, { count: members }] = await Promise.all([
            supabase.from('poll_responses').select('id').eq('poll_id', poll.id).eq('user_id', userId).maybeSingle(),
            supabase.from('poll_responses').select('id', { count: 'exact', head: true }).eq('poll_id', poll.id),
            supabase.from('group_members').select('id', { count: 'exact', head: true }).eq('group_id', poll.group_id).eq('status', 'approved'),
          ])
          if (mineResp) continue
          items.push({
            id: `poll-${poll.id}`,
            tone: 'court',
            icon: 'calendar',
            title: t('home.needs_availability'),
            detail: `${poll.title} · ${t('home.responded', { count: responded ?? 0, total: members ?? 0 })}`,
            cta: t('home.needs_add'),
            ctaTone: 'ink',
            to: `/play/availability/${poll.id}`,
          })
          break
        }
      }

      return items.slice(0, 4)
    },
  })
}

const NEEDS_ICON = { check: Check, 'user-plus': UserPlus, calendar: Calendar, alert: AlertTriangle } as const

function NeedsYouSection({ items }: { items: NeedsYouItem[] }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  if (items.length === 0) return null

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">
          {t('home.needs_you')}
        </h2>
        <span className="num rounded-pill bg-ball px-[7px] py-0.5 text-[11px] font-bold leading-[14px] text-ink">
          {items.length}
        </span>
      </div>

      {items.map((item, i) => {
        const Icon = NEEDS_ICON[item.icon]
        return (
          <motion.button
            key={item.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => navigate(item.to)}
            className="flex items-center gap-3 rounded-[14px] border border-hairline bg-card px-3.5 py-3 text-left transition-transform active:scale-[0.99]"
          >
            <span
              className={cn(
                'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-control',
                item.tone === 'alert' ? 'bg-alert-50' : 'bg-court-50',
              )}
            >
              <Icon
                className={cn('h-[18px] w-[18px]', item.tone === 'alert' ? 'text-alert' : 'text-court')}
                strokeWidth={2.2}
              />
            </span>
            <span className="flex min-w-0 flex-grow flex-col gap-px">
              <span className="line-clamp-2 text-[15px] font-semibold leading-5 text-ink">{item.title}</span>
              {item.detail && (
                <span className="num truncate text-[13px] leading-[18px] text-ink-2">{item.detail}</span>
              )}
            </span>
            <span
              className={cn(
                'flex-shrink-0 rounded-control px-3.5 py-2.5 text-[13px] font-semibold leading-4 text-white',
                item.ctaTone === 'ink' ? 'bg-ink' : 'bg-court',
              )}
            >
              {item.cta}
            </span>
          </motion.button>
        )
      })}
    </section>
  )
}

// ── YOUR WEEK ─────────────────────────────────────────────────────────────────
// Five days at a glance. A dot per day, today filled. It is the cheapest way to
// answer "am I playing this week" without opening a calendar.

function useYourWeek(userId: string) {
  return useQuery<{ counts: Record<string, number>; matchByDay: Record<string, string> }>({
    queryKey: ['home-your-week', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const from = todayStr()
      const to = format(addDays(new Date(), 4), 'yyyy-MM-dd', { locale: getDateLocale() })
      const { data } = await supabase
        .from('matches')
        .select('id, match_date, player_ids')
        .gte('match_date', from).lte('match_date', to)
        .not('status', 'in', '(cancelled)')
        .order('match_time', { ascending: true, nullsFirst: true })
      const counts: Record<string, number> = {}
      const matchByDay: Record<string, string> = {}
      for (const m of data ?? []) {
        if (!((m.player_ids as string[]) ?? []).includes(userId)) continue
        const day = m.match_date as string
        counts[day] = (counts[day] ?? 0) + 1
        if (!matchByDay[day]) matchByDay[day] = m.id as string
      }
      return { counts, matchByDay }
    },
  })
}

function YourWeekStrip({ counts, matchByDay }: {
  counts: Record<string, number>
  /** date -> match id, so a day with a game opens that game. */
  matchByDay: Record<string, string>
}) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const locale = useDateLocale()
  const today = new Date()

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">
          {t('home.your_week')}
        </h2>
        <button onClick={() => navigate('/play')} className="text-[13px] font-semibold text-court">
          {t('home.see_all')}
        </button>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: 5 }, (_, i) => {
          const d = addDays(today, i)
          const key = format(d, 'yyyy-MM-dd', { locale: getDateLocale() })
          const label = (() => {
            try { return format(d, 'EEE', { locale }) } catch { return '' }
          })()
          const has = (counts[key] ?? 0) > 0
          const isToday = i === 0
          const matchId = matchByDay[key]
          return (
            <button
              key={key}
              // A day you are playing opens that match. A day you are not
              // opens the week view, where you can add one.
              onClick={() => navigate(matchId ? `/matches/${matchId}` : '/play')}
              aria-label={label}
              className={cn(
                'flex min-h-[44px] flex-col items-center justify-center gap-1.5 rounded-card border py-2.5',
                isToday ? 'border-ink bg-ink' : 'border-hairline bg-card',
              )}
            >
              <span
                className={cn(
                  'text-[11px] font-semibold leading-[13px]',
                  isToday ? 'text-white' : 'text-ink-2',
                )}
              >
                {label}
              </span>
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-pill',
                  isToday ? (has ? 'bg-ball' : 'bg-white/25') : has ? 'bg-line' : 'bg-hairline',
                )}
              />
            </button>
          )
        })}
      </div>
    </section>
  )
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
  const countdown  = getShortCountdown(match.match_date, t)
  const matchStart = match.match_time
    ? new Date(`${match.match_date}T${match.match_time}`)
    : new Date(`${match.match_date}T00:00:00`)
  const now = new Date()
  const canRecord = now > matchStart
    && now < new Date(matchStart.getTime() + 24 * 60 * 60 * 1000)
    && match.status === 'scheduled'
    && match.player_ids.length === 4
    && !match.has_result

  const dateLine = (() => {
    try { return format(parseISO(match.match_date), 'EEE d MMM', { locale }) }
    catch { return match.match_date }
  })()
  const venueLine = [
    match.booked_venue_name,
    match.booked_court_number != null ? t('home.court_n', { n: match.booked_court_number }) : null,
  ].filter(Boolean).join(' · ')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3.5 rounded-panel bg-court p-[18px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <p className="num text-[24px] font-extrabold leading-[26px] tracking-[-0.01em] text-white">
            {dateLine}
            {match.match_time ? ` · ${match.match_time.slice(0, 5)}` : ''}
          </p>
          {venueLine && (
            <p className="truncate text-[13px] font-medium leading-[18px] text-court-100">{venueLine}</p>
          )}
        </div>
        {/* The one ball-yellow element on Today. */}
        <span className="flex-shrink-0 whitespace-nowrap rounded-pill bg-ball px-[9px] py-[5px] text-[11px] font-bold leading-[14px] text-ink">
          {countdown}
        </span>
      </div>

      {match.players.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex">
            {match.players.map((p, i) => (
              <span key={p.id} className={cn('rounded-pill ring-2 ring-court', i > 0 && '-ml-2')}>
                <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size="sm" />
              </span>
            ))}
          </div>
          <p className="truncate text-[13px] font-medium leading-[18px] text-court-100">
            {match.players.length >= 4
              ? t('home.match_full')
              : t('home.match_of_four', { count: match.players.length })}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => navigate(`/matches/${match.id}`)}
          className="min-h-[44px] flex-grow rounded-card bg-card py-[13px] text-center text-[15px] font-semibold leading-[18px] text-ink"
        >
          {t('home.match_details')}
        </button>
        {canRecord && (
          <button
            onClick={onRecordResult}
            aria-label={t('home.record_result')}
            className="flex min-h-[44px] w-12 items-center justify-center rounded-card bg-white/[0.14]"
          >
            <Trophy className="h-5 w-5 text-white" strokeWidth={2} />
          </button>
        )}
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
          <span className="h-6 w-6 rounded-full bg-court-50 flex items-center justify-center text-[12px] text-court font-bold shrink-0">✓</span>
          <p className="text-[13px] text-ink-2 line-through">You're all set up</p>
        </div>

        {/* Step 2: Group */}
        <div className="flex items-start gap-3">
          {groupDone ? (
            <>
              <span className="h-6 w-6 rounded-full bg-court-50 flex items-center justify-center text-[12px] text-court font-bold shrink-0">✓</span>
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
                        onClick={() => navigate('/people', { state: { openCreateGroup: true } })}
                        className="rounded-lg bg-court px-3 py-1.5 text-[12px] font-bold text-white"
                      >
                        Create a group
                      </button>
                      <button
                        onClick={() => navigate('/people')}
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
                      onClick={() => navigate('/people')}
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
              <span className="h-6 w-6 rounded-full bg-court-50 flex items-center justify-center text-[12px] text-court font-bold shrink-0">✓</span>
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
            onClick={() => navigate('/people', { state: { openCreateGroup: true } })}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-court py-2.5 text-[13px] font-bold text-white"
          >
            <Users className="h-3.5 w-3.5" />
            Create a group
          </button>
          <button
            onClick={() => navigate('/people')}
            className="rounded-xl border border-hairline py-2.5 text-[13px] font-semibold text-ink-2"
          >
            Browse groups
          </button>
        </div>
      )}
    </motion.div>
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
    else if (item.type.includes('group')) navigate(`/people/groups/${item.related_id}`)
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

  const { data: nextMatch, isLoading: loadingMatch } = useNextMatch(userId)
  const { data: needsYou = [] }   = useNeedsYou(userId, t)
  const { data: week }            = useYourWeek(userId)
  const { data: activity = [] }   = useRecentActivity(userId)
  const { data: setupProgress }   = useSetupProgress(userId)

  const setupComplete = setupProgress
    ? setupProgress.groupState === 'usable' && setupProgress.hasPollOrMatch
    : true // hide card while loading (avoids flash)

  const today = new Date()
  const weekday = (() => { try { return format(today, 'EEEE', { locale }) } catch { return '' } })()
  const dayLine = (() => {
    try { return format(today, 'd MMMM', { locale }) } catch { return '' }
  })()
  const place = (profile as { city?: string | null } | null)?.city ?? null

  return (
    <div className="min-h-full bg-surface pb-32">
      {/* ── Header ────────────────────────────────────────────────────────
          The day is the headline. A greeting tells the player nothing they
          did not already know; the weekday is what they are orienting by. */}
      <div className="flex flex-col gap-0.5 px-5 pb-4 pt-14">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[32px] font-extrabold leading-[34px] tracking-[-0.02em] text-ink">
            {weekday}
          </h1>
          <div className="flex flex-shrink-0 gap-2">
            <button
              onClick={() => navigate('/search')}
              aria-label={t('common.search')}
              className="flex h-11 w-11 items-center justify-center rounded-pill border border-hairline bg-card"
            >
              <Search className="h-5 w-5 text-ink-2" strokeWidth={2} />
            </button>
            <NotificationBell />
          </div>
        </div>
        <p className="text-[15px] font-medium leading-[22px] text-ink-3">
          {[dayLine, place].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="flex flex-col gap-6 px-5">

        {/* Onboarding, only while setup is incomplete. */}
        {!setupComplete && setupProgress && <GettingStartedCard progress={setupProgress} />}

        {/* ── Needs you ── */}
        <NeedsYouSection items={needsYou} />

        {/* ── Next match ── */}
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">
            {t('home.next_match')}
          </h2>
          {loadingMatch ? (
            <div className="h-44 animate-pulse rounded-panel bg-hairline/60" />
          ) : nextMatch ? (
            <NextMatchCard
              match={nextMatch}
              onRecordResult={() => navigate(`/matches/${nextMatch.id}`)}
            />
          ) : (
            <EmptyMatchCard
              onCreateMatch={() => setCreateMatchOpen(true)}
              hasUsableGroup={setupProgress?.groupState === 'usable'}
            />
          )}
        </section>

        {/* ── Your week ── */}
        <YourWeekStrip counts={week?.counts ?? {}} matchByDay={week?.matchByDay ?? {}} />

        {/* ── Recent activity ── */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">
              {t('home.recent_activity')}
            </h2>
            <button
              onClick={() => navigate('/notifications')}
              className="text-[13px] font-semibold text-court"
            >
              {t('home.see_all')}
            </button>
          </div>

          {activity.length === 0 ? (
            <div className="rounded-panel border border-dashed border-hairline p-5 text-center">
              <p className="text-[13px] font-semibold text-ink-2">{t('home.no_activity')}</p>
              <p className="mt-1 text-[13px] text-ink-3">{t('home.no_activity_sub')}</p>
            </div>
          ) : (
            <ActivityFeed items={activity} />
          )}
        </section>

        <div className="h-2" />
      </div>

<CreateMatchSheet
        open={createMatchOpen}
        onClose={() => setCreateMatchOpen(false)}
      />
    </div>
  )
}
