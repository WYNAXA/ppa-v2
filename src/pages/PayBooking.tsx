import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { format, parseISO } from 'date-fns'
import { getDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'

// ── Env vars ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string)

// ── Types ─────────────────────────────────────────────────────────────────────

interface GuestPlayer {
  id: string
  name: string
  phone?: string
  email?: string
}

interface CourtBooking {
  id: string
  booking_reference: string
  venue_id: string
  match_date: string
  start_time: string
  duration_minutes: number | null
  player_ids: string[] | null
  guest_players: GuestPlayer[] | null
  paid_player_ids: string[] | null
  price_per_player_pence: number
}

interface PadelVenue {
  venue_id: string
  venue_name: string
  city: string | null
  full_address: string | null
}

// ── Payment form ──────────────────────────────────────────────────────────────

interface PaymentFormProps {
  bookingId: string
  playerId: string
  playerName: string
  isGuest: boolean
  booking: CourtBooking
  venueName: string
  onSuccess: () => void
}

function PaymentForm({
  bookingId,
  playerId,
  playerName: _playerName,
  isGuest: _isGuest,
  booking,
  venueName: _venueName,
  onSuccess,
}: PaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setSubmitting(true)
    setError(null)

    try {
      const { error: submitError } = await elements.submit()
      if (submitError) {
        setError(submitError.message ?? 'Payment failed')
        setSubmitting(false)
        return
      }

      // Confirm the payment using the clientSecret already loaded into Elements
      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      })

      if (confirmError) {
        setError(confirmError.message ?? 'Payment failed')
        setSubmitting(false)
        return
      }

      // Update paid_player_ids in court_bookings
      const { data: freshBooking } = await supabase
        .from('court_bookings')
        .select('paid_player_ids')
        .eq('id', bookingId)
        .single()

      await supabase
        .from('court_bookings')
        .update({
          paid_player_ids: [...((freshBooking?.paid_player_ids as string[] | null) ?? []), playerId],
        })
        .eq('id', bookingId)

      onSuccess()
    } catch (err) {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  const amountGBP = (booking.price_per_player_pence / 100).toFixed(2)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && (
        <p className="text-[13px] text-red-500 text-center">{error}</p>
      )}
      <button
        type="submit"
        disabled={!stripe || !elements || submitting}
        className="w-full rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white disabled:opacity-50 transition-opacity"
      >
        {submitting ? 'Processing…' : `Pay £${amountGBP}`}
      </button>
    </form>
  )
}

// ── Success screen ────────────────────────────────────────────────────────────

