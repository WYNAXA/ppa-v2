import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  format,
  addDays,
  isSameDay,
  startOfWeek as dateFnsStartOfWeek,
  parseISO,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Calendar, UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
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
            Auto-scheduled
          </span>
        )}
        {!isPlayer && viewTab === 'group' && match.player_ids.length >= 4 && (
          <span className="text-[10px] font-medium text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">
            4/4 players
          </span>
        )}
        {!isPlayer && openSlots > 0 && openSlots <= 2 && (
          <span className="text-[10px] font-bold text-orange-700 bg-orange-50 rounded-full px-2 py-0.5 animate-pulse">
            {openSlots === 1 ? 'Ringer needed' : `${openSlots} spots open`}
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
          I can ringer
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

      await supabase.from('notifications').insert({
        user_id: creatorId,
        type: 'ringer_offer',
        title: 'Ringer available',
        message: `${name} is available to ringer for your match on ${format(parseISO(match.match_date), 'EEE d MMM')} at ${match.match_time?.slice(0, 5) ?? 'TBC'}`,
        related_id: match.id,
        read: false,
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
        <p className="text-[16px] font-bold text-gray-900 text-center mb-1">Offer to ringer?</p>
        <p className="text-[13px] text-gray-500 text-center mb-4">
          The match creator will be notified. They can add you if they accept.
        </p>

        <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 mb-4 space-y-2">
          <p className="text-[13px] font-semibold text-gray-800">
            {format(parseISO(match.match_date), 'EEEE d MMM')}
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
            {match.player_ids.length}/4 players · {4 - match.player_ids.length} spot{4 - match.player_ids.length !== 1 ? 's' : ''} open
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border border-gray-200 py-3 text-[14px] font-semibold text-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={() => offerMutation.mutate()}
            disabled={offerMutation.isPending}
            className="flex-1 rounded-2xl bg-[#009688] py-3 text-[14px] font-bold text-white disabled:opacity-50"
          >
            {offerMutation.isPending ? 'Sending…' : 'Confirm'}
          </button>
        </div>
        {offerMutation.isSuccess && (
          <p className="text-[12px] text-green-600 text-center mt-2 font-semibold">Offer sent!</p>
        )}
      </motion.div>
    </>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function WeekMatchView({ onCreateMatch }: WeekMatchViewProps) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const userId = profile?.id ?? ''

  // ── State ──────────────────────────────────────────────────────────────────
  const [viewTab, setViewTab] = useState<ViewTab>('mine')
  const [weekStart, setWeekStart] = useState(() =>
    dateFnsStartOfWeek(new Date(), { weekStartsOn: 1 }),
  )
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [selectedFilter, setSelectedFilter] = useState<string>('all')
  const [direction, setDirection] = useState<'next' | 'prev'>('next')
  const [ringerOfferMatch, setRingerOfferMatch] = useState<EnrichedMatch | null>(null)

  // ── Derived ────────────────────────────────────────────────────────────────
  const weekEnd = addDays(weekStart, 6)
  const fetchStart = format(weekStart, 'yyyy-MM-dd')
  const fetchEnd = format(addDays(weekStart, 13), 'yyyy-MM-dd')
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
  const { data: openMatches = [], isLoading: loadingOpen } = useQuery<EnrichedMatch[]>({
    queryKey: ['week-open-matches', fetchStart, userId, userGroupIds],
    enabled: !!userId && viewTab === 'open',
    queryFn: async () => {
      let query = supabase
        .from('matches')
        .select('id, match_date, match_time, match_type, status, player_ids, group_id, booked_venue_name, created_manually, poll_id')
        .in('status', ['open', 'pending'])
        .gte('match_date', format(today, 'yyyy-MM-dd'))
        .not('status', 'in', '(cancelled)')
        .order('match_date', { ascending: true })
        .order('match_time', { ascending: true })
        .limit(30)
      if (userGroupIds.length > 0) {
        query = query.in('group_id', userGroupIds)
      }
      const { data, error } = await query
      if (error) throw error
      // Exclude matches user is already in
      const filtered = (data ?? []).filter(m => !(m.player_ids as string[])?.includes(userId))
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
      const { data: match } = await supabase
        .from('matches').select('player_ids').eq('id', matchId).single()
      if (!match) throw new Error('Match not found')
      const ids = (match.player_ids as string[]) ?? []
      if (ids.length >= 4) throw new Error('Match is full')
      if (ids.includes(userId)) throw new Error('Already in match')
      await supabase.from('matches').update({
        player_ids: [...ids, userId],
        ...(ids.length + 1 >= 4 ? { status: 'scheduled' } : {}),
      }).eq('id', matchId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['week-my-matches'] })
      queryClient.invalidateQueries({ queryKey: ['week-group-matches'] })
      queryClient.invalidateQueries({ queryKey: ['week-open-matches'] })
    },
  })

  // ── Select active data ─────────────────────────────────────────────────────
  const activeMatches = viewTab === 'mine' ? myMatches : viewTab === 'group' ? groupMatches : openMatches
  const isLoading = viewTab === 'mine' ? loadingMine : viewTab === 'group' ? loadingGroup : loadingOpen

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filteredMatches = useMemo(() => {
    return activeMatches.filter((m) => {
      const matchDate = parseISO(m.match_date)
      if (selectedDay) {
        if (!isSameDay(matchDate, selectedDay)) return false
      } else {
        if (viewTab !== 'open' && (matchDate < weekStart || matchDate > weekEnd)) return false
      }
      if (selectedFilter === 'all') return true
      if (selectedFilter === 'groups') return !!m.group_id
      if (selectedFilter === 'manual') return m.created_manually && !m.group_id
      return m.group_id === selectedFilter
    })
  }, [activeMatches, selectedDay, weekStart, weekEnd, selectedFilter, viewTab])

  // ── Week summary ───────────────────────────────────────────────────────────
  const weekMatches = activeMatches.filter((m) => {
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
        { id: 'all', label: 'All' },
        { id: 'groups', label: 'My Groups' },
        ...userGroups.map((g) => ({ id: g.id, label: g.name })),
        { id: 'manual', label: 'Manual' },
      ]
    : [
        { id: 'all', label: 'All Groups' },
        ...userGroups.map((g) => ({ id: g.id, label: g.name })),
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
      {/* ── View toggle ── */}
      <div className="px-5 pt-3 pb-1">
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {([
            { id: 'mine' as ViewTab, label: 'My Matches' },
            { id: 'group' as ViewTab, label: 'Group' },
            { id: 'open' as ViewTab, label: 'Open' },
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
                ? format(selectedDay, 'EEEE d MMM')
                : `${format(weekStart, 'd MMM')} — ${format(weekEnd, 'd MMM')}`}
            </p>
            {selectedDay ? (
              <button onClick={() => setSelectedDay(null)} className="text-[11px] font-semibold text-[#009688] mt-0.5">Show full week</button>
            ) : !isCurrentWeek ? (
              <button onClick={goToday} className="text-[11px] font-semibold text-[#009688] mt-0.5">Today</button>
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
                  {format(day, 'EEE')}
                </span>
                <span className={cn('text-[16px] font-bold leading-tight', isDayToday && !isSelected && 'text-[#009688]')}>
                  {format(day, 'd')}
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
          <span className="font-semibold">{weekMatches.length} match{weekMatches.length !== 1 ? 'es' : ''}</span>
          <span>·</span>
          <span>{uniquePlayers.size} players active</span>
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
                {viewTab === 'mine' && (selectedDay ? `No matches on ${format(selectedDay, 'EEEE d MMM')}` : 'No matches this week')}
                {viewTab === 'group' && 'No group matches this week'}
                {viewTab === 'open' && 'No open matches available'}
              </p>
              <p className="text-[12px] text-gray-400 mb-4">
                {viewTab === 'mine' ? 'Create a match or check your availability' : 'Check back later or create one'}
              </p>
              <button
                onClick={onCreateMatch}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#009688] px-4 py-2.5 text-[13px] font-bold text-white"
              >
                <Plus className="h-4 w-4" />
                Create match
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
                          {format(day, 'EEEE d MMM')}
                          {isSameDay(day, today) && <span className="text-[#009688] ml-1">· Today</span>}
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
