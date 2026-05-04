import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  format,
  addDays,
  isSameDay,
  startOfWeek as dateFnsStartOfWeek,
  parseISO,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { MatchCard, type MatchCardData } from '@/components/shared/MatchCard'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserGroup {
  id: string
  name: string
}

interface WeekMatchViewProps {
  onCreateMatch: () => void
}

type EnrichedMatch = MatchCardData & {
  group_id?: string | null
  group_name?: string | null
  created_manually?: boolean
  poll_id?: string | null
}

// ---------------------------------------------------------------------------
// Internal helper component
// ---------------------------------------------------------------------------

function MatchCardWithExtras({
  match,
  userId,
  index,
}: {
  match: EnrichedMatch
  userId: string
  index: number
}) {
  const isOpen = match.status === 'open' && !match.player_ids.includes(userId)

  return (
    <div className="relative">
      {/* Extra badges above the card */}
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
      </div>
      <MatchCard
        match={match}
        currentUserId={userId}
        action={isOpen ? 'join' : 'view'}
        index={index}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WeekMatchView({ onCreateMatch }: WeekMatchViewProps) {
  const { profile } = useAuth()
  const userId = profile?.id ?? ''

  // ---- core state --------------------------------------------------------
  const [weekStart, setWeekStart] = useState(() =>
    dateFnsStartOfWeek(new Date(), { weekStartsOn: 1 }),
  )
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [selectedFilter, setSelectedFilter] = useState<string>('all')
  const [direction, setDirection] = useState<'next' | 'prev'>('next')

  // ---- derived dates -----------------------------------------------------
  const weekEnd = addDays(weekStart, 6)
  const fetchStart = format(weekStart, 'yyyy-MM-dd')
  const fetchEnd = format(addDays(weekStart, 13), 'yyyy-MM-dd')
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today = new Date()
  const isCurrentWeek = isSameDay(
    weekStart,
    dateFnsStartOfWeek(today, { weekStartsOn: 1 }),
  )

  // ---- data fetching: matches --------------------------------------------
  const { data: matches = [], isLoading } = useQuery<EnrichedMatch[]>({
    queryKey: ['week-matches', fetchStart, userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select(
          'id, match_date, match_time, match_type, status, player_ids, group_id, booked_venue_name, created_manually, poll_id',
        )
        .or(`player_ids.cs.{${userId}},status.eq.open`)
        .gte('match_date', fetchStart)
        .lte('match_date', fetchEnd)
        .not('status', 'in', '(cancelled)')
        .order('match_date', { ascending: true })
        .order('match_time', { ascending: true })

      if (error) throw error
      if (!data || data.length === 0) return []

      // Fetch player profiles
      const allIds = [
        ...new Set(data.flatMap((m) => (m.player_ids as string[]) ?? [])),
      ]
      const { data: profiles } =
        allIds.length > 0
          ? await supabase
              .from('profiles')
              .select('id, name, avatar_url')
              .in('id', allIds)
          : { data: [] }

      // Fetch group names
      const groupIds = [
        ...new Set(data.map((m) => m.group_id).filter(Boolean)),
      ]
      const { data: groups } =
        groupIds.length > 0
          ? await supabase.from('groups').select('id, name').in('id', groupIds)
          : { data: [] }
      const groupMap = Object.fromEntries(
        (groups ?? []).map((g) => [g.id, g]),
      )

      return data.map((m) => ({
        id: m.id,
        match_date: m.match_date,
        match_time: m.match_time,
        match_type: m.match_type,
        status: m.status,
        player_ids: (m.player_ids as string[]) ?? [],
        booked_venue_name: m.booked_venue_name,
        players: (profiles ?? []).filter((p) =>
          ((m.player_ids as string[]) ?? []).includes(p.id),
        ),
        group_id: m.group_id,
        group_name: m.group_id ? groupMap[m.group_id]?.name : null,
        created_manually: m.created_manually,
        poll_id: m.poll_id,
      }))
    },
  })

  // ---- data fetching: user groups ----------------------------------------
  const { data: userGroups = [] } = useQuery<UserGroup[]>({
    queryKey: ['user-groups-for-filter', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId)
        .eq('status', 'approved')

      if (!memberships || memberships.length === 0) return []

      const ids = memberships.map((m) => m.group_id)
      const { data: groups } = await supabase
        .from('groups')
        .select('id, name')
        .in('id', ids)

      return groups ?? []
    },
  })

  // ---- week navigation ---------------------------------------------------
  function goNextWeek() {
    setDirection('next')
    setWeekStart((prev) => addDays(prev, 7))
    setSelectedDay(null)
  }

  function goPrevWeek() {
    setDirection('prev')
    setWeekStart((prev) => addDays(prev, -7))
    setSelectedDay(null)
  }

  function goToday() {
    const thisWeek = dateFnsStartOfWeek(today, { weekStartsOn: 1 })
    setDirection(weekStart > thisWeek ? 'prev' : 'next')
    setWeekStart(thisWeek)
    setSelectedDay(null)
  }

  // ---- filtering ---------------------------------------------------------
  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      const matchDate = parseISO(m.match_date)

      // Day filter
      if (selectedDay) {
        if (!isSameDay(matchDate, selectedDay)) return false
      } else {
        if (matchDate < weekStart || matchDate > weekEnd) return false
      }

      // Group filter
      if (selectedFilter === 'all') return true
      if (selectedFilter === 'groups') return !!m.group_id
      if (selectedFilter === 'manual')
        return m.created_manually && !m.group_id
      return m.group_id === selectedFilter
    })
  }, [matches, selectedDay, weekStart, weekEnd, selectedFilter])

  // Week summary stats
  const weekMatches = matches.filter((m) => {
    const d = parseISO(m.match_date)
    return d >= weekStart && d <= weekEnd
  })
  const uniquePlayers = new Set(weekMatches.flatMap((m) => m.player_ids))

  // ---- filter chip config ------------------------------------------------
  const filterChips = [
    { id: 'all', label: 'All' },
    { id: 'groups', label: 'My Groups' },
    ...userGroups.map((g) => ({ id: g.id, label: g.name })),
    { id: 'manual', label: 'Manual' },
  ]

  // ---- render ------------------------------------------------------------
  return (
    <div>
      {/* ---- Sticky week navigation header ---- */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-gray-50 px-5 pt-3 pb-2">
        {/* Week range + nav buttons */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={goPrevWeek}
            className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>

          <div className="text-center">
            <p className="text-[14px] font-bold text-gray-900">
              {format(weekStart, 'd MMM')} — {format(weekEnd, 'd MMM')}
            </p>
            {!isCurrentWeek && (
              <button
                onClick={goToday}
                className="text-[11px] font-semibold text-[#009688] mt-0.5"
              >
                Today
              </button>
            )}
          </div>

          <button
            onClick={goNextWeek}
            className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
        </div>

        {/* Day pills */}
        <div className="flex gap-1.5 justify-between">
          {weekDays.map((day) => {
            const hasMatch = matches.some((m) =>
              isSameDay(parseISO(m.match_date), day),
            )
            const isSelected = selectedDay && isSameDay(day, selectedDay)
            const isDayToday = isSameDay(day, today)

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={cn(
                  'flex-1 flex flex-col items-center py-2 rounded-xl transition-all min-w-0',
                  isSelected
                    ? 'bg-[#009688] text-white'
                    : 'bg-white text-gray-700',
                  isDayToday && !isSelected && 'ring-2 ring-[#009688]',
                )}
              >
                <span
                  className={cn(
                    'text-[10px] font-medium',
                    isSelected ? 'text-white/80' : 'text-gray-400',
                  )}
                >
                  {format(day, 'EEE')}
                </span>
                <span
                  className={cn(
                    'text-[16px] font-bold leading-tight',
                    isDayToday && !isSelected && 'text-[#009688]',
                  )}
                >
                  {format(day, 'd')}
                </span>
                {hasMatch && (
                  <div
                    className={cn(
                      'h-1 w-1 rounded-full mt-0.5',
                      isSelected ? 'bg-white' : 'bg-[#009688]',
                    )}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ---- Filter bar ---- */}
      <div className="px-5 pt-3 pb-1 overflow-x-auto no-scrollbar">
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

      {/* ---- Week summary ---- */}
      {!selectedDay && weekMatches.length > 0 && (
        <div className="mx-5 mt-3 mb-1 flex items-center gap-3 text-[12px] text-gray-500">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          <span className="font-semibold">
            {weekMatches.length} match{weekMatches.length !== 1 && 'es'}
          </span>
          <span>·</span>
          <span>{uniquePlayers.size} players active</span>
        </div>
      )}

      {/* ---- Animated match list ---- */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${weekStart.toISOString()}-${selectedDay?.toISOString() ?? 'week'}-${selectedFilter}`}
          initial={{ x: direction === 'next' ? 60 : -60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: direction === 'next' ? -60 : 60, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="px-5 pt-3 pb-32"
        >
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 rounded-2xl bg-gray-100 animate-pulse"
                />
              ))}
            </div>
          ) : filteredMatches.length === 0 ? (
            <div className="rounded-2xl bg-gray-50 border border-dashed border-gray-200 px-6 py-10 text-center">
              <p className="text-[14px] font-semibold text-gray-500 mb-1">
                {selectedDay
                  ? `No matches on ${format(selectedDay, 'EEEE d MMM')}`
                  : 'No matches this week'}
              </p>
              <p className="text-[12px] text-gray-400 mb-4">
                Create a match or check your availability
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
                    const dayMatches = filteredMatches.filter((m) =>
                      isSameDay(parseISO(m.match_date), day),
                    )
                    if (dayMatches.length === 0) return null

                    return (
                      <div key={day.toISOString()}>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5 mt-3 first:mt-0">
                          {format(day, 'EEEE d MMM')}
                          {isSameDay(day, today) && (
                            <span className="text-[#009688] ml-1">
                              · Today
                            </span>
                          )}
                        </p>
                        <div className="space-y-2">
                          {dayMatches.map((match, i) => (
                            <MatchCardWithExtras
                              key={match.id}
                              match={match}
                              userId={userId}
                              index={i}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })
                : filteredMatches.map((match, i) => (
                    <MatchCardWithExtras
                      key={match.id}
                      match={match}
                      userId={userId}
                      index={i}
                    />
                  ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
