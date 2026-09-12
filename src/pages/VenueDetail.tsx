import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, MapPin, Star, ExternalLink, Phone, Mail, Globe, QrCode, X } from 'lucide-react'
import QRCodeSVG from 'react-qr-code'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { venueClaimUrl } from '@/lib/admin'
import { money, currencySymbolFor } from '@/lib/money'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'
import { goBack } from '@/lib/navigation'

// ── Constants ────────────────────────────────────────────────────────────────

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

const FACILITY_MAP: Record<string, { icon: string; label: string }> = {
  parking: { icon: '\u{1F17F}\uFE0F', label: 'Parking' },
  changing_rooms: { icon: '\u{1F6BF}', label: 'Changing Rooms' },
  bar: { icon: '\u{1F37A}', label: 'Bar' },
  pro_shop: { icon: '\u{1F6D2}', label: 'Pro Shop' },
  coaching: { icon: '\u{1F3BE}', label: 'Coaching' },
  equipment_hire: { icon: '\u{1F3D3}', label: 'Equipment Hire' },
  cafe: { icon: '\u2615', label: 'Caf\u00E9' },
  showers: { icon: '\u{1F6BF}', label: 'Showers' },
  lockers: { icon: '\u{1F510}', label: 'Lockers' },
  viewing_area: { icon: '\u{1F441}', label: 'Viewing Area' },
}

const ALL_FACILITY_KEYS = Object.keys(FACILITY_MAP)

// ── Helpers ──────────────────────────────────────────────────────────────────

function getOpenStatus(openingHours: Record<string, { open: string; close: string }> | null) {
  if (!openingHours) return { isOpen: false, label: 'Hours unknown', todayHours: null }
  const now = new Date()
  const dayKey = DAY_NAMES[now.getDay()]
  const hours = openingHours[dayKey]
  if (!hours) return { isOpen: false, label: 'Closed', todayHours: null }
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const [openH, openM] = hours.open.split(':').map(Number)
  const [closeH, closeM] = hours.close.split(':').map(Number)
  const openMin = openH * 60 + openM
  const closeMin = closeH * 60 + closeM
  // A close at or before the open means the venue shuts after midnight
  // (e.g. 08:00–01:30). Then it's open if we're past opening OR before the
  // next-day close — not the simple "between" check.
  const crossesMidnight = closeMin <= openMin
  const isOpen = crossesMidnight
    ? (nowMinutes >= openMin || nowMinutes < closeMin)
    : (nowMinutes >= openMin && nowMinutes < closeMin)
  return {
    isOpen,
    label: isOpen ? `Open \u00B7 Closes at ${hours.close}` : `Closed \u00B7 Opens at ${hours.open}`,
    todayHours: hours,
  }
}

function googleMapsUrl(lat?: number | null, lng?: number | null, address?: string | null) {
  if (lat && lng) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  if (address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  return '#'
}

// A hand-maintained country→symbol table used to live here. It listed ~40 countries
// and returned '£' for every other country on earth. The venue row already carries
// its own currency, so amounts are formatted from that — see lib/money.

// Every seed venue was given the same fabricated opening hours. Treat that exact
// pattern (and null) as "not confirmed" so we invite the venue to update it rather
// than presenting invented hours as fact.
function isSeedDefaultHours(oh: Record<string, { open: string; close: string }> | null): boolean {
  if (!oh) return false
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
  const weekend = ['saturday', 'sunday']
  const wk = weekdays.every(d => oh[d]?.open === '07:00' && oh[d]?.close === '22:00')
  const we = weekend.every(d => oh[d]?.open === '08:00' && oh[d]?.close === '21:00')
  return wk && we
}

function WaitingOnInfo({ text }: { text?: string }) {
  return (
    <p className="text-sm text-ink-2 italic">
      {text ?? 'Waiting on updated information from the venue.'}
    </p>
  )
}

function renderStars(rating: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <Star
      key={i}
      size={14}
      className={cn(
        i < Math.round(rating) ? 'fill-warn text-warn' : 'text-ink-3',
      )}
    />
  ))
}

