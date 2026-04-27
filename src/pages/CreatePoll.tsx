import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Plus, X, Clock, Calendar } from 'lucide-react'
import { format, addHours, startOfWeek, addWeeks } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

interface Group { id: string; name: string }

interface FormSlot {
  id: string
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'
  start_time: string
  end_time: string
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

const DEFAULT_ADDITIONAL_OPTIONS = ["I can drive", "I'm up for a drink after"]

function nextMonday(): string {
  // Start of next week (Monday)
  const d = startOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 })
  return format(d, 'yyyy-MM-dd')
}

function defaultClosesAt(): string {
  return format(addHours(new Date(), 48), "yyyy-MM-dd'T'HH:mm")
}

export function CreatePollPage() {
  const navigate = useNavigate()
  const { profile, user } = useAuth()

  const [groups, setGroups] = useState<Group[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [title, setTitle] = useState("This week's game")
  const [groupId, setGroupId] = useState('')
  const [pollType, setPollType] = useState<'competitive' | 'friendly'>('competitive')
  const [weekStartDate, setWeekStartDate] = useState(nextMonday())
  const [closesAt, setClosesAt] = useState(defaultClosesAt())
  const [recurrence, setRecurrence] = useState<'never' | 'weekly'>('never')
  const [slots, setSlots] = useState<FormSlot[]>([
    { id: crypto.randomUUID(), day: 'Monday', start_time: '19:00', end_time: '21:00' },
  ])
  const [additionalOptions, setAdditionalOptions] = useState<string[]>(DEFAULT_ADDITIONAL_OPTIONS)
  const [customOption, setCustomOption] = useState('')

  useEffect(() => {
    if (!profile?.id) return
    supabase
      .from('group_members')
      .select('group_id, groups:group_id(id, name)')
      .eq('user_id', profile.id)
      .eq('status', 'approved')
      .then(({ data, error }) => {
        if (error) console.error('[create-poll] group_members:', error)
        const g: Group[] = (data ?? [])
          .map((m: any) => Array.isArray(m.groups) ? m.groups[0] : m.groups)
          .filter(Boolean) as Group[]
        setGroups(g)
        if (g.length === 1) setGroupId(g[0].id)
        setGroupsLoading(false)
      })
  }, [profile?.id])

  function addSlot() {
    if (slots.length >= 7) return
    setSlots((prev) => [
      ...prev,
      { id: crypto.randomUUID(), day: 'Monday', start_time: '19:00', end_time: '21:00' },
    ])
  }

  function removeSlot(id: string) {
    setSlots((prev) => prev.filter((s) => s.id !== id))
  }

  function updateSlot(id: string, field: keyof FormSlot, value: string) {
    setSlots((prev) => prev.map((s) => s.id === id ? { ...s, [field]: value } : s))
  }

  function addAdditionalOption() {
    const opt = customOption.trim()
    if (!opt || additionalOptions.includes(opt)) return
    setAdditionalOptions((prev) => [...prev, opt])
    setCustomOption('')
  }

  function removeAdditionalOption(index: number) {
    setAdditionalOptions((prev) => prev.filter((_, i) => i !== index))
  }

  const canSubmit =
    title.trim().length > 0 &&
    groupId !== '' &&
    slots.length > 0 &&
    new Date(closesAt) > new Date()

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('polls')
        .insert({
          group_id: groupId,
          title: title.trim(),
          created_by: user.id,
          status: 'open',
          poll_type: pollType,
          week_start_date: weekStartDate,
          closes_at: new Date(closesAt).toISOString(),
          time_slots: slots.map((s) => ({
            id: s.id,
            day: s.day,
            start_time: s.start_time,
            end_time: s.end_time,
          })),
          additional_options: additionalOptions,
          recurrence_pattern: recurrence,
        })
        .select('id')
        .single()

      if (error) throw error

      // Notify group members
      const { data: members } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('status', 'approved')
        .neq('user_id', user.id)

      if (members?.length) {
        await supabase.from('notifications').insert(
          members.map((m: { user_id: string }) => ({
            user_id: m.user_id,
            type: 'poll_created',
            title: 'Time to set your availability 🎾',
            message: `${profile?.name ?? 'Your admin'} wants to know when you can play.`,
            related_id: data.id,
            read: false,
          }))
        )
      }

      return data
    },
    onSuccess: (data) => {
      navigate(`/play/availability/${data.id}`, { replace: true })
    },
  })

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
        <div>
          <h1 className="text-[18px] font-bold text-gray-900">Create Availability Check</h1>
          <p className="text-[12px] text-gray-400">Ask your group when they can play</p>
        </div>
      </div>

      <div className="px-5 space-y-5">

        {/* Title */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. This week's game"
            style={{ fontSize: '16px' }}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-[#009688] focus:ring-2 focus:ring-[#009688]/20"
          />
        </div>

        {/* Group */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Group</label>
          {groupsLoading ? (
            <div className="h-10 rounded-xl bg-gray-100 animate-pulse" />
          ) : groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-center">
              <p className="text-[13px] font-semibold text-gray-600 mb-1">No groups yet</p>
              <p className="text-[12px] text-gray-400 mb-3">Go to Community to join or create a group first.</p>
              <button
                onClick={() => navigate('/community')}
                className="inline-flex items-center gap-2 rounded-xl bg-[#009688] px-4 py-2.5 text-[13px] font-bold text-white"
              >
                Go to Community
              </button>
            </div>
          ) : groups.length === 1 ? (
            <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5">
              <p className="text-[13px] font-semibold text-teal-800">{groups[0].name}</p>
            </div>
          ) : (
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              style={{ fontSize: '16px' }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-[#009688] bg-white"
            >
              <option value="">Select a group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Poll type */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-700 mb-2">Match type</label>
          <div className="flex gap-2">
            {(['competitive', 'friendly'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setPollType(type)}
                className={cn(
                  'flex-1 rounded-xl border-2 py-2.5 text-[13px] font-semibold capitalize transition-all',
                  pollType === type
                    ? 'border-[#009688] bg-[#009688] text-white'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                )}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Week start date */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
            <Calendar className="inline h-3.5 w-3.5 mr-1 text-gray-400" />
            Week (pick the Monday)
          </label>
          <input
            type="date"
            value={weekStartDate}
            onChange={(e) => setWeekStartDate(e.target.value)}
            style={{ fontSize: '16px' }}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-[#009688] bg-white"
          />
          <p className="text-[11px] text-gray-400 mt-1">Select the Monday of the target week</p>
        </div>

        {/* Time slots */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[13px] font-semibold text-gray-700">
              Time slots
              <span className="ml-1.5 text-[11px] text-gray-400 font-normal">up to 7</span>
            </label>
            {slots.length < 7 && (
              <button
                onClick={addSlot}
                className="flex items-center gap-1 text-[12px] font-semibold text-[#009688]"
              >
                <Plus className="h-3.5 w-3.5" />
                Add slot
              </button>
            )}
          </div>

          <AnimatePresence>
            <div className="space-y-3">
              {slots.map((slot, i) => (
                <motion.div
                  key={slot.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Slot {i + 1}</span>
                    {slots.length > 1 && (
                      <button onClick={() => removeSlot(slot.id)}>
                        <X className="h-4 w-4 text-gray-400 hover:text-red-400" />
                      </button>
                    )}
                  </div>

                  {/* Day picker */}
                  <div className="mb-2">
                    <label className="block text-[11px] text-gray-500 mb-1">Day</label>
                    <select
                      value={slot.day}
                      onChange={(e) => updateSlot(slot.id, 'day', e.target.value)}
                      style={{ fontSize: '16px' }}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 bg-white outline-none focus:border-[#009688]"
                    >
                      {DAYS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  {/* Start / End */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Start
                      </label>
                      <input
                        type="time"
                        value={slot.start_time}
                        step="1800"
                        onChange={(e) => updateSlot(slot.id, 'start_time', e.target.value)}
                        style={{ fontSize: '16px' }}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 bg-white outline-none focus:border-[#009688]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> End
                      </label>
                      <input
                        type="time"
                        value={slot.end_time}
                        step="1800"
                        onChange={(e) => updateSlot(slot.id, 'end_time', e.target.value)}
                        style={{ fontSize: '16px' }}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 bg-white outline-none focus:border-[#009688]"
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        </div>

        {/* Additional options */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-700 mb-2">Additional options</label>
          <p className="text-[11px] text-gray-400 mb-2">Players can tick these when they respond</p>
          <div className="space-y-2 mb-3">
            {additionalOptions.map((opt, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                <span className="text-[13px] text-gray-700">{opt}</span>
                <button onClick={() => removeAdditionalOption(i)}>
                  <X className="h-4 w-4 text-gray-400 hover:text-red-400" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={customOption}
              onChange={(e) => setCustomOption(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addAdditionalOption()}
              placeholder="Add custom option…"
              style={{ fontSize: '16px' }}
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-[#009688]"
            />
            <button
              onClick={addAdditionalOption}
              disabled={!customOption.trim()}
              className="rounded-xl bg-[#009688] px-3 py-2 text-white disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Closes at */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Poll closes at</label>
          <input
            type="datetime-local"
            value={closesAt}
            min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
            onChange={(e) => setClosesAt(e.target.value)}
            style={{ fontSize: '16px' }}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-[#009688]"
          />
        </div>

        {/* Recurrence */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-700 mb-2">Recurrence</label>
          <div className="flex gap-2">
            {(['never', 'weekly'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRecurrence(r)}
                className={cn(
                  'flex-1 rounded-xl border-2 py-2.5 text-[13px] font-semibold capitalize transition-all',
                  recurrence === r
                    ? 'border-[#009688] bg-[#009688] text-white'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                )}
              >
                {r === 'never' ? 'One-off' : 'Weekly'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Fixed footer */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 pt-4"
        style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}
      >
        {createMutation.isError && (
          <p className="text-[12px] text-red-500 text-center mb-2">
            Failed to create poll. Try again.
          </p>
        )}
        <button
          onClick={() => createMutation.mutate()}
          disabled={!canSubmit || createMutation.isPending || groupsLoading}
          className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
        >
          {createMutation.isPending ? 'Creating…' : 'Create & Add My Availability →'}
        </button>
      </div>
    </div>
  )
}
