import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MapPin } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { format, addHours } from 'date-fns'

interface CreateEventSheetProps {
  open: boolean
  onClose: () => void
  groupId: string
}

function todayDateTime() {
  return format(addHours(new Date(), 1), "yyyy-MM-dd'T'HH:mm")
}

export function CreateEventSheet({ open, onClose, groupId }: CreateEventSheetProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [title, setTitle]       = useState('')
  const [startTime, setStartTime] = useState(todayDateTime())
  const [endTime, setEndTime]   = useState(format(addHours(new Date(), 3), "yyyy-MM-dd'T'HH:mm"))
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')

  function reset() {
    setTitle('')
    setStartTime(todayDateTime())
    setEndTime(format(addHours(new Date(), 3), "yyyy-MM-dd'T'HH:mm"))
    setLocation('')
    setDescription('')
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('events')
        .insert({
          group_id:    groupId,
          created_by:  user.id,
          title:       title.trim(),
          start_time:  new Date(startTime).toISOString(),
          end_time:    endTime ? new Date(endTime).toISOString() : null,
          location:    location.trim() || null,
          description: description.trim() || null,
          status:      'published',
        })
      if (error) {
        console.error('[CreateEvent] insert error:', error)
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-events', groupId] })
      reset()
      onClose()
    },
  })

  const canSubmit = title.trim().length > 0 && startTime

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[55] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="h-4 w-4 text-gray-600" />
              </button>
              <h2 className="text-[15px] font-bold text-gray-900">Create Event</h2>
              <div className="w-9" />
            </div>

            <div
              className="px-5 overflow-y-auto space-y-4"
              style={{ maxHeight: '80vh', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
            >
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Title <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Club Tournament"
                  style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Start time</label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  End time <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  Location <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Venue or address"
                    style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
                    className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Details for members…"
                  rows={2}
                  style={{ fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 resize-none"
                />
              </div>

              {createMutation.isError && (
                <p className="text-[12px] text-red-500 text-center">Failed to create event. Try again.</p>
              )}

              <button
                onClick={() => createMutation.mutate()}
                disabled={!canSubmit || createMutation.isPending}
                className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
              >
                {createMutation.isPending ? 'Creating…' : 'Create Event'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
