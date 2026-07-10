import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { useDateLocale } from '@/lib/dateLocale'
import { Bell, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Users, Zap, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { sendNotification, sendNotifications } from '@/lib/notifications'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'
import { isUserAvailableForSlot, getSlotDate, POLL_OPTION_DRIVE } from '@/lib/pollUtils'
import { AskRingersSheet } from '@/components/match/AskRingersSheet'
import { AskRingersAllSheet } from '@/components/match/AskRingersAllSheet'

// ── Types ───────────────────────────────────────────────────────────────────

interface PollSlot {
  id: string
  day: string
  start_time: string
  end_time: string
}

interface PollAdminViewProps {
  pollId: string
  groupId: string
  poll: {
    id: string
    title: string
    closes_at: string
    status: string
    week_start_date: string
    time_slots: PollSlot[]
    additional_options: string[]
    poll_dates?: string[]  // range-model polls
  }
  isAdmin: boolean
  currentUserId: string
  currentUserName: string
  onRefetch: () => void
}

interface ResponseWithProfile {
  user_id: string
  selected_slots: string[] | null
  additional_responses: Record<string, boolean> | null
  flexible_times: Record<string, any> | null
  availability_ranges: Record<string, { start: string; end: string }[]> | null
  submitted_at: string | null
  profile: { id: string; name: string; avatar_url: string | null } | undefined
}

// ── Countdown Timer ─────────────────────────────────────────────────────────

function PollCountdown({ closesAt }: { closesAt: string }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: false })

  useEffect(() => {
    const calc = () => {
      const diff = new Date(closesAt).getTime() - Date.now()
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true })
        return
      }
      setTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
        expired: false,
      })
    }
    calc()
    const i = setInterval(calc, 1000)
    return () => clearInterval(i)
  }, [closesAt])

  const urgency = timeLeft.expired
    ? 'expired'
    : timeLeft.days > 0
      ? 'normal'
      : timeLeft.hours >= 6
        ? 'warning'
        : 'critical'

  const colours = {
    expired: 'bg-gray-50 border-gray-200 text-gray-500',
    normal: 'bg-teal-50 border-teal-200 text-teal-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
    critical: 'bg-red-50 border-red-200 text-red-700',
  }

  const unitBox = (value: number, label: string) => (
    <div className="flex flex-col items-center">
      <span className="text-[20px] font-bold tabular-nums leading-none">{String(value).padStart(2, '0')}</span>
      <span className="text-[10px] mt-1 uppercase tracking-wide opacity-70">{label}</span>
    </div>
  )

  if (timeLeft.expired) {
    return (
      <div className={cn('rounded-2xl border px-4 py-3 text-center', colours.expired)}>
        <p className="text-[13px] font-semibold">Poll Closed</p>
      </div>
    )
  }

  return (
    <div className={cn('rounded-2xl border px-4 py-3', colours[urgency])}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          <span className="text-[12px] font-semibold">
            {urgency === 'critical' ? 'Closing soon!' : urgency === 'warning' ? 'Closing today' : 'Time remaining'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {timeLeft.days > 0 && unitBox(timeLeft.days, 'days')}
          {unitBox(timeLeft.hours, 'hrs')}
          {unitBox(timeLeft.minutes, 'min')}
          {unitBox(timeLeft.seconds, 'sec')}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export function PollAdminView({
  pollId,
  groupId,
  poll,
  isAdmin,
  currentUserId: _currentUserId,
  currentUserName,
  onRefetch,
}: PollAdminViewProps) {
  const locale = useDateLocale()

  // Safe parse time_slots and additional_options (may be JSON strings from DB)
  const safePoll = useMemo(() => {
    const ts = Array.isArray(poll.time_slots) ? poll.time_slots
      : typeof poll.time_slots === 'string' ? (() => { try { return JSON.parse(poll.time_slots as unknown as string) } catch { return [] } })()
      : []
    const ao = Array.isArray(poll.additional_options) ? poll.additional_options
      : typeof poll.additional_options === 'string' ? (() => { try { return JSON.parse(poll.additional_options as unknown as string) } catch { return [] } })()
      : []
    return { ...poll, time_slots: ts as PollSlot[], additional_options: ao as string[] }
  }, [poll])

  // Range-poll detection: poll_dates set = range model
  const isRangePoll = Array.isArray(poll.poll_dates) && poll.poll_dates.length > 0

  // ── State ──
  const [expandedSection, setExpandedSection] = useState<'available' | 'unavailable' | 'notVoted' | null>(null)
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set())
  const [remindedUsers, setRemindedUsers] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [matchSchedules, setMatchSchedules] = useState<any[]>([])
  const [askRingersMatchId, setAskRingersMatchId] = useState<string | null>(null)
  const [askRingersAll, setAskRingersAll] = useState(false)

  // ── Matches needing ringers (actual DB matches for this group) ──
  // Queries ALL upcoming matches (any status that's playable, any poll type)
  // and filters to those with fewer than 4 players.
  const today = new Date().toISOString().split('T')[0]
  const { data: matchesNeedingRingers = [] } = useQuery({
    queryKey: ['matches-needing-ringers', groupId, today],
    enabled: isAdmin && !!groupId,
    queryFn: async () => {
      const { data } = await supabase
        .from('matches')
        .select('id, match_date, match_time, player_ids, status, poll_id')
        .eq('group_id', groupId)
        .gte('match_date', today)
        .in('status', ['scheduled', 'pending', 'confirmed', 'open'])
        .order('match_date', { ascending: true })
        .limit(20)
      return (data ?? []).filter((m: any) => (m.player_ids?.length ?? 0) < 4)
    },
  })

  // ── Data Fetching ──
  const { data: responses = [] } = useQuery<ResponseWithProfile[]>({
    queryKey: ['polls', 'detail', pollId, 'responses'],
    queryFn: async () => {
      const { data } = await supabase
        .from('poll_responses')
        .select('user_id, selected_slots, additional_responses, flexible_times, submitted_at, availability_ranges')
        .eq('poll_id', pollId)
      const userIds = (data ?? []).map((r) => r.user_id)
      const { data: profiles } = userIds.length > 0
        ? await supabase.from('profiles').select('id, name, avatar_url').in('id', userIds)
        : { data: [] as any[] }
      const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))
      return (data ?? []).map((r) => ({ ...r, profile: profileMap[r.user_id] }))
    },
  })

  const { data: groupMembers = [] } = useQuery({
    queryKey: ['polls', 'detail', pollId, 'group-members'],
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('status', 'approved')
      if (!memberships) return []
      const ids = memberships.map((m) => m.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', ids)
      return profiles ?? []
    },
  })

  // ── Derived Data ──
  const respondedUserIds = useMemo(() => new Set(responses.map((r) => r.user_id)), [responses])

  const availableResponses = useMemo(
    () =>
      responses.filter((r) => {
        if (isRangePoll) {
          // Range poll: available if they have any ranges
          const ranges = r.availability_ranges
          return ranges && typeof ranges === 'object' && Object.keys(ranges).length > 0
        }
        const slots = Array.isArray(r.selected_slots) ? r.selected_slots : []
        const hasFlex = r.flexible_times && Object.keys(r.flexible_times).length > 0
        return slots.length > 0 || hasFlex
      }),
    [responses, isRangePoll],
  )

  const unavailableResponses = useMemo(
    () =>
      responses.filter((r) => {
        if (isRangePoll) {
          const ranges = r.availability_ranges
          return !ranges || typeof ranges !== 'object' || Object.keys(ranges).length === 0
        }
        const slots = Array.isArray(r.selected_slots) ? r.selected_slots : []
        const hasFlex = r.flexible_times && Object.keys(r.flexible_times).length > 0
        return slots.length === 0 && !hasFlex
      }),
    [responses, isRangePoll],
  )

  const notVotedMembers = useMemo(
    () => groupMembers.filter((m) => !respondedUserIds.has(m.id)),
    [groupMembers, respondedUserIds],
  )

  // ── Day groupings ──
  const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  const dayData = useMemo(() => {
    if (isRangePoll) {
      // Range polls: derive days from poll_dates, count players with ranges on each date
      const pollDates = (poll.poll_dates ?? []) as string[]
      return pollDates.map((dateStr) => {
        const d = new Date(dateStr + 'T12:00:00')
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        const day = dayNames[d.getDay()]
        const dateLabel = (() => {
          try { return format(d, 'EEEE d MMMM', { locale }) } catch { return dateStr }
        })()
        const availablePlayers = availableResponses.filter((r) => {
          const ranges = r.availability_ranges
          return ranges && ranges[dateStr] && ranges[dateStr].length > 0
        })
        return { day, dateLabel, slots: [] as PollSlot[], availablePlayers }
      })
    }

    // Legacy path
    const slotsByDay: Record<string, PollSlot[]> = {}
    for (const slot of safePoll.time_slots) {
      if (!slotsByDay[slot.day]) slotsByDay[slot.day] = []
      slotsByDay[slot.day].push(slot)
    }

    return DAY_ORDER.filter((d) => slotsByDay[d]).map((day) => {
      const daySlots = slotsByDay[day]
      const availablePlayers = availableResponses.filter((r) =>
        daySlots.some((slot) => isUserAvailableForSlot(r, slot)),
      )
      const dateLabel = (() => {
        try {
          return format(getSlotDate(poll.week_start_date, day), 'EEEE d MMMM', { locale })
        } catch {
          return day
        }
      })()

      return { day, dateLabel, slots: daySlots, availablePlayers }
    })
  }, [safePoll.time_slots, poll.week_start_date, poll.poll_dates, isRangePoll, availableResponses, locale])

  // ── Slot-level data ──
  const slotData = useMemo(() => {
    return safePoll.time_slots.map((slot) => {
      const voters = responses.filter((r) => isUserAvailableForSlot(r, slot))
      return { slot, voters }
    })
  }, [safePoll.time_slots, responses])

  // ── Additional options summary ──
  const additionalSummary = useMemo(() => {
    return (safePoll.additional_options ?? []).map((opt) => {
      const players = responses.filter((r) => r.additional_responses?.[opt] === true)
      return { option: opt, players }
    })
  }, [safePoll.additional_options, responses])

  // Per-player additional_responses lookup (for match card enrichment)
  const playerAdditionalResponses = useMemo(() => {
    const map = new Map<string, Record<string, boolean>>()
    for (const r of responses) {
      if (r.additional_responses) map.set(r.user_id, r.additional_responses)
    }
    return map
  }, [responses])

  // Any slot/date with 4+ players?
  const hasViableSlot = isRangePoll
    ? dayData.some((d) => d.availablePlayers.length >= 4)
    : slotData.some((s) => s.voters.length >= 4)

  // ── Handlers ──
  async function handleRemind(userId: string) {
    sendNotification({
      user_id: userId,
      type: 'poll_reminder',
      title: "Don't forget to vote!",
      message: `${currentUserName} needs your availability for this week`,
      related_id: pollId,
    })
    setRemindedUsers((prev) => new Set([...prev, userId]))
  }

  async function handleRemindAll() {
    const toRemind = notVotedMembers.filter((m) => !remindedUsers.has(m.id))
    if (toRemind.length === 0) return
    sendNotifications(
      toRemind.map((m) => ({
        user_id: m.id,
        type: 'poll_reminder',
        title: "Don't forget to vote!",
        message: `${currentUserName} needs your availability for this week`,
        related_id: pollId,
      })),
    )
    setRemindedUsers((prev) => new Set([...prev, ...toRemind.map((m) => m.id)]))
  }

  const [generateError, setGenerateError] = useState<string | null>(null)
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null)
  const [confirming, setConfirming] = useState(false)
  // Benched list — recomputed whenever the schedule is edited
  const [playersBenched, setPlayersBenched] = useState<string[]>([])
  const [benchedDirty, setBenchedDirty] = useState(false)
  const [recomputing, setRecomputing] = useState(false)
  const [engineProfiles, setEngineProfiles] = useState<Record<string, any>>({})
  const [confirmResult, setConfirmResult] = useState<{ matchesCreated: number } | null>(null)
  // Per-slot availability: { slotId: [userId, ...] } — for filtering swap candidates
  const [slotAvailability, setSlotAvailability] = useState<Record<string, string[]>>({})
  // Count of players excluded on drop (available only at dropped slot, no outcome row)
  const [excludedCount, setExcludedCount] = useState(0)
  // Breakdown: loaded on mount (independent of Generate)
  const [breakdownClusters, setBreakdownClusters] = useState<any[]>([])
  const [breakdownProfiles, setBreakdownProfiles] = useState<Record<string, any>>({})
  const [breakdownLoaded, setBreakdownLoaded] = useState(false)
  const [breakdownExpanded, setBreakdownExpanded] = useState(false)

  // Fetch breakdown on load (range polls only) — independent of Generate
  useEffect(() => {
    if (!isRangePoll || breakdownLoaded) return
    async function fetchBreakdown() {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/poll-scheduler`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`,
            },
            body: JSON.stringify({ mode: 'breakdown', poll_id: pollId }),
          },
        )
        const data = await res.json()
        if (data.success) {
          setBreakdownClusters(data.clusters ?? [])
          setBreakdownProfiles(data.profiles ?? {})
        }
      } catch (e) {
        // Non-critical — breakdown is informational
      } finally {
        setBreakdownLoaded(true)
      }
    }
    fetchBreakdown()
  }, [isRangePoll, breakdownLoaded, pollId])

  async function handleGenerateMatches() {
    setGenerating(true)
    setMatchSchedules([])
    setGenerateError(null)
    setSelectedSchedule(null)
    setPlayersBenched([])
    setConfirmResult(null)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/poll-scheduler`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`,
          },
          body: JSON.stringify({ mode: 'propose', poll_id: pollId }),
        },
      )
      const data = await res.json()
      console.log('[PollScheduler] propose:', res.status, 'proposals:', data?.proposals?.length)
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)

      // Store playersBenched + slot availability for the confirm step
      setPlayersBenched(data.players_benched ?? [])
      setEngineProfiles(data.profiles ?? {})
      setSlotAvailability(data.slot_availability ?? {})
      setExcludedCount(0)

      // Wrap the flat proposals into a single schedule object for the existing render
      const proposals = data.proposals ?? []
      if (proposals.length === 0) {
        setGenerateError('No match options returned. Ensure enough players have voted.')
        setMatchSchedules([])
      } else {
        const playerNames = (m: any) =>
          (m.player_ids ?? []).map((pid: string) => data.profiles?.[pid]?.name ?? 'Unknown')
        const schedule = {
          scheduleNumber: 1,
          strategyName: 'Optimal Schedule',
          strategyDescription: `${data.total_participation ?? proposals.length * 4} players placed, ${(data.players_benched ?? []).length} benched`,
          isRecommended: true,
          totalMatches: proposals.length,
          totalPlayers: data.total_participation ?? 0,
          ringersNeeded: 0,
          matches: proposals.map((m: any) => ({
            ...m,
            playerIds: m.player_ids,
            playerNames: playerNames(m),
            dayOfWeek: m.day,
            timeSlot: m.time_slot_display ?? m.match_time,
            date: m.match_date,
          })),
        }
        setMatchSchedules([schedule])
      }
    } catch (e: any) {
      console.error('[PollScheduler] error:', e)
      setGenerateError(e?.message ?? 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  // Recompute benched from the CURRENT (possibly edited) schedule.
  // Does NOT re-optimise — only re-derives scheduled/benched sets.
  async function recomputeBenched(schedule: any) {
    if (!schedule?.matches?.length) return
    setRecomputing(true)
    try {
      const matches = (schedule.matches ?? []).map((m: any) => ({
        player_ids: m.player_ids ?? m.playerIds,
        slot_id: m.slot_id ?? m.slotId ?? null,
      }))
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/poll-scheduler`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`,
          },
          body: JSON.stringify({ mode: 'recompute', poll_id: pollId, schedule: matches }),
        },
      )
      const data = await res.json()
      if (data.success) {
        setPlayersBenched(data.players_benched ?? [])
        setSlotAvailability(data.slot_availability ?? slotAvailability)
        setExcludedCount(data.excluded_count ?? 0)
        setBenchedDirty(false)
        // Update match windows from recompute (range polls)
        if (data.match_windows && selectedSchedule) {
          const updated = { ...selectedSchedule, matches: selectedSchedule.matches.map((m: any) => {
            const sid = m.slot_id ?? m.slotId
            const w = data.match_windows[sid]
            if (w) return { ...m, window_start: w.window_start, window_end: w.window_end, match_time: w.window_start + ':00' }
            return m
          })}
          setSelectedSchedule(updated)
          setMatchSchedules(prev => prev.map(s => s.scheduleNumber === updated.scheduleNumber ? updated : s))
        }
      }
    } catch (e) {
      console.error('[Recompute] error:', e)
    } finally {
      setRecomputing(false)
    }
  }

  const [swapTarget, setSwapTarget] = useState<{ matchIdx: number; playerIdx: number } | null>(null)

  // Called when the admin edits a match (swap/drop). Routes through the dirty guard.
  // Updates BOTH selectedSchedule AND matchSchedules so the card renders the edit immediately.
  function handleScheduleEdit(editedSchedule: any) {
    setSelectedSchedule(editedSchedule)
    // Sync matchSchedules so the card render (which iterates matchSchedules) shows the edit
    setMatchSchedules(prev =>
      prev.map(s => s.scheduleNumber === editedSchedule.scheduleNumber ? editedSchedule : s)
    )
    setBenchedDirty(true)
    recomputeBenched(editedSchedule)
  }

  // SWAP: replace one scheduled player with a benched/available one. Atomic — match stays at 4.
  function handleSwapPlayer(matchIdx: number, playerIdx: number, newPlayerId: string) {
    if (!selectedSchedule) return
    const matches = [...selectedSchedule.matches]
    const match = { ...matches[matchIdx] }
    const pids = [...(match.player_ids ?? match.playerIds)]
    pids[playerIdx] = newPlayerId
    match.player_ids = pids
    match.playerIds = pids
    match.playerNames = pids.map((pid: string) => engineProfiles[pid]?.name ?? 'Unknown')
    matches[matchIdx] = match
    setSwapTarget(null)
    handleScheduleEdit({ ...selectedSchedule, matches })
  }

  // DROP MATCH: remove an entire match. All 4 players become benched (if available at a formed slot).
  function handleDropMatch(matchIdx: number) {
    if (!selectedSchedule) return
    const matches = selectedSchedule.matches.filter((_: any, i: number) => i !== matchIdx)
    handleScheduleEdit({
      ...selectedSchedule,
      matches,
      totalMatches: matches.length,
    })
  }

  async function handleConfirmSchedule() {
    if (!selectedSchedule || benchedDirty || recomputing) return
    setConfirming(true)
    try {
      // benched_ids is always current: edits trigger recompute, and confirm is
      // blocked (benchedDirty || recomputing) until recompute completes.
      const schedule = (selectedSchedule.matches ?? [])
        .filter((m: any) => (m.player_ids ?? m.playerIds)?.length >= 2)
        .map((m: any) => {
          const entry: any = {
            player_ids: m.player_ids ?? m.playerIds,
            match_date: m.match_date ?? m.date,
            match_time: m.match_time ?? ((m.timeSlot?.split('-')[0]?.trim() ?? '19:00') + ':00'),
            slot_id: m.slot_id ?? m.slotId ?? null,
            additional_options: m.additional_options ?? {},
          }
          if (m.window_start) entry.window_start = m.window_start
          if (m.window_end) entry.window_end = m.window_end
          return entry
        })

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/poll-scheduler`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`,
          },
          body: JSON.stringify({
            mode: 'confirm',
            poll_id: pollId,
            schedule,
            benched_ids: playersBenched,
          }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)

      toast.success(`${data.matches_created} match${data.matches_created !== 1 ? 'es' : ''} scheduled`)
      setConfirmResult({ matchesCreated: data.matches_created ?? 0 })
      setMatchSchedules([])
      setSelectedSchedule(null)
      setPlayersBenched([])
      onRefetch()
    } catch (e: any) {
      console.error('[PollScheduler] confirm error:', e)
      toast.error(e?.message ?? 'Failed to confirm schedule')
    } finally {
      setConfirming(false)
    }
  }

  function toggleSlotExpand(slotId: string) {
    setExpandedSlots((prev) => {
      const next = new Set(prev)
      if (next.has(slotId)) next.delete(slotId)
      else next.add(slotId)
      return next
    })
  }

  function toggleSection(section: 'available' | 'unavailable' | 'notVoted') {
    setExpandedSection((prev) => (prev === section ? null : section))
  }

  function firstName(name?: string | null) {
    return name?.split(' ')[0] ?? 'Unknown'
  }

  function additionalIcon(opt: string) {
    if (opt === POLL_OPTION_DRIVE) return '\u{1F697}'
    const lower = opt.toLowerCase()
    if (lower.includes('drive') || lower.includes('car') || lower.includes('lift')) return '\u{1F697}'
    if (lower.includes('drink') || lower.includes('beer') || lower.includes('social')) return '\u{1F37A}'
    return null
  }

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* 1. Countdown Timer */}
      <PollCountdown closesAt={poll.closes_at} />

      {/* 2. Response Summary Cards */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => toggleSection('available')}
          className={cn(
            'rounded-2xl border px-3 py-3 text-center transition-all',
            expandedSection === 'available'
              ? 'border-teal-300 bg-teal-50'
              : 'border-gray-100 bg-white hover:border-teal-200',
          )}
        >
          <CheckCircle className="h-5 w-5 text-[#009688] mx-auto mb-1" />
          <p className="text-[18px] font-bold text-gray-900">{availableResponses.length}</p>
          <p className="text-[10px] text-gray-500 font-medium">Available</p>
        </button>

        <button
          onClick={() => toggleSection('unavailable')}
          className={cn(
            'rounded-2xl border px-3 py-3 text-center transition-all',
            expandedSection === 'unavailable'
              ? 'border-red-300 bg-red-50'
              : 'border-gray-100 bg-white hover:border-red-200',
          )}
        >
          <XCircle className="h-5 w-5 text-red-400 mx-auto mb-1" />
          <p className="text-[18px] font-bold text-gray-900">{unavailableResponses.length}</p>
          <p className="text-[10px] text-gray-500 font-medium">Unavailable</p>
        </button>

        <button
          onClick={() => toggleSection('notVoted')}
          className={cn(
            'rounded-2xl border px-3 py-3 text-center transition-all',
            expandedSection === 'notVoted'
              ? 'border-amber-300 bg-amber-50'
              : 'border-gray-100 bg-white hover:border-amber-200',
          )}
        >
          <Clock className="h-5 w-5 text-amber-400 mx-auto mb-1" />
          <p className="text-[18px] font-bold text-gray-900">{notVotedMembers.length}</p>
          <p className="text-[10px] text-gray-500 font-medium">Not Voted</p>
        </button>
      </div>

      {/* Expandable detail sections */}
      <AnimatePresence mode="wait">
        {expandedSection === 'available' && availableResponses.length > 0 && (
          <motion.div
            key="available"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden rounded-2xl border border-teal-100 bg-teal-50"
          >
            <div className="px-4 py-3 space-y-2">
              <p className="text-[12px] font-semibold text-teal-700 uppercase tracking-wide">Available Players</p>
              {availableResponses.map((r) => (
                <div key={r.user_id} className="flex items-center gap-2">
                  <PlayerAvatar name={r.profile?.name} avatarUrl={r.profile?.avatar_url} size="sm" />
                  <span className="text-[13px] text-gray-700">{r.profile?.name ?? 'Unknown'}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {expandedSection === 'unavailable' && unavailableResponses.length > 0 && (
          <motion.div
            key="unavailable"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden rounded-2xl border border-red-100 bg-red-50"
          >
            <div className="px-4 py-3 space-y-2">
              <p className="text-[12px] font-semibold text-red-700 uppercase tracking-wide">Unavailable</p>
              {unavailableResponses.map((r) => (
                <div key={r.user_id} className="flex items-center gap-2">
                  <PlayerAvatar name={r.profile?.name} avatarUrl={r.profile?.avatar_url} size="sm" />
                  <span className="text-[13px] text-gray-500">{r.profile?.name ?? 'Unknown'}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {expandedSection === 'notVoted' && notVotedMembers.length > 0 && (
          <motion.div
            key="notVoted"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden rounded-2xl border border-amber-100 bg-amber-50"
          >
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold text-amber-700 uppercase tracking-wide">Not Voted</p>
                {isAdmin && notVotedMembers.some((m) => !remindedUsers.has(m.id)) && (
                  <button
                    onClick={handleRemindAll}
                    className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 hover:text-amber-700"
                  >
                    <Bell className="h-3.5 w-3.5" />
                    Remind All
                  </button>
                )}
              </div>
              {notVotedMembers.map((m) => (
                <div key={m.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PlayerAvatar name={m.name} avatarUrl={m.avatar_url} size="sm" />
                    <span className="text-[13px] text-gray-700">{m.name}</span>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleRemind(m.id)}
                      disabled={remindedUsers.has(m.id)}
                      className={cn(
                        'flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all',
                        remindedUsers.has(m.id)
                          ? 'bg-green-100 text-green-600'
                          : 'bg-amber-100 text-amber-700 hover:bg-amber-200 active:scale-95',
                      )}
                    >
                      {remindedUsers.has(m.id) ? (
                        <>
                          <CheckCircle className="h-3 w-3" /> Sent
                        </>
                      ) : (
                        <>
                          <Bell className="h-3 w-3" /> Remind
                        </>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. Daily Availability — unified breakdown (range polls: from breakdown mode on load) */}
      {isRangePoll && breakdownLoaded && (
        <div className="space-y-2">
          <button
            onClick={() => setBreakdownExpanded(!breakdownExpanded)}
            className="w-full flex items-center justify-between"
          >
            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
              Daily Availability
              {breakdownClusters.length > 0 && (
                <span className="ml-2 text-[10px] font-semibold text-teal-600 normal-case">
                  {breakdownClusters.filter(c => !c.short).length} match window{breakdownClusters.filter(c => !c.short).length !== 1 ? 's' : ''}
                  {breakdownClusters.some(c => c.short) && `, ${breakdownClusters.filter(c => c.short).length} short`}
                </span>
              )}
            </h3>
            <span className="text-[11px] text-gray-400">
              {breakdownExpanded ? 'collapse' : 'expand'}
            </span>
          </button>

          {breakdownExpanded && (
            <div className="space-y-2">
              {breakdownClusters.length === 0 ? (
                <p className="text-[12px] text-gray-400 py-2">No overlapping availability yet.</p>
              ) : (
                (() => {
                  const byDate = new Map<string, typeof breakdownClusters>()
                  for (const c of breakdownClusters) {
                    const arr = byDate.get(c.date) ?? []
                    arr.push(c)
                    byDate.set(c.date, arr)
                  }
                  return Array.from(byDate.entries()).map(([date, clusters]) => {
                    const d = new Date(date + 'T12:00:00')
                    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                    const dayLabel = `${dayNames[d.getDay()]} ${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`
                    return (
                      <div key={date} className="rounded-xl border border-gray-100 px-3 py-2 space-y-1.5">
                        <p className="text-[12px] font-semibold text-gray-800">{dayLabel}</p>
                        {clusters.map((c: any, idx: number) => (
                          <div key={idx} className={cn(
                            'rounded-lg px-3 py-2 text-[11px] border',
                            c.short ? 'border-amber-200 bg-amber-50/50' : 'border-teal-200 bg-teal-50/50'
                          )}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-gray-700">{c.window_start}–{c.window_end}</span>
                              <span className={cn(
                                'text-[10px] font-bold rounded-full px-2 py-0.5',
                                c.short ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'
                              )}>
                                {c.short
                                  ? `${c.count} — needs ${4 - c.count} ringer${4 - c.count !== 1 ? 's' : ''}`
                                  : `${c.count} players`}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {(c.player_ids ?? []).map((pid: string) => (
                                <span key={pid} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600 border border-gray-100">
                                  {breakdownProfiles[pid]?.name?.split(' ')[0] ?? pid.slice(0, 8)}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })
                })()
              )}
            </div>
          )}
        </div>
      )}

      {/* Legacy slot polls: keep old daily availability + slot breakdown */}
      {!isRangePoll && dayData.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Daily Availability</h3>
          {dayData.map(({ day, dateLabel, availablePlayers }) => {
            const count = availablePlayers.length
            const total = groupMembers.length || 1
            const pct = Math.round((count / total) * 100)
            const barColour = count >= 4 ? 'bg-[#009688]' : count >= 2 ? 'bg-amber-400' : 'bg-gray-300'
            return (
              <div key={day} className="rounded-2xl border border-gray-100 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span className="text-[13px] font-semibold text-gray-900">{dateLabel}</span>
                  </div>
                  <span className={cn('text-[12px] font-semibold', count >= 4 ? 'text-[#009688]' : 'text-gray-400')}>
                    {count}/{total} available
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', barColour)} style={{ width: `${pct}%` }} />
                </div>
                {availablePlayers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {availablePlayers.map((r) => (
                      <span key={r.user_id} className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700">
                        <PlayerAvatar name={r.profile?.name} avatarUrl={r.profile?.avatar_url} size="sm" />
                        {firstName(r.profile?.name)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Legacy slot breakdown (non-range polls only) */}
      {!isRangePoll && slotData.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Slot Breakdown</h3>
          {slotData.map(({ slot, voters }) => {
            const isExpanded = expandedSlots.has(slot.id)
            const viable = voters.length >= 4
            const dateLabel = (() => {
              try { return format(getSlotDate(poll.week_start_date, slot.day), 'EEE d', { locale }) }
              catch { return slot.day }
            })()
            return (
              <div key={slot.id} className="rounded-2xl border border-gray-100 overflow-hidden">
                <button onClick={() => toggleSlotExpand(slot.id)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-gray-900">{dateLabel} {slot.start_time}–{slot.end_time}</span>
                    {viable && <span className="flex items-center gap-0.5 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700"><Zap className="h-3 w-3" /> Match Ready</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', viable ? 'bg-[#009688] text-white' : 'bg-gray-100 text-gray-500')}>{voters.length}</span>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </button>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="px-4 pb-3 space-y-2 border-t border-gray-50">
                        {voters.map((r) => (
                          <div key={r.user_id} className="flex items-center gap-2 py-1.5">
                            <PlayerAvatar name={r.profile?.name} avatarUrl={r.profile?.avatar_url} size="sm" />
                            <span className="text-[13px] text-gray-700">{r.profile?.name ?? 'Unknown'}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      )}

      {/* 6. Additional Options Summary */}
      {additionalSummary.length > 0 && additionalSummary.some((a) => a.players.length > 0) && (
        <div className="space-y-2">
          <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Additional Options</h3>
          {additionalSummary.map(({ option, players }) => (
            <div key={option} className="rounded-2xl border border-gray-100 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-semibold text-gray-900">
                  {additionalIcon(option) ? `${additionalIcon(option)} ` : ''}
                  {option}
                </span>
                <span className="text-[12px] font-semibold text-gray-400">{players.length}</span>
              </div>
              {players.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {players.map((r) => (
                    <span
                      key={r.user_id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700"
                    >
                      {firstName(r.profile?.name)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 7. Match Generation (Admin Only) */}
      {isAdmin && (hasViableSlot || matchSchedules.length > 0 || confirmResult) && (
        <div className="rounded-2xl border border-teal-100 bg-teal-50/30 px-4 py-4 space-y-3">

          {/* Success state after confirm */}
          {confirmResult && (
            <div className="rounded-xl bg-teal-50 border border-teal-200 px-4 py-3 space-y-2">
              <p className="text-[13px] font-bold text-teal-800">
                {confirmResult.matchesCreated} match{confirmResult.matchesCreated !== 1 ? 'es' : ''} scheduled
              </p>
              <a
                href={`/community/groups/${groupId}`}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#009688] hover:text-[#00796B]"
              >
                View matches
              </a>
            </div>
          )}

          {/* Generate button — hidden after confirm, disabled if poll already processed */}
          {!confirmResult && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-[#009688]" />
              <span className="text-[13px] font-bold text-gray-900">Match Generation</span>
            </div>
            {poll.status === 'processed' ? (
              <span className="text-[11px] text-gray-400">Poll already processed</span>
            ) : (
            <button
              onClick={handleGenerateMatches}
              disabled={generating}
              className="flex items-center gap-1.5 rounded-xl bg-[#009688] px-3.5 py-2 text-[12px] font-bold text-white disabled:opacity-50 active:scale-95 transition-all"
            >
              {generating ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Generating...
                </>
              ) : (
                <>
                  <Users className="h-3.5 w-3.5" />
                  Generate Options
                </>
              )}
            </button>
            )}
          </div>
          )}

          {!confirmResult && generating && (
            <div className="flex flex-col items-center py-6 gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
              <p className="text-[12px] text-gray-400">Finding optimal match configurations...</p>
            </div>
          )}

          {generateError && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3">
              <p className="text-[12px] font-semibold text-red-700">Generation failed</p>
              <p className="text-[11px] text-red-500 mt-0.5">{generateError}</p>
            </div>
          )}

          {!confirmResult && !generating && matchSchedules.length === 0 && poll.status !== 'processed' && (
            <p className="text-[11px] text-gray-400">
              Generate an optimal schedule from poll responses. You can swap players and drop matches before confirming.
            </p>
          )}

          {!confirmResult && !generating && matchSchedules.length > 0 && (
            <div className="space-y-3">
              <p className="text-[12px] text-gray-500">
                {matchSchedules.length} option{matchSchedules.length !== 1 ? 's' : ''} found
              </p>
              {matchSchedules.map((schedule, idx) => (
                <div key={idx} className="rounded-xl border border-gray-200 bg-white px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-semibold text-gray-900">
                      {schedule.strategyName ?? `Option ${idx + 1}`}
                    </p>
                    {schedule.isRecommended && (
                      <span className="text-[10px] font-bold text-teal-700 bg-teal-50 rounded-full px-2 py-0.5">Recommended</span>
                    )}
                  </div>
                  {schedule.strategyDescription && (
                    <p className="text-[11px] text-gray-400">{schedule.strategyDescription}</p>
                  )}
                  <p className="text-[11px] text-gray-500">
                    {schedule.totalMatches ?? schedule.matches?.length ?? 0} matches · {schedule.totalPlayers ?? 0} players
                    {(schedule.ringersNeeded ?? 0) > 0 && ` · ${schedule.ringersNeeded} ringers needed`}
                  </p>

                  {(schedule.matches ?? []).map((match: any, mIdx: number) => {
                    const pids: string[] = match.player_ids ?? match.playerIds ?? []
                    const isSelected = selectedSchedule?.scheduleNumber === schedule.scheduleNumber
                    const isRingerMatch = match.needs_ringer === true
                    return (
                      <div key={mIdx} className={cn(
                        'rounded-lg px-3 py-2 text-[12px] space-y-1',
                        isRingerMatch ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'
                      )}>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-gray-800">{match.dayOfWeek ?? match.date ?? match.day}</span>
                            {match.window_start && match.window_end && (
                              <span className="ml-2 text-[10px] font-semibold text-teal-600">
                                {match.window_start}–{match.window_end}
                              </span>
                            )}
                            {isRingerMatch && (
                              <span className="ml-2 text-[10px] font-bold text-[#E65100] bg-orange-100 rounded-full px-2 py-0.5">
                                Needs {match.ringer_count ?? 1} ringer
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">{match.timeSlot ?? `${match.start_time}–${match.end_time}`}</span>
                            {isSelected && (
                              <button
                                onClick={() => handleDropMatch(mIdx)}
                                className="text-[10px] text-[#E65100] hover:text-[#BF360C] font-semibold"
                                title="Drop this match"
                              >
                                Drop
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Player chips with avatar + icons */}
                        <div className="space-y-1.5 mt-1">
                          {pids.map((pid: string, pIdx: number) => {
                            const profile = engineProfiles[pid]
                            const name = profile?.name ?? match.playerNames?.[pIdx] ?? 'Unknown'
                            const isSwapOpen = isSelected && swapTarget?.matchIdx === mIdx && swapTarget?.playerIdx === pIdx
                            const matchSlotId = match.slot_id ?? match.slotId
                            const slotAvail = new Set(slotAvailability[matchSlotId] ?? [])
                            const swapCandidates = playersBenched.filter(id => slotAvail.has(id))
                            const ar = playerAdditionalResponses.get(pid)
                            const activeOpts = ar ? Object.entries(ar).filter(([, v]) => v) : []
                            return (
                              <div key={pIdx}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <PlayerAvatar name={name} avatarUrl={profile?.avatar_url} size="sm" />
                                    <span className="text-[13px] font-medium text-gray-800">{name.split(' ')[0]}</span>
                                    {activeOpts.map(([opt]) => {
                                      const icon = additionalIcon(opt)
                                      return icon
                                        ? <span key={opt} className="text-[14px]" title={opt}>{icon}</span>
                                        : <span key={opt} className="text-[9px] text-gray-500 bg-gray-100 rounded-full px-1.5 py-0.5" title={opt}>{opt}</span>
                                    })}
                                  </div>
                                  {isSelected && (
                                    <button
                                      onClick={() => setSwapTarget(isSwapOpen ? null : { matchIdx: mIdx, playerIdx: pIdx })}
                                      className="rounded-lg border border-teal-200 px-2.5 py-1 text-[11px] font-semibold text-[#009688] hover:bg-teal-50"
                                    >
                                      {isSwapOpen ? 'Cancel' : 'Swap'}
                                    </button>
                                  )}
                                </div>
                                {isSwapOpen && (
                                  <div className="ml-8 mt-1 mb-1 p-2 bg-white rounded-lg border border-teal-100 space-y-1">
                                    <p className="text-[11px] text-gray-500 font-semibold">Available for this slot:</p>
                                    {swapCandidates.length === 0 && (
                                      <p className="text-[11px] text-gray-400">No other available players</p>
                                    )}
                                    {swapCandidates.map((benchId: string) => {
                                      const bp = engineProfiles[benchId]
                                      return (
                                        <button
                                          key={benchId}
                                          onClick={() => handleSwapPlayer(mIdx, pIdx, benchId)}
                                          className="flex items-center gap-2 w-full text-left text-[12px] text-[#009688] hover:bg-teal-50 rounded-lg px-2 py-1.5"
                                        >
                                          <PlayerAvatar name={bp?.name} avatarUrl={bp?.avatar_url} size="sm" />
                                          {bp?.name?.split(' ')[0] ?? benchId.slice(0, 8)}
                                        </button>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}

                  <button
                    onClick={() => setSelectedSchedule(schedule)}
                    className={cn(
                      'w-full rounded-xl border-2 py-2.5 text-[13px] font-bold transition-all active:scale-[0.98]',
                      selectedSchedule?.scheduleNumber === schedule.scheduleNumber
                        ? 'border-[#009688] bg-[#009688] text-white'
                        : 'border-[#009688] text-[#009688] hover:bg-teal-50'
                    )}
                  >
                    {selectedSchedule?.scheduleNumber === schedule.scheduleNumber ? '✓ Selected' : 'Select this option'}
                  </button>
                </div>
              ))}

              {/* Confirm button */}
              {selectedSchedule && (
                <button
                  onClick={handleConfirmSchedule}
                  disabled={confirming || benchedDirty || recomputing}
                  className="w-full rounded-2xl bg-gray-900 py-3.5 text-[14px] font-bold text-white disabled:opacity-50 mt-2"
                >
                  {confirming ? '⏳ Scheduling matches...'
                    : recomputing ? '⏳ Recomputing...'
                    : `✓ Confirm — schedule ${selectedSchedule.totalMatches ?? selectedSchedule.matches?.length ?? 0} matches`}
                </button>
              )}

              {/* Benched players summary */}
              {selectedSchedule && playersBenched.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-[11px] text-amber-700">
                  <span className="font-semibold">{playersBenched.length} benched:</span>{' '}
                  {playersBenched.map(id => engineProfiles[id]?.name?.split(' ')[0] ?? id.slice(0,8)).join(', ')}
                </div>
              )}

              {/* Excluded players warning (lack-of-numbers after dropping matches) */}
              {selectedSchedule && excludedCount > 0 && (
                <div className="rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-[11px] text-gray-500">
                  <span className="font-semibold">{excludedCount} player{excludedCount !== 1 ? 's' : ''} excluded</span>{' '}
                  — available only at dropped slots, no game this week
                </div>
              )}

            </div>
          )}
        </div>
      )}

      {/* Matches needing ringers */}
      {isAdmin && matchesNeedingRingers.length > 0 && (
        <div className="rounded-2xl border border-orange-100 bg-orange-50/30 px-4 py-3 mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-bold text-orange-700">Matches needing ringers</p>
            {matchesNeedingRingers.length >= 1 && (
              <button
                onClick={() => setAskRingersAll(true)}
                className="text-[11px] font-semibold text-[#009688] hover:text-[#00796B]"
              >
                Ask for all
              </button>
            )}
          </div>
          {matchesNeedingRingers.map((m: any) => (
            <div key={m.id} className="flex items-center justify-between rounded-xl bg-white border border-orange-100 px-3 py-2">
              <div>
                <p className="text-[12px] font-medium text-gray-800">{m.match_date} {m.match_time?.slice(0, 5) ?? ''}</p>
                <p className="text-[10px] text-gray-400">{m.player_ids?.length ?? 0}/4 players</p>
              </div>
              <button
                onClick={() => setAskRingersMatchId(m.id)}
                className="rounded-lg border border-teal-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-teal-700"
              >
                Ask ringers
              </button>
            </div>
          ))}
        </div>
      )}

      {/* AskRingersSheet — single match */}
      {askRingersMatchId && (() => {
        const m = matchesNeedingRingers.find((x: any) => x.id === askRingersMatchId)
        if (!m) return null
        return (
          <AskRingersSheet
            open={true}
            onClose={() => setAskRingersMatchId(null)}
            matchId={askRingersMatchId}
            groupId={groupId}
            matchDateTime={`${m.match_date}T${m.match_time ?? '00:00'}`}
            currentPlayerIds={m.player_ids ?? []}
            onSent={() => { setAskRingersMatchId(null); onRefetch() }}
          />
        )
      })()}

      {/* AskRingersAllSheet — all matches needing ringers */}
      {askRingersAll && matchesNeedingRingers.length > 0 && (
        <AskRingersAllSheet
          open={true}
          onClose={() => setAskRingersAll(false)}
          matches={matchesNeedingRingers}
          groupId={groupId}
          onSent={() => { setAskRingersAll(false); onRefetch() }}
        />
      )}

    </div>
  )
}
