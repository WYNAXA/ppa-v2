import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, ChevronRight, Clock, Users, CheckCircle } from 'lucide-react'
import { format, parseISO, formatDistanceToNow, isPast } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
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
  created_at: string
  groups?: { id: string; name: string } | null
}

async function fetchAvailabilityHome(userId: string) {
  const { data: memberships, error: membErr } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('profile_id', userId)

  if (membErr) console.error('[availability] group_members:', membErr)

  const groupIds = (memberships ?? []).map((m: { group_id: string }) => m.group_id)
  if (groupIds.length === 0) return { polls: [] as Poll[], responseCounts: {}, myResponses: [] }

  const { data: polls, error: pollsErr } = await supabase
    .from('polls')
    .select('*, groups:group_id(id, name)')
    .in('group_id', groupIds)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(10)

  if (pollsErr) console.error('[availability] polls:', pollsErr)

  const pollList = (polls ?? []) as Poll[]
  const pollIds = pollList.map((p) => p.id)
  if (pollIds.length === 0) return { polls: [] as Poll[], responseCounts: {}, myResponses: [] }

  const { data: allResponses } = await supabase
    .from('poll_responses')
    .select('poll_id, user_id, available_slots')
    .in('poll_id', pollIds)

  const responseCounts: Record<string, number> = {}
  const myResponses: Array<{ poll_id: string; available_slots: string[] }> = []

  for (const r of (allResponses ?? [])) {
    responseCounts[r.poll_id] = (responseCounts[r.poll_id] ?? 0) + 1
    if (r.user_id === userId) {
      myResponses.push({ poll_id: r.poll_id, available_slots: r.available_slots ?? [] })
    }
  }

  return { polls: pollList, responseCounts, myResponses }
}

function closesText(closesAt: string) {
  try {
    if (isPast(parseISO(closesAt))) return 'Closed'
    return `Closes ${formatDistanceToNow(parseISO(closesAt), { addSuffix: true })}`
  } catch { return '' }
}

function formatSlotLabel(slot: PollSlot) {
  try {
    return `${format(parseISO(slot.date), 'EEE d MMM')} · ${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)}`
  } catch { return slot.date }
}

function ActivePollCard({ poll, responseCount, hasResponded, onRespond }: {
  poll: Poll
  responseCount: number
  hasResponded: boolean
  onRespond: () => void
}) {
  const progress = Math.min(responseCount / 4, 1)
  const ready = responseCount >= 4

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-2xl border p-4',
        ready ? 'border-green-200 bg-green-50/40' : 'border-teal-100 bg-teal-50/30'
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-gray-900 leading-tight">{poll.title}</p>
          <p className="text-[12px] text-gray-500 mt-0.5">{poll.groups?.name ?? '—'}</p>
        </div>
        {hasResponded && (
          <span className="flex-shrink-0 text-[10px] font-bold text-teal-700 bg-teal-100 rounded-full px-2 py-0.5">
            Responded ✓
          </span>
        )}
      </div>

      {/* Progress toward 4-player match */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] text-gray-600 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {responseCount} {responseCount === 1 ? 'player' : 'players'} responded
          </span>
          <span className="text-[11px] text-gray-400">{closesText(poll.closes_at)}</span>
        </div>
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <motion.div
            className={cn('h-full rounded-full', ready ? 'bg-green-500' : 'bg-[#009688]')}
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        </div>
        {ready && (
          <p className="text-[11px] text-green-600 font-semibold mt-1 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" /> Match ready — 4 players available!
          </p>
        )}
      </div>

      <button
        onClick={onRespond}
        className={cn(
          'w-full rounded-xl py-2.5 text-[13px] font-bold text-white',
          ready ? 'bg-green-600' : 'bg-[#009688]'
        )}
      >
        {hasResponded ? 'Update my availability' : 'Add my availability →'}
      </button>
    </motion.div>
  )
}

