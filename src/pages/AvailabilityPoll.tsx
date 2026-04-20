import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Users, CheckCircle, Clock, Trophy } from 'lucide-react'
import { format, parseISO, formatDistanceToNow, isPast } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'

interface PollSlot {
  id: string
  date: string
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
  options: { slots: PollSlot[] }
  notes?: string | null
  groups?: { id: string; name: string } | null
}

interface PollResponseRow {
  user_id: string
  available_slots: string[]
}

interface Profile {
  id: string
  name: string
  avatar_url?: string | null
}

type SlotAvailability = 'available' | 'maybe' | 'unavailable'

async function fetchPollDetail(pollId: string, userId: string) {
  const { data: poll, error } = await supabase
    .from('polls')
    .select('*, groups:group_id(id, name)')
    .eq('id', pollId)
    .single()

  if (error || !poll) throw error ?? new Error('Poll not found')

  const { data: responses } = await supabase
    .from('poll_responses')
    .select('user_id, available_slots')
    .eq('poll_id', pollId)

  const responderIds = [...new Set((responses ?? []).map((r) => r.user_id as string))]
  const profileMap: Record<string, Profile> = {}

  if (responderIds.length > 0) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, name, avatar_url')
      .in('id', responderIds)
    for (const p of (profileData ?? [])) {
      profileMap[p.id] = p
    }
  }

  const myResponse = (responses ?? []).find((r) => r.user_id === userId) ?? null

  return {
    poll: poll as Poll,
    responses: (responses ?? []) as PollResponseRow[],
    profiles: profileMap,
    myResponse,
  }
}

