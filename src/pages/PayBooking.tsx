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

interface UnpaidPlayer {
  id: string
  name: string
  isGuest: boolean
  isCurrent: boolean // the player opening this page
}

// ── Payment form ──────────────────────────────────────────────────────────────

interface PaymentFormProps {
  bookingId: string
  playerId: string
  coveredPlayerIds: string[]
  totalPence: number
  onSuccess: () => void
}

function PaymentForm({
  bookingId,
  playerId,
  coveredPlayerIds,
  totalPence,
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

      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      })

      if (confirmError) {
        setError(confirmError.message ?? 'Payment failed')
        setSubmitting(false)
        return
      }

      // Record payment in ledger (best-effort, idempotent)
      const piId = paymentIntent?.id
      if (piId) {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/record-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
            body: JSON.stringify({
              booking_id: bookingId,
              payment_intent_id: piId,
              covered_player_ids: coveredPlayerIds,
              payer_id: playerId,
            }),
          })
        } catch (e) { console.warn('record-payment failed', e) }
      }

      // Append ALL covered player ids to paid_player_ids (deduped)
      const { data: freshBooking } = await supabase
        .from('court_bookings')
        .select('paid_player_ids')
        .eq('id', bookingId)
        .single()

      const existing = (freshBooking?.paid_player_ids as string[] | null) ?? []
      const merged = [...new Set([...existing, ...coveredPlayerIds])]

      await supabase
        .from('court_bookings')
        .update({ paid_player_ids: merged })
        .eq('id', bookingId)

      onSuccess()
    } catch {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  const amountGBP = (totalPence / 100).toFixed(2)

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
        {submitting ? 'Processing\u2026' : `Pay \u00a3${amountGBP}`}
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

  // Unpaid player list + selection
  const [unpaidPlayers, setUnpaidPlayers] = useState<UnpaidPlayer[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [alreadyPaid, setAlreadyPaid] = useState(false)
  const [succeeded, setSucceeded] = useState(false)
  const [creatingIntent, setCreatingIntent] = useState(false)

  // ── Load booking data ───────────────────────────────────────────────────

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

        // 2. Check if current player already paid
        const paidIds = (b.paid_player_ids as string[] | null) ?? []
        if (paidIds.includes(playerId!)) {
          setAlreadyPaid(true)
          setLoading(false)
          return
        }

        // 3. Determine current player identity
        const allPlayerIds = (b.player_ids as string[] | null) ?? []
        const guestPlayers = (b.guest_players as GuestPlayer[] | null) ?? []

        let resolvedName = ''
        let resolvedIsGuest = false

        if (allPlayerIds.includes(playerId!)) {
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

        // 4. Resolve ALL unpaid players (for multi-cover selection)
        const unpaid: UnpaidPlayer[] = []

        // PPA users who haven't paid
        const unpaidUserIds = allPlayerIds.filter((id) => !paidIds.includes(id))
        if (unpaidUserIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, name')
            .in('id', unpaidUserIds)

          const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name]))
          for (const uid of unpaidUserIds) {
            unpaid.push({
              id: uid,
              name: profileMap.get(uid) ?? 'Player',
              isGuest: false,
              isCurrent: uid === playerId,
            })
          }
        }

        // Guests who haven't paid
        for (const g of guestPlayers) {
          if (!paidIds.includes(g.id)) {
            unpaid.push({
              id: g.id,
              name: g.name,
              isGuest: true,
              isCurrent: g.id === playerId,
            })
          }
        }

        setUnpaidPlayers(unpaid)
        // Default: only current player selected
        setSelectedIds(new Set([playerId!]))

        // 5. Fetch venue
        const { data: v } = await supabase
          .from('padel_venues')
          .select('venue_id, venue_name, city, full_address')
          .eq('venues_id', b.venue_id)
          .single()

        setVenue(v as PadelVenue | null)
        setLoading(false)
      } catch {
        setError('Something went wrong. Please try again.')
        setLoading(false)
      }
    }

    load()
  }, [bookingId, playerId])

  // ── Create payment intent (called when user proceeds) ──────────────────

  async function createPaymentIntent() {
    if (!booking || !playerId) return
    setCreatingIntent(true)
    setError(null)

    const shareCount = selectedIds.size
    const totalPence = shareCount * booking.price_per_player_pence

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-booking-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          amount_pence: totalPence,
          share_count: shareCount,
          venue_id: booking.venue_id,
          player_id: playerId,
          booking_id: bookingId,
          venue_name: venue?.venue_name ?? 'Padel Court',
          match_date: booking.match_date,
          start_time: booking.start_time,
          ...(isGuest ? { guest_name: playerName } : {}),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.error ?? 'Failed to initialise payment. Please try again.')
        setCreatingIntent(false)
        return
      }

      const { client_secret: cs } = await res.json()
      setClientSecret(cs)
      setCreatingIntent(false)
    } catch {
      setError('Something went wrong. Please try again.')
      setCreatingIntent(false)
    }
  }

  // ── Selection helpers ──────────────────────────────────────────────────

  function togglePlayer(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    // Reset any existing payment intent when selection changes
    setClientSecret(null)
  }

  // ── Derived values ─────────────────────────────────────────────────────

  const shareCount = selectedIds.size
  const totalPence = booking ? shareCount * booking.price_per_player_pence : 0
  const totalGBP = (totalPence / 100).toFixed(2)
  const perShareGBP = booking ? (booking.price_per_player_pence / 100).toFixed(2) : '0.00'

  // ── Already paid ──
  if (alreadyPaid) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <div className="text-[56px] mb-4">{'\u2713'}</div>
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
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 rounded-full border-4 border-gray-200 border-t-[#009688] animate-spin" />
        <p className="text-[13px] text-gray-400">Loading booking\u2026</p>
      </div>
    )
  }

  // ── Error ──
  if (error && !booking) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <div className="text-[48px] mb-4">{'\u26A0\uFE0F'}</div>
        <h1 className="text-[20px] font-bold text-gray-900 mb-2">Oops</h1>
        <p className="text-[14px] text-gray-500">{error}</p>
      </div>
    )
  }

  if (!booking) return null

  // ── Format date ──
  const dateFormatted = (() => {
    try { return format(parseISO(booking.match_date), 'EEEE d MMMM yyyy', { locale: getDateLocale() }) } catch { return booking.match_date }
  })()

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

        {/* Player selection card */}
        <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
              {unpaidPlayers.length > 1 ? 'Cover additional players?' : 'Paying for'}
            </p>
            <p className="text-[12px] font-semibold text-gray-400">
              {'\u00a3'}{perShareGBP} / player
            </p>
          </div>

          <div className="space-y-2">
            {unpaidPlayers.map((p) => (
              <label
                key={p.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                  selectedIds.has(p.id)
                    ? 'border-[#009688]/30 bg-[#009688]/5'
                    : 'border-gray-100'
                } ${p.isCurrent ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  disabled={p.isCurrent}
                  onChange={() => togglePlayer(p.id)}
                  className="w-4 h-4 rounded border-gray-300 text-[#009688] focus:ring-[#009688] disabled:opacity-70"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-gray-900 truncate">
                    {p.name}
                    {p.isCurrent && <span className="text-[11px] text-gray-400 font-normal ml-1.5">(you)</span>}
                  </p>
                  {p.isGuest && (
                    <p className="text-[11px] text-gray-400">Guest</p>
                  )}
                </div>
              </label>
            ))}
          </div>

          {/* Total */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <p className="text-[13px] font-semibold text-gray-700">
              Paying {shareCount} {shareCount === 1 ? 'share' : 'shares'}
            </p>
            <p className="text-[22px] font-black text-[#009688]">{'\u00a3'}{totalGBP}</p>
          </div>
        </div>

        {/* Error inline */}
        {error && (
          <p className="text-[13px] text-red-500 text-center">{error}</p>
        )}

        {/* Payment form or proceed button */}
        {clientSecret ? (
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
                coveredPlayerIds={[...selectedIds]}
                totalPence={totalPence}
                onSuccess={() => setSucceeded(true)}
              />
            </Elements>
          </div>
        ) : (
          <button
            onClick={createPaymentIntent}
            disabled={creatingIntent}
            className="w-full rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white disabled:opacity-50 transition-opacity"
          >
            {creatingIntent ? 'Setting up payment\u2026' : `Proceed to pay \u00a3${totalGBP}`}
          </button>
        )}

        <p className="text-[11px] text-gray-400 text-center pb-8">
          Payments are processed securely by Stripe. PPA never stores your card details.
        </p>
      </div>
    </div>
  )
}
