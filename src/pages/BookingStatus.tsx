import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { getDateLocale } from '@/lib/dateLocale'
import {
  ChevronLeft, CheckCircle, Clock, AlertTriangle, XCircle,
  Plus, CreditCard, MapPin, Calendar,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const PLAYERS_PER_COURT = 4

// ── Types ─────────────────────────────────────────────────────────────────────

interface GuestPlayer {
  id: string
  name: string
  phone?: string
  email?: string
}

interface BookingData {
  id: string
  status: string
  start_at: string
  end_at: string
  venue_id: string
  court_id: string | null
  booked_by: string
  player_ids: string[] | null
  guest_players: GuestPlayer[] | null
  paid_player_ids: string[] | null
  payment_deadline: string | null
  total_price_pence: number | null
  price_per_player_pence: number | null
}

interface ResolvedPlayer {
  id: string
  name: string
  avatarUrl: string | null
  isGuest: boolean
  isPaid: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPence(pence: number): string {
  return `\u00a3${(pence / 100).toFixed(2)}`
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Expired'
  const totalHours = Math.floor(ms / (1000 * 60 * 60))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  if (days > 0) return `${days}d ${hours}h`
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  if (totalHours > 0) return `${totalHours}h ${mins}m`
  return `${mins}m`
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  held:      { label: 'Court held',    color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',  icon: Clock },
  confirmed: { label: 'Court secured', color: 'text-teal-700',   bg: 'bg-teal-50 border-teal-200',    icon: CheckCircle },
  released:  { label: 'Released',      color: 'text-gray-500',   bg: 'bg-gray-50 border-gray-200',    icon: XCircle },
  cancelled: { label: 'Cancelled',     color: 'text-gray-500',   bg: 'bg-gray-50 border-gray-200',    icon: XCircle },
  completed: { label: 'Played',        color: 'text-teal-700',   bg: 'bg-teal-50 border-teal-200',    icon: CheckCircle },
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function BookingStatusPage() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const navigate = useNavigate()
  const { session } = useAuth()
  const userId = session?.user?.id ?? ''

  const [booking, setBooking] = useState<BookingData | null>(null)
  const [venueName, setVenueName] = useState('')
  const [courtName, setCourtName] = useState('')
  const [players, setPlayers] = useState<ResolvedPlayer[]>([])
  const [cancellationNoticeHours, setCancellationNoticeHours] = useState(24)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  // Tick every minute for countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  // ── Fetch ───────────────────────────────────────────────────────────────

  async function fetchBooking() {
    if (!bookingId) { setError('Invalid link.'); setLoading(false); return }

    const { data: b, error: bErr } = await supabase
      .from('court_bookings')
      .select('id, status, start_at, end_at, venue_id, court_id, booked_by, player_ids, guest_players, paid_player_ids, payment_deadline, total_price_pence, price_per_player_pence')
      .eq('id', bookingId)
      .single()

    if (bErr || !b) {
      setError('Booking not found or you don\u2019t have access.')
      setLoading(false)
      return
    }

    setBooking(b as BookingData)

    // Venue name
    const { data: venue } = await supabase.from('venues').select('name').eq('id', b.venue_id).single()
    setVenueName(venue?.name ?? 'Venue')

    // Court name
    if (b.court_id) {
      const { data: court } = await supabase.from('courts').select('court_name').eq('id', b.court_id).single()
      setCourtName(court?.court_name ?? '')
    }

    // Cancellation notice hours
    const { data: settings } = await supabase
      .from('court_availability_settings')
      .select('cancellation_notice_hours')
      .eq('venue_id', b.venue_id)
      .maybeSingle()
    setCancellationNoticeHours(settings?.cancellation_notice_hours ?? 24)

    // Resolve players
    const paidIds = (b.paid_player_ids as string[] | null) ?? []
    const userIds = (b.player_ids as string[] | null) ?? []
    const guests = (b.guest_players as GuestPlayer[] | null) ?? []
    const resolved: ResolvedPlayer[] = []

    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url').in('id', userIds)
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))
      for (const uid of userIds) {
        const prof = profileMap.get(uid)
        resolved.push({
          id: uid,
          name: prof?.name ?? 'Player',
          avatarUrl: prof?.avatar_url ?? null,
          isGuest: false,
          isPaid: paidIds.includes(uid),
        })
      }
    }

    for (const g of guests) {
      resolved.push({
        id: g.id,
        name: g.name,
        avatarUrl: null,
        isGuest: true,
        isPaid: paidIds.includes(g.id),
      })
    }

    setPlayers(resolved)
    setLoading(false)
  }

  useEffect(() => { fetchBooking() }, [bookingId])

  // ── Cancel ──────────────────────────────────────────────────────────────

  async function handleCancel() {
    if (!bookingId) return
    setCancelling(true)
    setCancelError(null)

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const token = currentSession?.access_token
      if (!token) {
        setCancelError('Not authenticated \u2014 please sign in again')
        setCancelling(false)
        return
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/cancel-booking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ booking_id: bookingId }),
      })

      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        setCancelError(body?.error ?? 'Cancellation failed. Please try again.')
        setCancelling(false)
        return
      }

      setShowCancelConfirm(false)
      setCancelling(false)
      // Re-fetch to show updated status
      setLoading(true)
      await fetchBooking()
    } catch (e) {
      console.warn('cancel-booking failed', e)
      setCancelError('Something went wrong. Please try again.')
      setCancelling(false)
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────

  const paidCount = players.filter((p) => p.isPaid).length
  const isBooker = booking?.booked_by === userId
  const canCancel = isBooker && (booking?.status === 'held' || booking?.status === 'confirmed')
  const startMs = booking?.start_at ? new Date(booking.start_at).getTime() : 0
  const cutoffMs = startMs - cancellationNoticeHours * 60 * 60 * 1000
  const beforeCutoff = now < cutoffMs
  const deadlineMs = booking?.payment_deadline ? new Date(booking.payment_deadline).getTime() : 0
  const deadlineRemaining = deadlineMs - now
  const perPlayer = booking?.price_per_player_pence ?? 0

  const statusCfg = STATUS_CONFIG[booking?.status ?? ''] ?? STATUS_CONFIG.cancelled
  const StatusIcon = statusCfg.icon

  // ── Loading ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 rounded-full border-4 border-gray-200 border-t-[#009688] animate-spin" />
        <p className="text-[13px] text-gray-400">Loading booking\u2026</p>
      </div>
    )
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <div className="text-[48px] mb-4">{'\u26A0\uFE0F'}</div>
        <h1 className="text-[20px] font-bold text-gray-900 mb-2">Oops</h1>
        <p className="text-[14px] text-gray-500">{error ?? 'Something went wrong.'}</p>
        <button onClick={() => navigate(-1)} className="mt-6 text-[14px] font-semibold text-[#009688]">Go back</button>
      </div>
    )
  }

  // ── Format ──────────────────────────────────────────────────────────────

  const dateFormatted = (() => {
    try { return format(parseISO(booking.start_at), 'EEEE d MMMM yyyy', { locale: getDateLocale() }) } catch { return '' }
  })()
  const timeFormatted = (() => {
    try { return format(parseISO(booking.start_at), 'HH:mm', { locale: getDateLocale() }) } catch { return '' }
  })()
  const endTimeFormatted = (() => {
    try { return format(parseISO(booking.end_at), 'HH:mm', { locale: getDateLocale() }) } catch { return '' }
  })()

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 pt-14 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <h1 className="text-[18px] font-bold text-gray-900">Booking</h1>
        </div>
      </div>

      <div className="px-5 py-5 space-y-4 max-w-lg mx-auto">
        {/* Status badge */}
        <div className={cn('rounded-2xl border p-4 flex items-center gap-3', statusCfg.bg)}>
          <StatusIcon className={cn('h-5 w-5 flex-shrink-0', statusCfg.color)} />
          <p className={cn('text-[15px] font-bold', statusCfg.color)}>{statusCfg.label}</p>
        </div>

        {/* Venue / date / time */}
        <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-2.5">
          <div className="flex items-center gap-2.5">
            <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-[14px] font-semibold text-gray-900">{venueName}</p>
              {courtName && <p className="text-[12px] text-gray-400">{courtName}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <p className="text-[13px] text-gray-700">{dateFormatted}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <p className="text-[13px] text-gray-700">{timeFormatted} \u2013 {endTimeFormatted}</p>
          </div>
        </div>

        {/* Countdown timers (held only) */}
        {booking.status === 'held' && (
          <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-3">
            {deadlineMs > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold text-gray-500">Payment due in</p>
                <p className={cn('text-[14px] font-bold', deadlineRemaining > 0 ? 'text-amber-600' : 'text-red-500')}>
                  {formatCountdown(deadlineRemaining)}
                </p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold text-gray-500">Free cancellation until</p>
              <p className="text-[13px] font-semibold text-gray-700">
                {(() => { try { return format(new Date(cutoffMs), 'EEE d MMM, HH:mm', { locale: getDateLocale() }) } catch { return '\u2014' } })()}
              </p>
            </div>
          </div>
        )}

        {/* Player payment status */}
        <div className="rounded-2xl border border-gray-100 overflow-hidden bg-white">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
              Player payments {'\u2014'} {paidCount} of {PLAYERS_PER_COURT} paid
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {players.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <PlayerAvatar name={p.name} avatarUrl={p.avatarUrl} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-[13px] font-semibold text-gray-800 truncate">{p.name}</p>
                    {p.id === userId && (
                      <span className="text-[10px] font-bold text-teal-600 bg-teal-100 rounded-full px-1.5 py-0.5 flex-shrink-0">You</span>
                    )}
                    {p.isGuest && (
                      <span className="text-[10px] font-bold text-orange-600 bg-orange-50 rounded-full px-1.5 py-0.5 flex-shrink-0">Guest</span>
                    )}
                  </div>
                  <p className={cn('text-[12px]', p.isPaid ? 'text-teal-600 font-medium' : 'text-gray-400')}>
                    {p.isPaid ? `${formatPence(perPlayer)} paid` : '\u23F3 Payment pending'}
                  </p>
                </div>
                {p.isPaid ? (
                  <CheckCircle className="h-4 w-4 text-teal-500 flex-shrink-0" />
                ) : (booking.status === 'held' || booking.status === 'confirmed') ? (
                  <button
                    onClick={() => navigate(`/pay/booking/${bookingId}/player/${p.id}`)}
                    className="flex items-center gap-1 rounded-xl bg-[#009688] px-3 py-1.5 text-[12px] font-bold text-white flex-shrink-0"
                  >
                    <CreditCard className="h-3 w-3" />
                    Pay share
                  </button>
                ) : null}
              </div>
            ))}
            {players.length < PLAYERS_PER_COURT &&
              Array.from({ length: PLAYERS_PER_COURT - players.length }, (_, i) => (
                <div key={`empty-${i}`} className="flex items-center gap-3 px-4 py-3 opacity-40">
                  <div className="h-7 w-7 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center flex-shrink-0">
                    <Plus className="h-3 w-3 text-gray-300" />
                  </div>
                  <p className="text-[13px] text-gray-400">Open spot</p>
                </div>
              ))}
          </div>
        </div>

        {/* Cancel button */}
        {canCancel && (
          <div className="space-y-2">
            {!showCancelConfirm ? (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="w-full rounded-2xl border-2 border-red-200 py-3.5 text-[14px] font-bold text-red-500 flex items-center justify-center gap-2"
              >
                <XCircle className="h-4 w-4" />
                Cancel booking
              </button>
            ) : (
              <div className="rounded-2xl border border-red-100 bg-red-50 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[14px] font-bold text-red-800">
                      {beforeCutoff ? 'Cancel with full refund?' : 'Cancel \u2014 no refund'}
                    </p>
                    <p className="text-[12px] text-red-600 mt-1">
                      {beforeCutoff
                        ? 'All payments will be refunded in full.'
                        : 'You are inside the cancellation window. Payments already made will not be refunded.'}
                    </p>
                  </div>
                </div>
                {cancelError && (
                  <p className="text-[12px] text-red-500">{cancelError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowCancelConfirm(false); setCancelError(null) }}
                    disabled={cancelling}
                    className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600"
                  >
                    Keep booking
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="flex-1 rounded-xl bg-red-500 py-2.5 text-[13px] font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {cancelling ? 'Cancelling\u2026' : beforeCutoff ? 'Confirm \u2014 full refund' : 'Confirm \u2014 no refund'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
