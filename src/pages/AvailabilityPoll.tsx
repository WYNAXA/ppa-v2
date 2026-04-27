import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, CheckCircle, Clock, Trophy, AlertTriangle, Star, Users, Shuffle, RefreshCw } from 'lucide-react'
import { format, isPast, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { generateHalfHourSlots, getTimePeriod, getSlotDate } from '@/lib/pollUtils'
import { WeeklyScheduleSelector } from '@/components/polls/WeeklyScheduleSelector'

// ── Types ───────────────────────────────────────────────────────────────────

interface PollSlot {
  id: string
  day: string
  start_time: string
  end_time: string
}

interface Poll {
  id: string
  group_id: string
  title: string
  created_by: string | null
  status: string
  closes_at: string
  week_start_date: string
  time_slots: PollSlot[]
  additional_options: string[]
  groups?: { id: string; name: string; admin_id: string } | null
}

interface MyResponse {
  id: string
  selected_slots: string[]
  flexible_times: Record<string, any> | null
  additional_responses: Record<string, boolean> | null
  can_play_twice: boolean | null
  preferred_date: string | null
  submitted_at: string | null
}

// ── Data fetching ────────────────────────────────────────────────────────────

async function fetchPollDetail(pollId: string, userId: string) {
  const { data: poll, error } = await supabase
    .from('polls')
    .select('*, groups:group_id(id, name, admin_id)')
    .eq('id', pollId)
    .single()

  if (error || !poll) throw error ?? new Error('Poll not found')

  const { data: myResponse } = await supabase
    .from('poll_responses')
    .select('id, selected_slots, flexible_times, additional_responses, can_play_twice, preferred_date, submitted_at')
    .eq('poll_id', pollId)
    .eq('user_id', userId)
    .maybeSingle()

  // Check if user is admin of this group
  const { data: memberData } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', poll.group_id)
    .eq('user_id', userId)
    .eq('status', 'approved')
    .maybeSingle()

  const groupAdminId = (poll.groups as any)?.admin_id
  const isAdmin = groupAdminId === userId || memberData?.role === 'admin'

  return {
    poll: poll as Poll,
    myResponse: myResponse as MyResponse | null,
    isAdmin,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDayLabel(weekStartDate: string, dayName: string): string {
  try {
    const d = getSlotDate(weekStartDate, dayName)
    return format(d, 'EEEE d MMMM')
  } catch {
    return dayName
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function AvailabilityPollPage() {
  const { pollId } = useParams<{ pollId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const userId = profile?.id ?? ''

  // ── Query ──
  const { data, isLoading } = useQuery({
    queryKey: ['poll', pollId, userId],
    queryFn: () => fetchPollDetail(pollId!, userId),
    enabled: !!pollId && !!userId,
  })

  // ── Response form state ──
  const [cantDoWeek, setCantDoWeek] = useState(false)
  const [selectedSlots, setSelectedSlots] = useState<string[]>([])
  const [customTimeRanges, setCustomTimeRanges] = useState<Record<string, { start: string; end: string }>>({})
  const [gamesPerWeek, setGamesPerWeek] = useState<'one' | 'two' | 'multiple'>('one')
  const [preferredDate, setPreferredDate] = useState('')
  const [additionalResponses, setAdditionalResponses] = useState<Record<string, boolean>>({})
  const [isEditMode, setIsEditMode] = useState(false)
  const [initialised, setInitialised] = useState(false)

  // ── Post-submit state ──
  const [submitted, setSubmitted] = useState(false)
  const [matchCreated, setMatchCreated] = useState<{ id: string } | null>(null)

  // ── Conflict dialog ──
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [conflictDetails, setConflictDetails] = useState<any[]>([])

  // ── Admin match generation ──
  const [showMatchGen, setShowMatchGen] = useState(false)
  const [matchSchedules, setMatchSchedules] = useState<any[]>([])
  const [matchProfiles, setMatchProfiles] = useState<Record<string, any>>({})
  const [generatingMatches, setGeneratingMatches] = useState(false)
  const [creatingMatches, setCreatingMatches] = useState(false)

  // Populate form from existing response once data loads
  useEffect(() => {
    if (data?.myResponse && !initialised) {
      const r = data.myResponse
      const slots = Array.isArray(r.selected_slots) ? (r.selected_slots as string[]) : []
      setSelectedSlots(slots)
      setCantDoWeek(slots.length === 0 && r.submitted_at != null)

      const customRanges = (r.flexible_times as any)?.custom_time_ranges ?? {}
      setCustomTimeRanges(customRanges)

      if (r.can_play_twice === true) setGamesPerWeek('two')
      else if (r.can_play_twice === null) setGamesPerWeek('multiple')
      else setGamesPerWeek('one')

      setPreferredDate(r.preferred_date ?? '')

      const ar = r.additional_responses ?? {}
      setAdditionalResponses(
        Object.fromEntries(Object.entries(ar).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean>
      )

      setInitialised(true)
    }
  }, [data?.myResponse, initialised])

  // ── Derived values ──
  const poll = data?.poll
  const myResponse = data?.myResponse
  const isAdmin = data?.isAdmin ?? false
  const isClosed = poll ? (isPast(parseISO(poll.closes_at)) || poll.status !== 'open') : false
  const isFormActive = !isClosed && (!myResponse || isEditMode)

  const timeSlots = poll?.time_slots ?? []
  const additionalOptions = poll?.additional_options ?? []

  // Slots grouped by day (order: Mon-Sun)
  const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
  const slotsByDay = useMemo(() => {
    const groups: Record<string, PollSlot[]> = {}
    for (const slot of timeSlots) {
      if (!groups[slot.day]) groups[slot.day] = []
      groups[slot.day].push(slot)
    }
    return groups
  }, [timeSlots])

  const orderedDays = useMemo(() => {
    return DAY_ORDER.filter((d) => slotsByDay[d])
  }, [slotsByDay])

  // Days that appear in the user's selected slots (for Preferred Day dropdown)
  const selectedDays = useMemo(() => {
    return [...new Set(
      selectedSlots.map((id) => timeSlots.find((s) => s.id === id)?.day).filter(Boolean)
    )] as string[]
  }, [selectedSlots, timeSlots])

  // ── Handlers ──
  function toggleSlot(slotId: string) {
    setCantDoWeek(false)
    setSelectedSlots((prev) => {
      const has = prev.includes(slotId)
      if (has) {
        setCustomTimeRanges((r) => { const n = { ...r }; delete n[slotId]; return n })
        return prev.filter((id) => id !== slotId)
      }
      return [...prev, slotId]
    })
  }

  function toggleCantDoWeek() {
    const next = !cantDoWeek
    setCantDoWeek(next)
    if (next) setSelectedSlots([])
  }

  function toggleAdditional(opt: string) {
    setAdditionalResponses((prev) => ({ ...prev, [opt]: !prev[opt] }))
  }

  // ── Conflict check ──
  async function checkHouseholdConflicts(): Promise<any[]> {
    if (!poll || !userId || selectedSlots.length === 0) return []
    try {
      const { data: result } = await supabase.rpc('get_household_conflicts', {
        p_user_id: userId,
        p_slots: selectedSlots,
      })
      return result ?? []
    } catch {
      return []
    }
  }

  // ── Submit ──
  const submitMutation = useMutation({
    mutationFn: async () => {
      const responseData = {
        poll_id: pollId!,
        user_id: userId,
        selected_slots: cantDoWeek ? [] : selectedSlots,
        flexible_times: Object.keys(customTimeRanges).length > 0
          ? { custom_time_ranges: customTimeRanges }
          : {},
        additional_responses: additionalResponses,
        can_play_twice: gamesPerWeek === 'two' ? true : gamesPerWeek === 'multiple' ? null : false,
        preferred_date: preferredDate || null,
        submitted_at: new Date().toISOString(),
      }

      // Upsert: delete existing then insert
      if (myResponse?.id) {
        await supabase.from('poll_responses').delete().eq('id', myResponse.id)
      } else {
        await supabase.from('poll_responses').delete()
          .eq('poll_id', pollId!).eq('user_id', userId)
      }

      const { error } = await supabase.from('poll_responses').insert(responseData)
      if (error) throw error

      // Call auto-match edge function
      let newMatchId: string | null = null
      try {
        const { data: autoMatch } = await supabase.functions.invoke('check-poll-auto-match', {
          body: { poll_id: pollId },
        })
        if (autoMatch?.matches?.length > 0) {
          newMatchId = autoMatch.matches[0].match_id ?? null
        }
      } catch {
        // non-fatal
      }

      return { newMatchId }
    },
    onSuccess: ({ newMatchId }) => {
      setMatchCreated(newMatchId ? { id: newMatchId } : null)
      setSubmitted(true)
      setIsEditMode(false)
      queryClient.invalidateQueries({ queryKey: ['poll', pollId] })
      queryClient.invalidateQueries({ queryKey: ['availability-home'] })
    },
  })

  async function handleSubmit() {
    if (submitMutation.isPending) return
    if (!cantDoWeek && selectedSlots.length === 0) return

    // Household conflict check
    if (!cantDoWeek && selectedSlots.length > 0) {
      const conflicts = await checkHouseholdConflicts()
      if (conflicts.length > 0) {
        setConflictDetails(conflicts)
        setShowConflictDialog(true)
        return
      }
    }

    submitMutation.mutate()
  }

  function proceedDespiteConflicts() {
    setShowConflictDialog(false)
    submitMutation.mutate()
  }

  // ── Admin: generate match options ──
  async function handleGenerateMatches() {
    if (!pollId) return
    setGeneratingMatches(true)
    setShowMatchGen(true)
    setMatchSchedules([])
    try {
      const { data } = await supabase.functions.invoke('generate-match-options', {
        body: { poll_id: pollId, max_options: 4 },
      })
      if (data?.weeklySchedules) {
        setMatchSchedules(data.weeklySchedules)
        setMatchProfiles(data.profiles ?? {})
      }
    } catch (e) {
      console.error('generate-match-options error:', e)
    } finally {
      setGeneratingMatches(false)
    }
  }

  async function handleSelectSchedule(schedule: any) {
    if (!pollId || creatingMatches) return
    setCreatingMatches(true)
    try {
      const matchesToCreate = (schedule.matches ?? []).map((m: any) => {
        const timeToUse = m.actualStartTime ?? m.timeSlot.split('-')[0].trim()
        const matchTime = timeToUse.includes(':') && timeToUse.split(':').length === 2
          ? `${timeToUse}:00`
          : timeToUse
        return {
          poll_id: pollId,
          group_id: poll!.group_id,
          match_date: m.date,
          match_time: matchTime,
          player_ids: Array.isArray(m.playerIds) ? m.playerIds : [m.playerIds],
          status: m.playersNeeded > 0 ? 'pending' : 'scheduled',
          match_type: 'competitive',
          context_type: 'poll',
          created_manually: false,
        }
      })

      const { error } = await supabase.from('matches').insert(matchesToCreate)
      if (error) throw error

      await supabase.from('polls').update({ status: 'processed' }).eq('id', pollId)

      setShowMatchGen(false)
      queryClient.invalidateQueries({ queryKey: ['poll', pollId] })
    } catch (e) {
      console.error('create matches error:', e)
    } finally {
      setCreatingMatches(false)
    }
  }

  // ── Loading / not found ──
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
      </div>
    )
  }

  if (!poll) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-[14px] text-gray-500">Poll not found.</p>
        <button onClick={() => navigate(-1)} className="text-[13px] text-[#009688] font-semibold">Go back</button>
      </div>
    )
  }

  const closesLabel = (() => {
    try {
      if (isPast(parseISO(poll.closes_at))) return 'Closed'
      return `Closes ${format(parseISO(poll.closes_at), 'MMM d, yyyy \'at\' h:mm a')}`
    } catch { return '' }
  })()

  // ── Render ──
  return (
    <div className="min-h-full bg-white pb-40">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-14 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
        >
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[18px] font-bold text-gray-900 leading-tight truncate">{poll.title}</h1>
          <p className="text-[12px] text-gray-400 flex items-center gap-1.5 mt-0.5">
            {poll.groups?.name}
            <span>·</span>
            <Clock className="h-3 w-3" />
            {closesLabel}
          </p>
        </div>
      </div>

      <div className="px-5 space-y-5">

        {/* ── Banners ── */}
        <AnimatePresence>
          {matchCreated && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl bg-green-50 border border-green-200 px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-[13px] font-bold text-green-800">🎾 Match found!</p>
                  <p className="text-[11px] text-green-600">You've been scheduled</p>
                </div>
              </div>
              <button
                onClick={() => navigate(`/matches/${matchCreated.id}`)}
                className="rounded-xl bg-green-600 px-3 py-1.5 text-[12px] font-bold text-white flex-shrink-0"
              >
                View Match
              </button>
            </motion.div>
          )}

          {submitted && !matchCreated && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl bg-teal-50 border border-teal-100 px-4 py-3 flex items-center gap-2"
            >
              <CheckCircle className="h-4 w-4 text-[#009688]" />
              <p className="text-[13px] font-semibold text-teal-800">Availability saved!</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Existing response summary (not in edit mode) ── */}
        {myResponse && !isEditMode && (
          <div className="rounded-2xl bg-teal-50 border border-teal-100 px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-semibold text-teal-800">Your Availability</p>
              {!isClosed && (
                <button
                  onClick={() => setIsEditMode(true)}
                  className="text-[12px] font-semibold text-teal-600 hover:text-teal-700"
                >
                  Edit
                </button>
              )}
            </div>
            {cantDoWeek || myResponse.selected_slots?.length === 0 ? (
              <p className="text-[13px] text-gray-500">Can't make it this week</p>
            ) : (
              <div className="space-y-0.5 text-[13px] text-gray-600">
                {(myResponse.selected_slots ?? []).map((slotId) => {
                  const slot = timeSlots.find((s) => s.id === slotId)
                  if (!slot) return null
                  const customRange = (myResponse.flexible_times as any)?.custom_time_ranges?.[slotId]
                  const timeDisplay = customRange
                    ? `${customRange.start} – ${customRange.end}`
                    : `${slot.start_time} – ${slot.end_time}`
                  return (
                    <div key={slotId}>
                      {getDayLabel(poll.week_start_date, slot.day)} — {timeDisplay}
                    </div>
                  )
                })}
              </div>
            )}
            {Object.entries(myResponse.additional_responses ?? {}).some(([, v]) => v) && (
              <div className="text-[12px] text-teal-600">
                {Object.entries(myResponse.additional_responses ?? {})
                  .filter(([, v]) => v)
                  .map(([opt]) => <div key={opt}>• {opt}</div>)
                }
              </div>
            )}
          </div>
        )}

        {/* ── Admin: closed poll actions ── */}
        {isAdmin && isClosed && !showMatchGen && (
          <div className="rounded-2xl border border-gray-100 px-4 py-4">
            <p className="text-[13px] font-semibold text-gray-700 mb-3">Admin — Poll closed</p>
            <button
              onClick={handleGenerateMatches}
              className="flex items-center gap-2 rounded-xl bg-[#009688] px-4 py-2.5 text-[13px] font-bold text-white"
            >
              <Shuffle className="h-4 w-4" />
              Generate match options
            </button>
          </div>
        )}

        {/* ── Admin: match generation UI ── */}
        {showMatchGen && (
          <div className="rounded-2xl border border-gray-100 px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-bold text-gray-900">Match Options</p>
              <div className="flex items-center gap-2">
                {!generatingMatches && matchSchedules.length > 0 && (
                  <button
                    onClick={handleGenerateMatches}
                    className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-700"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                  </button>
                )}
                <button
                  onClick={() => setShowMatchGen(false)}
                  className="text-[12px] text-gray-400 hover:text-gray-600"
                >
                  Close
                </button>
              </div>
            </div>

            {generatingMatches ? (
              <div className="flex flex-col items-center py-8 gap-3">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
                <p className="text-[13px] text-gray-400">Generating options…</p>
              </div>
            ) : matchSchedules.length > 0 ? (
              <WeeklyScheduleSelector
                weeklySchedules={matchSchedules}
                allProfiles={matchProfiles}
                onSelectSchedule={handleSelectSchedule}
                loading={creatingMatches}
              />
            ) : (
              <p className="text-[13px] text-gray-400 text-center py-4">No match configurations found.</p>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            RESPONSE FORM (only when form is active)
            ══════════════════════════════════════════════ */}
        {isFormActive && (
          <>
            {/* ── Section A: Can't do this week ── */}
            <section>
              <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3">
                Set Your Availability
              </h2>
              <label className="flex items-center gap-3 rounded-2xl border-2 border-red-100 bg-red-50 px-4 py-3.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cantDoWeek}
                  onChange={toggleCantDoWeek}
                  className="h-5 w-5 rounded border-red-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-[14px] font-semibold text-red-700">Can't make it this week</span>
              </label>
            </section>

            {/* ── Section B+C: Time slots + custom time ── */}
            {!cantDoWeek && (
              <section className="space-y-3">
                {timeSlots.length === 0 && (
                  <p className="text-[13px] text-gray-400 text-center py-4">No time slots in this poll.</p>
                )}

                {orderedDays.map((day) => {
                  const daySlots = slotsByDay[day] ?? []
                  const anySelected = daySlots.some((s) => selectedSlots.includes(s.id))
                  const dateLabel = getDayLabel(poll.week_start_date, day)

                  return (
                    <div key={day} className="rounded-2xl border border-gray-100 overflow-hidden">
                      {/* Day header */}
                      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <p className="text-[14px] font-semibold text-gray-900">{dateLabel}</p>
                        {anySelected && (
                          <button
                            onClick={() => daySlots.forEach((s) => {
                              if (selectedSlots.includes(s.id)) toggleSlot(s.id)
                            })}
                            className="text-[12px] font-medium text-red-500 hover:text-red-600"
                          >
                            Can't make this day
                          </button>
                        )}
                        {!anySelected && (
                          <span className="text-[12px] text-gray-400">Tap a slot to select</span>
                        )}
                      </div>

                      {/* Time chips */}
                      <div className="px-4 py-3 flex flex-wrap gap-2">
                        {daySlots.map((slot) => {
                          const isSelected = selectedSlots.includes(slot.id)
                          const period = getTimePeriod(slot.start_time)
                          return (
                            <button
                              key={slot.id}
                              onClick={() => toggleSlot(slot.id)}
                              className={cn(
                                'flex flex-col items-center px-4 py-2.5 rounded-xl border-2 transition-all active:scale-[0.97]',
                                isSelected
                                  ? 'bg-[#009688] border-[#009688] text-white'
                                  : 'bg-white border-gray-200 text-gray-700 hover:border-teal-300'
                              )}
                            >
                              <span className="text-[13px] font-semibold">{period}</span>
                              <span className={cn('text-[11px] mt-0.5', isSelected ? 'text-teal-100' : 'text-gray-400')}>
                                {slot.start_time}–{slot.end_time}
                              </span>
                            </button>
                          )
                        })}
                      </div>

                      {/* Section C: Custom time adjustment for each selected slot in this day */}
                      {daySlots.filter((s) => selectedSlots.includes(s.id)).map((slot) => {
                        const customRange = customTimeRanges[slot.id]
                        const currentStart = customRange?.start ?? slot.start_time
                        const currentEnd = customRange?.end ?? slot.end_time
                        const startOptions = generateHalfHourSlots(slot.start_time, currentEnd)
                        const endOptions = generateHalfHourSlots(currentStart, slot.end_time)

                        return (
                          <div key={`custom-${slot.id}`} className="mx-4 mb-3 rounded-xl bg-teal-50 border border-teal-100 px-4 py-3 space-y-2">
                            <p className="text-[11px] font-semibold text-teal-700 uppercase tracking-wide">
                              Customise your time for {slot.day} (optional)
                            </p>
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <p className="text-[11px] text-gray-500 mb-1">From</p>
                                <select
                                  value={currentStart}
                                  onChange={(e) => setCustomTimeRanges((prev) => ({
                                    ...prev,
                                    [slot.id]: { start: e.target.value, end: currentEnd },
                                  }))}
                                  className="w-full rounded-xl border border-gray-200 px-2 py-2 text-[13px] bg-white outline-none focus:border-[#009688]"
                                >
                                  {startOptions.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              </div>
                              <span className="text-gray-400 text-[13px] pt-5">to</span>
                              <div className="flex-1">
                                <p className="text-[11px] text-gray-500 mb-1">To</p>
                                <select
                                  value={currentEnd}
                                  onChange={(e) => setCustomTimeRanges((prev) => ({
                                    ...prev,
                                    [slot.id]: { start: currentStart, end: e.target.value },
                                  }))}
                                  className="w-full rounded-xl border border-gray-200 px-2 py-2 text-[13px] bg-white outline-none focus:border-[#009688]"
                                >
                                  {endOptions.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </section>
            )}

            {/* ── Section D: Games this week ── */}
            {!cantDoWeek && selectedSlots.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Games This Week</h2>
                  <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">Optional</span>
                </div>
                <div className="space-y-2">
                  {([
                    { value: 'one', title: 'One game only (default)', desc: 'I can play once this week on any of my selected times' },
                    { value: 'two', title: 'Two games if needed', desc: 'I can play up to twice if it helps fill matches' },
                    { value: 'multiple', title: 'Every slot I selected', desc: "I'm happy to play on every time I've marked" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setGamesPerWeek(opt.value)}
                      className={cn(
                        'w-full flex items-start gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition-all active:scale-[0.98]',
                        gamesPerWeek === opt.value ? 'border-[#009688] bg-teal-50/40' : 'border-gray-100 hover:border-gray-200'
                      )}
                    >
                      <div className={cn(
                        'mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                        gamesPerWeek === opt.value ? 'border-[#009688]' : 'border-gray-300'
                      )}>
                        {gamesPerWeek === opt.value && <div className="h-2.5 w-2.5 rounded-full bg-[#009688]" />}
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold text-gray-900">{opt.title}</p>
                        <p className="text-[12px] text-gray-400 mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ── Section E: Preferred day ── */}
            {!cantDoWeek && selectedSlots.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Star className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Preferred Day</h2>
                  <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">Optional</span>
                </div>
                <select
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-[14px] text-gray-900 bg-white outline-none focus:border-[#009688]"
                >
                  <option value="">No preference</option>
                  {selectedDays.map((day) => {
                    const d = getSlotDate(poll.week_start_date, day)
                    const dateStr = format(d, 'yyyy-MM-dd')
                    return (
                      <option key={day} value={dateStr}>
                        {day} ({format(d, 'MMM d')})
                      </option>
                    )
                  })}
                </select>
              </section>
            )}

            {/* ── Section F: Additional options ── */}
            {additionalOptions.length > 0 && !cantDoWeek && selectedSlots.length > 0 && (
              <section>
                <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3">Additional Options</h2>
                <div className="space-y-2">
                  {additionalOptions.map((opt) => (
                    <label
                      key={opt}
                      className="flex items-center gap-3 border border-gray-100 rounded-xl px-4 py-3.5 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={additionalResponses[opt] ?? false}
                        onChange={() => toggleAdditional(opt)}
                        className="h-5 w-5 rounded border-gray-300 text-[#009688] focus:ring-[#009688]"
                      />
                      <span className="text-[14px] font-medium text-gray-900">{opt}</span>
                    </label>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

      </div>

      {/* ── Fixed submit footer ── */}
      {isFormActive && (
        <div
          className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 pt-4"
          style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}
        >
          {submitMutation.isError && (
            <p className="text-[12px] text-red-500 text-center mb-2">Failed to save. Try again.</p>
          )}

          <div className="flex gap-3">
            {myResponse && isEditMode && (
              <button
                onClick={() => setIsEditMode(false)}
                className="flex-1 rounded-2xl border border-gray-200 py-3.5 text-[14px] font-semibold text-gray-700"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={submitMutation.isPending || (!cantDoWeek && selectedSlots.length === 0)}
              className="flex-1 rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
            >
              {submitMutation.isPending
                ? 'Saving…'
                : myResponse && isEditMode
                ? 'Update Availability'
                : 'Set Availability'}
            </button>
          </div>
        </div>
      )}

      {/* ── Section G: Household conflict dialog ── */}
      {showConflictDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl space-y-4"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
              <h3 className="text-[15px] font-bold text-gray-900">Household Conflict</h3>
            </div>
            <p className="text-[13px] text-gray-600">
              Your household partner may also be playing at one of your selected times. Continue anyway?
            </p>
            {conflictDetails.length > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-[12px] text-amber-700">
                {conflictDetails.slice(0, 2).map((c: any, i: number) => (
                  <div key={i}>• {c.description ?? JSON.stringify(c)}</div>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConflictDialog(false)
                }}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-700"
              >
                Remove Conflicts
              </button>
              <button
                onClick={proceedDespiteConflicts}
                className="flex-1 rounded-xl bg-amber-500 py-2.5 text-[13px] font-bold text-white"
              >
                Continue Anyway
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