export function AvailabilityPollPage() {
  const { pollId } = useParams<{ pollId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const userId = profile?.id ?? ''

  const { data: pollData, isLoading } = useQuery({
    queryKey: ['poll', pollId, userId],
    queryFn: () => fetchPollDetail(pollId!, userId),
    enabled: !!pollId && !!userId,
  })

  // Slot availability state
  const [slotStates, setSlotStates] = useState<Record<string, SlotAvailability>>({})
  const [initialised, setInitialised] = useState(false)

  // Initialise from user's existing response once data loads
  if (pollData && !initialised) {
    const states: Record<string, SlotAvailability> = {}
    const slots = pollData.poll.options?.slots ?? []
    for (const s of slots) {
      states[s.id] = pollData.myResponse?.available_slots?.includes(s.id) ? 'available' : 'unavailable'
    }
    setSlotStates(states)
    setInitialised(true)
  }

  const [submitted, setSubmitted] = useState(false)
  const [matchReady, setMatchReady] = useState(false)
  const [suggestedMatchId, setSuggestedMatchId] = useState<string | null>(null)

  const submitMutation = useMutation({
    mutationFn: async () => {
      const poll = pollData!.poll
      const availableSlotIds = Object.entries(slotStates)
        .filter(([, state]) => state === 'available')
        .map(([id]) => id)

      // Replace existing response
      await supabase
        .from('poll_responses')
        .delete()
        .eq('poll_id', pollId!)
        .eq('user_id', userId)

      const { error } = await supabase
        .from('poll_responses')
        .insert({
          poll_id: pollId!,
          user_id: userId,
          available_slots: availableSlotIds,
          responded_at: new Date().toISOString(),
        })

      if (error) throw error

      // Fetch all responses to check auto-match
      const { data: allResponses } = await supabase
        .from('poll_responses')
        .select('user_id, available_slots')
        .eq('poll_id', pollId!)

      const responseList = (allResponses ?? []) as PollResponseRow[]
      const slots = poll.options?.slots ?? []

      let newMatchId: string | null = null
      let isReady = false

      for (const slot of slots) {
        const ready = responseList.filter((r) =>
          (r.available_slots ?? []).includes(slot.id)
        )
        if (ready.length >= 4) {
          isReady = true

          // Check if a suggested match already exists for this slot
          const { data: existing } = await supabase
            .from('matches')
            .select('id')
            .eq('group_id', poll.group_id)
            .eq('match_date', slot.date)
            .eq('context_type', 'poll')
            .eq('status', 'suggested')
            .maybeSingle()

          if (!existing) {
            const playerIds = ready.map((r) => r.user_id).slice(0, 4)
            const { data: newMatch } = await supabase
              .from('matches')
              .insert({
                match_date: slot.date,
                match_time: slot.start_time,
                context_type: 'poll',
                match_type: 'casual',
                status: 'suggested',
                player_ids: playerIds,
                group_id: poll.group_id,
                created_manually: false,
              })
              .select('id')
              .single()

            if (newMatch) newMatchId = newMatch.id
          } else {
            newMatchId = existing.id
          }

          break
        }
      }

      return { isReady, newMatchId }
    },
    onSuccess: ({ isReady, newMatchId }) => {
      setMatchReady(isReady)
      setSuggestedMatchId(newMatchId)
      setSubmitted(true)
      queryClient.invalidateQueries({ queryKey: ['poll', pollId] })
      queryClient.invalidateQueries({ queryKey: ['availability-home'] })
    },
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
      </div>
    )
  }

  if (!pollData) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-[14px] text-gray-500">Poll not found.</p>
        <button onClick={() => navigate(-1)} className="text-[13px] text-[#009688] font-semibold">Go back</button>
      </div>
    )
  }

  const { poll, responses, profiles } = pollData
  const slots = poll.options?.slots ?? []
  const isClosed = isPast(parseISO(poll.closes_at)) || poll.status !== 'open'
  const closesLabel = (() => {
    try {
      if (isPast(parseISO(poll.closes_at))) return 'Closed'
      return `Closes ${formatDistanceToNow(parseISO(poll.closes_at), { addSuffix: true })}`
    } catch { return '' }
  })()

  function toggleSlot(slotId: string, next: SlotAvailability) {
    setSlotStates((prev) => ({ ...prev, [slotId]: prev[slotId] === next ? 'unavailable' : next }))
  }

  // Slot card border/bg based on count and user's own selection
  function slotCardClass(slotId: string, count: number) {
    const myState = slotStates[slotId]
    if (count >= 4) return 'border-green-300 bg-green-50/40'
    if (myState === 'available') return 'border-teal-300 bg-teal-50/30'
    if (myState === 'maybe') return 'border-yellow-300 bg-yellow-50/20'
    return 'border-gray-100 bg-white'
  }

  return (
    <div className="min-h-full bg-white pb-32">
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
          <p className="text-[12px] text-gray-400">
            {poll.groups?.name ?? '—'} · {closesLabel}
          </p>
        </div>
      </div>

      {/* Match ready banner */}
      <AnimatePresence>
        {matchReady && submitted && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-5 mb-4 rounded-2xl bg-green-50 border border-green-200 px-4 py-3 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-[13px] font-bold text-green-800">Match ready!</p>
                <p className="text-[11px] text-green-600">4 players found for a slot</p>
              </div>
            </div>
            {suggestedMatchId && (
              <button
                onClick={() => navigate(`/matches/${suggestedMatchId}`)}
                className="rounded-xl bg-green-600 px-3 py-1.5 text-[12px] font-bold text-white flex-shrink-0 flex items-center gap-1"
              >
                <Trophy className="h-3.5 w-3.5" />
                View Match
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success state */}
      <AnimatePresence>
        {submitted && !matchReady && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-5 mb-4 rounded-2xl bg-teal-50 border border-teal-100 px-4 py-3 flex items-center gap-2"
          >
            <CheckCircle className="h-4 w-4 text-[#009688]" />
            <p className="text-[13px] font-semibold text-teal-800">Availability saved!</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtitle */}
      <div className="px-5 mb-4">
        <p className="text-[13px] text-gray-500">Select the slots you're available for. We'll match you when 4 players align.</p>
        {poll.notes && (
          <p className="text-[12px] text-gray-400 italic mt-1.5">{poll.notes}</p>
        )}
      </div>

      {/* Response summary */}
      <div className="px-5 mb-4">
        <div className="flex items-center gap-1.5 text-[12px] text-gray-500">
          <Users className="h-3.5 w-3.5" />
          <span>{responses.length} {responses.length === 1 ? 'player' : 'players'} responded so far</span>
        </div>
      </div>

      {/* Slots */}
      <div className="px-5 space-y-3">
        {slots.map((slot, i) => {
          const available = responses.filter((r) => (r.available_slots ?? []).includes(slot.id))
          const count = available.length
          const myState = slotStates[slot.id] ?? 'unavailable'

          return (
            <motion.div
              key={slot.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={cn('rounded-2xl border px-4 py-3.5 transition-colors', slotCardClass(slot.id, count))}
            >
              {/* Slot header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-[14px] font-bold text-gray-900">
                    {(() => { try { return format(parseISO(slot.date), 'EEEE, d MMMM') } catch { return slot.date } })()}
                  </p>
                  <p className="text-[12px] text-gray-500 flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
                  </p>
                </div>

                {/* Avatars + count */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {count > 0 && (
                    <div className="flex -space-x-1.5">
                      {available.slice(0, 3).map((r) => {
                        const p = profiles[r.user_id]
                        return (
                          <PlayerAvatar key={r.user_id} name={p?.name ?? null} avatarUrl={p?.avatar_url} size="sm" />
                        )
                      })}
                    </div>
                  )}
                  <span className={cn(
                    'text-[12px] font-bold',
                    count >= 4 ? 'text-green-600' : count > 0 ? 'text-[#009688]' : 'text-gray-400'
                  )}>
                    {count}/4
                  </span>
                </div>
              </div>

              {/* Match ready indicator */}
              {count >= 4 && (
                <div className="flex items-center gap-1.5 mb-3 text-green-600 text-[11px] font-semibold">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Match ready for this slot!
                </div>
              )}

              {/* Toggle buttons */}
              {!isClosed ? (
                <div className="flex gap-2">
                  {(['available', 'maybe', 'unavailable'] as SlotAvailability[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleSlot(slot.id, s)}
                      className={cn(
                        'flex-1 rounded-xl py-2 text-[11px] font-semibold border transition-all',
                        myState === s
                          ? s === 'available' ? 'bg-[#009688] text-white border-[#009688]'
                            : s === 'maybe'    ? 'bg-yellow-500 text-white border-yellow-500'
                            : 'bg-gray-300 text-gray-700 border-gray-300'
                          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                      )}
                    >
                      {s === 'available' ? '✓ Yes' : s === 'maybe' ? '? Maybe' : '✗ No'}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 italic">Poll closed</p>
              )}
            </motion.div>
          )
        })}

        {slots.length === 0 && (
          <p className="text-[13px] text-gray-400 text-center py-8">No time slots in this poll.</p>
        )}
      </div>

      {/* Fixed submit footer */}
      {!isClosed && (
        <div
          className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 pt-4"
          style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}
        >
          {submitMutation.isError && (
            <p className="text-[12px] text-red-500 text-center mb-2">Failed to save. Try again.</p>
          )}
          <button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || slots.length === 0}
            className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
          >
            {submitMutation.isPending
              ? 'Saving…'
              : submitted
              ? 'Update Availability'
              : 'Submit Availability'}
          </button>
        </div>
      )}
    </div>
  )
}
