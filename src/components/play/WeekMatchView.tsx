import { useState, useMemo, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  format,
  addDays,
  isSameDay,
  startOfWeek as dateFnsStartOfWeek,
  parseISO,
  isValid,
} from 'date-fns'
import { useDateLocale } from '@/lib/dateLocale'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Plus, Calendar, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { sendNotification } from '@/lib/notifications'
import { useAuth } from '@/hooks/useAuth'
import { useUserMatchesSubscription } from '@/hooks/useRealtimeSubscription'
import { MatchCard, type MatchCardData } from '@/components/shared/MatchCard'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface UserGroup { id: string; name: string }
interface WeekMatchViewProps { onCreateMatch: () => void }

type ViewTab = 'mine' | 'group' | 'open'

type EnrichedMatch = MatchCardData & {
  group_id?: string | null
  group_name?: string | null
  created_manually?: boolean
  poll_id?: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Border colour class based on match relationship to user */
function getLeftBorder(match: EnrichedMatch, userId: string): string {
  const isPlayer = match.player_ids.includes(userId)
  if (isPlayer) return match.status === 'pending' ? 'border-l-amber-400' : 'border-l-[#009688]'
  if (match.player_ids.length >= 4) return 'border-l-gray-300'
  return 'border-l-orange-500'
}

// ── MatchCardEnhanced ────────────────────────────────────────────────────────

function MatchCardEnhanced({
  match, userId, index, viewTab, onJoinMatch, onOfferRinger,
}: {
  match: EnrichedMatch; userId: string; index: number; viewTab: ViewTab
  onJoinMatch: (matchId: string) => void
  onOfferRinger: (match: EnrichedMatch) => void
}) {
  const { t } = useTranslation()
  const isPlayer = match.player_ids.includes(userId)
  const openSlots = 4 - match.player_ids.length
  const showJoin = !isPlayer && openSlots > 0 && viewTab !== 'mine'

  return (
    <div className="relative">
      {/* Badges row */}
      <div className="flex items-center gap-1.5 mb-1">
        {match.group_name && (
          <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">
            {match.group_name}
          </span>
        )}
        {match.poll_id && (
          <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 rounded-full px-2 py-0.5">
            {t('play.auto_scheduled')}
          </span>
        )}
        {!isPlayer && viewTab === 'group' && match.player_ids.length >= 4 && (
          <span className="text-[10px] font-medium text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">
            {t('play.players_full')}
          </span>
        )}
        {!isPlayer && openSlots > 0 && openSlots <= 2 && (
          <span className="text-[10px] font-bold text-orange-700 bg-orange-50 rounded-full px-2 py-0.5 animate-pulse">
            {openSlots === 1 ? t('play.ringer_needed') : t('play.spots_open', { count: openSlots })}
          </span>
        )}
      </div>

      {/* Card with coloured left border */}
      <div className={cn('rounded-2xl border-l-4 overflow-hidden', getLeftBorder(match, userId))}>
        <MatchCard
          match={match}
          currentUserId={userId}
          action={isPlayer ? 'view' : showJoin ? 'join' : 'view'}
          onJoin={showJoin ? () => onJoinMatch(match.id) : undefined}
          index={index}
        />
      </div>

      {/* Ringer offer button for group/open view when not already a player */}
      {!isPlayer && openSlots > 0 && viewTab !== 'mine' && (
        <button
          onClick={() => onOfferRinger(match)}
          className="mt-1.5 flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-1.5 text-[11px] font-semibold text-orange-700 active:scale-[0.97] transition-transform"
        >
          <UserPlus className="h-3 w-3" />
          {t('play.i_can_ringer')}
        </button>
      )}
    </div>
  )
}

// ── RingerOfferSheet ─────────────────────────────────────────────────────────

function RingerOfferSheet({ match, userId, onClose }: {
  match: EnrichedMatch | null; userId: string; onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const locale = useDateLocale()

  const offerMutation = useMutation({
    mutationFn: async () => {
      if (!match) return
      // Get match creator (first player or created_by)
      const creatorId = match.player_ids[0]
      if (!creatorId) return

      // Fetch user name
      const { data: profile } = await supabase
        .from('profiles').select('name').eq('id', userId).single()
      const name = profile?.name ?? 'A player'

      sendNotification({
        user_id: creatorId,
        type: 'ringer_offer',
        title: t('play.ringer_available_title'),
        message: `${name} is available to ringer for your match on ${format(parseISO(match.match_date), 'EEE d MMM', { locale })} at ${match.match_time?.slice(0, 5) ?? 'TBC'}`,
        related_id: match.id,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      onClose()
    },
  })

  if (!match) return null

  return (
    <>
      <motion.div
        className="fixed inset-0 z-50 bg-black/40"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[55] bg-white rounded-t-3xl px-5 pt-6"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}
      >
        <p className="text-[16px] font-bold text-gray-900 text-center mb-1">{t('play.offer_to_ringer')}</p>
        <p className="text-[13px] text-gray-500 text-center mb-4">
          {t('play.ringer_offer_sub')}
        </p>

        <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 mb-4 space-y-2">
          <p className="text-[13px] font-semibold text-gray-800">
            {format(parseISO(match.match_date), 'EEEE d MMM', { locale })}
            {match.match_time && ` · ${match.match_time.slice(0, 5)}`}
          </p>
          {match.booked_venue_name && (
            <p className="text-[12px] text-gray-500">{match.booked_venue_name}</p>
          )}
          <div className="flex -space-x-1.5 mt-1">
            {match.players?.slice(0, 4).map((p) => (
              <PlayerAvatar key={p.id} name={p.name} avatarUrl={p.avatar_url} size="sm" />
            ))}
          </div>
          <p className="text-[11px] text-gray-400">
            {(4 - match.player_ids.length) === 1
              ? t('play.players_spots', { current: match.player_ids.length, spots: 1 })
              : t('play.players_spots_plural', { current: match.player_ids.length, spots: 4 - match.player_ids.length })}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border border-gray-200 py-3 text-[14px] font-semibold text-gray-700"
          >
            {t('play.cancel')}
          </button>
          <button
            onClick={() => offerMutation.mutate()}
            disabled={offerMutation.isPending}
            className="flex-1 rounded-2xl bg-[#009688] py-3 text-[14px] font-bold text-white disabled:opacity-50"
          >
            {offerMutation.isPending ? t('play.sending') : t('play.confirm')}
          </button>
        </div>
        {offerMutation.isSuccess && (
          <p className="text-[12px] text-green-600 text-center mt-2 font-semibold">{t('play.offer_sent')}</p>
        )}
      </motion.div>
    </>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function WeekMatchView({ onCreateMatch }: WeekMatchViewProps) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const userId = profile?.id ?? ''

  const locale = useDateLocale()

  // Realtime: auto-refresh when matches change
  useUserMatchesSubscription(userId)

  // ── State ──────────────────────────────────────────────────────────────────
  const [viewTab, setViewTab] = useState<ViewTab>('mine')
  const [searchParams, setSearchParams] = useSearchParams()
  const weekStart = useMemo(() => {
    const weekParam = searchParams.get('week')
    if (weekParam) {
      const parsed = parseISO(weekParam)
      if (isValid(parsed)) return dateFnsStartOfWeek(parsed, { weekStartsOn: 1 })
    }
    return dateFnsStartOfWeek(new Date(), { weekStartsOn: 1 })
  }, [searchParams])
  const setWeekStart = useCallback((newWeek: Date | ((prev: Date) => Date)) => {
    const actual = typeof newWeek === 'function' ? newWeek(weekStart) : newWeek
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('week', format(actual, 'yyyy-MM-dd', { locale }))
      return next
    }, { replace: true })
  }, [weekStart, setSearchParams])
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [selectedFilter, setSelectedFilter] = useState<string>('all')
  const [direction, setDirection] = useState<'next' | 'prev'>('next')
  const [ringerOfferMatch, setRingerOfferMatch] = useState<EnrichedMatch | null>(null)
  const [needsRingersOnly, setNeedsRingersOnly] = useState(false)

  // ── Derived ────────────────────────────────────────────────────────────────
  const weekEnd = addDays(weekStart, 6)
  const fetchStart = format(weekStart, 'yyyy-MM-dd', { locale })
  const fetchEnd = format(addDays(weekStart, 13), 'yyyy-MM-dd', { locale })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today = new Date()
  const isCurrentWeek = isSameDay(weekStart, dateFnsStartOfWeek(today, { weekStartsOn: 1 }))

  // ── User groups ────────────────────────────────────────────────────────────
  const { data: userGroups = [] } = useQuery<UserGroup[]>({
    queryKey: ['user-groups-for-filter', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from('group_members').select('group_id')
        .eq('user_id', userId).eq('status', 'approved')
      if (!memberships || memberships.length === 0) return []
      const ids = memberships.map((m) => m.group_id)
      const { data: groups } = await supabase.from('groups').select('id, name').in('id', ids)
      return groups ?? []
    },
  })
  const userGroupIds = useMemo(() => userGroups.map((g) => g.id), [userGroups])

  // ── My Matches ─────────────────────────────────────────────────────────────
  const { data: myMatches = [], isLoading: loadingMine } = useQuery<EnrichedMatch[]>({
    queryKey: ['week-my-matches', fetchStart, userId],
    enabled: !!userId,
    queryFn: async () => fetchMatches(`.contains('player_ids', [${userId}])`, fetchStart, fetchEnd, userId),
  })

  // ── Group Matches ──────────────────────────────────────────────────────────
  const { data: groupMatches = [], isLoading: loadingGroup } = useQuery<EnrichedMatch[]>({
    queryKey: ['week-group-matches', fetchStart, userId, userGroupIds],
    enabled: !!userId && userGroupIds.length > 0 && viewTab === 'group',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('id, match_date, match_time, match_type, status, player_ids, group_id, booked_venue_name, created_manually, poll_id')
        .in('group_id', userGroupIds)
        .gte('match_date', fetchStart).lte('match_date', fetchEnd)
        .not('status', 'in', '(cancelled)')
        .order('match_date', { ascending: true })
        .order('match_time', { ascending: true })
      if (error) throw error
      return enrichMatches(data ?? [], userId)
    },
  })

  // ── Open Matches ───────────────────────────────────────────────────────────
  const userElo = (profile as any)?.internal_ranking ?? null
  const { data: openMatches = [], isLoading: loadingOpen } = useQuery<EnrichedMatch[]>({
    queryKey: ['week-open-matches', fetchStart, userId, userElo],
    enabled: !!userId && viewTab === 'open',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('id, match_date, match_time, match_type, status, player_ids, group_id, booked_venue_name, created_manually, poll_id, is_open, open_elo_min, open_elo_max')
        .eq('is_open', true)
        .gte('match_date', format(today, 'yyyy-MM-dd', { locale }))
        .not('status', 'in', '(cancelled)')
        .order('match_date', { ascending: true })
        .order('match_time', { ascending: true })
        .limit(30)
      if (error) throw error
      // Exclude matches user is already in, then ELO-filter client-side
      const filtered = (data ?? [])
        .filter(m => !(m.player_ids as string[])?.includes(userId))
        .filter(m => {
          if (userElo == null) return true
          if ((m as any).open_elo_min != null && userElo < (m as any).open_elo_min) return false
          if ((m as any).open_elo_max != null && userElo > (m as any).open_elo_max) return false
          return true
        })
      return enrichMatches(filtered, userId)
    },
  })

  // ── Shared enrichment function ─────────────────────────────────────────────
  async function enrichMatches(data: any[], _uid?: string): Promise<EnrichedMatch[]> {
    if (data.length === 0) return []
    const allIds = [...new Set(data.flatMap((m) => (m.player_ids as string[]) ?? []))]
    const { data: profiles } = allIds.length > 0
      ? await supabase.from('profiles').select('id, name, avatar_url').in('id', allIds)
      : { data: [] }
    const groupIds = [...new Set(data.map((m) => m.group_id).filter(Boolean))]
    const { data: groups } = groupIds.length > 0
      ? await supabase.from('groups').select('id, name').in('id', groupIds)
      : { data: [] }
    const groupMap = Object.fromEntries((groups ?? []).map((g) => [g.id, g]))
    return data.map((m) => ({
      id: m.id, match_date: m.match_date, match_time: m.match_time,
      match_type: m.match_type, status: m.status,
      player_ids: (m.player_ids as string[]) ?? [],
      booked_venue_name: m.booked_venue_name,
      players: (profiles ?? []).filter((p) => ((m.player_ids as string[]) ?? []).includes(p.id)),
      group_id: m.group_id, group_name: m.group_id ? groupMap[m.group_id]?.name : null,
      created_manually: m.created_manually, poll_id: m.poll_id,
    }))
  }

  // ── Fetch my matches directly (without the shared function since query differs) ──
  async function fetchMatches(_filter: string, start: string, end: string, uid: string): Promise<EnrichedMatch[]> {
    const { data, error } = await supabase
      .from('matches')
      .select('id, match_date, match_time, match_type, status, player_ids, group_id, booked_venue_name, created_manually, poll_id')
      .contains('player_ids', [uid])
      .gte('match_date', start).lte('match_date', end)
      .not('status', 'in', '(cancelled)')
      .order('match_date', { ascending: true })
      .order('match_time', { ascending: true })
    if (error) throw error
    return enrichMatches(data ?? [], uid)
  }

  // ── Join match mutation ────────────────────────────────────────────────────
  const joinMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const { data, error } = await supabase.rpc('claim_open_match', {
        p_match_id: matchId,
      })
      if (error) throw error
      if (!(data as any)?.success) throw new Error('Claim failed')
    },
    onSuccess: (_: any, matchId: string) => {
      queryClient.invalidateQueries({ queryKey: ['week-my-matches'] })
      queryClient.invalidateQueries({ queryKey: ['week-group-matches'] })
      queryClient.invalidateQueries({ queryKey: ['week-open-matches'] })
      queryClient.invalidateQueries({ queryKey: ['join-open-matches'] })
      queryClient.invalidateQueries({ queryKey: ['play-upcoming'] })
      queryClient.invalidateQueries({ queryKey: ['home-next-match'] })
      navigate(`/matches/${matchId}`)
      toast.success('Joined the match')
    },
    onError: (err: any) => {
      console.error('Join match failed:', err)
      toast.error(err?.message ?? 'Failed to join match. Try again.')
    },
  })

  // ── Results to confirm (completed matches pending verification) ─────────
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  }, [])

  interface PendingResultMatch {
    id: string
    match_date: string
    match_time: string | null
    booked_venue_name: string | null
    verification_status: string
    submitted_by: string | null
    team1_players: string[]
    team2_players: string[]
    created_at: string | null
    /** true when the current user is on the opposing team and hasn't voted */
    canConfirm: boolean
    /** Names of opposing-team players who haven't voted yet */
    waitingOnNames: string[]
  }

  const { data: pendingResultMatches = [] } = useQuery<PendingResultMatch[]>({
    queryKey: ['results-to-confirm', userId],
    enabled: !!userId,
    queryFn: async () => {
      // Step 1: completed matches the user is in, last 30 days
      const { data: matches } = await supabase
        .from('matches')
        .select('id, match_date, match_time, booked_venue_name')
        .contains('player_ids', [userId])
        .eq('status', 'completed')
        .gte('match_date', thirtyDaysAgo)
        .order('match_date', { ascending: false })
        .limit(20)
      if (!matches || matches.length === 0) return []

      // Step 2: fetch result details for those match ids
      const matchIds = matches.map((m) => m.id)
      const { data: results } = await supabase
        .from('match_results')
        .select('id, match_id, verification_status, submitted_by, team1_players, team2_players, created_at')
        .in('match_id', matchIds)
      if (!results || results.length === 0) return []

      const resultByMatch = Object.fromEntries(results.map((r) => [r.match_id, r]))

      // Step 3: fetch votes for pending/disputed results so we know who hasn't confirmed
      const pendingResultIds = results
        .filter((r) => r.verification_status !== 'verified')
        .map((r) => r.id)
      const { data: votes } = pendingResultIds.length > 0
        ? await supabase
            .from('match_result_votes')
            .select('match_result_id, voter_id')
            .in('match_result_id', pendingResultIds)
        : { data: [] as { match_result_id: string; voter_id: string }[] }
      const votesByResult = new Map<string, Set<string>>()
      for (const v of votes ?? []) {
        if (!votesByResult.has(v.match_result_id)) votesByResult.set(v.match_result_id, new Set())
        votesByResult.get(v.match_result_id)!.add(v.voter_id)
      }

      // Step 4: collect all player IDs we need names for
      const allPlayerIds = new Set<string>()
      for (const r of results) {
        for (const pid of [...(r.team1_players ?? []), ...(r.team2_players ?? [])]) allPlayerIds.add(pid)
      }
      const { data: profiles } = allPlayerIds.size > 0
        ? await supabase.from('profiles').select('id, name').in('id', [...allPlayerIds])
        : { data: [] as { id: string; name: string }[] }
      const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.name]))

      // Only include matches where result is pending or disputed (not verified)
      return matches
        .filter((m) => {
          const r = resultByMatch[m.id]
          return r && r.verification_status !== 'verified'
        })
        .map((m): PendingResultMatch => {
          const r = resultByMatch[m.id]
          const t1 = (r.team1_players ?? []) as string[]
          const t2 = (r.team2_players ?? []) as string[]
          const submittedBy = r.submitted_by as string | null
          const submittingTeam = t1.includes(submittedBy ?? '') ? t1 : t2
          const opposingTeam = submittingTeam === t1 ? t2 : t1
          const isOnOpposingTeam = opposingTeam.includes(userId)
          const voterIds = votesByResult.get(r.id) ?? new Set<string>()
          const hasVoted = voterIds.has(userId)

          // Compute who on the opposing team hasn't voted yet
          const waitingOnIds = opposingTeam.filter((pid) => !voterIds.has(pid))
          const waitingOnNames = waitingOnIds.map((pid) => nameMap[pid]?.split(' ')[0] ?? '?')

          return {
            id: m.id,
            match_date: m.match_date,
            match_time: m.match_time,
            booked_venue_name: m.booked_venue_name,
            verification_status: r.verification_status as string,
            submitted_by: submittedBy,
            team1_players: t1,
            team2_players: t2,
            created_at: r.created_at as string | null,
            canConfirm: isOnOpposingTeam && !hasVoted,
            waitingOnNames,
          }
        })
    },
    staleTime: 30_000,
  })

  // Split pending results into actionable vs waiting
  const pendingCanConfirm = pendingResultMatches.filter((m) => m.canConfirm)
  const pendingWaitingOn = pendingResultMatches.filter((m) => !m.canConfirm)

  // ── Select active data ─────────────────────────────────────────────────────
  const activeMatches = viewTab === 'mine' ? myMatches : viewTab === 'group' ? groupMatches : openMatches
  const isLoading = viewTab === 'mine' ? loadingMine : viewTab === 'group' ? loadingGroup : loadingOpen

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filteredMatches = useMemo(() => {
    return activeMatches.filter((m) => {
      // Hide completed and cancelled matches from the display
      if (m.status === 'completed' || m.status === 'cancelled') return false
      const matchDate = parseISO(m.match_date)
      if (selectedDay) {
        if (!isSameDay(matchDate, selectedDay)) return false
      } else {
        if (viewTab !== 'open' && (matchDate < weekStart || matchDate > weekEnd)) return false
      }
      if (needsRingersOnly && (m.player_ids?.length ?? 0) >= 4) return false
      if (selectedFilter === 'all') return true
      if (selectedFilter === 'groups') return !!m.group_id
      if (selectedFilter === 'manual') return m.created_manually && !m.group_id
      return m.group_id === selectedFilter
    })
  }, [activeMatches, selectedDay, weekStart, weekEnd, selectedFilter, viewTab, needsRingersOnly])

  // ── Future-week match count (matches beyond this week's display window) ────
  const futureWeekCount = useMemo(() => {
    if (viewTab === 'open') return 0
    return activeMatches.filter((m) => {
      if (m.status === 'completed' || m.status === 'cancelled') return false
      const matchDate = parseISO(m.match_date)
      return matchDate > weekEnd
    }).length
  }, [activeMatches, weekEnd, viewTab])

  // ── Week summary ───────────────────────────────────────────────────────────
  const weekMatches = activeMatches.filter((m) => {
    if (m.status === 'completed' || m.status === 'cancelled') return false
    const d = parseISO(m.match_date)
    return d >= weekStart && d <= weekEnd
  })
  const uniquePlayers = new Set(weekMatches.flatMap((m) => m.player_ids))

  // ── Day dots: colour based on view tab ─────────────────────────────────────
  function getDayDots(day: Date): Array<'teal' | 'gray' | 'orange'> {
    const dots: Array<'teal' | 'gray' | 'orange'> = []
    const dayMatches = activeMatches.filter((m) => isSameDay(parseISO(m.match_date), day))
    for (const m of dayMatches) {
      const isPlayer = m.player_ids.includes(userId)
      if (isPlayer && !dots.includes('teal')) dots.push('teal')
      else if (!isPlayer && m.player_ids.length < 4 && !dots.includes('orange')) dots.push('orange')
      else if (!isPlayer && !dots.includes('gray')) dots.push('gray')
      if (dots.length >= 3) break
    }
    return dots
  }

  // ── Filter chips (contextual) ──────────────────────────────────────────────
  const filterChips = viewTab === 'mine'
    ? [
        { id: 'all', label: t('play.chip_all') },
        { id: 'groups', label: t('play.chip_my_groups') },
        ...userGroups.map((g) => ({ id: g.id, label: g.name })),
        { id: 'manual', label: t('play.chip_manual') },
      ]
    : viewTab === 'group'
    ? [
        { id: 'all', label: t('play.chip_all_groups') },
        ...userGroups.map((g) => ({ id: g.id, label: g.name })),
      ]
    : [
        { id: 'all', label: t('play.chip_all') },
      ]

  // ── Navigation ─────────────────────────────────────────────────────────────
  function goNextWeek() { setDirection('next'); setWeekStart((p) => addDays(p, 7)); setSelectedDay(null) }
  function goPrevWeek() { setDirection('prev'); setWeekStart((p) => addDays(p, -7)); setSelectedDay(null) }
  function goToday() {
    const thisWeek = dateFnsStartOfWeek(today, { weekStartsOn: 1 })
    setDirection(weekStart > thisWeek ? 'prev' : 'next')
    setWeekStart(thisWeek); setSelectedDay(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Results to confirm (you can act) ── */}
      {pendingCanConfirm.length > 0 && (
        <div className="px-5 pt-3 pb-2">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-[12px] font-bold text-amber-800 mb-2">
              {t('play.results_to_confirm', { defaultValue: 'Results to confirm' })}
            </p>
            <div className="space-y-1.5">
              {pendingCanConfirm.map((m) => {
                const autoVerifyTime = m.created_at ? new Date(m.created_at).getTime() + 24 * 60 * 60 * 1000 : 0
                const msUntil = autoVerifyTime - Date.now()
                const hoursLeft = msUntil > 0 ? Math.ceil(msUntil / (60 * 60 * 1000)) : 0
                return (
                  <button
                    key={m.id}
                    onClick={() => navigate(`/matches/${m.id}`)}
                    className="w-full flex items-center justify-between rounded-xl bg-white border border-amber-100 px-3 py-2 text-left hover:border-amber-300 transition-colors"
                  >
                    <div>
                      <p className="text-[12px] font-semibold text-gray-800">
                        {(() => { try { return format(parseISO(m.match_date), 'EEE d MMM', { locale }) } catch { return m.match_date } })()}
                        {m.match_time && ` · ${m.match_time.slice(0, 5)}`}
                      </p>
                      {m.booked_venue_name && (
                        <p className="text-[10px] text-gray-500 truncate">{m.booked_venue_name}</p>
                      )}
                      {hoursLeft > 0 && (
                        <p className="text-[10px] text-gray-400">Auto-confirms in {hoursLeft}h</p>
                      )}
                    </div>
                    <span className={cn(
                      'text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 flex-shrink-0',
                      m.verification_status === 'disputed'
                        ? 'bg-red-50 text-red-600 border border-red-100'
                        : 'bg-amber-100 text-amber-700 border border-amber-200'
                    )}>
                      {m.verification_status === 'disputed' ? 'Disputed' : 'Confirm'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Results waiting on others ── */}
      {pendingWaitingOn.length > 0 && (
        <div className="px-5 pt-3 pb-2">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-[12px] font-bold text-gray-500 mb-2">Awaiting the other team</p>
            <div className="space-y-1.5">
              {pendingWaitingOn.map((m) => {
                const autoVerifyTime = m.created_at ? new Date(m.created_at).getTime() + 24 * 60 * 60 * 1000 : 0
                const msUntil = autoVerifyTime - Date.now()
                const hoursLeft = msUntil > 0 ? Math.ceil(msUntil / (60 * 60 * 1000)) : 0
                return (
                  <button
                    key={m.id}
                    onClick={() => navigate(`/matches/${m.id}`)}
                    className="w-full flex items-center justify-between rounded-xl bg-white border border-gray-100 px-3 py-2 text-left hover:border-gray-300 transition-colors"
                  >
                    <div>
                      <p className="text-[12px] font-semibold text-gray-800">
                        {(() => { try { return format(parseISO(m.match_date), 'EEE d MMM', { locale }) } catch { return m.match_date } })()}
                        {m.match_time && ` · ${m.match_time.slice(0, 5)}`}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        Waiting on {m.waitingOnNames.length > 0 ? m.waitingOnNames.join(' & ') : 'opponent'} to confirm
                      </p>
                      {hoursLeft > 0 && (
                        <p className="text-[10px] text-gray-400">Auto-confirms in {hoursLeft}h</p>
                      )}
                    </div>
                    <span className={cn(
                      'text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 flex-shrink-0',
                      m.verification_status === 'disputed'
                        ? 'bg-red-50 text-red-600 border border-red-100'
                        : 'bg-gray-100 text-gray-500 border border-gray-200'
                    )}>
                      {m.verification_status === 'disputed' ? 'Disputed' : 'Pending'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── View toggle ── */}
      <div className="px-5 pt-3 pb-1">
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {([
            { id: 'mine' as ViewTab, label: t('play.tab_my_matches') },
            { id: 'group' as ViewTab, label: t('play.tab_group') },
            { id: 'open' as ViewTab, label: t('play.tab_open') },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setViewTab(tab.id); setSelectedFilter('all') }}
              className={cn(
                'flex-1 rounded-lg py-2 text-[12px] font-semibold transition-colors',
                viewTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sticky week nav ── */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-gray-50 px-5 pt-2 pb-2">
        <div className="flex items-center justify-between mb-2">
          <button onClick={goPrevWeek} className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <div className="text-center">
            <p className="text-[14px] font-bold text-gray-900">
              {selectedDay
                ? format(selectedDay, 'EEEE d MMM', { locale })
                : `${format(weekStart, 'd MMM', { locale })} — ${format(weekEnd, 'd MMM', { locale })}`}
            </p>
            {selectedDay ? (
              <button onClick={() => setSelectedDay(null)} className="text-[11px] font-semibold text-[#009688] mt-0.5">{t('play.show_full_week')}</button>
            ) : !isCurrentWeek ? (
              <button onClick={goToday} className="text-[11px] font-semibold text-[#009688] mt-0.5">{t('play.today')}</button>
            ) : null}
          </div>
          <button onClick={goNextWeek} className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
        </div>

        {/* Day pills with multi-colour dots */}
        <div className="flex gap-1.5 justify-between">
          {weekDays.map((day) => {
            const dots = getDayDots(day)
            const isSelected = selectedDay && isSameDay(day, selectedDay)
            const isDayToday = isSameDay(day, today)
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={cn(
                  'flex-1 flex flex-col items-center py-2 rounded-xl transition-all min-w-0',
                  isSelected ? 'bg-[#009688] text-white' : 'bg-white text-gray-700',
                  isDayToday && !isSelected && 'ring-2 ring-[#009688]',
                )}
              >
                <span className={cn('text-[10px] font-medium', isSelected ? 'text-white/80' : 'text-gray-400')}>
                  {format(day, 'EEE', { locale })}
                </span>
                <span className={cn('text-[16px] font-bold leading-tight', isDayToday && !isSelected && 'text-[#009688]')}>
                  {format(day, 'd', { locale })}
                </span>
                {dots.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {dots.map((color, i) => (
                      <div key={i} className={cn('h-1 w-1 rounded-full', {
                        'bg-white': isSelected,
                        'bg-[#009688]': !isSelected && color === 'teal',
                        'bg-gray-300': !isSelected && color === 'gray',
                        'bg-orange-400': !isSelected && color === 'orange',
                      })} />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="px-5 pt-2 pb-1 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 min-w-max">
          <button
            onClick={() => setNeedsRingersOnly(v => !v)}
            className={cn(
              'flex-shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors',
              needsRingersOnly
                ? 'bg-orange-500 border-orange-500 text-white'
                : 'border-gray-200 text-gray-600 bg-white',
            )}
          >
            {t('play.needs_ringers')}
          </button>
          {filterChips.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedFilter(f.id)}
              className={cn(
                'flex-shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors',
                selectedFilter === f.id
                  ? 'bg-[#009688] border-[#009688] text-white'
                  : 'border-gray-200 text-gray-600 bg-white',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Week summary ── */}
      {!selectedDay && weekMatches.length > 0 && (
        <div className="mx-5 mt-2 mb-1 flex items-center gap-3 text-[12px] text-gray-500">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          <span className="font-semibold">{weekMatches.length === 1 ? t('play.week_matches', { count: 1 }) : t('play.week_matches_plural', { count: weekMatches.length })}</span>
          <span>·</span>
          <span>{t('play.players_active', { count: uniquePlayers.size })}</span>
        </div>
      )}

      {/* ── Match list ── */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${viewTab}-${weekStart.toISOString()}-${selectedDay?.toISOString() ?? 'week'}-${selectedFilter}`}
          initial={{ x: direction === 'next' ? 60 : -60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: direction === 'next' ? -60 : 60, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="px-5 pt-2 pb-32"
        >
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : filteredMatches.length === 0 ? (
            <div className="rounded-2xl bg-gray-50 border border-dashed border-gray-200 px-6 py-10 text-center">
              <p className="text-[14px] font-semibold text-gray-500 mb-1">
                {viewTab === 'mine' && (selectedDay ? t('play.no_matches_on_date', { date: format(selectedDay, 'EEEE d MMM', { locale }) }) : t('play.no_matches_this_week'))}
                {viewTab === 'group' && t('play.no_group_matches_this_week')}
                {viewTab === 'open' && t('play.no_open_matches_available')}
              </p>
              <p className="text-[12px] text-gray-400 mb-4">
                {viewTab === 'mine' ? t('play.empty_mine_subtitle') : t('play.empty_group_subtitle')}
              </p>
              <button
                onClick={onCreateMatch}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#009688] px-4 py-2.5 text-[13px] font-bold text-white"
              >
                <Plus className="h-4 w-4" />
                {t('play.create_match')}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {!selectedDay
                ? weekDays.map((day) => {
                    const dayMatches = filteredMatches.filter((m) => isSameDay(parseISO(m.match_date), day))
                    if (dayMatches.length === 0) return null
                    return (
                      <div key={day.toISOString()}>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5 mt-3 first:mt-0">
                          {format(day, 'EEEE d MMM', { locale })}
                          {isSameDay(day, today) && <span className="text-[#009688] ml-1">{t('play.today_dot')}</span>}
                        </p>
                        <div className="space-y-2">
                          {dayMatches.map((match, i) => (
                            <MatchCardEnhanced
                              key={match.id} match={match} userId={userId}
                              index={i} viewTab={viewTab}
                              onJoinMatch={(id) => joinMutation.mutate(id)}
                              onOfferRinger={setRingerOfferMatch}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })
                : filteredMatches.map((match, i) => (
                    <MatchCardEnhanced
                      key={match.id} match={match} userId={userId}
                      index={i} viewTab={viewTab}
                      onJoinMatch={(id) => joinMutation.mutate(id)}
                      onOfferRinger={setRingerOfferMatch}
                    />
                  ))}
            </div>
          )}

          {/* ── Future-week indicator ── */}
          {!selectedDay && futureWeekCount > 0 && (
            <button
              onClick={goNextWeek}
              className="mt-4 w-full rounded-2xl border border-dashed border-teal-200 bg-teal-50/50 px-4 py-3 text-center transition-colors active:bg-teal-100"
            >
              <span className="text-[13px] font-semibold text-[#009688]">
                {futureWeekCount === 1
                  ? t('play.next_week_indicator_singular')
                  : t('play.next_week_indicator_plural', { count: futureWeekCount })}
              </span>
            </button>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Ringer offer sheet ── */}
      <AnimatePresence>
        {ringerOfferMatch && (
          <RingerOfferSheet
            match={ringerOfferMatch}
            userId={userId}
            onClose={() => setRingerOfferMatch(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
