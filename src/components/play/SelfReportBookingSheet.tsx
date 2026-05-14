import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Venue { venue_id: string; venue_name: string; city?: string | null }

interface SelfReportBookingSheetProps {
  open: boolean
  onClose: () => void
  matchId: string
  playerCount: number
  onSuccess: () => void
}

function useDebounce(value: string, delay: number) {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return dv
}

export function SelfReportBookingSheet({ open, onClose, matchId, playerCount, onSuccess }: SelfReportBookingSheetProps) {
  const [venueQuery, setVenueQuery] = useState('')
  const [venueResults, setVenueResults] = useState<Venue[]>([])
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [manualMode, setManualMode] = useState(false)
  const [manualVenueName, setManualVenueName] = useState('')
  const [courtNumber, setCourtNumber] = useState('')
  const [bookingRef, setBookingRef] = useState('')
  const [totalCostPounds, setTotalCostPounds] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const debouncedQuery = useDebounce(venueQuery, 300)

  useEffect(() => {
    if (debouncedQuery.length < 2) { setVenueResults([]); return }
    supabase
      .from('padel_venues')
      .select('venue_id, venue_name, city')
      .or(`venue_name.ilike.%${debouncedQuery}%,city.ilike.%${debouncedQuery}%`)
      .limit(5)
      .then(({ data }) => setVenueResults(data ?? []))
  }, [debouncedQuery])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setVenueQuery('')
      setVenueResults([])
      setSelectedVenue(null)
      setManualMode(false)
      setManualVenueName('')
      setCourtNumber('')
      setBookingRef('')
      setTotalCostPounds('')
      setError(null)
    }
  }, [open])

  const venueName = manualMode ? manualVenueName : selectedVenue?.venue_name ?? ''
  const venueId = manualMode ? null : selectedVenue?.venue_id ?? null
  const canSubmit = venueName.trim().length > 0

  const totalPence = totalCostPounds ? Math.round(parseFloat(totalCostPounds) * 100) : null
  const perPlayerPounds = totalPence && playerCount > 0
    ? (totalPence / playerCount / 100).toFixed(2)
    : null

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const { error: rpcErr } = await supabase.rpc('self_report_booking', {
      p_match_id: matchId,
      p_venue_id: venueId,
      p_venue_name: venueName.trim(),
      p_court_number: courtNumber ? parseInt(courtNumber) || null : null,
      p_booking_reference: bookingRef.trim() || null,
      p_total_cost_pence: totalPence,
    })
    setSubmitting(false)
    if (rpcErr) {
      setError(rpcErr.message ?? 'Failed to report booking')
      return
    }
    onSuccess()
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl max-h-[85vh] flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
              <h2 className="text-[15px] font-bold text-gray-900">Report a booking</h2>
              <button onClick={onClose} className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="h-4 w-4 text-gray-600" />
              </button>
            </div>
            <div className="px-5 pb-6 overflow-y-auto flex-1" style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}>
              <p className="text-[12px] text-gray-400 mb-4">Already booked elsewhere? Let your teammates know the details.</p>

              {/* Venue */}
              {!selectedVenue && !manualMode ? (
                <div className="mb-4">
                  <label className="text-[12px] font-semibold text-gray-700 block mb-1">Venue</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={venueQuery}
                      onChange={(e) => setVenueQuery(e.target.value)}
                      placeholder="Search venues..."
                      style={{ fontSize: '16px' }}
                      className="w-full rounded-xl border border-gray-200 pl-9 pr-4 py-2.5 outline-none focus:border-teal-500"
                    />
                  </div>
                  {venueResults.length > 0 && (
                    <div className="mt-1 rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                      {venueResults.map((v) => (
                        <button
                          key={v.venue_id}
                          onClick={() => { setSelectedVenue(v); setVenueQuery(''); setVenueResults([]) }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 border-b border-gray-50 last:border-0"
                        >
                          <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                          <div>
                            <p className="text-[13px] font-medium text-gray-800">{v.venue_name}</p>
                            {v.city && <p className="text-[11px] text-gray-400">{v.city}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setManualMode(true)}
                    className="text-[12px] text-[#009688] font-semibold mt-2"
                  >
                    Can't find it? Enter manually
                  </button>
                </div>
              ) : manualMode ? (
                <div className="mb-4">
                  <label className="text-[12px] font-semibold text-gray-700 block mb-1">Venue name</label>
                  <input
                    type="text"
                    value={manualVenueName}
                    onChange={(e) => setManualVenueName(e.target.value)}
                    placeholder="e.g. Padel Zone Dublin"
                    style={{ fontSize: '16px' }}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-teal-500"
                  />
                  <button onClick={() => { setManualMode(false); setManualVenueName('') }} className="text-[12px] text-gray-400 mt-1">
                    Search venues instead
                  </button>
                </div>
              ) : (
                <div className="mb-4 rounded-xl bg-teal-50 border border-teal-100 px-3 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-teal-800">{selectedVenue!.venue_name}</p>
                    {selectedVenue!.city && <p className="text-[11px] text-teal-600">{selectedVenue!.city}</p>}
                  </div>
                  <button onClick={() => setSelectedVenue(null)} className="text-[11px] text-teal-600 font-semibold">Change</button>
                </div>
              )}

              {/* Court number */}
              <div className="mb-4">
                <label className="text-[12px] font-semibold text-gray-700 block mb-1">Court number <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={courtNumber}
                  onChange={(e) => setCourtNumber(e.target.value)}
                  placeholder="e.g. 3"
                  style={{ fontSize: '16px' }}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-teal-500"
                />
              </div>

              {/* Booking reference */}
              <div className="mb-4">
                <label className="text-[12px] font-semibold text-gray-700 block mb-1">Booking reference <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={bookingRef}
                  onChange={(e) => setBookingRef(e.target.value)}
                  placeholder="e.g. PLY-12345"
                  style={{ fontSize: '16px' }}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-teal-500"
                />
              </div>

              {/* Total cost */}
              <div className="mb-5">
                <label className="text-[12px] font-semibold text-gray-700 block mb-1">Total cost <span className="text-gray-400 font-normal">(optional)</span></label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-[14px]">{'\u00A3'}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={totalCostPounds}
                    onChange={(e) => setTotalCostPounds(e.target.value)}
                    placeholder="0.00"
                    style={{ fontSize: '16px' }}
                    className="w-full rounded-xl border border-gray-200 pl-8 pr-4 py-2.5 outline-none focus:border-teal-500"
                  />
                </div>
                {perPlayerPounds && (
                  <p className="text-[11px] text-gray-400 mt-1">= {'\u00A3'}{perPlayerPounds} each for {playerCount} players</p>
                )}
              </div>

              {error && <p className="text-[12px] text-red-500 text-center mb-3">{error}</p>}

              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40"
              >
                {submitting ? 'Saving\u2026' : 'Confirm booking'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
