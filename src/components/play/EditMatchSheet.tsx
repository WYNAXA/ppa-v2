import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MapPin } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Match } from '@/lib/types'

interface Venue { venue_id: string; venue_name: string; city?: string | null }

function useDebounce<T>(value: T, delay: number) {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return dv
}

interface EditMatchSheetProps {
  open: boolean
  onClose: () => void
  match: Match
}

export function EditMatchSheet({ open, onClose, match }: EditMatchSheetProps) {
  const [date, setDate]           = useState(match.match_date)
  const [time, setTime]           = useState(match.match_time?.slice(0, 5) ?? '')
  const [venueQuery, setVenueQuery] = useState(match.booked_venue_name ?? '')
  const [venues, setVenues]       = useState<Venue[]>([])
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(
    match.booked_venue_name ? { venue_id: '', venue_name: match.booked_venue_name } : null
  )
  const [showVenues, setShowVenues] = useState(false)
  const [notes, setNotes]         = useState(match.notes ?? '')
  const debouncedQuery = useDebounce(venueQuery, 280)
  const queryClient = useQueryClient()

  // Reset fields when sheet opens
  useEffect(() => {
    if (open) {
      setDate(match.match_date)
      setTime(match.match_time?.slice(0, 5) ?? '')
      setVenueQuery(match.booked_venue_name ?? '')
      setSelectedVenue(match.booked_venue_name ? { venue_id: '', venue_name: match.booked_venue_name } : null)
      setNotes(match.notes ?? '')
      setVenues([])
    }
  }, [open, match])

  useEffect(() => {
    if (debouncedQuery.length < 2) { setVenues([]); return }
    supabase
      .from('padel_venues')
      .select('venue_id, venue_name, city')
      .ilike('venue_name', `%${debouncedQuery}%`)
      .limit(6)
      .then(({ data, error }) => {
        console.log('[venue search edit]', debouncedQuery, { data, error })
        if (data) setVenues(data)
      })
  }, [debouncedQuery])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('matches')
        .update({
          match_date: date,
          match_time: time || null,
          booked_venue_name: selectedVenue?.venue_name ?? null,
          notes: notes || null,
        })
        .eq('id', match.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', match.id] })
      onClose()
    },
  })

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
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3">
              <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="h-4 w-4 text-gray-600" />
              </button>
              <h2 className="text-[15px] font-bold text-gray-900">Edit Match</h2>
              <div className="w-9" />
            </div>

            <div
              className="px-5 overflow-y-auto"
              style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))', maxHeight: '80vh' }}
            >
              <div className="space-y-4 pb-2">
                {/* Date */}
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>

                {/* Time */}
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Time</label>
                  <input
                    type="time"
                    value={time}
                    step="1800"
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>

                {/* Venue */}
                <div className="relative">
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                    Venue <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={venueQuery}
                      onChange={(e) => {
                        setVenueQuery(e.target.value)
                        setShowVenues(true)
                        if (!e.target.value) setSelectedVenue(null)
                      }}
                      onFocus={() => setShowVenues(true)}
                      placeholder="Search venues…"
                      className="w-full rounded-xl border border-gray-200 pl-9 pr-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                    />
                    {selectedVenue && (
                      <button
                        onClick={() => { setVenueQuery(''); setSelectedVenue(null) }}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                      >
                        <X className="h-4 w-4 text-gray-400" />
                      </button>
                    )}
                  </div>
                  <AnimatePresence>
                    {showVenues && venues.length > 0 && !selectedVenue && (
                      <motion.ul
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="absolute z-50 mt-1 w-full rounded-xl border border-gray-100 bg-white shadow-lg max-h-48 overflow-y-auto"
                      >
                        {venues.map((v) => (
                          <li key={v.venue_id}>
                            <button
                              onClick={() => { setSelectedVenue(v); setVenueQuery(v.venue_name); setShowVenues(false) }}
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-teal-50 flex items-center gap-2"
                            >
                              <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                              <span className="font-medium text-gray-800">{v.venue_name}</span>
                              {v.city && <span className="text-gray-400 text-[12px]">{v.city}</span>}
                            </button>
                          </li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                    Notes <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any details for the players…"
                    rows={2}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 resize-none"
                  />
                </div>

                {saveMutation.isError && (
                  <p className="text-[12px] text-red-500 text-center">Failed to save. Try again.</p>
                )}

                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !date}
                  className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
                >
                  {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
