import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { Bell, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Users, Zap, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'
import { isUserAvailableForSlot, getSlotDate } from '@/lib/pollUtils'
import { CreateMatchSheet } from '@/components/play/CreateMatchSheet'

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
  currentUserId,
  currentUserName,
  onRefetch,
}: PollAdminViewProps) {
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

  // ── State ──
  const [expandedSection, setExpandedSection] = useState<'available' | 'unavailable' | 'notVoted' | null>(null)
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set())
  const [remindedUsers, setRemindedUsers] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [matchSchedules, setMatchSchedules] = useState<any[]>([])
  const [createMatchOpen, setCreateMatchOpen] = useState(false)
  const [scheduleDefaults, setScheduleDefaults] = useState<{ date?: string; groupId?: string }>({})

  // ── Data Fetching ──
  const { data: responses = [] } = useQuery<ResponseWithProfile[]>({
    queryKey: ['polls', 'detail', pollId, 'responses'],
    queryFn: async () => {
      const { data } = await supabase
        .from('poll_responses')
        .select('user_id, selected_slots, additional_responses, flexible_times, submitted_at')
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
        const slots = Array.isArray(r.selected_slots) ? r.selected_slots : []
        const hasFlex = r.flexible_times && Object.keys(r.flexible_times).length > 0
        return slots.length > 0 || hasFlex
      }),
    [responses],
  )

  const unavailableResponses = useMemo(
    () =>
      responses.filter((r) => {
        const slots = Array.isArray(r.selected_slots) ? r.selected_slots : []
        const hasFlex = r.flexible_times && Object.keys(r.flexible_times).length > 0
        return slots.length === 0 && !hasFlex
      }),
    [responses],
  )

  const notVotedMembers = useMemo(
    () => groupMembers.filter((m) => !respondedUserIds.has(m.id)),
    [groupMembers, respondedUserIds],
  )

  // ── Day groupings ──
  const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  const dayData = useMemo(() => {
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
          return format(getSlotDate(poll.week_start_date, day), 'EEEE d MMMM')
        } catch {
          return day
        }
      })()

      return { day, dateLabel, slots: daySlots, availablePlayers }
    })
  }, [safePoll.time_slots, poll.week_start_date, availableResponses])

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

  // Any slot with 4+ players?
  const hasViableSlot = slotData.some((s) => s.voters.length >= 4)

  // ── Handlers ──
  async function handleRemind(userId: string) {
    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'poll_reminder',
      title: "Don't forget to vote!",
      message: `${currentUserName} needs your availability for this week`,
      related_id: pollId,
      read: false,
    })
    setRemindedUsers((prev) => new Set([...prev, userId]))
  }

  async function handleRemindAll() {
    const toRemind = notVotedMembers.filter((m) => !remindedUsers.has(m.id))
    if (toRemind.length === 0) return
    await supabase.from('notifications').insert(
      toRemind.map((m) => ({
        user_id: m.id,
        type: 'poll_reminder',
        title: "Don't forget to vote!",
        message: `${currentUserName} needs your availability for this week`,
        related_id: pollId,
        read: false,
      })),
    )
    setRemindedUsers((prev) => new Set([...prev, ...toRemind.map((m) => m.id)]))
  }

  const [generateError, setGenerateError] = useState<string | null>(null)
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null)
  const [confirming, setConfirming] = useState(false)

  async function handleGenerateMatches() {
    setGenerating(true)
    setMatchSchedules([])
    setGenerateError(null)
    setSelectedSchedule(null)
    try {
      // Use direct fetch with anon key — confirmed working via curl
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-match-options`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`,
          },
          body: JSON.stringify({ poll_id: pollId }),
        },
      )
      const data = await res.json()
      console.log('[GenerateOptions] status:', res.status, 'schedules:', data?.weeklySchedules?.length)
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      const schedules = data?.weeklySchedules ?? []
      if (schedules.length === 0) setGenerateError('No match options returned. Ensure enough players have voted.')
      setMatchSchedules(schedules)
    } catch (e: any) {
      console.error('[GenerateOptions] error:', e)
      setGenerateError(e?.message ?? 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  async function handleConfirmSchedule() {
    if (!selectedSchedule) return
    setConfirming(true)
    let created = 0

    for (const m of selectedSchedule.matches ?? []) {
      if (!m.playerIds || m.playerIds.length < 2) continue
      const matchTime = (m.timeSlot?.split('-')[0]?.trim() ?? '19:00') + ':00'
      const { error } = await supabase.from('matches').insert({
        match_date: m.date, match_time: matchTime,
        match_type: 'competitive',
        status: m.status === 'ready' ? 'scheduled' : 'pending',
        player_ids: m.playerIds, group_id: groupId, poll_id: pollId, created_manually: false, created_by: currentUserId,
      })
      if (error && error.code !== '23505') console.error('[Confirm] error:', error)
      else if (error?.code === '23505') { console.log('[Confirm] match exists, skipping'); created++ }
      else {
        created++
        await supabase.from('notifications').insert(
          m.playerIds.map((pid: string) => ({
            user_id: pid, type: 'match_suggested', title: '🎾 Match scheduled!',
            message: `${m.dayOfWeek} ${m.timeSlot} match with ${(m.playerNames ?? []).join(', ')}`,
            related_id: groupId, read: false,
          }))
        )
      }
    }

    await supabase.from('polls').update({ status: 'processed' }).eq('id', pollId)
    setMatchSchedules([]); setSelectedSchedule(null); setConfirming(false)
    onRefetch()
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

      {/* 4. Per-Day Availability Summary */}
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

              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', barColour)} style={{ width: `${pct}%` }} />
              </div>

              {/* Player chips */}
              {availablePlayers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {availablePlayers.map((r) => (
                    <span
                      key={r.user_id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700"
                    >
                      <PlayerAvatar name={r.profile?.name} avatarUrl={r.profile?.avatar_url} size="sm" />
                      {firstName(r.profile?.name)}
                    </span>
                  ))}
                </div>
              )}

              {/* Schedule Match button */}
              {isAdmin && count >= 4 && (
                <button
                  onClick={() => {
                    const dayDate = (() => { try { return format(getSlotDate(poll.week_start_date, day), 'yyyy-MM-dd') } catch { return '' } })()
                    setScheduleDefaults({ date: dayDate, groupId })
                    setCreateMatchOpen(true)
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-[#009688] px-3 py-2 text-[12px] font-bold text-white mt-1"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Schedule Match
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* 5. Time Slot Breakdown (Accordion) */}
      {slotData.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Slot Breakdown</h3>
          {slotData.map(({ slot, voters }) => {
            const isExpanded = expandedSlots.has(slot.id)
            const viable = voters.length >= 4
            const dateLabel = (() => {
              try {
                return format(getSlotDate(poll.week_start_date, slot.day), 'EEE d')
              } catch {
                return slot.day
              }
            })()

            return (
              <div key={slot.id} className="rounded-2xl border border-gray-100 overflow-hidden">
                <button
                  onClick={() => toggleSlotExpand(slot.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-gray-900">
                      {dateLabel} {slot.start_time}–{slot.end_time}
                    </span>
                    {viable && (
                      <span className="flex items-center gap-0.5 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                        <Zap className="h-3 w-3" /> Match Ready
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-bold',
                        viable ? 'bg-[#009688] text-white' : 'bg-gray-100 text-gray-500',
                      )}
                    >
                      {voters.length}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-3 space-y-2 border-t border-gray-50">
                        {voters.length === 0 ? (
                          <p className="text-[12px] text-gray-400 py-2">No players for this slot yet.</p>
                        ) : (
                          voters.map((r) => {
                            const addOpts = Object.entries(r.additional_responses ?? {}).filter(([, v]) => v)
                            return (
                              <div key={r.user_id} className="flex items-center justify-between py-1.5">
                                <div className="flex items-center gap-2">
                                  <PlayerAvatar
                                    name={r.profile?.name}
                                    avatarUrl={r.profile?.avatar_url}
                                    size="sm"
                                  />
                                  <span className="text-[13px] text-gray-700">{r.profile?.name ?? 'Unknown'}</span>
                                </div>
                                {addOpts.length > 0 && (
                                  <div className="flex items-center gap-1">
                                    {addOpts.map(([opt]) => {
                                      const icon = additionalIcon(opt)
                                      return icon ? (
                                        <span key={opt} className="text-[14px]" title={opt}>
                                          {icon}
                                        </span>
                                      ) : (
                                        <span
                                          key={opt}
                                          className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500"
                                          title={opt}
                                        >
                                          {opt}
                                        </span>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          })
                        )}
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
      {isAdmin && (hasViableSlot || matchSchedules.length > 0) && (
        <div className="rounded-2xl border border-teal-100 bg-teal-50/30 px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-[#009688]" />
              <span className="text-[13px] font-bold text-gray-900">Match Generation</span>
            </div>
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
          </div>

          {generating && (
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

          {!generating && matchSchedules.length > 0 && (
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
                    const names = match.playerNames ?? []
                    const team1 = names.slice(0, 2).map((n: string) => n.split(' ')[0]).join(' + ')
                    const team2 = names.slice(2, 4).map((n: string) => n.split(' ')[0]).join(' + ')
                    return (
                      <div key={mIdx} className="rounded-lg bg-gray-50 px-3 py-2 text-[12px]">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-800">{match.dayOfWeek ?? match.date ?? match.day}</span>
                          <span className="text-gray-400">{match.timeSlot ?? `${match.start_time}–${match.end_time}`}</span>
                        </div>
                        {names.length >= 4 && (
                          <p className="text-[11px] text-gray-600 mt-0.5">{team1} <span className="text-gray-400">vs</span> {team2}</p>
                        )}
                        {names.length > 0 && names.length < 4 && (
                          <p className="text-[11px] text-gray-500 mt-0.5">{names.join(', ')} <span className="text-orange-500">+ {4 - names.length} needed</span></p>
                        )}
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
                  disabled={confirming}
                  className="w-full rounded-2xl bg-gray-900 py-3.5 text-[14px] font-bold text-white disabled:opacity-50 mt-2"
                >
                  {confirming ? '⏳ Scheduling matches...' : `✓ Confirm — schedule ${selectedSchedule.totalMatches ?? selectedSchedule.matches?.length ?? 0} matches`}
                </button>
              )}

            </div>
          )}
        </div>
      )}

      {/* CreateMatchSheet for schedule match */}
      <CreateMatchSheet
        open={createMatchOpen}
        onClose={() => { setCreateMatchOpen(false); onRefetch() }}
        defaultGroupId={scheduleDefaults.groupId}
      />
    </div>
  )
}