function EmptyPollState({ onStart }: { onStart: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 px-5 py-8 text-center">
      <p className="text-[14px] font-semibold text-gray-500 mb-1">No active availability check</p>
      <p className="text-[12px] text-gray-400 mb-4">Start one for your group to find a game</p>
      <button
        onClick={onStart}
        className="inline-flex items-center gap-2 rounded-xl bg-[#009688] px-4 py-2.5 text-[13px] font-bold text-white"
      >
        <Plus className="h-4 w-4" />
        Start one for your group
      </button>
    </div>
  )
}

export function AvailabilityPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const userId = profile?.id ?? ''

  const { data, isLoading } = useQuery({
    queryKey: ['availability-home', userId],
    queryFn: () => fetchAvailabilityHome(userId),
    enabled: !!userId,
    staleTime: 15_000,
  })

  const polls = data?.polls ?? []
  const responseCounts = data?.responseCounts ?? {}
  const myResponses = data?.myResponses ?? []
  const activePoll = polls[0] ?? null

  // Slots where user is available across all polls
  const myAvailableSlots = polls.flatMap((poll) => {
    const myResp = myResponses.find((r) => r.poll_id === poll.id)
    if (!myResp) return []
    return (poll.options?.slots ?? [])
      .filter((s) => myResp.available_slots.includes(s.id))
      .map((slot) => ({ poll, slot }))
  })

  return (
    <div className="min-h-full bg-white pb-6">
      {/* Header */}
      <div className="px-5 pt-14 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-gray-900">Find My Game</h1>
            <p className="text-[13px] text-gray-500 mt-0.5">Tell us when you can play</p>
          </div>
          <button
            onClick={() => navigate('/play/availability/create')}
            className="h-9 w-9 rounded-full bg-[#009688] flex items-center justify-center shadow-sm"
            aria-label="Create availability poll"
          >
            <Plus className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
        </div>
      ) : (
        <div className="px-5 space-y-6">
          {/* Active poll */}
          <section>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
              Active Availability Check
            </p>
            {activePoll ? (
              <ActivePollCard
                poll={activePoll}
                responseCount={responseCounts[activePoll.id] ?? 0}
                hasResponded={myResponses.some((r) => r.poll_id === activePoll.id)}
                onRespond={() => navigate(`/play/availability/${activePoll.id}`)}
              />
            ) : (
              <EmptyPollState onStart={() => navigate('/play/availability/create')} />
            )}
          </section>

          {/* Other open polls */}
          {polls.length > 1 && (
            <section>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                Other Open Polls
              </p>
              <div className="flex flex-col gap-2">
                {polls.slice(1).map((poll) => (
                  <button
                    key={poll.id}
                    onClick={() => navigate(`/play/availability/${poll.id}`)}
                    className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3 text-left hover:border-teal-200 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-gray-900 truncate">{poll.title}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {poll.groups?.name ?? '—'} · {responseCounts[poll.id] ?? 0} responses
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* My upcoming availability */}
          {myAvailableSlots.length > 0 && (
            <section>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                My Upcoming Availability
              </p>
              <div className="flex flex-col gap-2">
                {myAvailableSlots.map(({ poll, slot }) => (
                  <button
                    key={`${poll.id}-${slot.id}`}
                    onClick={() => navigate(`/play/availability/${poll.id}`)}
                    className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-left hover:border-teal-200 transition-colors"
                  >
                    <div className="h-8 w-8 rounded-full bg-teal-50 flex items-center justify-center flex-shrink-0">
                      <Clock className="h-4 w-4 text-[#009688]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-gray-900">{formatSlotLabel(slot)}</p>
                      <p className="text-[11px] text-gray-400">{poll.title}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Empty state when no groups */}
          {polls.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-[14px] text-gray-500 font-semibold mb-1">No open polls</p>
              <p className="text-[12px] text-gray-400">Join a group or tap + to create one</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
