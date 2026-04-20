import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Plus, X, Clock } from 'lucide-react'
import { format, addHours } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'


interface Group { id: string; name: string }

interface FormSlot {
  id: string
  date: string
  start_time: string
  end_time: string
}

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

function defaultClosesAt() {
  return format(addHours(new Date(), 48), "yyyy-MM-dd'T'HH:mm")
}

export function CreatePollPage() {
  const navigate = useNavigate()
  const { profile, user } = useAuth()

  const [groups, setGroups]           = useState<Group[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [title, setTitle]             = useState("This week's game")
  const [groupId, setGroupId]         = useState('')
  const [closesAt, setClosesAt]       = useState(defaultClosesAt())
  const [notes, setNotes]             = useState('')
  const [slots, setSlots]             = useState<FormSlot[]>([
    { id: crypto.randomUUID(), date: todayStr(), start_time: '19:00', end_time: '21:00' },
  ])

  // Fetch user's groups
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
          .map((m: { groups?: { id: string; name: string } | { id: string; name: string }[] | null }) => Array.isArray(m.groups) ? m.groups[0] : m.groups)
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
      { id: crypto.randomUUID(), date: todayStr(), start_time: '19:00', end_time: '21:00' },
    ])
  }

  function removeSlot(id: string) {
    setSlots((prev) => prev.filter((s) => s.id !== id))
  }

  function updateSlot(id: string, field: keyof FormSlot, value: string) {
    setSlots((prev) => prev.map((s) => s.id === id ? { ...s, [field]: value } : s))
  }

  const canSubmit = title.trim().length > 0 && groupId && slots.length > 0

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('polls')
        .insert({
          group_id: groupId,
          title: title.trim(),
          created_by: user!.id,
          status: 'open',
          closes_at: new Date(closesAt).toISOString(),
          options: { slots: slots.map((s) => ({ id: s.id, date: s.date, start_time: s.start_time, end_time: s.end_time })) },
          notes: notes.trim() || null,
        })
        .select('id')
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      // Go to the poll page to submit own availability right away
      navigate(`/play/availability/${data.id}`, { replace: true })
    },
  })

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
        <div>
          <h1 className="text-[18px] font-bold text-gray-900">Create Availability Check</h1>
          <p className="text-[12px] text-gray-400">Ask your group when they can play</p>
        </div>
      </div>

      <div className="px-5 space-y-5">
        {/* Title */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. This week's game"
            style={{ fontSize: '16px' }}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </div>

        {/* Group selector */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Group</label>
          {groupsLoading ? (
            <div className="h-10 rounded-xl bg-gray-100 animate-pulse" />
          ) : groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-center">
              <p className="text-[13px] font-semibold text-gray-600 mb-1">
                Select a group to share your availability with.
              </p>
              <p className="text-[12px] text-gray-400 mb-3">
                If you're not in a group yet, go to Community to join or create one.
              </p>
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
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 bg-white"
            >
              <option value="">Select a group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Date/time slots */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[13px] font-medium text-gray-700">
              Date & Time Options
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

                  {/* Date */}
                  <div className="mb-2">
                    <label className="block text-[11px] text-gray-500 mb-1">Date</label>
                    <input
                      type="date"
                      value={slot.date}
                      min={todayStr()}
                      onChange={(e) => updateSlot(slot.id, 'date', e.target.value)}
                      style={{ fontSize: '16px' }}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 bg-white outline-none focus:border-teal-500"
                    />
                  </div>

                  {/* Start / End time — stacked full-width */}
                  <div className="flex flex-col gap-2">
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
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 bg-white outline-none focus:border-teal-500"
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
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 bg-white outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        </div>

        {/* Closes at */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
            Poll closes at
          </label>
          <input
            type="datetime-local"
            value={closesAt}
            min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
            onChange={(e) => setClosesAt(e.target.value)}
            style={{ fontSize: '16px' }}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
            Notes <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any context for your group…"
            rows={2}
            style={{ fontSize: '16px' }}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 resize-none"
          />
        </div>
      </div>

      {/* Fixed footer */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 pt-4"
        style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}
      >
        {createMutation.isError && (
          <p className="text-[12px] text-red-500 text-center mb-2">Failed to create poll. Try again.</p>
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
