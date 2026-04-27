import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, MapPin, X, Clock, Calendar, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface Venue { venue_id: string; venue_name: string; city?: string | null; address?: string | null }
interface Court { id: string; court_name: string | null; court_number: number | null }
interface TimeSlot { start_time: string; end_time: string; available: boolean; price?: number | null }

function useDebounce<T>(value: T, delay: number) {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return dv
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

export function BookCourtPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [params] = useSearchParams()

  const matchId  = params.get('match_id') ?? ''
  const matchDate = params.get('date') ?? new Date().toISOString().split('T')[0]
  const matchTime = params.get('time') ?? ''

  const [venueQuery, setVenueQuery]     = useState('')
  const [venueResults, setVenueResults] = useState<Venue[]>([])
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [showVenueList, setShowVenueList] = useState(false)
  const [selectedCourtId, setSelectedCourtId] = useState<string>('')
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [slots, setSlots]               = useState<TimeSlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotsError, setSlotsError]     = useState('')
  const [booking, setBooking]           = useState(false)
  const [bookingError, setBookingError] = useState('')
  const [booked, setBooked]             = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const debouncedQuery = useDebounce(venueQuery, 300)

  // Fetch match summary if navigated from match detail
  const { data: matchSummary } = useQuery({
    queryKey: ['match-summary', matchId],
    queryFn: async () => {
      if (!matchId) return null
      const { data } = await supabase
        .from('matches')
        .select('id, match_date, match_time, player_ids, booked_venue_name')
        .eq('id', matchId)
        .single()
      return data
    },
    enabled: !!matchId,
  })

  // Venue search
  useEffect(() => {
    if (debouncedQuery.length < 2) { setVenueResults([]); return }
    supabase
      .from('padel_venues')
      .select('venue_id, venue_name, city, address')
      .ilike('venue_name', `%${debouncedQuery}%`)
      .limit(8)
      .then(({ data }) => setVenueResults(data ?? []))
  }, [debouncedQuery])

  // Courts for venue
  const { data: courts = [] } = useQuery<Court[]>({
    queryKey: ['courts', selectedVenue?.venue_id],
    queryFn: async () => {
      if (!selectedVenue?.venue_id) return []
      const { data } = await supabase
        .from('courts')
        .select('id, court_name, court_number')
        .eq('venue_id', selectedVenue.venue_id)
        .order('court_number', { ascending: true })
      return data ?? []
    },
    enabled: !!selectedVenue?.venue_id,
  })

  // Fetch availability slots
  async function fetchSlots() {
    if (!selectedVenue) return
    setLoadingSlots(true)
    setSlotsError('')
    setSlots([])
    setSelectedSlot(null)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-court-availability`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          venue_id: selectedVenue.venue_id,
          date: matchDate,
          duration_minutes: 90,
          ...(selectedCourtId ? { court_id: selectedCourtId } : {}),
        }),
      })
      if (!res.ok) throw new Error('Failed to fetch availability')
      const json = await res.json()
      setSlots(json.slots ?? json ?? [])
    } catch {
      setSlotsError('Could not load availability. Please try again.')
    } finally {
      setLoadingSlots(false)
    }
  }

  async function handleBook() {
    if (!selectedVenue || !selectedSlot || !session) return
    setBooking(true)
    setBookingError('')
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-court-booking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          venue_id:         selectedVenue.venue_id,
          court_id:         selectedCourtId || undefined,
          start_time:       selectedSlot.start_time,
          duration_minutes: 90,
          match_id:         matchId || undefined,
          player_ids:       matchSummary?.player_ids ?? [session.user.id],
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Booking failed')

      // Update match with venue + court
      if (matchId) {
        const court = courts.find((c) => c.id === selectedCourtId)
        await supabase.from('matches').update({
          booked_venue_name:   selectedVenue.venue_name,
          booked_court_number: court?.court_number ?? null,
        }).eq('id', matchId)
      }

      if (json.client_secret) {
        setClientSecret(json.client_secret)
      } else {
        setBooked(true)
      }
    } catch (e: unknown) {
      setBookingError(e instanceof Error ? e.message : 'Booking failed. Try again.')
    } finally {
      setBooking(false)
    }
  }

  // Payment handled: mark booked
  function handlePaymentDone() {
    setClientSecret(null)
    setBooked(true)
  }

  if (booked) {
    return (
      <div className="min-h-full bg-white flex flex-col items-center justify-center px-8 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="h-20 w-20 rounded-full bg-teal-50 flex items-center justify-center mb-6"
        >
          <CheckCircle className="h-10 w-10 text-[#009688]" />
        </motion.div>
        <h1 className="text-[22px] font-bold text-gray-900 mb-2">Court Booked!</h1>
        <p className="text-[14px] text-gray-500 mb-1">{selectedVenue?.venue_name}</p>
        {selectedSlot && (
          <p className="text-[13px] text-gray-400 mb-8">
            {formatTime(selectedSlot.start_time)} · 90 minutes
          </p>
        )}
        <button
          onClick={() => matchId ? navigate(`/matches/${matchId}`) : navigate('/play')}
          className="w-full max-w-xs rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white"
        >
          {matchId ? 'Back to Match' : 'Go to Play'}
        </button>
      </div>
    )
  }

  // Stripe payment step
  if (clientSecret) {
    return (
      <div className="min-h-full bg-white flex flex-col items-center justify-center px-8 text-center">
        <p className="text-[16px] font-bold text-gray-900 mb-2">Complete Payment</p>
        <p className="text-[13px] text-gray-500 mb-6">
          Payment flow would embed here using the Stripe SDK with client_secret.
        </p>
        <button
          onClick={handlePaymentDone}
          className="w-full max-w-xs rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white"
        >
          Confirm Payment
        </button>
        <button
          onClick={() => setClientSecret(null)}
          className="mt-3 text-[13px] text-gray-400"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-white pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-14 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
        >
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-[18px] font-bold text-gray-900">Book a Court</h1>
          <p className="text-[12px] text-gray-400">Find and reserve your court</p>
        </div>
      </div>

      <div className="px-5 space-y-5">

        {/* Match summary */}
        {matchSummary && (
          <div className="rounded-2xl bg-teal-50 border border-teal-100 p-4">
            <p className="text-[11px] font-bold text-teal-700 uppercase tracking-wide mb-2">Match Details</p>
            {matchDate && (
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-3.5 w-3.5 text-teal-500" />
                <p className="text-[13px] text-teal-800">{matchDate}</p>
              </div>
            )}
            {matchTime && (
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-teal-500" />
                <p className="text-[13px] text-teal-800">{matchTime.slice(0, 5)}</p>
              </div>
            )}
            <p className="text-[11px] text-teal-600 mt-1.5">{matchSummary.player_ids?.length ?? 0} players</p>
          </div>
        )}

        {/* Venue search */}
        <div>
          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Venue</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={venueQuery}
              onChange={(e) => {
                setVenueQuery(e.target.value)
                setShowVenueList(true)
                if (!e.target.value) { setSelectedVenue(null); setSlots([]); setSelectedCourtId('') }
              }}
              onFocus={() => setShowVenueList(true)}
              placeholder="Search venues…"
              className="w-full rounded-xl border border-gray-200 pl-9 pr-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
            {selectedVenue && (
              <button
                onClick={() => { setVenueQuery(''); setSelectedVenue(null); setSlots([]); setSelectedCourtId('') }}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            )}
          </div>
          <AnimatePresence>
            {showVenueList && venueResults.length > 0 && !selectedVenue && (
              <motion.ul
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-1 w-full rounded-xl border border-gray-100 bg-white shadow-lg max-h-52 overflow-y-auto"
              >
                {venueResults.map((v) => (
                  <li key={v.venue_id}>
                    <button
                      onClick={() => {
                        setSelectedVenue(v)
                        setVenueQuery(v.venue_name)
                        setShowVenueList(false)
                        setSelectedCourtId('')
                        setSlots([])
                        setSelectedSlot(null)
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-teal-50 flex items-start gap-2"
                    >
                      <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[13px] font-semibold text-gray-800">{v.venue_name}</p>
                        {v.city && <p className="text-[11px] text-gray-400">{v.city}</p>}
                      </div>
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>

        {/* Court selector */}
        {selectedVenue && courts.length > 0 && (
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Court (optional)</label>
            <select
              value={selectedCourtId}
              onChange={(e) => { setSelectedCourtId(e.target.value); setSlots([]); setSelectedSlot(null) }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"
            >
              <option value="">Any court</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.court_name ?? `Court ${c.court_number}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Check availability button */}
        {selectedVenue && (
          <button
            onClick={fetchSlots}
            disabled={loadingSlots}
            className="w-full rounded-2xl border-2 border-[#009688] py-3 text-[14px] font-bold text-[#009688] disabled:opacity-50"
          >
            {loadingSlots ? 'Checking…' : 'Check Availability'}
          </button>
        )}

        {slotsError && (
          <p className="text-[12px] text-red-500 text-center">{slotsError}</p>
        )}

        {/* Time slots */}
        {slots.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Available Times</p>
            <div className="grid grid-cols-2 gap-2">
              {slots.map((slot, i) => (
                <button
                  key={i}
                  onClick={() => slot.available && setSelectedSlot(slot)}
                  disabled={!slot.available}
                  className={cn(
                    'rounded-xl border py-3 px-3 text-left transition-colors',
                    !slot.available
                      ? 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed'
                      : selectedSlot?.start_time === slot.start_time
                        ? 'border-[#009688] bg-teal-50'
                        : 'border-gray-200 bg-white hover:border-teal-300'
                  )}
                >
                  <p className="text-[13px] font-semibold text-gray-800">
                    {formatTime(slot.start_time)}
                  </p>
                  <p className="text-[11px] text-gray-400">90 min</p>
                  {slot.price != null && (
                    <p className="text-[11px] font-semibold text-[#009688] mt-0.5">£{slot.price}</p>
                  )}
                  {!slot.available && (
                    <p className="text-[10px] text-red-400 mt-0.5">Unavailable</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Confirm booking */}
        {selectedSlot && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-gray-50 border border-gray-100 p-4"
          >
            <p className="text-[12px] font-bold text-gray-500 uppercase tracking-wide mb-2">Booking Summary</p>
            <p className="text-[14px] font-bold text-gray-900">{selectedVenue?.venue_name}</p>
            <p className="text-[13px] text-gray-600 mt-0.5">
              {matchDate} · {formatTime(selectedSlot.start_time)} – {formatTime(selectedSlot.end_time)}
            </p>
            {selectedCourtId && courts.find((c) => c.id === selectedCourtId) && (
              <p className="text-[12px] text-gray-500 mt-0.5">
                {courts.find((c) => c.id === selectedCourtId)?.court_name ??
                 `Court ${courts.find((c) => c.id === selectedCourtId)?.court_number}`}
              </p>
            )}

            {bookingError && (
              <p className="text-[12px] text-red-500 mt-2">{bookingError}</p>
            )}

            <button
              onClick={handleBook}
              disabled={booking}
              className="mt-4 w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-50"
            >
              {booking ? 'Confirming…' : 'Confirm Booking'}
            </button>
          </motion.div>
        )}

      </div>
    </div>
  )
}