// ── Component ────────────────────────────────────────────────────────────────

export function VenueDetailPage() {
  const { venueId } = useParams<{ venueId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id

  const locale = useDateLocale()
  const [userRating, setUserRating] = useState(0)
  const [userReview, setUserReview] = useState('')
  const [showClaimQr, setShowClaimQr] = useState(false)

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: venue, isLoading } = useQuery({
    queryKey: ['venue-detail', venueId],
    enabled: !!venueId,
    queryFn: async () => {
      if (!venueId) return null
      const { data } = await supabase.from('padel_venues').select('*').eq('venue_id', venueId).single()
      return data
    },
  })

  const { data: ratings = [] } = useQuery({
    queryKey: ['venue-ratings', venueId],
    enabled: !!venueId,
    queryFn: async () => {
      const { data } = await supabase
        .from('venue_ratings')
        .select('*, profiles:user_id(name, avatar_url)')
        .eq('venue_id', venueId!)
        .order('created_at', { ascending: false })
        .limit(20)
      return data ?? []
    },
  })

  const { data: hasPlayed } = useQuery({
    queryKey: ['venue-played', venueId, userId],
    enabled: !!venueId && !!userId && !!venue?.venue_name,
    queryFn: async () => {
      const { count } = await supabase
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .eq('booked_venue_name', venue!.venue_name)
        .contains('player_ids', [userId!])
      return (count ?? 0) > 0
    },
  })

  const { data: existingRating } = useQuery({
    queryKey: ['venue-user-rating', venueId, userId],
    enabled: !!venueId && !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('venue_ratings')
        .select('*')
        .eq('venue_id', venueId!)
        .eq('user_id', userId!)
        .maybeSingle()
      if (data) {
        setUserRating(data.rating)
        setUserReview(data.review ?? '')
      }
      return data
    },
  })

  /**
   * Nearby venues, by actual distance from THIS venue.
   *
   * This used to select 10 arbitrary rows from `discoverable_venues` with no
   * geo filter and no ordering, then "sort" them client-side on `latitude` /
   * `longitude` — which were never in the select list. Every distance came out
   * `Infinity`, the comparator returned `NaN`, and the sort was a no-op, so the
   * section showed whichever rows Postgres happened to return first. On an
   * Ireland-weighted table that meant Dublin, from anywhere in the world.
   *
   * `venues_near` does the haversine in Postgres, filters to `status='active'`
   * and orders by real distance. Radius is generous (60mi) so sparse regions
   * still show something; we take the closest 3.
   */
  const { data: nearbyVenues = [] } = useQuery({
    queryKey: ['nearby-venues', venueId, venue?.latitude, venue?.longitude],
    enabled: venue?.latitude != null && venue?.longitude != null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('venues_near', {
        p_lat: Number(venue!.latitude),
        p_lng: Number(venue!.longitude),
        p_radius_miles: 60,
        p_limit: 4, // 4 so we still have 3 after dropping this venue
      })
      if (error) throw error
      return (data ?? [])
        .filter((v: any) => v.venue_id !== venueId)
        .slice(0, 3)
    },
  })

  // Upcoming classes & coaching sessions at this venue (players can book a spot).
  const { data: classes = [] } = useQuery({
    queryKey: ['venue-classes', venue?.venues_id, userId],
    enabled: !!venue?.venues_id,
    queryFn: async () => {
      const { data: sessions } = await supabase
        .from('coaching_sessions')
        .select('id, coach_user_id, title, session_type, start_at, capacity, price_pence, currency')
        .eq('venue_id', (venue as { venues_id: string }).venues_id)
        .eq('status', 'scheduled')
        .gte('start_at', new Date().toISOString())
        .order('start_at')
        .limit(20)
      const list = sessions ?? []
      if (!list.length) return []
      const ids = list.map((s: any) => s.id)
      const coachIds = [...new Set(list.map((s: any) => s.coach_user_id))]
      const [{ data: bks }, { data: coaches }, { data: cprofiles }] = await Promise.all([
        supabase.from('coaching_bookings').select('session_id, player_id').in('session_id', ids).eq('status', 'booked'),
        supabase.from('profiles').select('id, name, avatar_url').in('id', coachIds),
        supabase.from('coach_profiles').select('user_id, headline, specialties').in('user_id', coachIds),
      ])
      const counts = new Map<string, number>(); const mine = new Set<string>()
      for (const b of bks ?? []) { counts.set(b.session_id, (counts.get(b.session_id) ?? 0) + 1); if (b.player_id === userId) mine.add(b.session_id) }
      const coachName = new Map((coaches ?? []).map((c: any) => [c.id, c.name]))
      const coachAvatar = new Map((coaches ?? []).map((c: any) => [c.id, c.avatar_url]))
      const coachHeadline = new Map((cprofiles ?? []).map((c: any) => [c.user_id, c.headline]))
      const coachSpecialties = new Map((cprofiles ?? []).map((c: any) => [c.user_id, c.specialties]))
      return list.map((s: any) => ({ ...s, booked: counts.get(s.id) ?? 0, mine: mine.has(s.id), coachName: coachName.get(s.coach_user_id) ?? 'Coach', coachAvatar: coachAvatar.get(s.coach_user_id) ?? null, coachHeadline: coachHeadline.get(s.coach_user_id) ?? null, coachSpecialties: coachSpecialties.get(s.coach_user_id) ?? null }))
    },
  })

  const bookClass = useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await supabase.rpc('book_class', { p_session_id: sessionId })
      if (error) throw error
      return data as { status: string }
    },
    onSuccess: (res) => {
      // Always refresh so the card reflects the new capacity/booked state…
      queryClient.invalidateQueries({ queryKey: ['venue-classes', venue?.venues_id, userId] })
      // …and tell the player what actually happened (a race can fill the last
      // spot between render and tap, so "booked" isn't guaranteed).
      switch (res?.status) {
        case 'booked': toast.success('You’re booked in — see you on court!'); break
        case 'already_booked': toast('You’re already booked in.'); break
        case 'full': toast.error('Sorry — that class just filled up.'); break
        case 'past': toast.error('That class has already started.'); break
        default: toast.error('That class is no longer available.')
      }
    },
    onError: () => toast.error('Couldn’t book that class — please try again.'),
  })

  // Tournaments this venue is hosting (leagues run through the existing engine).
  const { data: tournaments = [] } = useQuery({
    queryKey: ['venue-tournaments', venue?.venues_id],
    enabled: !!venue?.venues_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('leagues')
        .select('id, name, format, tournament_start, max_participants, entry_fee_pence, status')
        .eq('source_venue_id', (venue as { venues_id: string }).venues_id)
        .eq('source_type', 'venue')
        .in('status', ['active', 'draft'])
        .order('tournament_start', { ascending: true, nullsFirst: false })
        .limit(10)
      const list = data ?? []
      if (!list.length) return []
      const ids = list.map((l: any) => l.id)
      const { data: m } = await supabase.from('league_members').select('league_id').in('league_id', ids).eq('status', 'active')
      const counts = new Map<string, number>()
      // league_members.league_id is nullable; a null key would collide all
      // null-league rows into one bogus bucket.
      for (const r of m ?? []) {
        if (!r.league_id) continue
        counts.set(r.league_id, (counts.get(r.league_id) ?? 0) + 1)
      }
      return list.map((l: any) => ({ ...l, participants: counts.get(l.id) ?? 0 }))
    },
  })

  // ── Mutations ────────────────────────────────────────────────────────────

  const submitRating = useMutation({
    mutationFn: async ({ rating, review }: { rating: number; review: string }) => {
      await supabase.from('venue_ratings').upsert(
        { venue_id: venueId!, user_id: userId!, rating, review },
        { onConflict: 'venue_id,user_id' },
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venue-detail', venueId] })
      queryClient.invalidateQueries({ queryKey: ['venue-ratings', venueId] })
      queryClient.invalidateQueries({ queryKey: ['venue-user-rating', venueId, userId] })
    },
  })

  // ── Derived values ───────────────────────────────────────────────────────

  // Claim QR: shown to any signed-in user while the venue is unclaimed; hidden once
  // a claim exists (venues_id anchor set). Turns it into a self-serve growth loop.
  const canClaim = !!user && !!venueId && !((venue as { venues_id?: string | null } | null)?.venues_id)
  const totalCourts = (venue?.indoor_courts ?? 0) + (venue?.outdoor_courts ?? 0) + (venue?.covered_courts ?? 0)
  const hoursConfirmed = !!venue?.opening_hours && !isSeedDefaultHours(venue.opening_hours as any)
  const openStatus = hoursConfirmed ? getOpenStatus(venue!.opening_hours as any) : null
  const venueSymbol = currencySymbolFor(venue?.currency)
  const pricingLabel = venue?.pricing_tier && venueSymbol ? venueSymbol.repeat(venue.pricing_tier) : null
  const venueFacilities = (venue?.facilities as string[] | null) ?? []

  // ── Loading / error states ───────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-court border-t-transparent" />
      </div>
    )
  }

  if (!venue) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 px-6 text-center">
        <p className="text-ink-2">Venue not found</p>
        <button onClick={() => goBack(navigate, '/play')} className="text-court font-medium">
          Go back
        </button>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="pb-28"
    >
      {/* 1. Hero */}
      <div className="relative h-56 overflow-hidden">
        {Array.isArray(venue.photos) && venue.photos[0] ? (
          <img
            src={(venue.photos as string[])[0]}
            alt={venue.venue_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-court-700 to-court" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <button
          onClick={() => goBack(navigate, '/play')}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow"
        >
          <ChevronLeft size={20} className="text-ink" />
        </button>
        <div className="absolute bottom-4 left-5 right-5">
          <h1 className="text-xl font-bold text-white leading-tight">{venue.venue_name}</h1>
          <div className="flex items-center gap-1 mt-1 text-white/80 text-sm">
            <MapPin size={14} />
            <span>{[venue.city, venue.postcode].filter(Boolean).join(' \u00B7 ')}</span>
          </div>
          <div className="flex gap-2 mt-2">
            {venue.ppa_bookable && (
              <span className="text-xs font-medium bg-court text-white px-2 py-0.5 rounded-full">
                Book via PPA
              </span>
            )}
            {venue.is_verified && (
              <span className="text-xs font-medium bg-court text-white px-2 py-0.5 rounded-full">
                Verified \u2713
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Quick info chips */}
      <div className="flex gap-2 px-5 mt-3 overflow-x-auto scrollbar-hide">
        {totalCourts > 0 && (
          <div className="shrink-0 rounded-xl bg-surface border border-hairline px-3 py-2 text-sm">
            {'\u{1F3BE}'} {totalCourts} courts
          </div>
        )}
        {openStatus && (
          <div className={cn(
            'shrink-0 rounded-xl bg-surface border border-hairline px-3 py-2 text-sm',
            !openStatus.isOpen && 'text-alert',
          )}>
            {'\u{1F550}'} {openStatus.todayHours
              ? (openStatus.isOpen ? `Open until ${openStatus.todayHours.close}` : 'Closed')
              : 'Closed'}
          </div>
        )}
        {pricingLabel && (
          <div className="shrink-0 rounded-xl bg-surface border border-hairline px-3 py-2 text-sm">
            {'\u{1F4B7}'} {pricingLabel}
          </div>
        )}
        {venue.rating && venue.rating > 0 && (
          <div className="shrink-0 rounded-xl bg-surface border border-hairline px-3 py-2 text-sm">
            {'\u2B50'} {venue.rating}
          </div>
        )}
      </div>

      {/* 3. Book / Directions */}
      <div className="flex gap-3 px-5 mt-4">
        {venue.ppa_bookable ? (
          <button
            onClick={() => navigate(`/play/book-court?venue_id=${venueId}`)}
            className="flex-1 rounded-xl bg-court text-white font-semibold py-3 text-sm active:scale-[0.98] transition-transform"
          >
            Book via PPA
          </button>
        ) : venue.booking_url?.trim() ? (
          <button
            onClick={() => window.open(venue.booking_url!, '_blank')}
            className="flex-1 rounded-xl bg-court text-white font-semibold py-3 text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
          >
            Book via {venue.booking_platform ?? 'website'}
            <ExternalLink size={14} />
          </button>
        ) : venue.website?.trim() ? (
          <button
            onClick={() => window.open(venue.website!, '_blank')}
            className="flex-1 rounded-xl bg-court text-white font-semibold py-3 text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
          >
            Visit venue website
            <ExternalLink size={14} />
          </button>
        ) : venue.phone?.trim() ? (
          <a
            href={`tel:${venue.phone}`}
            className="flex-1 rounded-xl bg-hairline text-ink font-semibold py-3 text-sm text-center active:scale-[0.98] transition-transform"
          >
            Call venue
          </a>
        ) : null}
        <button
          onClick={() => window.open(googleMapsUrl(venue.latitude, venue.longitude, venue.full_address), '_blank')}
          className="flex-1 rounded-xl bg-hairline text-ink font-semibold py-3 text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
        >
          <MapPin size={16} /> Directions
        </button>
      </div>

      {/* Claim CTA — shown to anyone while the venue is unclaimed; hides once claimed */}
      {canClaim && (
        <div className="px-5 mt-3">
          <button
            onClick={() => setShowClaimQr(true)}
            className="w-full rounded-xl border border-dashed border-court-100 bg-court-50 text-court-700 font-semibold py-2.5 text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <QrCode size={16} /> Own this venue? Claim it
          </button>
        </div>
      )}

      {/* Claim-QR modal */}
      {showClaimQr && venueId && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-scrim p-4"
          onClick={() => setShowClaimQr(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-card p-6 text-center relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowClaimQr(false)}
              className="absolute top-4 right-4 text-ink-2 active:scale-90 transition-transform"
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <p className="text-[13px] font-semibold text-court-700">Claim this venue on Wynaxa Hub</p>
            <h3 className="text-lg font-bold text-ink mt-0.5 mb-4">{venue.venue_name}</h3>
            <div className="bg-card p-4 rounded-2xl border border-hairline inline-block">
              <QRCodeSVG value={venueClaimUrl(venueId)} size={200} />
            </div>
            <p className="text-[12px] text-ink-2 mt-4 leading-relaxed">
              Scan with a phone to claim it — or claim it right now. Manage courts, pricing,
              hours and bookings from Wynaxa Hub.
            </p>
            <a
              href={venueClaimUrl(venueId)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-court px-6 py-3 text-[14px] font-bold text-white active:scale-[0.98] transition-transform"
            >
              Claim it now →
            </a>
          </div>
        </div>
      )}

      {/* 4. Courts */}
      {totalCourts > 0 && (
        <section className="px-5 mt-6">
          <h2 className="text-base font-semibold text-ink mb-3">Courts</h2>
          <div className="grid grid-cols-3 gap-2">
            {(venue.indoor_courts ?? 0) > 0 && (
              <div className="rounded-xl bg-surface border border-hairline p-3 text-center">
                <div className="text-xl">{'\u{1F3E0}'}</div>
                <div className="text-sm font-medium mt-1">{venue.indoor_courts} Indoor</div>
              </div>
            )}
            {(venue.outdoor_courts ?? 0) > 0 && (
              <div className="rounded-xl bg-surface border border-hairline p-3 text-center">
                <div className="text-xl">{'\u2600\uFE0F'}</div>
                <div className="text-sm font-medium mt-1">{venue.outdoor_courts} Outdoor</div>
              </div>
            )}
            {(venue.covered_courts ?? 0) > 0 && (
              <div className="rounded-xl bg-surface border border-hairline p-3 text-center">
                <div className="text-xl">{'\u26FA'}</div>
                <div className="text-sm font-medium mt-1">{venue.covered_courts} Covered</div>
              </div>
            )}
          </div>
          {venue.surface_type && (
            <p className="text-sm text-ink-2 mt-2">
              Surface: <span className="capitalize">{venue.surface_type.replace(/_/g, ' ')}</span>
            </p>
          )}
          {(venue.singles_courts ?? 0) > 0 && (
            <p className="text-sm text-court mt-1">Singles courts available</p>
          )}
        </section>
      )}

      {/* Classes & coaching — bookable sessions run by the venue's coaches */}
      {classes.length > 0 && (
        <section className="px-5 mt-6">
          <h2 className="text-base font-semibold text-ink mb-3">Classes &amp; coaching</h2>
          <div className="space-y-2">
            {classes.map((c: any) => {
              const full = c.booked >= c.capacity
              const spots = Math.max(0, c.capacity - c.booked)
              return (
                <div key={c.id} className="rounded-xl bg-surface border border-hairline p-3 flex items-center gap-3">
                  <button
                    onClick={() => c.coach_user_id && navigate(`/coaches/${c.coach_user_id}`)}
                    className="flex-shrink-0 active:scale-95 transition-transform"
                    aria-label={`View ${c.coachName}`}
                  >
                    {c.coachAvatar ? (
                      <img src={c.coachAvatar} alt={c.coachName} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-court-100 flex items-center justify-center text-lg">{'\u{1F3BE}'}</div>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{c.title}</p>
                    <p className="text-xs text-ink-2 truncate">
                      {format(new Date(c.start_at), 'EEE d MMM · HH:mm', { locale })} · {c.coachName}
                    </p>
                    {c.coachHeadline && <p className="text-[11px] text-court truncate">{c.coachHeadline}</p>}
                    {Array.isArray(c.coachSpecialties) && c.coachSpecialties.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {c.coachSpecialties.slice(0, 3).map((sp: string) => (
                          <span key={sp} className="text-[11px] leading-none px-1.5 py-1 rounded-full bg-court-50 text-court-700 border border-court-100">
                            {sp}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] mt-0.5">
                      {c.price_pence != null && (
                        <span className="font-semibold text-ink-2">{money(c.price_pence, c.currency ?? venue.currency)}</span>
                      )}
                      {c.price_pence != null && <span className="text-ink-3"> · </span>}
                      <span className="text-ink-2">{c.mine ? 'You’re booked' : full ? 'Full' : `${spots} spot${spots === 1 ? '' : 's'} left`}</span>
                    </p>
                  </div>
                  {c.mine ? (
                    <span className="text-[12px] font-semibold text-court flex-shrink-0">Booked ✓</span>
                  ) : (
                    <button
                      disabled={full || bookClass.isPending}
                      onClick={() => bookClass.mutate(c.id)}
                      className="h-8 px-3 rounded-lg bg-court text-white text-[12px] font-semibold disabled:opacity-40 flex-shrink-0 active:scale-95 transition-transform"
                    >
                      Book
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Tournaments hosted here — tap through to the league to join & play */}
      {tournaments.length > 0 && (
        <section className="px-5 mt-6">
          <h2 className="text-base font-semibold text-ink mb-3">Tournaments</h2>
          <div className="space-y-2">
            {tournaments.map((tn: any) => (
              <button key={tn.id} onClick={() => navigate(`/compete/leagues/${tn.id}`)}
                className="w-full flex items-center gap-3 rounded-xl bg-surface border border-hairline p-3 text-left active:scale-[0.98] transition-transform">
                <div className="w-10 h-10 rounded-lg bg-warn-100 flex items-center justify-center flex-shrink-0 text-lg">{'\u{1F3C6}'}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{tn.name}</p>
                  <p className="text-xs text-ink-2 truncate">
                    {tn.tournament_start && format(new Date(tn.tournament_start), 'EEE d MMM · HH:mm', { locale })}
                    {` · ${tn.participants}${tn.max_participants ? `/${tn.max_participants}` : ''} players`}
                    {tn.entry_fee_pence > 0 && ` · ${money(tn.entry_fee_pence, venue.currency)}`}
                  </p>
                </div>
                <ChevronLeft size={16} className="text-ink-3 rotate-180 shrink-0" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 5. Opening Hours */}
      <section className="px-5 mt-6">
        <h2 className="text-base font-semibold text-ink mb-3">Opening Hours</h2>
        {!hoursConfirmed ? (
          <WaitingOnInfo text="Opening hours not confirmed yet — waiting on the venue." />
        ) : (
          <div className="space-y-1">
            {DAY_ORDER.map((dayKey) => {
              const hours = (venue.opening_hours as any)?.[dayKey]
              const isToday = DAY_NAMES[new Date().getDay()] === dayKey
              const dayLabel = DAY_LABELS[DAY_ORDER.indexOf(dayKey)]
              return (
                <div
                  key={dayKey}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-3 py-2 text-sm',
                    isToday ? 'bg-court-50 font-medium' : '',
                  )}
                >
                  <span className={cn(isToday ? 'text-court-700' : 'text-ink-2')}>
                    {dayLabel}
                    {isToday && openStatus && (
                      <span className={cn(
                        'ml-2 text-xs px-1.5 py-0.5 rounded-full',
                        openStatus.isOpen
                          ? 'bg-court-50 text-court'
                          : 'bg-alert-50 text-alert',
                      )}>
                        {openStatus.isOpen ? 'Open now' : 'Closed'}
                      </span>
                    )}
                  </span>
                  <span className={cn(isToday ? 'text-court-700' : 'text-ink-2')}>
                    {hours ? `${hours.open} - ${hours.close}` : 'Closed'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* 6. Facilities */}
      {venueFacilities.length > 0 && (
        <section className="px-5 mt-6">
          <h2 className="text-base font-semibold text-ink mb-3">Facilities</h2>
          <div className="grid grid-cols-3 gap-2">
            {ALL_FACILITY_KEYS.map((key) => {
              const f = FACILITY_MAP[key]
              const available = venueFacilities.includes(key)
              return (
                <div
                  key={key}
                  className={cn(
                    'rounded-xl border p-3 text-center text-sm',
                    available
                      ? 'bg-surface border-hairline'
                      : 'bg-surface/50 border-hairline opacity-40',
                  )}
                >
                  <div className="text-lg">{f.icon}</div>
                  <div className="mt-1 text-xs">{f.label}</div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 7. About */}
      <section className="px-5 mt-6">
        <h2 className="text-base font-semibold text-ink mb-2">About</h2>
        {venue.description
          ? <p className="text-sm text-ink-2 leading-relaxed">{venue.description}</p>
          : <WaitingOnInfo />}
        {venue.is_members_only && (
          <div className="mt-3 rounded-xl bg-warn-50 border border-warn p-3 text-sm text-warn">
            Members only {venue.membership_required ? `\u2014 ${venue.membership_required}` : ''}
          </div>
        )}
      </section>

      {/* 8. Rate this venue */}
      {hasPlayed && userId && (
        <section className="px-5 mt-6">
          <h2 className="text-base font-semibold text-ink mb-3">Rate this venue</h2>
          <div className="flex gap-1 mb-3">
            {Array.from({ length: 5 }, (_, i) => (
              <button
                key={i}
                onClick={() => setUserRating(i + 1)}
                className="p-1"
              >
                <Star
                  size={28}
                  className={cn(
                    'transition-colors',
                    i < userRating
                      ? 'fill-court text-court'
                      : 'text-ink-3',
                  )}
                />
              </button>
            ))}
          </div>
          <textarea
            value={userReview}
            onChange={(e) => setUserReview(e.target.value)}
            placeholder="Write a review (optional)"
            rows={3}
            className="w-full rounded-xl border border-hairline p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-court/30 focus:border-court"
          />
          <button
            disabled={userRating === 0 || submitRating.isPending}
            onClick={() => submitRating.mutate({ rating: userRating, review: userReview })}
            className={cn(
              'mt-2 w-full rounded-xl py-3 text-sm font-semibold transition-colors',
              userRating > 0
                ? 'bg-court text-white active:scale-[0.98]'
                : 'bg-hairline text-ink-2 cursor-not-allowed',
            )}
          >
            {submitRating.isPending
              ? 'Submitting...'
              : existingRating
                ? 'Update review'
                : 'Submit review'}
          </button>
        </section>
      )}

      {/* 9. Reviews */}
      {ratings.length > 0 && (
        <section className="px-5 mt-6">
          <h2 className="text-base font-semibold text-ink mb-3">What players say</h2>
          <div className="space-y-3">
            {ratings.map((r: any) => (
              <div key={r.id} className="rounded-xl bg-surface border border-hairline p-4">
                <div className="flex items-center gap-2 mb-2">
                  <PlayerAvatar
                    name={r.profiles?.name ?? 'Player'}
                    avatarUrl={r.profiles?.avatar_url}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {r.profiles?.name ?? 'Player'}
                    </p>
                    <div className="flex items-center gap-0.5">{renderStars(r.rating)}</div>
                  </div>
                  <span className="text-xs text-ink-2">
                    {format(new Date(r.created_at), 'd MMM yyyy', { locale })}
                  </span>
                </div>
                {r.review && <p className="text-sm text-ink-2">{r.review}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 10. Nearby Venues */}
      {nearbyVenues.length > 0 && (
        <section className="px-5 mt-6">
          <h2 className="text-base font-semibold text-ink mb-3">Nearby Venues</h2>
          <div className="space-y-2">
            {nearbyVenues.map((v: any) => (
              <button
                key={v.venue_id}
                onClick={() => navigate(`/venues/${v.venue_id}`)}
                className="w-full flex items-center gap-3 rounded-xl bg-surface border border-hairline p-3 text-left active:scale-[0.98] transition-transform"
              >
                <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-court-100">
                  {v.photos?.[0] ? (
                    <img
                      src={(v.photos as string[])[0]}
                      alt={v.venue_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-court-100 to-court flex items-center justify-center text-white text-lg">
                      {'\u{1F3BE}'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{v.venue_name}</p>
                  <p className="text-xs text-ink-2 truncate">
                    {v.city}
                    {v.distance_miles != null && (
                      <> &middot; {v.distance_miles < 10
                        ? v.distance_miles.toFixed(1)
                        : Math.round(v.distance_miles)} mi</>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-ink-2">
                      {(v.indoor_courts ?? 0) + (v.outdoor_courts ?? 0)} courts
                    </span>
                    {v.ppa_bookable && (
                      <span className="text-[11px] font-medium bg-court-50 text-court px-1.5 py-0.5 rounded-full">
                        PPA
                      </span>
                    )}
                    {v.rating > 0 && (
                      <span className="text-xs text-ink-2 flex items-center gap-0.5">
                        <Star size={10} className="fill-warn text-warn" /> {v.rating}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronLeft size={16} className="text-ink-3 rotate-180 shrink-0" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 11. Contact */}
      {(venue.phone || venue.email || venue.instagram || venue.website) && (
        <section className="px-5 mt-6 mb-6">
          <h2 className="text-base font-semibold text-ink mb-3">Contact</h2>
          <div className="space-y-2">
            {venue.phone && (
              <a
                href={`tel:${venue.phone}`}
                className="flex items-center gap-3 rounded-xl bg-surface border border-hairline p-3 text-sm text-ink-2"
              >
                <Phone size={16} className="text-court shrink-0" />
                {venue.phone}
              </a>
            )}
            {venue.email && (
              <a
                href={`mailto:${venue.email}`}
                className="flex items-center gap-3 rounded-xl bg-surface border border-hairline p-3 text-sm text-ink-2"
              >
                <Mail size={16} className="text-court shrink-0" />
                {venue.email}
              </a>
            )}
            {venue.instagram && (
              <a
                href={`https://instagram.com/${venue.instagram.replace(/^@/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl bg-surface border border-hairline p-3 text-sm text-ink-2"
              >
                <Globe size={16} className="text-court shrink-0" />
                @{venue.instagram.replace(/^@/, '')}
              </a>
            )}
            {venue.website && (
              <a
                href={venue.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl bg-surface border border-hairline p-3 text-sm text-ink-2"
              >
                <ExternalLink size={16} className="text-court shrink-0" />
                {venue.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            )}
          </div>
        </section>
      )}
    </motion.div>
  )
}
