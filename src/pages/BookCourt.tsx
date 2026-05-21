import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { format, addDays, parseISO } from 'date-fns'
import { useDateLocale, getDateLocale } from '@/lib/dateLocale'
import {
  ChevronLeft, MapPin, Calendar, Clock, Users, CreditCard,
  CheckCircle, Share2, Copy, Search, X, Plus, ChevronRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'
import { calculateDistance, formatDistance, driveMinutes } from '@/lib/travelUtils'

// ── Constants ─────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string)

const MAX_ADVANCE_DAYS = 21
const PPA_EXCLUSIVE_FROM_DAY = 15
const PRICE_PER_PLAYER_PENCE = 900
const TOTAL_PRICE_PENCE = 3600

const PLATFORM_LABELS: Record<string, { label: string; appScheme?: string }> = {
  Playtomic: { label: 'Playtomic', appScheme: 'playtomic://' },
  PadelMates: { label: 'PadelMates', appScheme: 'padelmates://' },
}

// ── Types ─────────────────────────────────────────────────────────────────────

type BookingStep = 'venue' | 'date-slot' | 'players' | 'match-details' | 'payment' | 'confirmation'

interface Venue {
  venue_id: string
  venues_id?: string | null
  venue_name: string
  city?: string | null
  full_address?: string | null
  booking_url?: string | null
  booking_platform?: string | null
  number_of_courts?: number | null
  latitude?: number | null
  longitude?: number | null
  ppa_bookable?: boolean | null
  price_pence?: number | null
  price_per_player_pence?: number | null
  website?: string | null
  phone?: string | null
}

interface TimeSlot {
  start_time: string
  end_time?: string
  available: boolean
  court_id?: string | null
  court_label?: string | null
  price?: number | null
}

type BookingPlayer =
  | { type: 'user'; id: string; name: string; avatar_url?: string | null }
  | { type: 'guest'; id: string; name: string; phone?: string; email?: string }

interface Profile {
  id: string
  name: string
  avatar_url?: string | null
  email?: string | null
}

interface CourtBooking {
  id: string
  booking_reference?: string | null
  venue_id: string
  match_date: string
  start_time: string
  duration_minutes: number
  status: string
  player_ids?: string[]
  guest_players?: BookingPlayer[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return dv
}

function formatSlotTime(timeStr: string): string {
  try {
    if (timeStr.includes('T')) return format(parseISO(timeStr), 'HH:mm', { locale: getDateLocale() })
    return timeStr.slice(0, 5)
  } catch {
    return timeStr
  }
}

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

function openVenueLink(url: string, appScheme?: string) {
  if (appScheme) {
    const t = Date.now()
    window.location.href = appScheme
    setTimeout(() => {
      if (Date.now() - t < 1500) window.open(url, '_blank')
    }, 500)
  } else {
    window.open(url, '_blank')
  }
}

function generateDateRange() {
  const today = new Date()
  return Array.from({ length: MAX_ADVANCE_DAYS }, (_, i) => {
    const d = addDays(today, i + 1)
    return {
      date: format(d, 'yyyy-MM-dd', { locale: getDateLocale() }),
      label: format(d, 'EEE d MMM', { locale: getDateLocale() }),
      dayNum: i + 1,
      isPpaExclusive: i + 1 >= PPA_EXCLUSIVE_FROM_DAY,
    }
  })
}

// ── Step progress indicator ───────────────────────────────────────────────────

const STEPS: { key: BookingStep; label: string }[] = [
  { key: 'venue', label: 'Venue' },
  { key: 'date-slot', label: 'Date' },
  { key: 'players', label: 'Players' },
  { key: 'payment', label: 'Payment' },
]

function StepIndicator({ step }: { step: BookingStep }) {
  const stepIndex = STEPS.findIndex((s) => s.key === step)
  return (
    <div className="flex items-center justify-center gap-1.5 px-5 py-3">
      {STEPS.map((s, i) => {
        const isActive = s.key === step
        const isDone = i < stepIndex
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <div className="flex flex-col items-center gap-0.5">
              <div
                className={cn(
                  'h-2.5 w-2.5 rounded-full transition-all duration-300',
                  isDone
                    ? 'bg-[#009688]'
                    : isActive
                      ? 'bg-[#009688] ring-2 ring-teal-200'
                      : 'bg-gray-200',
                )}
              />
              <span
                className={cn(
                  'text-[9px] font-medium tracking-wide',
                  isActive ? 'text-[#009688]' : isDone ? 'text-teal-500' : 'text-gray-300',
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  'h-px w-6 mb-3 transition-colors duration-300',
                  i < stepIndex ? 'bg-[#009688]' : 'bg-gray-200',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Stripe PaymentForm ────────────────────────────────────────────────────────

interface PaymentFormProps {
  onSuccess: (paymentIntentId: string) => void
  venueName: string
  matchDate: string
  startTime: string
  loading: boolean
  setLoading: (v: boolean) => void
  error: string
  setError: (v: string) => void
}

function PaymentForm({
  onSuccess,
  venueName,
  matchDate,
  startTime,
  loading,
  setLoading,
  error,
  setError,
}: PaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setLoading(true)
    setError('')
    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      })
      if (stripeError) {
        setError(stripeError.message ?? 'Payment failed. Please try again.')
        setLoading(false)
        return
      }
      if (paymentIntent?.status === 'succeeded') {
        onSuccess(paymentIntent.id)
      } else {
        setError('Payment was not completed. Please try again.')
        setLoading(false)
      }
    } catch {
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Summary card */}
      <div className="rounded-2xl bg-teal-50 border border-teal-100 p-4 space-y-2">
        <p className="text-[13px] font-bold text-teal-800">Securing your court at {venueName}</p>
        <div className="flex items-center gap-2 text-teal-700">
          <Calendar className="h-3.5 w-3.5 text-teal-500 flex-shrink-0" />
          <span className="text-[13px]">{matchDate}</span>
          <Clock className="h-3.5 w-3.5 text-teal-500 ml-1 flex-shrink-0" />
          <span className="text-[13px]">{formatSlotTime(startTime)}</span>
        </div>
        <div className="border-t border-teal-100 pt-2">
          <p className="text-[16px] font-bold text-teal-900">
            You pay: {formatPence(PRICE_PER_PLAYER_PENCE)}{' '}
            <span className="text-[12px] font-normal text-teal-600">(your deposit)</span>
          </p>
          <p className="text-[12px] text-teal-600 mt-0.5">
            The remaining {formatPence(TOTAL_PRICE_PENCE - PRICE_PER_PLAYER_PENCE)} is split between
            the other 3 players. They'll be asked to pay 48 hours before the match.
          </p>
        </div>
      </div>

      <PaymentElement />

      {error && <p className="text-[13px] text-red-500 text-center">{error}</p>}

      <button
        type="submit"
        disabled={loading || !stripe || !elements}
        className="w-full rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Processing…
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4" />
            Pay {formatPence(PRICE_PER_PLAYER_PENCE)}
          </>
        )}
      </button>
    </form>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function BookCourtPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const locale = useDateLocale()
  const userId = session?.user?.id ?? ''
  const [params] = useSearchParams()
  const matchId = params.get('match_id') ?? ''

  // ── Step ────────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<BookingStep>('venue')

  // ── Venue step ──────────────────────────────────────────────────────────────
  const [venueQuery, setVenueQuery] = useState('')
  const [venueResults, setVenueResults] = useState<Venue[]>([])
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [nonPpaVenue, setNonPpaVenue] = useState<Venue | null>(null)
  const debouncedVenueQuery = useDebounce(venueQuery, 300)

  // ── Date & slot step ────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedDuration, setSelectedDuration] = useState<number>(90)
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotsError, setSlotsError] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [selectedCourtId, setSelectedCourtId] = useState<string>('')
  const [timePeriod, setTimePeriod] = useState('evening')

  // ── Players step ────────────────────────────────────────────────────────────
  const [selectedPlayers, setSelectedPlayers] = useState<BookingPlayer[]>([])
  const [addingPlayerSlot, setAddingPlayerSlot] = useState<number | null>(null)
  const [addMode, setAddMode] = useState<'search' | 'guest' | 'match' | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [userResults, setUserResults] = useState<Profile[]>([])
  const [guestName, setGuestName] = useState('')
  const [guestContact, setGuestContact] = useState('')
  const debouncedUserSearch = useDebounce(userSearch, 300)

  // ── Payment step ────────────────────────────────────────────────────────────
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [fetchingPayment, setFetchingPayment] = useState(false)

  // ── Match details step (standalone bookings only) ───────────────────────────
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [matchType, setMatchType] = useState<'friendly' | 'casual' | 'competitive'>('casual')
  const [createdMatchId, setCreatedMatchId] = useState<string | null>(null)

  // ── Confirmation ────────────────────────────────────────────────────────────
  const [createdBooking, setCreatedBooking] = useState<CourtBooking | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const dateRange = generateDateRange()

  // ── Queries ─────────────────────────────────────────────────────────────────

  // User's groups (for match-details step in standalone bookings)
  const { data: userGroups = [] } = useQuery({
    queryKey: ['user-groups-for-booking', userId],
    enabled: !!userId && !matchId,
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from('group_members')
        .select('group_id, groups(id, name)')
        .eq('user_id', userId)
        .in('status', ['approved', 'ringer'])
      return (memberships ?? []).map((m: any) => {
        const g = Array.isArray(m.groups) ? m.groups[0] : m.groups
        return { id: g?.id as string, name: g?.name as string }
      }).filter((g: any) => g.id)
    },
  })

  // Pre-select first group when data loads
  useEffect(() => {
    if (userGroups.length > 0 && selectedGroupId === null) {
      setSelectedGroupId(userGroups[0].id)
    }
  }, [userGroups, selectedGroupId])

  const { data: userLocation } = useQuery<{ latitude: number | null; longitude: number | null } | null>({
    queryKey: ['my-location-bookcourt', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('latitude, longitude')
        .eq('id', userId)
        .single()
      return data ?? null
    },
  })

  const { data: myProfile } = useQuery<Profile | null>({
    queryKey: ['my-profile-bookcourt', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, email')
        .eq('id', userId)
        .single()
      return data ?? null
    },
  })

  const { data: matchData } = useQuery({
    queryKey: ['match-for-booking', matchId],
    enabled: !!matchId,
    queryFn: async () => {
      const { data } = await supabase
        .from('matches')
        .select('id, player_ids, match_date, match_time')
        .eq('id', matchId)
        .single()
      return data
    },
  })

  const matchPlayerIds: string[] = matchData?.player_ids ?? []

  const { data: matchProfiles = [] } = useQuery<Profile[]>({
    queryKey: ['match-profiles-booking', matchPlayerIds.join(',')],
    enabled: matchPlayerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, email')
        .in('id', matchPlayerIds)
      return data ?? []
    },
  })

  // ── Effects ─────────────────────────────────────────────────────────────────

  // Init player list: from match if matchId, else current user only
  useEffect(() => {
    if (matchId && matchProfiles.length > 0 && selectedPlayers.length === 0) {
      const players: BookingPlayer[] = matchProfiles.map((p) => ({
        type: 'user' as const,
        id: p.id,
        name: p.name,
        avatar_url: p.avatar_url ?? null,
      }))
      setSelectedPlayers(players)
      return
    }
    if (!matchId && myProfile && selectedPlayers.length === 0) {
      setSelectedPlayers([
        {
          type: 'user',
          id: myProfile.id,
          name: myProfile.name,
          avatar_url: myProfile.avatar_url ?? null,
        },
      ])
    }
  }, [matchId, matchProfiles, myProfile])

  // Venue search
  useEffect(() => {
    if (debouncedVenueQuery.length < 2) {
      setVenueResults([])
      return
    }
    supabase
      .from('padel_venues')
      .select(
        'venue_id, venues_id, venue_name, city, full_address, booking_url, booking_platform, number_of_courts, latitude, longitude, ppa_bookable, price_pence, price_per_player_pence, website, phone',
      )
      .or(`venue_name.ilike.%${debouncedVenueQuery}%,city.ilike.%${debouncedVenueQuery}%`)
      .limit(15)
      .then(({ data }) => {
        const venues: Venue[] = data ?? []
        const uLat = userLocation?.latitude
        const uLng = userLocation?.longitude
        if (uLat && uLng) {
          venues.sort((a, b) => {
            const dA =
              a.latitude && a.longitude
                ? calculateDistance(uLat, uLng, a.latitude, a.longitude)
                : Infinity
            const dB =
              b.latitude && b.longitude
                ? calculateDistance(uLat, uLng, b.latitude, b.longitude)
                : Infinity
            return dA - dB
          })
        }
        setVenueResults(venues)
      })
  }, [debouncedVenueQuery, userLocation])

  // PPA user search
  useEffect(() => {
    if (debouncedUserSearch.length < 2) {
      setUserResults([])
      return
    }
    supabase
      .from('profiles')
      .select('id, name, avatar_url, email')
      .ilike('name', `%${debouncedUserSearch}%`)
      .neq('id', userId)
      .limit(10)
      .then(({ data }) => setUserResults(data ?? []))
  }, [debouncedUserSearch, userId])

  // Fetch slots when date/duration changes + reset period
  useEffect(() => {
    setTimePeriod('evening')
    setSelectedSlot(null)
    if (!selectedDate || !selectedVenue) return
    fetchSlots()
  }, [selectedDate, selectedDuration, selectedVenue?.venue_id])

  // ── Data fetchers ────────────────────────────────────────────────────────────

  async function fetchSlots() {
    if (!selectedVenue || !selectedDate) return
    setLoadingSlots(true)
    setSlotsError('')
    setSlots([])
    setSelectedSlot(null)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-court-availability`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          venue_id: selectedVenue.venues_id ?? selectedVenue.venue_id,
          date: selectedDate,
          duration_minutes: selectedDuration,
        }),
      })
      if (!res.ok) throw new Error('Failed to fetch availability')
      const json = await res.json()
      console.log('[Availability] raw:', JSON.stringify(json).slice(0, 200))
      // The API returns { slots: [{ start_time, end_time, available_courts }] }
      const rawSlots = json.slots ?? json.availableSlots ?? json ?? []
      // Flatten: each slot with available_courts becomes selectable
      const parsed = rawSlots.map((s: any) => ({
        start_time: s.start_time,
        end_time: s.end_time,
        available: true,
        court_id: s.available_courts?.[0]?.id ?? null,
        court_label: s.available_courts?.[0]?.name ?? null,
        courts: s.available_courts ?? [],
        price: null,
      }))
      setSlots(parsed)
    } catch {
      setSlotsError('Could not load availability. Please try another day.')
    } finally {
      setLoadingSlots(false)
    }
  }

  async function initPayment() {
    if (!selectedVenue || !selectedSlot || !userId) return
    setFetchingPayment(true)
    setPaymentError('')
    setClientSecret(null)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-booking-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          amount_pence: PRICE_PER_PLAYER_PENCE,
          booker_id: userId,
          venue_name: selectedVenue.venue_name,
          match_date: selectedDate,
          start_time: selectedSlot.start_time,
        }),
      })
      if (!res.ok) throw new Error('Could not initialise payment')
      const json = await res.json()
      setClientSecret(json.client_secret)
    } catch {
      setPaymentError('Could not start payment. Please try again.')
    } finally {
      setFetchingPayment(false)
    }
  }

  async function handlePaymentSuccess(piId: string) {
    if (!selectedVenue || !selectedSlot) return
    setPaymentLoading(true)
    try {
      const userPlayers = selectedPlayers.filter((p) => p.type === 'user').map((p) => p.id)
      const guestPlayers = selectedPlayers.filter((p) => p.type === 'guest')

      const paymentDeadline = (() => {
        try {
          const dt = new Date(`${selectedDate}T${selectedSlot.start_time}`)
          return new Date(dt.getTime() - 24 * 60 * 60 * 1000).toISOString()
        } catch {
          return null
        }
      })()

      const normalizedStartTime =
        selectedSlot.start_time.length === 5
          ? `${selectedSlot.start_time}:00`
          : selectedSlot.start_time

      const startAt = `${selectedDate}T${normalizedStartTime}+00:00`
      const endAtDate = new Date(startAt)
      endAtDate.setMinutes(endAtDate.getMinutes() + selectedDuration)
      const endAt = endAtDate.toISOString()

      const { data: booking } = await supabase
        .from('court_bookings')
        .insert({
          venue_id: selectedVenue.venue_id,
          court_id: selectedCourtId || null,
          match_id: matchId || null,
          booked_by: userId,
          start_at: startAt,
          end_at: endAt,
          duration_minutes: selectedDuration,
          status: 'confirmed',
          player_ids: userPlayers,
          guest_players: guestPlayers,
          paid_player_ids: [userId],
          total_price_pence: selectedVenue.price_pence ?? TOTAL_PRICE_PENCE,
          price_per_player_pence: selectedVenue.price_per_player_pence ?? PRICE_PER_PLAYER_PENCE,
          booker_stripe_pi_id: piId,
          payment_deadline: paymentDeadline,
        })
        .select()
        .single()

      if (matchId && booking) {
        await supabase
          .from('matches')
          .update({
            booked_venue_name: selectedVenue.venue_name,
            booked_venue_id: selectedVenue.venue_id,
            booked_court_number: null,
            booked_at: new Date().toISOString(),
            booked_by: userId,
            booking_reference: (booking as any).booking_reference ?? null,
            booking_status: 'booked',
          })
          .eq('id', matchId)
      } else if (!matchId && booking) {
        // Standalone booking — create a linked match
        try {
          const { data: newMatch } = await supabase
            .from('matches')
            .insert({
              match_date: selectedDate,
              match_time: normalizedStartTime,
              match_type: matchType,
              status: userPlayers.length >= 4 ? 'scheduled' : 'pending',
              player_ids: userPlayers,
              group_id: selectedGroupId,
              context_type: selectedGroupId ? 'group' : 'open',
              booked_venue_name: selectedVenue.venue_name,
              created_manually: false,
              created_by: userId,
            })
            .select('id')
            .single()

          if (newMatch) {
            await supabase.from('court_bookings')
              .update({ match_id: newMatch.id })
              .eq('id', booking.id)
            setCreatedMatchId(newMatch.id)
          }
        } catch {
          // Booking succeeded but match creation failed — non-fatal
          console.warn('[BookCourt] Match creation failed for standalone booking')
        }
      }

      setCreatedBooking(booking as CourtBooking)
      setStep('confirmation')
    } catch {
      setPaymentError('Payment succeeded but booking creation failed. Please contact support.')
    } finally {
      setPaymentLoading(false)
    }
  }

  // ── Navigation ───────────────────────────────────────────────────────────────

  function goBack() {
    if (step === 'venue') {
      navigate(-1)
    } else if (step === 'date-slot') {
      setStep('venue')
      setSelectedVenue(null)
      setVenueQuery('')
      setVenueResults([])
      setSlots([])
      setSelectedSlot(null)
      setSelectedDate('')
    } else if (step === 'players') {
      setStep('date-slot')
      setSelectedSlot(null)
    } else if (step === 'match-details') {
      setStep('players')
    } else if (step === 'payment') {
      setStep(matchId ? 'players' : 'match-details')
      setClientSecret(null)
    } else if (step === 'confirmation') {
      navigate(matchId ? `/matches/${matchId}` : '/play')
    }
  }

  const stepTitles: Record<BookingStep, string> = {
    venue: 'Find a Venue',
    'date-slot': 'Choose Date & Time',
    players: 'Add Players',
    'match-details': 'Match Details',
    payment: 'Secure Your Court',
    confirmation: 'Booking Confirmed',
  }

  // ── Utility helpers ──────────────────────────────────────────────────────────

  function venueDistance(v: Venue): number | null {
    const uLat = userLocation?.latitude
    const uLng = userLocation?.longitude
    if (!uLat || !uLng || !v.latitude || !v.longitude) return null
    return calculateDistance(uLat, uLng, v.latitude, v.longitude)
  }

  function shareBooking() {
    if (!createdBooking || !selectedVenue || !selectedSlot) return
    const text = [
      `Court booked at ${selectedVenue.venue_name}`,
      `${selectedDate} at ${formatSlotTime(selectedSlot.start_time)}`,
      `Ref: ${createdBooking.booking_reference ?? createdBooking.id}`,
    ].join('\n')
    if (navigator.share) {
      navigator.share({ title: 'Court Booking', text }).catch(() => {})
    } else {
      navigator.clipboard.writeText(text).catch(() => {})
    }
  }

  function waLink(player: BookingPlayer): string {
    if (!createdBooking) return ''
    const url = `${window.location.origin}/pay/booking/${createdBooking.id}/player/${player.id}`
    const text = encodeURIComponent(
      `Hi${player.name ? ` ${player.name}` : ''}! Please pay your £9 court deposit here: ${url}`,
    )
    return `https://wa.me/?text=${text}`
  }

  async function copyPayLink(player: BookingPlayer) {
    if (!createdBooking) return
    const url = `${window.location.origin}/pay/booking/${createdBooking.id}/player/${player.id}`
    await navigator.clipboard.writeText(url).catch(() => {})
    setCopiedId(player.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function closeModal() {
    setAddingPlayerSlot(null)
    setAddMode(null)
    setUserSearch('')
    setGuestName('')
    setGuestContact('')
  }

  function addPlayerToList(player: BookingPlayer) {
    setSelectedPlayers((prev) => {
      const next = [...prev]
      if (addingPlayerSlot !== null && addingPlayerSlot < next.length) {
        next[addingPlayerSlot] = player
      } else {
        next.push(player)
      }
      return next.slice(0, 4)
    })
    closeModal()
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ── Header ── */}
      {step !== 'confirmation' && (
        <div className="flex-shrink-0">
          <div className="flex items-center gap-3 px-5 pt-14 pb-2">
            <button
              onClick={goBack}
              className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
            >
              <ChevronLeft className="h-5 w-5 text-gray-600" />
            </button>
            <h1 className="text-[18px] font-bold text-gray-900">{stepTitles[step]}</h1>
          </div>
          <StepIndicator step={step} />
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto pb-12">
        <AnimatePresence mode="wait">

          {/* ════════════════ STEP 1 — VENUE ════════════════ */}
          {step === 'venue' && (
            <motion.div
              key="venue"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }}
              className="px-5 pt-2 space-y-4"
            >
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  autoFocus
                  type="text"
                  value={venueQuery}
                  onChange={(e) => {
                    setVenueQuery(e.target.value)
                    setNonPpaVenue(null)
                  }}
                  placeholder="Search venues by name or city…"
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 pl-10 pr-10 py-3 text-[15px] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all"
                />
                {venueQuery.length > 0 && (
                  <button
                    onClick={() => {
                      setVenueQuery('')
                      setVenueResults([])
                      setNonPpaVenue(null)
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    <X className="h-4 w-4 text-gray-400" />
                  </button>
                )}
              </div>

              {/* Non-PPA venue notice */}
              <AnimatePresence>
                {nonPpaVenue && (() => {
                  const hasBookingUrl = !!nonPpaVenue.booking_url?.trim()
                  const hasWebsite = !!nonPpaVenue.website?.trim()
                  const hasPhone = !!nonPpaVenue.phone?.trim()
                  const platformLabel = PLATFORM_LABELS[nonPpaVenue.booking_platform ?? '']?.label
                    ?? nonPpaVenue.booking_platform ?? null
                  const appScheme = PLATFORM_LABELS[nonPpaVenue.booking_platform ?? '']?.appScheme

                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="rounded-2xl border border-blue-100 bg-blue-50 p-4"
                    >
                      <p className="text-[14px] font-bold text-blue-800 mb-1">{nonPpaVenue.venue_name}</p>

                      {hasBookingUrl ? (
                        <>
                          <p className="text-[13px] text-blue-600 mb-3">
                            This venue books via <strong>{platformLabel ?? 'external platform'}</strong>.
                            {' '}You'll be taken to their app to complete the booking.
                          </p>
                          <button
                            onClick={() => openVenueLink(nonPpaVenue.booking_url!, appScheme)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-bold text-white"
                          >
                            {platformLabel ? `Open in ${platformLabel}` : 'Book at venue'}
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : hasWebsite ? (
                        <>
                          <p className="text-[13px] text-blue-600 mb-3">
                            This venue doesn't have direct booking integration yet. Visit their website to check availability and book.
                          </p>
                          <button
                            onClick={() => window.open(nonPpaVenue.website!, '_blank')}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-bold text-white"
                          >
                            Visit venue website
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-[13px] text-blue-600 mb-3">
                            No online booking available — contact venue directly.
                          </p>
                          {hasPhone && (
                            <a
                              href={`tel:${nonPpaVenue.phone}`}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-bold text-white"
                            >
                              Call {nonPpaVenue.phone}
                            </a>
                          )}
                        </>
                      )}

                      <button
                        onClick={() => setNonPpaVenue(null)}
                        className="mt-2 block text-[12px] text-blue-400 hover:text-blue-600"
                      >
                        Choose a different venue
                      </button>
                    </motion.div>
                  )
                })()}
              </AnimatePresence>

              {/* Venue results */}
              <AnimatePresence>
                {venueResults.length > 0 && !nonPpaVenue && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="space-y-2"
                  >
                    {venueResults.map((v) => {
                      const dist = venueDistance(v)
                      const isPpa = v.ppa_bookable === true
                      return (
                        <button
                          key={v.venue_id}
                          onClick={() => {
                            if (!isPpa) {
                              setNonPpaVenue(v)
                            } else {
                              setSelectedVenue(v)
                              setVenueQuery(v.venue_name)
                              setVenueResults([])
                              setNonPpaVenue(null)
                              setStep('date-slot')
                            }
                          }}
                          className="w-full text-left rounded-2xl border border-gray-100 bg-white p-4 hover:border-teal-200 hover:bg-teal-50/30 transition-colors shadow-sm active:scale-[0.99]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-[14px] font-bold text-gray-900">{v.venue_name}</p>
                                {isPpa ? (
                                  <span className="text-[10px] font-bold text-teal-700 bg-teal-100 rounded-full px-2 py-0.5 flex-shrink-0">
                                    Book via PPA
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 rounded-full px-2 py-0.5 flex-shrink-0">
                                    {PLATFORM_LABELS[v.booking_platform ?? '']?.label ??
                                      v.booking_platform ??
                                      'External'}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {v.city && (
                                  <span className="flex items-center gap-1 text-[12px] text-gray-500">
                                    <MapPin className="h-3 w-3" />
                                    {v.city}
                                  </span>
                                )}
                                {dist != null && (
                                  <span className="text-[12px] font-semibold text-teal-600">
                                    {formatDistance(dist)} · ~{driveMinutes(dist)} min
                                  </span>
                                )}
                                {v.number_of_courts != null && (
                                  <span className="text-[12px] text-gray-400">
                                    {v.number_of_courts} courts
                                  </span>
                                )}
                              </div>
                              {isPpa && (
                                <p className="text-[11px] text-teal-600 mt-0.5">3 weeks in advance</p>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 mt-1" />
                          </div>
                        </button>
                      )
                    })}
                  </motion.div>
                )}
              </AnimatePresence>

              {venueQuery.length >= 2 && venueResults.length === 0 && !nonPpaVenue && (
                <p className="text-center text-[13px] text-gray-400 py-6">
                  No venues found for "{venueQuery}"
                </p>
              )}

              {venueQuery.length < 2 && !nonPpaVenue && (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <div className="h-14 w-14 rounded-full bg-teal-50 flex items-center justify-center">
                    <MapPin className="h-7 w-7 text-[#009688]" />
                  </div>
                  <p className="text-[14px] font-semibold text-gray-700">Find your court</p>
                  <p className="text-[13px] text-gray-400 max-w-xs">
                    Search by venue name or city. PPA-bookable venues can be reserved directly in the app — up to 3 weeks in advance.
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* ════════════════ STEP 2 — DATE & SLOT ════════════════ */}
          {step === 'date-slot' && (
            <motion.div
              key="date-slot"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }}
              className="px-5 pt-2 space-y-4"
            >
              {/* Selected venue chip */}
              {selectedVenue && (
                <div className="flex items-center gap-2 rounded-2xl border border-teal-100 bg-teal-50 px-4 py-2.5">
                  <MapPin className="h-4 w-4 text-teal-500 flex-shrink-0" />
                  <p className="text-[13px] font-semibold text-teal-800 flex-1 min-w-0 truncate">
                    {selectedVenue.venue_name}
                  </p>
                  {selectedVenue.city && (
                    <span className="text-[12px] text-teal-500 flex-shrink-0">{selectedVenue.city}</span>
                  )}
                </div>
              )}

              {/* PPA advantage banner */}
              <div className="rounded-2xl border border-teal-100 bg-gradient-to-r from-teal-50 to-emerald-50 px-4 py-3">
                <p className="text-[12px] font-bold text-teal-700">
                  PPA Advantage: Book up to 3 weeks in advance
                </p>
                <p className="text-[11px] text-teal-600 mt-0.5">
                  vs. 2 weeks on Playtomic — days 15–21 are PPA exclusive
                </p>
              </div>

              {/* Duration tabs */}
              <div>
                <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                  Duration
                </p>
                <div className="flex gap-2">
                  {[60, 90, 120].map((dur) => (
                    <button
                      key={dur}
                      onClick={() => setSelectedDuration(dur)}
                      className={cn(
                        'flex-1 rounded-xl py-2.5 text-[13px] font-semibold border transition-colors',
                        selectedDuration === dur
                          ? 'bg-[#009688] text-white border-[#009688]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-teal-300',
                      )}
                    >
                      {dur} min
                    </button>
                  ))}
                </div>
              </div>

              {/* Date calendar grid */}
              <div>
                <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-2">Select date</p>
                <div className="grid grid-cols-7 gap-1 text-center mb-1">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                    <span key={d} className="text-[10px] font-semibold text-gray-400">{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {(() => {
                    // Pad start to align with day-of-week
                    const firstDate = dateRange[0]?.date ? new Date(dateRange[0].date + 'T12:00:00') : new Date()
                    const startDow = (firstDate.getDay() + 6) % 7 // Mon=0
                    const pads = Array.from({ length: startDow }, (_, i) => <div key={`pad-${i}`} />)
                    const cells = dateRange.map(({ date, isPpaExclusive }) => {
                      const isSelected = selectedDate === date
                      const d = new Date(date + 'T12:00:00')
                      return (
                        <button
                          key={date}
                          onClick={() => setSelectedDate(date)}
                          className={cn(
                            'h-10 w-full rounded-xl text-[13px] font-semibold transition-all relative',
                            isSelected ? 'bg-[#009688] text-white' : 'bg-white text-gray-800 hover:bg-gray-50',
                            isPpaExclusive && !isSelected && 'bg-teal-50/60',
                          )}
                        >
                          {d.getDate()}
                          {isPpaExclusive && !isSelected && (
                            <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-teal-400" />
                          )}
                        </button>
                      )
                    })
                    return [...pads, ...cells]
                  })()}
                </div>
                {selectedDate && (
                  <p className="text-[12px] text-[#009688] font-semibold mt-2">
                    {format(new Date(selectedDate + 'T12:00:00'), 'EEEE d MMMM yyyy', { locale })}
                    {dateRange.find(d => d.date === selectedDate)?.isPpaExclusive && ' · PPA exclusive'}
                  </p>
                )}
              </div>

              {/* Slots */}
              {selectedDate && (
                <div>
                  <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                    Available Times
                  </p>

                  {loadingSlots && (
                    <div className="flex items-center justify-center py-10 gap-2">
                      <svg
                        className="h-5 w-5 animate-spin text-[#009688]"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z"
                        />
                      </svg>
                      <span className="text-[13px] text-gray-400">Checking availability…</span>
                    </div>
                  )}

                  {slotsError && !loadingSlots && (
                    <p className="text-center text-[13px] text-red-500 py-6">{slotsError}</p>
                  )}

                  {!loadingSlots && !slotsError && slots.length === 0 && (
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 py-8 text-center">
                      <Clock className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-[13px] text-gray-400">
                        No availability for this date — try another day
                      </p>
                    </div>
                  )}

                  {/* Time period filter */}
                  {!loadingSlots && slots.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3">
                      {[
                        { id: 'morning', label: 'Morning', emoji: '🌅', from: 6, to: 12 },
                        { id: 'afternoon', label: 'Afternoon', emoji: '☀️', from: 12, to: 17 },
                        { id: 'evening', label: 'Evening', emoji: '🌆', from: 17, to: 22 },
                      ].filter(p => slots.some(s => { const h = parseInt(s.start_time?.split(':')[0] ?? '0'); return h >= p.from && h < p.to }))
                      .map(p => {
                        const count = slots.filter(s => { const h = parseInt(s.start_time?.split(':')[0] ?? '0'); return h >= p.from && h < p.to }).length
                        return (
                          <button
                            key={p.id}
                            onClick={() => setTimePeriod(p.id)}
                            className={cn(
                              'flex-shrink-0 flex flex-col items-center rounded-xl border-2 px-4 py-2 transition-all min-w-[80px]',
                              timePeriod === p.id ? 'border-[#009688] bg-teal-50 text-[#009688]' : 'border-gray-100 bg-white text-gray-600',
                            )}
                          >
                            <span className="text-[18px]">{p.emoji}</span>
                            <span className="text-[12px] font-semibold mt-0.5">{p.label}</span>
                            <span className="text-[10px] opacity-70">{count} slots</span>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {!loadingSlots && slots.length > 0 && (() => {
                    const period = [
                      { id: 'morning', from: 6, to: 12 },
                      { id: 'afternoon', from: 12, to: 17 },
                      { id: 'evening', from: 17, to: 22 },
                    ].find(p => p.id === timePeriod)
                    const filtered = period
                      ? slots.filter(s => { const h = parseInt(s.start_time?.split(':')[0] ?? '0'); return h >= period.from && h < period.to })
                      : slots
                    return filtered.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {filtered.map((slot, i) => {
                        const priceP =
                          slot.price != null
                            ? slot.price
                            : selectedVenue?.price_pence ?? TOTAL_PRICE_PENCE
                        const pricePerPlayer =
                          selectedVenue?.price_per_player_pence ?? PRICE_PER_PLAYER_PENCE
                        const isSelected = selectedSlot?.start_time === slot.start_time
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              if (!slot.available) return
                              setSelectedSlot(slot)
                              setSelectedCourtId(slot.court_id ?? '')
                            }}
                            disabled={!slot.available}
                            className={cn(
                              'rounded-2xl border p-3 text-left transition-all active:scale-[0.98]',
                              !slot.available
                                ? 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed'
                                : isSelected
                                  ? 'border-[#009688] bg-teal-50 shadow-sm'
                                  : 'border-gray-200 bg-white hover:border-teal-300',
                            )}
                          >
                            <div className="flex items-start justify-between">
                              <p
                                className={cn(
                                  'text-[17px] font-bold',
                                  isSelected ? 'text-[#009688]' : 'text-gray-800',
                                )}
                              >
                                {formatSlotTime(slot.start_time)}
                              </p>
                              {isSelected && (
                                <CheckCircle className="h-4 w-4 text-[#009688] flex-shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[11px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">
                                {selectedDuration} min
                              </span>
                              {slot.court_label && (
                                <span className="text-[11px] text-gray-400">{slot.court_label}</span>
                              )}
                            </div>
                            <p className="text-[12px] font-semibold text-[#009688] mt-1">
                              {formatPence(priceP)} · {formatPence(pricePerPlayer)}/player
                            </p>
                            {!slot.available && (
                              <p className="text-[10px] text-red-400 mt-0.5">Unavailable</p>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    ) : (
                      <div className="rounded-2xl border border-gray-100 bg-gray-50 py-6 text-center">
                        <p className="text-[13px] text-gray-400">No slots for this time period</p>
                        <p className="text-[11px] text-gray-300 mt-1">Try another time of day</p>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Continue CTA */}
              <AnimatePresence>
                {selectedSlot && (
                  <motion.button
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => setStep('players')}
                    className="w-full rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white flex items-center justify-center gap-2"
                  >
                    Continue with {formatSlotTime(selectedSlot.start_time)}
                    <ChevronRight className="h-4 w-4" />
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ════════════════ STEP 3 — PLAYERS ════════════════ */}
          {step === 'players' && (
            <motion.div
              key="players"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }}
              className="px-5 pt-2 space-y-4"
            >
              {/* Booking summary chip */}
              {selectedVenue && selectedSlot && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-800 truncate">
                      {selectedVenue.venue_name}
                    </p>
                    <p className="text-[12px] text-gray-500">
                      {selectedDate} · {formatSlotTime(selectedSlot.start_time)} · {selectedDuration} min
                    </p>
                  </div>
                </div>
              )}

              {matchId ? (
                <div className="rounded-2xl bg-teal-50 border border-teal-200 px-4 py-3">
                  <p className="text-[13px] text-teal-900 font-medium">Players locked from your match</p>
                  <p className="text-[12px] text-teal-800 mt-0.5">To change players, edit them on the match. Updates sync automatically.</p>
                </div>
              ) : (
                <p className="text-[13px] text-gray-500">
                  Fill all 4 player slots, or continue with fewer — open spots can be filled later.
                </p>
              )}

              {/* Player slots */}
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => {
                  const player = selectedPlayers[i]
                  const isBooker = i === 0

                  if (player) {
                    return (
                      <motion.div
                        key={`player-${i}`}
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={cn(
                          'flex items-center gap-3 rounded-2xl border px-4 py-3',
                          isBooker ? 'border-teal-100 bg-teal-50/60' : 'border-gray-100 bg-white',
                        )}
                      >
                        <PlayerAvatar
                          name={player.name}
                          avatarUrl={player.type === 'user' ? player.avatar_url : null}
                          size="md"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-[14px] font-semibold text-gray-800 truncate">
                              {player.name}
                            </p>
                            {isBooker && (
                              <span className="text-[10px] font-bold text-teal-600 bg-teal-100 rounded-full px-1.5 py-0.5 flex-shrink-0">
                                You
                              </span>
                            )}
                            {player.type === 'guest' && (
                              <span className="text-[10px] font-bold text-orange-600 bg-orange-50 rounded-full px-1.5 py-0.5 flex-shrink-0">
                                Guest
                              </span>
                            )}
                          </div>
                          {player.type === 'guest' && (player.phone || player.email) && (
                            <p className="text-[12px] text-gray-400 truncate">
                              {player.phone || player.email}
                            </p>
                          )}
                        </div>
                        {!isBooker && !matchId && (
                          <button
                            onClick={() =>
                              setSelectedPlayers((prev) => prev.filter((_, idx) => idx !== i))
                            }
                            className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
                          >
                            <X className="h-3.5 w-3.5 text-gray-500" />
                          </button>
                        )}
                      </motion.div>
                    )
                  }

                  if (matchId) return null // Match context: don't show empty add slots

                  return (
                    <button
                      key={`slot-${i}`}
                      onClick={() => {
                        setAddingPlayerSlot(i)
                        setAddMode(null)
                      }}
                      className="w-full flex items-center gap-3 rounded-2xl border border-dashed border-gray-200 px-4 py-3 hover:border-teal-300 hover:bg-teal-50/30 transition-colors"
                    >
                      <div className="h-9 w-9 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center flex-shrink-0">
                        <Plus className="h-4 w-4 text-gray-400" />
                      </div>
                      <p className="text-[14px] text-gray-400 font-medium">Add player {i + 1}</p>
                    </button>
                  )
                })}
              </div>

              {/* Price summary */}
              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[14px] font-bold text-gray-800">
                      Total: {formatPence(TOTAL_PRICE_PENCE)}
                    </p>
                    <p className="text-[12px] text-gray-500">
                      You pay {formatPence(PRICE_PER_PLAYER_PENCE)} now as your deposit
                    </p>
                  </div>
                  <Users className="h-5 w-5 text-gray-300" />
                </div>
              </div>

              <button
                onClick={() => {
                  if (matchId) {
                    setStep('payment')
                    initPayment()
                  } else {
                    setStep('match-details')
                  }
                }}
                className="w-full rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white flex items-center justify-center gap-2"
              >
                {matchId ? 'Continue to payment' : 'Next'}
                <ChevronRight className="h-4 w-4" />
              </button>
            </motion.div>
          )}

          {/* ════════════════ STEP 3.5 — MATCH DETAILS (standalone only) ════════════════ */}
          {step === 'match-details' && !matchId && (
            <motion.div
              key="match-details"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              className="space-y-5"
            >
              <p className="text-[13px] text-gray-500 text-center">This booking will create a match so it appears in your match history and rankings.</p>

              {/* Group selector */}
              {userGroups.length > 0 && (
                <div>
                  <label className="text-[13px] font-semibold text-gray-700 block mb-2">Is this match part of a group?</label>
                  <select
                    value={selectedGroupId ?? ''}
                    onChange={(e) => setSelectedGroupId(e.target.value || null)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-800 bg-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="">None — standalone match</option>
                    {userGroups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1">Group matches count toward your group's league points and standings.</p>
                </div>
              )}

              {/* Match type */}
              <div>
                <label className="text-[13px] font-semibold text-gray-700 block mb-2">Match type</label>
                <div className="flex gap-2">
                  {([
                    { value: 'casual' as const, label: 'Casual' },
                    { value: 'friendly' as const, label: 'Friendly' },
                    { value: 'competitive' as const, label: 'Competitive' },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setMatchType(opt.value)}
                      className={cn(
                        'flex-1 rounded-xl py-3 text-[13px] font-semibold border-2 transition-colors',
                        matchType === opt.value
                          ? 'bg-teal-50 border-[#009688] text-[#009688]'
                          : 'border-gray-100 text-gray-500'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Affects how this match impacts your ranking.</p>
              </div>

              <button
                onClick={() => {
                  setStep('payment')
                  initPayment()
                }}
                className="w-full rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white flex items-center justify-center gap-2"
              >
                Continue to payment
                <ChevronRight className="h-4 w-4" />
              </button>
            </motion.div>
          )}

          {/* ════════════════ STEP 4 — PAYMENT ════════════════ */}
          {step === 'payment' && (
            <motion.div
              key="payment"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }}
              className="px-5 pt-2 space-y-4"
            >
              {fetchingPayment && (
                <div className="flex items-center justify-center py-16 gap-2">
                  <svg
                    className="h-5 w-5 animate-spin text-[#009688]"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  <span className="text-[13px] text-gray-400">Preparing payment…</span>
                </div>
              )}

              {paymentError && !fetchingPayment && !clientSecret && (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-5 text-center space-y-3">
                  <p className="text-[13px] text-red-600">{paymentError}</p>
                  <button
                    onClick={initPayment}
                    className="rounded-xl bg-[#009688] px-5 py-2.5 text-[13px] font-bold text-white"
                  >
                    Try again
                  </button>
                </div>
              )}

              {clientSecret && selectedVenue && selectedSlot && !fetchingPayment && (
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret,
                    appearance: {
                      theme: 'stripe',
                      variables: {
                        colorPrimary: '#009688',
                        borderRadius: '12px',
                        fontFamily: 'system-ui, sans-serif',
                      },
                    },
                  }}
                >
                  <PaymentForm
                    onSuccess={handlePaymentSuccess}
                    venueName={selectedVenue.venue_name}
                    matchDate={selectedDate}
                    startTime={selectedSlot.start_time}
                    loading={paymentLoading}
                    setLoading={setPaymentLoading}
                    error={paymentError}
                    setError={setPaymentError}
                  />
                </Elements>
              )}
            </motion.div>
          )}

          {/* ════════════════ STEP 5 — CONFIRMATION ════════════════ */}
          {step === 'confirmation' && (
            <motion.div
              key="confirmation"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="px-5 pt-12 pb-6 space-y-5"
            >
              {/* Success header */}
              <div className="flex flex-col items-center text-center gap-3">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 220, damping: 18 }}
                  className="h-20 w-20 rounded-full bg-teal-50 flex items-center justify-center"
                >
                  <CheckCircle className="h-10 w-10 text-[#009688]" />
                </motion.div>
                <h1 className="text-[26px] font-bold text-gray-900">Court secured! 🎾</h1>
                {selectedVenue && (
                  <p className="text-[16px] font-semibold text-gray-700">{selectedVenue.venue_name}</p>
                )}
                {selectedDate && selectedSlot && (
                  <p className="text-[14px] text-gray-500">
                    {selectedDate} · {formatSlotTime(selectedSlot.start_time)} · {selectedDuration} min
                  </p>
                )}
                {createdBooking?.booking_reference && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-2.5">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">
                      Booking reference
                    </p>
                    <p className="text-[15px] font-bold text-gray-800 font-mono">
                      {createdBooking.booking_reference}
                    </p>
                  </div>
                )}
              </div>

              {/* Player payment status */}
              <div className="rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                    Player payments
                  </p>
                </div>
                <div className="divide-y divide-gray-50">
                  {selectedPlayers.map((player) => {
                    const isBooker = player.id === userId
                    return (
                      <div key={player.id} className="flex items-center gap-3 px-4 py-3">
                        <PlayerAvatar
                          name={player.name}
                          avatarUrl={player.type === 'user' ? player.avatar_url : null}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-[13px] font-semibold text-gray-800 truncate">
                              {player.name}
                            </p>
                            {isBooker && (
                              <span className="text-[10px] font-bold text-teal-600 bg-teal-100 rounded-full px-1.5 py-0.5 flex-shrink-0">
                                You
                              </span>
                            )}
                          </div>
                          <p
                            className={cn(
                              'text-[12px]',
                              isBooker ? 'text-teal-600 font-medium' : 'text-gray-400',
                            )}
                          >
                            {isBooker
                              ? `${formatPence(PRICE_PER_PLAYER_PENCE)} paid`
                              : '⏳ Payment pending — link sent 48hrs before match'}
                          </p>
                        </div>
                        {isBooker && (
                          <CheckCircle className="h-4 w-4 text-teal-500 flex-shrink-0" />
                        )}
                      </div>
                    )
                  })}
                  {selectedPlayers.length < 4 &&
                    Array.from({ length: 4 - selectedPlayers.length }, (_, i) => (
                      <div
                        key={`empty-${i}`}
                        className="flex items-center gap-3 px-4 py-3 opacity-40"
                      >
                        <div className="h-7 w-7 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center flex-shrink-0">
                          <Plus className="h-3 w-3 text-gray-300" />
                        </div>
                        <p className="text-[13px] text-gray-400">Open spot</p>
                      </div>
                    ))}
                </div>
              </div>

              {/* 48hr info */}
              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 flex gap-3">
                <Clock className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-700">
                  Payment links will be sent to all players 48 hours before the match.
                </p>
              </div>

              {/* Share payment links */}
              {createdBooking && selectedPlayers.filter((p) => p.id !== userId).length > 0 && (
                <div className="space-y-2">
                  <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide">
                    Share payment links
                  </p>
                  {selectedPlayers
                    .filter((p) => p.id !== userId)
                    .map((player) => (
                      <div
                        key={player.id}
                        className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3"
                      >
                        <PlayerAvatar
                          name={player.name}
                          avatarUrl={player.type === 'user' ? player.avatar_url : null}
                          size="sm"
                        />
                        <p className="flex-1 text-[13px] font-medium text-gray-700 truncate min-w-0">
                          {player.name}
                        </p>
                        <a
                          href={waLink(player)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 rounded-xl bg-green-500 px-3 py-1.5 text-[12px] font-bold text-white flex-shrink-0"
                        >
                          WhatsApp
                        </a>
                        <button
                          onClick={() => copyPayLink(player)}
                          className="h-8 w-8 rounded-xl border border-gray-200 bg-white flex items-center justify-center flex-shrink-0"
                        >
                          {copiedId === player.id ? (
                            <CheckCircle className="h-3.5 w-3.5 text-teal-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 text-gray-400" />
                          )}
                        </button>
                      </div>
                    ))}
                </div>
              )}

              {/* Action buttons */}
              <button
                onClick={shareBooking}
                className="w-full rounded-2xl border-2 border-[#009688] py-3.5 text-[14px] font-bold text-[#009688] flex items-center justify-center gap-2"
              >
                <Share2 className="h-4 w-4" />
                Share booking
              </button>

              {(matchId || createdMatchId) && (
                <button
                  onClick={() => navigate(`/matches/${matchId || createdMatchId}`)}
                  className="w-full rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white"
                >
                  View match
                </button>
              )}

              <button
                onClick={() => navigate('/play')}
                className={cn(
                  'w-full rounded-2xl py-4 text-[15px] font-bold',
                  matchId || createdMatchId
                    ? 'border-2 border-gray-200 text-gray-600'
                    : 'bg-[#009688] text-white'
                )}
              >
                Back to Play
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ════════════════ ADD PLAYER MODAL ════════════════ */}
      <AnimatePresence>
        {addingPlayerSlot !== null && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="fixed inset-0 bg-black/40 z-[60]"
            />

            {/* Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
              className="fixed bottom-0 left-0 right-0 z-[70] rounded-t-3xl bg-white shadow-2xl max-h-[80vh] flex flex-col"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 88px)' }}
            >
              {/* Handle + title */}
              <div className="flex-shrink-0 px-5 pt-4 pb-3">
                <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-4" />
                <div className="flex items-center justify-between">
                  <p className="text-[17px] font-bold text-gray-900">Add Player</p>
                  <button
                    onClick={closeModal}
                    className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center"
                  >
                    <X className="h-4 w-4 text-gray-500" />
                  </button>
                </div>
              </div>

              {/* ── Mode: choose ── */}
              {addMode === null && (
                <div className="px-5 pb-8 space-y-2 overflow-y-auto">
                  <button
                    onClick={() => setAddMode('search')}
                    className="w-full flex items-center gap-4 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 hover:border-teal-200 hover:bg-teal-50/30 transition-colors"
                  >
                    <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                      <Search className="h-5 w-5 text-teal-600" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-[14px] font-semibold text-gray-800">Search PPA users</p>
                      <p className="text-[12px] text-gray-400">Find players already on PPA</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                  </button>

                  <button
                    onClick={() => setAddMode('guest')}
                    className="w-full flex items-center gap-4 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 hover:border-teal-200 hover:bg-teal-50/30 transition-colors"
                  >
                    <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                      <Users className="h-5 w-5 text-orange-500" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-[14px] font-semibold text-gray-800">Add guest</p>
                      <p className="text-[12px] text-gray-400">Someone not on PPA yet</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                  </button>

                  {matchId && matchProfiles.length > 0 && (
                    <button
                      onClick={() => setAddMode('match')}
                      className="w-full flex items-center gap-4 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 hover:border-teal-200 hover:bg-teal-50/30 transition-colors"
                    >
                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Calendar className="h-5 w-5 text-blue-500" />
                      </div>
                      <div className="text-left flex-1">
                        <p className="text-[14px] font-semibold text-gray-800">Match players</p>
                        <p className="text-[12px] text-gray-400">
                          {matchProfiles.length} players in this match
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                    </button>
                  )}
                </div>
              )}

              {/* ── Mode: search PPA users ── */}
              {addMode === 'search' && (
                <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-3">
                  <button
                    onClick={() => { setAddMode(null); setUserSearch('') }}
                    className="flex items-center gap-1 text-[13px] text-gray-400 hover:text-gray-600"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      autoFocus
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Search by name…"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-2.5 text-[14px] outline-none focus:border-teal-500"
                    />
                  </div>
                  <div className="space-y-1">
                    {userResults
                      .filter((u) => !selectedPlayers.some((p) => p.id === u.id))
                      .map((u) => (
                        <button
                          key={u.id}
                          onClick={() =>
                            addPlayerToList({
                              type: 'user',
                              id: u.id,
                              name: u.name,
                              avatar_url: u.avatar_url ?? null,
                            })
                          }
                          className="w-full flex items-center gap-3 rounded-2xl border border-gray-100 px-4 py-3 hover:border-teal-200 hover:bg-teal-50/30 transition-colors"
                        >
                          <PlayerAvatar name={u.name} avatarUrl={u.avatar_url} size="md" />
                          <p className="flex-1 text-left text-[14px] font-semibold text-gray-800">
                            {u.name}
                          </p>
                          <Plus className="h-4 w-4 text-gray-300" />
                        </button>
                      ))}
                    {userSearch.length >= 2 &&
                      userResults.filter((u) => !selectedPlayers.some((p) => p.id === u.id))
                        .length === 0 && (
                        <p className="text-center text-[13px] text-gray-400 py-4">
                          {userResults.length === 0 ? 'No users found' : 'All matching users already added'}
                        </p>
                      )}
                    {userSearch.length < 2 && (
                      <p className="text-center text-[13px] text-gray-400 py-4">
                        Type at least 2 characters to search
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Mode: add guest ── */}
              {addMode === 'guest' && (
                <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-4">
                  <button
                    onClick={() => setAddMode(null)}
                    className="flex items-center gap-1 text-[13px] text-gray-400 hover:text-gray-600"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
                      Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      autoFocus
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Guest's full name"
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-[14px] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
                      Phone or email <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={guestContact}
                      onChange={(e) => setGuestContact(e.target.value)}
                      placeholder="+44 7700 900000 or guest@email.com"
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-[14px] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                    />
                  </div>
                  <button
                    disabled={!guestName.trim() || !guestContact.trim()}
                    onClick={() => {
                      const isEmail = guestContact.trim().includes('@')
                      addPlayerToList({
                        type: 'guest',
                        id: `guest-${Date.now()}`,
                        name: guestName.trim(),
                        ...(isEmail
                          ? { email: guestContact.trim() }
                          : { phone: guestContact.trim() }),
                      })
                    }}
                    className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40 transition-opacity"
                  >
                    Add guest
                  </button>
                </div>
              )}

              {/* ── Mode: match players ── */}
              {addMode === 'match' && (
                <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-3">
                  <button
                    onClick={() => setAddMode(null)}
                    className="flex items-center gap-1 text-[13px] text-gray-400 hover:text-gray-600"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>
                  <p className="text-[13px] text-gray-500">Tap a player to add them</p>
                  <div className="space-y-1">
                    {matchProfiles
                      .filter(
                        (p) => p.id !== userId && !selectedPlayers.some((sp) => sp.id === p.id),
                      )
                      .map((p) => (
                        <button
                          key={p.id}
                          onClick={() =>
                            addPlayerToList({
                              type: 'user',
                              id: p.id,
                              name: p.name,
                              avatar_url: p.avatar_url ?? null,
                            })
                          }
                          className="w-full flex items-center gap-3 rounded-2xl border border-gray-100 px-4 py-3 hover:border-teal-200 hover:bg-teal-50/30 transition-colors"
                        >
                          <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size="md" />
                          <p className="flex-1 text-left text-[14px] font-semibold text-gray-800">
                            {p.name}
                          </p>
                          <Plus className="h-4 w-4 text-gray-300" />
                        </button>
                      ))}
                    {matchProfiles.filter(
                      (p) => p.id !== userId && !selectedPlayers.some((sp) => sp.id === p.id),
                    ).length === 0 && (
                      <p className="text-center text-[13px] text-gray-400 py-4">
                        All match players already added
                      </p>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
