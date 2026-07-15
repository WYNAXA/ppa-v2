import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import {
  ChevronLeft, MapPin, Clock, Calendar, Users, Share2,
  CreditCard, Banknote, Loader2,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useDateLocale } from '@/lib/dateLocale'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { goBack } from '@/lib/navigation'
import { calculateDistance, formatDistance } from '@/lib/travelUtils'
import {
  fetchOccurrenceDetail,
  fetchParticipants,
  fetchConnectionIds,
  joinVenueEvent,
  finaliseEventPayment,
  leaveVenueEvent,
} from '@/lib/venueEvents'
import { useTranslation } from 'react-i18next'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string)
const STRIPE_APPEARANCE = { theme: 'stripe' as const, variables: { colorPrimary: '#009688' } }

// ── Main page ────────────────────────────────────────────────────────────────

export function VenueEventDetailPage() {
  const { occurrenceId = '' } = useParams<{ occurrenceId: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const userId = user?.id ?? ''
  const queryClient = useQueryClient()
  const locale = useDateLocale()
  const { t } = useTranslation()

  const [paymentState, setPaymentState] = useState<{
    clientSecret: string
    paymentIntentId: string
    orderItemId: string
  } | null>(null)

  // ── Fetch occurrence detail ──────────────────────────────────────────────
  const { data: detail, isLoading } = useQuery({
    queryKey: ['venue-event-detail', occurrenceId],
    enabled: !!occurrenceId,
    queryFn: () => fetchOccurrenceDetail(occurrenceId),
  })

  // ── Fetch participants + profiles ────────────────────────────────────────
  const { data: participants = [] } = useQuery({
    queryKey: ['venue-event-participants', occurrenceId],
    enabled: !!occurrenceId,
    queryFn: async () => {
      const rows = await fetchParticipants(occurrenceId)
      if (rows.length === 0) return []
      const ids = rows.map((r) => r.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', ids)
      return rows.map((r) => ({
        ...r,
        profile: profiles?.find((p) => p.id === r.user_id) ?? null,
      }))
    },
  })

  // ── Fetch viewer's connections ───────────────────────────────────────────
  const { data: connectionIds } = useQuery({
    queryKey: ['my-connections-set', userId],
    enabled: !!userId,
    queryFn: () => fetchConnectionIds(userId),
    staleTime: 120_000,
  })

  // ── Is the viewer already a participant? ─────────────────────────────────
  const myParticipation = participants.find(
    (p) => p.user_id === userId && p.status === 'joined',
  )

  // ── Join mutation (pay_at_venue) ─────────────────────────────────────────
  const joinMutation = useMutation({
    mutationFn: () => joinVenueEvent(occurrenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venue-event-detail', occurrenceId] })
      queryClient.invalidateQueries({ queryKey: ['venue-event-participants', occurrenceId] })
      queryClient.invalidateQueries({ queryKey: ['venue-events-discover'] })
      toast.success(t('play.ve_joined'))
    },
    onError: (err: any) => {
      toast.error(err?.message ?? t('play.ve_join_failed'))
    },
  })

  // ── Leave mutation ───────────────────────────────────────────────────────
  const leaveMutation = useMutation({
    mutationFn: () => leaveVenueEvent(occurrenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venue-event-detail', occurrenceId] })
      queryClient.invalidateQueries({ queryKey: ['venue-event-participants', occurrenceId] })
      queryClient.invalidateQueries({ queryKey: ['venue-events-discover'] })
      toast.success(t('play.ve_left'))
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Failed to leave event')
    },
  })

  // ── Initiate pay_in_app checkout ─────────────────────────────────────────
  async function initiatePayment() {
    if (!detail) return
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-event-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          occurrence_id: occurrenceId,
          venue_id: detail.event.venue_id,
          event_name: detail.event.name,
          amount_pence: detail.event.price_pence,
          user_id: userId,
        }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error ?? 'Payment setup failed')
      setPaymentState({
        clientSecret: json.client_secret,
        paymentIntentId: json.payment_intent_id,
        orderItemId: json.order_item_id,
      })
    } catch (err: any) {
      toast.error(err?.message ?? 'Payment setup failed')
    }
  }

  // ── Loading / not found ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <p className="text-[14px] font-semibold text-gray-500">{t('play.ve_not_found')}</p>
        <button onClick={() => goBack(navigate, '/play')} className="mt-4 text-[13px] text-teal-600 font-semibold">
          {t('play.ve_go_back')}
        </button>
      </div>
    )
  }

  const { occurrence, event, venue } = detail
  const spotsLeft = occurrence.capacity - occurrence.spots_taken
  const isFull = spotsLeft <= 0
  const isFree = event.price_pence == null || event.price_pence === 0
  const isPayAtVenue = event.payment_type === 'pay_at_venue' || isFree

  // ── Distance ─────────────────────────────────────────────────────────────
  const userLat = (profile as any)?.latitude != null ? Number((profile as any).latitude) : null
  const userLng = (profile as any)?.longitude != null ? Number((profile as any).longitude) : null
  const distMiles =
    userLat != null && userLng != null && venue.latitude != null && venue.longitude != null
      ? calculateDistance(userLat, userLng, venue.latitude, venue.longitude)
      : null

  // ── Format dates ─────────────────────────────────────────────────────────
  let formattedDate = ''
  let formattedTime = ''
  let formattedEnd = ''
  try {
    formattedDate = format(parseISO(occurrence.starts_at), 'EEEE, d MMMM yyyy', { locale })
    formattedTime = format(parseISO(occurrence.starts_at), 'HH:mm', { locale })
    if (occurrence.ends_at) formattedEnd = format(parseISO(occurrence.ends_at), 'HH:mm', { locale })
  } catch { /* fallback to raw */ }

  // ── Attendee list with connections first ──────────────────────────────────
  const conns = connectionIds ?? new Set<string>()
  const joinedParticipants = participants.filter((p) => p.status === 'joined')
  const connectedAttendees = joinedParticipants.filter((p) => conns.has(p.user_id))
  const otherAttendees = joinedParticipants.filter((p) => !conns.has(p.user_id))

  const connectionSummary = (() => {
    if (connectedAttendees.length === 0) return null
    const names = connectedAttendees
      .slice(0, 2)
      .map((a) => a.profile?.name?.split(' ')[0] ?? 'Someone')
    const rest = connectedAttendees.length - names.length
    if (rest > 0) {
      return `${names.join(', ')} and ${rest} ${rest === 1 ? 'other' : 'others'} you know`
    }
    if (names.length === 2) return `${names[0]} and ${names[1]} you know`
    return `${names[0]} you know`
  })()

  // ── Level label ──────────────────────────────────────────────────────────
  const levelLabel = (() => {
    if (event.level_min != null && event.level_max != null) return `Level ${event.level_min}–${event.level_max}`
    if (event.level_min != null) return `Level ${event.level_min}+`
    if (event.level_max != null) return `Up to level ${event.level_max}`
    return null
  })()

  // ── Share ────────────────────────────────────────────────────────────────
  async function handleShare() {
    const url = `${window.location.origin}/play/events/${occurrenceId}`
    if (navigator.share) {
      try { await navigator.share({ title: event.name, url }) } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    }
  }

  // ── If payment flow is open, show Stripe Elements ────────────────────────
  if (paymentState) {
    return (
      <div className="min-h-full bg-white">
        <div className="flex items-center gap-3 px-5 pt-14 pb-4">
          <button
            onClick={() => setPaymentState(null)}
            className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <h1 className="text-[18px] font-bold text-gray-900">{t('play.ve_pay_title')}</h1>
        </div>
        <div className="px-5 pb-10">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 mb-5">
            <p className="text-[14px] font-bold text-gray-900">{event.name}</p>
            <p className="text-[13px] text-gray-500 mt-1">{venue.venue_name}</p>
            <p className="text-[13px] text-gray-500">{formattedDate} · {formattedTime}</p>
            <p className="text-[16px] font-bold text-[#009688] mt-2">
              {"\u00A3"}{((event.price_pence ?? 0) / 100).toFixed(2)}
            </p>
          </div>
          <Elements
            stripe={stripePromise}
            options={{ clientSecret: paymentState.clientSecret, appearance: STRIPE_APPEARANCE }}
          >
            <EventPaymentForm
              clientSecret={paymentState.clientSecret}
              paymentIntentId={paymentState.paymentIntentId}
              orderItemId={paymentState.orderItemId}
              occurrenceId={occurrenceId}
              onSuccess={() => {
                setPaymentState(null)
                queryClient.invalidateQueries({ queryKey: ['venue-event-detail', occurrenceId] })
                queryClient.invalidateQueries({ queryKey: ['venue-event-participants', occurrenceId] })
                queryClient.invalidateQueries({ queryKey: ['venue-events-discover'] })
                toast.success(t('play.ve_joined'))
              }}
              onError={(msg) => toast.error(msg)}
            />
          </Elements>
        </div>
      </div>
    )
  }

  // ── Main detail view ─────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-white pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-14 pb-4">
        <button
          onClick={() => goBack(navigate, '/play')}
          className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
        >
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-bold text-gray-900 leading-tight truncate">{event.name}</h1>
        </div>
        <button
          onClick={handleShare}
          className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
        >
          <Share2 className="h-4 w-4 text-gray-600" />
        </button>
      </div>

      {/* Meta card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-5 mb-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-2.5"
      >
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <p className="text-[13px] text-gray-700 font-medium">{formattedDate}</p>
        </div>
        {formattedTime && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <p className="text-[13px] text-gray-700">
              {formattedTime}{formattedEnd ? ` – ${formattedEnd}` : ''}
            </p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <p className="text-[13px] text-gray-700 truncate">
            {venue.venue_name}
            {venue.full_address ? ` · ${venue.full_address}` : ''}
            {distMiles != null && ` · ${formatDistance(distMiles)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <p className="text-[13px] text-gray-700">
            {occurrence.spots_taken}/{occurrence.capacity} {t('play.ve_spots_filled')}
            {spotsLeft > 0 && (
              <span className="text-[#009688] font-semibold ml-1">
                · {t('play.ve_spots_left', { count: spotsLeft })}
              </span>
            )}
            {isFull && <span className="text-red-500 font-semibold ml-1"> · {t('play.ve_full')}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          {levelLabel && (
            <span className="inline-flex items-center rounded-full bg-teal-50 border border-teal-100 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700">
              {levelLabel}
            </span>
          )}
          {event.event_type && (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600 capitalize">
              {event.event_type}
            </span>
          )}
          <span className="text-[13px] font-bold text-gray-700">
            {isFree ? t('play.ve_free') : `\u00A3${((event.price_pence ?? 0) / 100).toFixed(2)}`}
            {!isFree && isPayAtVenue && (
              <span className="text-[11px] font-normal text-gray-400 ml-1">{t('play.ve_pay_at_venue')}</span>
            )}
          </span>
        </div>
      </motion.div>

      {/* Description */}
      {event.description && (
        <div className="mx-5 mb-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-2">{t('play.ve_about')}</p>
          <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-line">{event.description}</p>
        </div>
      )}

      {/* Who's going — connections first */}
      <div className="mx-5 mb-4">
        <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-3">{t('play.ve_whos_going')}</p>

        {connectionSummary && (
          <p className="text-[13px] text-[#009688] font-semibold mb-3">{connectionSummary}</p>
        )}

        {joinedParticipants.length === 0 ? (
          <p className="text-[13px] text-gray-400">{t('play.ve_no_attendees')}</p>
        ) : (
          <div className="space-y-2">
            {/* Connected attendees first */}
            {connectedAttendees.map((a) => (
              <AttendeeRow key={a.user_id} name={a.profile?.name} avatarUrl={a.profile?.avatar_url} isConnection />
            ))}
            {/* Then others */}
            {otherAttendees.map((a) => (
              <AttendeeRow key={a.user_id} name={a.profile?.name} avatarUrl={a.profile?.avatar_url} />
            ))}
          </div>
        )}
        {otherAttendees.length > 0 && connectedAttendees.length > 0 && (
          <p className="text-[12px] text-gray-400 mt-2">
            +{otherAttendees.length} {otherAttendees.length === 1 ? 'other' : 'others'}
          </p>
        )}
      </div>

      {/* CTA — Join / Leave */}
      <div className="mx-5 mt-6">
        {myParticipation ? (
          <div className="space-y-3">
            <div className="rounded-2xl bg-teal-50 border border-teal-100 p-4 text-center">
              <p className="text-[14px] font-bold text-[#009688]">{t('play.ve_youre_going')}</p>
            </div>
            <button
              onClick={() => leaveMutation.mutate()}
              disabled={leaveMutation.isPending}
              className="w-full rounded-2xl border border-red-200 py-3 text-[13px] font-semibold text-red-500 transition-all active:scale-[0.98]"
            >
              {leaveMutation.isPending ? t('play.ve_leaving') : t('play.ve_leave')}
            </button>
          </div>
        ) : isFull ? (
          <div className="rounded-2xl bg-gray-100 p-4 text-center">
            <p className="text-[14px] font-bold text-gray-500">{t('play.ve_full')}</p>
          </div>
        ) : isPayAtVenue ? (
          <button
            onClick={() => joinMutation.mutate()}
            disabled={joinMutation.isPending}
            className="w-full rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {joinMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Banknote className="h-4 w-4" />
            )}
            {isFree ? t('play.ve_join_free') : t('play.ve_join_pay_venue')}
          </button>
        ) : (
          <button
            onClick={initiatePayment}
            className="w-full rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <CreditCard className="h-4 w-4" />
            {t('play.ve_join_pay_now', { price: `\u00A3${((event.price_pence ?? 0) / 100).toFixed(2)}` })}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Attendee row ─────────────────────────────────────────────────────────────

function AttendeeRow({ name, avatarUrl, isConnection }: {
  name?: string | null
  avatarUrl?: string | null
  isConnection?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-[12px] font-bold text-gray-500 flex-shrink-0">
          {(name ?? '?').charAt(0).toUpperCase()}
        </div>
      )}
      <span className="text-[13px] text-gray-700 flex-1">{name ?? 'Unknown'}</span>
      {isConnection && (
        <span className="text-[11px] font-semibold text-[#009688]">Connected</span>
      )}
    </div>
  )
}

// ── Stripe payment form for pay_in_app ───────────────────────────────────────

function EventPaymentForm({ clientSecret, paymentIntentId, orderItemId, occurrenceId, onSuccess, onError }: {
  clientSecret: string
  paymentIntentId: string
  orderItemId: string
  occurrenceId: string
  onSuccess: () => void
  onError: (msg: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const { t } = useTranslation()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setProcessing(true)

    try {
      const { error: submitError } = await elements.submit()
      if (submitError) {
        onError(submitError.message ?? 'Payment failed')
        setProcessing(false)
        return
      }

      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      })

      if (confirmError) {
        onError(confirmError.message ?? 'Payment failed')
        setProcessing(false)
        return
      }

      // Payment succeeded — finalise the join (atomic capacity check on server)
      await finaliseEventPayment(occurrenceId, orderItemId, paymentIntentId)
      onSuccess()
    } catch (err: any) {
      onError(err?.message ?? 'Payment failed')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full rounded-2xl bg-[#009688] py-4 text-[15px] font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {processing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CreditCard className="h-4 w-4" />
        )}
        {processing ? t('play.ve_processing') : t('play.ve_pay_now')}
      </button>
    </form>
  )
}