function SuccessScreen() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
      <div className="text-[64px] mb-4">🎾</div>
      <h1 className="text-[24px] font-black text-gray-900 mb-2">Payment confirmed!</h1>
      <p className="text-[15px] text-gray-500 mb-10">See you on court</p>

      <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-gray-50 p-5">
        <p className="text-[13px] font-bold text-gray-700 mb-2">Want to track your stats?</p>
        <p className="text-[12px] text-gray-500 mb-4">Download PPA to log your matches, track your ELO and find games near you.</p>
        <div className="flex flex-col gap-2">
          <a
            href="https://apps.apple.com/app/ppa"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-xl bg-gray-900 py-3 text-[13px] font-bold text-white text-center"
          >
            Download on the App Store
          </a>
          <a
            href="https://play.google.com/store/apps/ppa"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-xl border border-gray-200 py-3 text-[13px] font-bold text-gray-700 text-center"
          >
            Get it on Google Play
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PayBookingPage() {
  const { bookingId, playerId } = useParams<{ bookingId: string; playerId: string }>()

  const [booking, setBooking] = useState<CourtBooking | null>(null)
  const [venue, setVenue] = useState<PadelVenue | null>(null)
  const [playerName, setPlayerName] = useState<string>('')
  const [isGuest, setIsGuest] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [alreadyPaid, setAlreadyPaid] = useState(false)
  const [succeeded, setSucceeded] = useState(false)
  const [creatingIntent, setCreatingIntent] = useState(false)

  useEffect(() => {
    if (!bookingId || !playerId) {
      setError('Invalid link.')
      setLoading(false)
      return
    }

    async function load() {
      try {
        // 1. Fetch booking
        const { data: b, error: bErr } = await supabase
          .from('court_bookings')
          .select(
            'id, booking_reference, venue_id, match_date, start_time, duration_minutes, player_ids, guest_players, paid_player_ids, price_per_player_pence'
          )
          .eq('id', bookingId)
          .single()

        if (bErr || !b) {
          setError('Booking not found.')
          setLoading(false)
          return
        }

        setBooking(b as CourtBooking)

        // 2. Check if already paid
        const paidIds = (b.paid_player_ids as string[] | null) ?? []
        if (paidIds.includes(playerId!)) {
          setAlreadyPaid(true)
          setLoading(false)
          return
        }

        // 3. Determine player identity
        const playerIds = (b.player_ids as string[] | null) ?? []
        const guestPlayers = (b.guest_players as GuestPlayer[] | null) ?? []

        let resolvedName = ''
        let resolvedIsGuest = false

        if (playerIds.includes(playerId!)) {
          // PPA user — fetch their name
          const { data: profile } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', playerId)
            .single()
          resolvedName = profile?.name ?? 'Player'
          resolvedIsGuest = false
        } else {
          const guest = guestPlayers.find((g) => g.id === playerId)
          if (guest) {
            resolvedName = guest.name
            resolvedIsGuest = true
          } else {
            setError('Player not found on this booking.')
            setLoading(false)
            return
          }
        }

        setPlayerName(resolvedName)
        setIsGuest(resolvedIsGuest)

        // 4. Fetch venue
        const { data: v } = await supabase
          .from('padel_venues')
          .select('venue_id, venue_name, city, full_address')
          .eq('venue_id', b.venue_id)
          .single()

        setVenue(v as PadelVenue | null)

        // 5. Create payment intent via edge function
        setCreatingIntent(true)
        const res = await fetch(`${SUPABASE_URL}/functions/v1/create-booking-payment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            amount_pence: b.price_per_player_pence,
            player_id: playerId,
            booking_id: bookingId,
            venue_name: v?.venue_name ?? 'Padel Court',
            match_date: b.match_date,
            start_time: b.start_time,
            ...(resolvedIsGuest ? { guest_name: resolvedName } : {}),
          }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setError(body?.error ?? 'Failed to initialise payment. Please try again.')
          setLoading(false)
          setCreatingIntent(false)
          return
        }

        const { clientSecret: cs } = await res.json()
        setClientSecret(cs)
        setCreatingIntent(false)
        setLoading(false)
      } catch {
        setError('Something went wrong. Please try again.')
        setLoading(false)
      }
    }

    load()
  }, [bookingId, playerId])

  // ── Already paid ──
  if (alreadyPaid) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <div className="text-[56px] mb-4">✓</div>
        <h1 className="text-[22px] font-black text-gray-900 mb-2">Already paid</h1>
        <p className="text-[14px] text-gray-500">Your share has already been paid for this booking.</p>
      </div>
    )
  }

  // ── Success ──
  if (succeeded) {
    return <SuccessScreen />
  }

  // ── Loading ──
  if (loading || creatingIntent) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 rounded-full border-4 border-gray-200 border-t-[#009688] animate-spin" />
        <p className="text-[13px] text-gray-400">Loading booking…</p>
      </div>
    )
  }

  // ── Error ──
  if (error || !booking) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <div className="text-[48px] mb-4">⚠️</div>
        <h1 className="text-[20px] font-bold text-gray-900 mb-2">Oops</h1>
        <p className="text-[14px] text-gray-500">{error ?? 'Something went wrong.'}</p>
      </div>
    )
  }

  // ── Format date ──
  const dateFormatted = (() => {
    try { return format(parseISO(booking.match_date), 'EEEE d MMMM yyyy', { locale: getDateLocale() }) } catch { return booking.match_date }
  })()

  const amountGBP = (booking.price_per_player_pence / 100).toFixed(2)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 pt-14 pb-4">
        <p className="text-[12px] font-semibold text-[#009688] uppercase tracking-wide mb-0.5">Court Booking</p>
        <h1 className="text-[22px] font-black text-gray-900">Split Payment</h1>
      </div>

      <div className="px-5 py-5 space-y-4 max-w-lg mx-auto">
        {/* Booking details card */}
        <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-3">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Booking Details</p>

          <div className="space-y-2">
            {venue && (
              <div className="flex items-start justify-between gap-3">
                <span className="text-[13px] text-gray-500 flex-shrink-0">Venue</span>
                <span className="text-[13px] font-semibold text-gray-900 text-right">{venue.venue_name}</span>
              </div>
            )}
            <div className="flex items-start justify-between gap-3">
              <span className="text-[13px] text-gray-500 flex-shrink-0">Date</span>
              <span className="text-[13px] font-semibold text-gray-900 text-right">{dateFormatted}</span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-[13px] text-gray-500 flex-shrink-0">Time</span>
              <span className="text-[13px] font-semibold text-gray-900">{booking.start_time}</span>
            </div>
            {booking.booking_reference && (
              <div className="flex items-start justify-between gap-3">
                <span className="text-[13px] text-gray-500 flex-shrink-0">Ref</span>
                <span className="text-[13px] font-semibold text-gray-900">{booking.booking_reference}</span>
              </div>
            )}
          </div>
        </div>

        {/* Player + amount card */}
        <div className="rounded-2xl bg-white border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">
                {isGuest ? 'Guest' : 'Paying for'}
              </p>
              <p className="text-[16px] font-bold text-gray-900">{playerName}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Amount</p>
              <p className="text-[22px] font-black text-[#009688]">£{amountGBP}</p>
            </div>
          </div>
        </div>

        {/* Stripe payment form */}
        {clientSecret && (
          <div className="rounded-2xl bg-white border border-gray-100 p-4">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-4">Payment</p>
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
                bookingId={bookingId!}
                playerId={playerId!}
                playerName={playerName}
                isGuest={isGuest}
                booking={booking}
                venueName={venue?.venue_name ?? ''}
                onSuccess={() => setSucceeded(true)}
              />
            </Elements>
          </div>
        )}

        <p className="text-[11px] text-gray-400 text-center pb-8">
          Payments are processed securely by Stripe. PPA never stores your card details.
        </p>
      </div>
    </div>
  )
}
