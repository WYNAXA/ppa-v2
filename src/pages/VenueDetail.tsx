import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, MapPin, Star, ExternalLink, Phone, Mail, Globe, MessageCircle } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { money, majorToMinor } from '@/lib/money'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { AskVenueSheet } from '@/components/play/AskVenueSheet'
import { cn } from '@/lib/utils'
import { confirmedCourtCount } from '@/lib/venueRows'
import { hoursAreTrustworthy } from '@/lib/venueHours'
import { goBack } from '@/lib/navigation'
import { venueTierLabel } from '@/lib/venueTier'
import { openUrl } from '@/lib/openUrl'

// ── Constants ────────────────────────────────────────────────────────────────

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

const FACILITY_MAP: Record<string, { icon: string }> = {
  parking: { icon: '\u{1F17F}\uFE0F' },
  changing_rooms: { icon: '\u{1F6BF}' },
  bar: { icon: '\u{1F37A}' },
  pro_shop: { icon: '\u{1F6D2}' },
  coaching: { icon: '\u{1F3BE}' },
  equipment_hire: { icon: '\u{1F3D3}' },
  cafe: { icon: '\u2615' },
  showers: { icon: '\u{1F6BF}' },
  lockers: { icon: '\u{1F510}' },
  viewing_area: { icon: '\u{1F441}' },
}

/** Display order for the facility grid — FACILITY_MAP's own key order. */
const FACILITY_ORDER = Object.keys(FACILITY_MAP)

/**
 * The five boolean facility columns, and the FACILITY_MAP key each one means.
 *
 * Each of these columns is `DEFAULT false`, and 5,8xx of the 6,099 rows sit on
 * that default. So `false` means "nobody has told us", NOT "this venue has
 * none" — which is why only `true` puts a tile on the page. The previous
 * Facilities grid rendered a greyed-out tile for every key the venue did not
 * list, i.e. it asserted the absence of ten facilities on the strength of a
 * column default. Same class of error as the fabricated seed opening hours.
 *
 * `cafe_bar` is one column covering both, and maps to `cafe`; a venue that
 * genuinely has a bar carries `bar` in `amenities` (Rocket Padel does), which
 * adds the Bar tile on its own.
 */
const FACILITY_FLAGS = [
  { column: 'parking_available', key: 'parking' },
  { column: 'changing_rooms', key: 'changing_rooms' },
  { column: 'cafe_bar', key: 'cafe' },
  { column: 'coaching_available', key: 'coaching' },
  { column: 'equipment_rental', key: 'equipment_hire' },
] as const

/**
 * Free-form `amenities` tags that mean the same thing as a facility tile.
 *
 * `amenities` is enrichment output: 57 distinct tags across 276 venues, with a
 * long tail. The ones below duplicate a facility we already have an icon for,
 * so they fold into the grid instead of appearing twice.
 */
const AMENITY_TO_FACILITY: Record<string, string> = {
  parking: 'parking',
  free_parking: 'parking',
  // `parking_nearby` and `limited_parking` deliberately do NOT fold into the
  // Parking tile: a player choosing between two clubs is asking whether they
  // can park, and both of those answers are "sort of". They render as their own
  // chips instead, saying what the venue actually said.
  changing_rooms: 'changing_rooms',
  luxury_changing_rooms: 'changing_rooms',
  showers: 'showers',
  lockers: 'lockers',
  cafe: 'cafe',
  bistro: 'cafe',
  restaurant: 'cafe',
  bar: 'bar',
  lounge: 'bar',
  pro_shop: 'pro_shop',
  shop: 'pro_shop',
  retail: 'pro_shop',
  coaching: 'coaching',
  equipment_hire: 'equipment_hire',
  equipment_rental: 'equipment_hire',
  viewing_area: 'viewing_area',
  spectator_stands: 'viewing_area',
  mezzanine: 'viewing_area',
}

/** Amenity tags the Courts section already states — dropped to avoid saying it twice. */
const COURT_SHAPE_AMENITIES = new Set(['indoor', 'outdoor', 'covered', 'panoramic'])

/**
 * Tags that are the venue's own marketing rather than a fact a player can act
 * on. We are not a venue's copywriter: repeating "Luxury" as though the app had
 * checked is how a directory stops being trusted.
 */
const PUFFERY_AMENITIES = new Set(['luxury', 'prestigious', 'boutique'])

/** Tags whose snake_case does not title-case into something readable or honest. */
const AMENITY_LABELS: Record<string, string> = {
  ac: 'Air conditioning',
  wifi: 'Wi-Fi',
  '24hrs': 'Open 24 hours',
  sea_view: 'Sea view',
  sea_views: 'Sea view',
  city_views: 'City views',
  river_view: 'River view',
  ladies_only: 'Ladies only',
  olympic_venue: 'Olympic venue',
  ice_bath: 'Ice bath',
  swimming_pool: 'Pool',
  pool: 'Pool',
  pool_nearby: 'Pool nearby',
  beach_nearby: 'Beach nearby',
  parking_nearby: 'Parking nearby',
  limited_parking: 'Limited parking',
  shopping_mall: 'In a shopping centre',
  mall: 'In a shopping centre',
  free_courts: 'Free to play',
  public: 'Public courts',
  stadium_court: 'Stadium court',
  meeting_rooms: 'Meeting rooms',
  sports_complex: 'Part of a sports complex',
  sports_club: 'Part of a sports club',
  arts_district: 'Arts district',
}

/**
 * `surface_type` used to DEFAULT 'artificial_grass' — 5,627 such rows were
 * NULL-ified (migration 20260916100000). Any remaining value is real data
 * (on a venue with number_of_courts > 0) and should be rendered.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * A jsonb tag column (`facilities`, `amenities`) as a string list.
 *
 * Three rows store amenities DOUBLE-ENCODED — a jsonb string containing a JSON
 * array — which is a data defect, fixed by migration
 * `20260912_fix_double_encoded_amenities`. This function deliberately does not
 * parse strings: papering over it here would hide the next row that lands
 * malformed.
 */
function tagList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

function amenityLabel(tag: string, t: TFunction): string {
  const override = AMENITY_LABELS[tag]
  if (override) return t(`venue.amenity_${tag}`, { defaultValue: override })
  const words = tag.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function getOpenStatus(openingHours: Record<string, { open: string; close: string }> | null, t: TFunction) {
  if (!openingHours) return { isOpen: false, label: t('venue.hours_unknown'), todayHours: null }
  const now = new Date()
  const dayKey = DAY_NAMES[now.getDay()]
  const hours = openingHours[dayKey]
  if (!hours) return { isOpen: false, label: t('venue.closed'), todayHours: null }
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
    label: isOpen ? t('venue.open_closes_at', { time: hours.close }) : t('venue.closed_opens_at', { time: hours.open }),
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
// isSeedDefaultHours replaced by shared hoursAreTrustworthy() in @/lib/venueHours

function WaitingOnInfo({ text }: { text?: string }) {
  const { t } = useTranslation()
  return (
    <p className="text-sm text-ink-2 italic">
      {text ?? t('venue.waiting_default')}
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
  const { t } = useTranslation()
  const { user } = useAuth()
  const userId = user?.id

  const locale = useDateLocale()
  const [userRating, setUserRating] = useState(0)
  const [userReview, setUserReview] = useState('')
  const [hasFlagged, setHasFlagged] = useState(false)
  const [flagging, setFlagging] = useState(false)
  const [showAskVenue, setShowAskVenue] = useState(false)

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
    enabled: !!venueId && !!userId,
    queryFn: async () => {
      const { count } = await supabase
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .eq('padel_venue_id', venueId!)
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
      return list.map((s: any) => ({ ...s, booked: counts.get(s.id) ?? 0, mine: mine.has(s.id), coachName: coachName.get(s.coach_user_id) ?? null, coachAvatar: coachAvatar.get(s.coach_user_id) ?? null, coachHeadline: coachHeadline.get(s.coach_user_id) ?? null, coachSpecialties: coachSpecialties.get(s.coach_user_id) ?? null }))
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
        case 'booked': toast.success(t('venue.toast_class_booked')); break
        case 'already_booked': toast(t('venue.toast_class_already')); break
        case 'full': toast.error(t('venue.toast_class_full')); break
        case 'past': toast.error(t('venue.toast_class_past')); break
        default: toast.error(t('venue.toast_class_unavailable'))
      }
    },
    onError: () => toast.error(t('venue.toast_class_error')),
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

  // Player interest: shown to any signed-in user while the venue is unclaimed.
  const canClaim = !!user && !!venueId && !((venue as { venues_id?: string | null } | null)?.venues_id)

  // Check if current user already flagged this venue
  useEffect(() => {
    if (!canClaim || !user?.id || !venueId) return
    let cancelled = false
    supabase
      .from('player_venue_interest')
      .select('id')
      .eq('venue_id', venueId)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled && data) setHasFlagged(true) })
    return () => { cancelled = true }
  }, [canClaim, user?.id, venueId])

  async function handleFlagVenue() {
    if (!user?.id || !venueId) return
    setFlagging(true)
    const { error } = await supabase
      .from('player_venue_interest')
      .insert({ venue_id: venueId, user_id: user.id })
    setFlagging(false)
    if (error && error.code === '23505') { setHasFlagged(true); return }
    if (error) { toast.error('Could not save — try again.'); return }
    setHasFlagged(true)
    // No toast — the inline confirmation replaces the button and persists on the page
  }

  /**
   * Court count, from two columns that disagree and neither of which is
   * complete. Rocket Padel Bristol is indoor 4 / outdoor 0 / covered 0 with
   * `number_of_courts` 14: the breakdown is partial, the total is right. Taking
   * the sum alone told a 14-court club it had 4.
   */
  const isCoach = venue?.venue_type === 'coach'
  const totalCourts = (venue && !isCoach ? confirmedCourtCount(venue) : null) ?? 0
  const courtBreakdown = (venue?.indoor_courts ?? 0) + (venue?.outdoor_courts ?? 0) + (venue?.covered_courts ?? 0)
  // If the split doesn't reconcile to the total, suppress it entirely — show total only
  const splitReconciles = courtBreakdown > 0 && courtBreakdown === totalCourts

  const hoursConfirmed = hoursAreTrustworthy(venue?.opening_hours as any)
  const openStatus = hoursConfirmed ? getOpenStatus(venue!.opening_hours as any, t) : null

  /**
   * Price. `typical_court_price_peak` / `_offpeak` are numeric in MAJOR units
   * (28.00 = £28), unlike every `*_pence` column in the schema — so they go
   * through `majorToMinor` before `money`, which keeps the symbol and the
   * decimal exponent coming from the venue's own currency.
   *
   * The `pricing_tier` chip that used to sit here is gone: that column is
   * `DEFAULT 2` and reads 2 on Padel Hub Bristol (no price data at all) and on
   * Rocket Padel (£48 peak) alike. A £ £ £ indicator derived from a default is
   * decoration, not information.
   */
  const peakPrice = venue?.typical_court_price_peak != null && venue.currency
    ? money(majorToMinor(venue.typical_court_price_peak, venue.currency), venue.currency)
    : null
  const offpeakPrice = venue?.typical_court_price_offpeak != null && venue.currency
    ? money(majorToMinor(venue.typical_court_price_offpeak, venue.currency), venue.currency)
    : null
  const priceRange = offpeakPrice && peakPrice && offpeakPrice !== peakPrice
    ? `${offpeakPrice}–${peakPrice}`
    : (peakPrice ?? offpeakPrice)

  /**
   * `total_reviews` is a count carried in from the venue's public listing, and
   * is `DEFAULT 0` — so 0 means "we hold no count", not "no one has reviewed
   * it". 5,264 venues carry a real one and none of them showed it. Note this is
   * NOT the in-app `venue_ratings` count rendered further down; `rating` itself
   * is null on every row in the table, so no star average is claimed here.
   */
  const externalReviews = venue?.total_reviews && venue.total_reviews > 0 ? venue.total_reviews : null

  const surfaceType = venue?.surface_type || null

  /**
   * Facilities, unioned across the three columns that each carry part of the
   * answer: five booleans (~240–274 rows each), `facilities` (14 rows) and
   * `amenities` (276 rows). A venue can be described by any one of them, and
   * de-duplication happens on the FACILITY_MAP key so `cafe_bar = true` and
   * `amenities: ["cafe"]` produce one tile, not two.
   */
  const facilityKeys = (() => {
    if (!venue) return [] as string[]
    const keys = new Set<string>()
    for (const { column, key } of FACILITY_FLAGS) if (venue[column] === true) keys.add(key)
    for (const tag of tagList(venue.facilities)) if (FACILITY_MAP[tag]) keys.add(tag)
    for (const tag of tagList(venue.amenities)) {
      const mapped = AMENITY_TO_FACILITY[tag]
      if (mapped) keys.add(mapped)
    }
    return FACILITY_ORDER.filter((k) => keys.has(k))
  })()

  /** The long tail of amenity tags that have no facility tile — rendered as chips. */
  const amenityChips = (() => {
    if (!venue) return [] as string[]
    const labels = new Set<string>()
    for (const tag of tagList(venue.amenities)) {
      if (COURT_SHAPE_AMENITIES.has(tag)) continue
      if (PUFFERY_AMENITIES.has(tag)) continue
      if (AMENITY_TO_FACILITY[tag]) continue
      labels.add(amenityLabel(tag, t))
    }
    return [...labels]
  })()

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
        <p className="text-ink-2">{t('venue.not_found')}</p>
        <button onClick={() => goBack(navigate, '/play')} className="text-court font-medium">
          {t('venue.go_back')}
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
                {t('venue.book_via_ppa')}
              </span>
            )}
            {venue.is_verified && (
              <span className="text-xs font-medium bg-court text-white px-2 py-0.5 rounded-full">
                {t('venue.verified')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Quick info chips */}
      <div className="flex gap-2 px-5 mt-3 overflow-x-auto scrollbar-hide">
        {!isCoach && (totalCourts > 0 ? (
          <div className="shrink-0 rounded-xl bg-surface border border-hairline px-3 py-2 text-sm">
            {'\u{1F3BE}'} {t('courts.n_courts', { count: totalCourts })}
          </div>
        ) : (
          <div className="shrink-0 rounded-xl bg-surface border border-hairline px-3 py-2 text-sm text-ink-3">
            {'\u{1F3BE}'} {t('courts.courts_unconfirmed')}
          </div>
        ))}
        {isCoach && (
          <div className="shrink-0 rounded-xl bg-court-50 border border-court-100 px-3 py-2 text-sm text-court-700 font-medium">
            {'\u{1F3BE}'} {t('people.badge_coach')}
          </div>
        )}
        {openStatus && (
          <div className={cn(
            'shrink-0 rounded-xl bg-surface border border-hairline px-3 py-2 text-sm',
            !openStatus.isOpen && 'text-alert',
          )}>
            {'\u{1F550}'} {openStatus.todayHours
              ? (openStatus.isOpen ? t('venue.open_until', { time: openStatus.todayHours.close }) : t('venue.closed'))
              : t('venue.closed')}
          </div>
        )}
        {priceRange && (
          <div className="shrink-0 rounded-xl bg-surface border border-hairline px-3 py-2 text-sm">
            {'\u{1F4B7}'} {priceRange}
          </div>
        )}
        {venue.rating && venue.rating > 0 && (
          <div className="shrink-0 rounded-xl bg-surface border border-hairline px-3 py-2 text-sm">
            {'\u2B50'} {venue.rating}
          </div>
        )}
        {externalReviews != null && (
          <div className="shrink-0 rounded-xl bg-surface border border-hairline px-3 py-2 text-sm">
            {'\u{1F5E3}\uFE0F'} {t('venue.n_reviews', { count: externalReviews })}
          </div>
        )}
        {venue.is_members_only && (
          <div className="shrink-0 rounded-xl bg-warn-50 border border-warn px-3 py-2 text-sm text-warn">
            {'\u{1F511}'} {t('venue.members_only')}
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
            {t('venue.book_via_ppa')}
          </button>
        ) : venue.booking_url?.trim() ? (
          <button
            onClick={() => openUrl(venue.booking_url!)}
            className="flex-1 rounded-xl bg-court text-white font-semibold py-3 text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
          >
            {venueTierLabel({ ppa_bookable: venue.ppa_bookable, booking_platform: venue.booking_platform, booking_url: venue.booking_url })}
            <ExternalLink size={14} />
          </button>
        ) : venue.website?.trim() ? (
          <button
            onClick={() => openUrl(venue.website!)}
            className="flex-1 rounded-xl bg-court text-white font-semibold py-3 text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
          >
            {t('venue.visit_website')}
            <ExternalLink size={14} />
          </button>
        ) : venue.phone?.trim() ? (
          <a
            href={`tel:${venue.phone}`}
            className="flex-1 rounded-xl bg-hairline text-ink font-semibold py-3 text-sm text-center active:scale-[0.98] transition-transform"
          >
            {t('venue.call_venue')}
          </a>
        ) : (
          /**
           * The terminal branch. This chain used to end in `null`, so a venue
           * with no PPA booking, no booking_url, no website and no phone
           * rendered NOTHING here — Padel Hub Bristol is exactly that row
           * (booking_url is an empty string, the other three are null), which
           * is why its drawer showed no way to act at all.
           *
           * Saying we do not have the details is honest and actionable. Asking
           * the venue is also how the row gets filled in, so the dead end
           * becomes the acquisition prompt.
           */
          <button
            onClick={() => setShowAskVenue(true)}
            className="flex-1 rounded-xl border border-dashed border-court-100 bg-court-50 text-court-700 font-semibold py-3 text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
          >
            <Mail size={14} /> {t('venue.no_booking_ask')}
          </button>
        )}
        <button
          onClick={() => openUrl(googleMapsUrl(venue.latitude, venue.longitude, venue.full_address))}
          className="flex-1 rounded-xl bg-hairline text-ink font-semibold py-3 text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
        >
          <MapPin size={16} /> {t('venue.directions')}
        </button>
      </div>

      {/* How far ahead you can book — the venue's own words, where we hold them. */}
      {venue.booking_advance_info?.trim() && (
        <p className="px-5 mt-2 text-xs text-ink-2 leading-relaxed">{venue.booking_advance_info}</p>
      )}

      {/* Player interest — K5: name the product the player knows */}
      {canClaim && (
        <div className="px-5 mt-3">
          {hasFlagged ? (
            <p className="text-[12px] text-ink-2 text-center py-2 leading-relaxed">
              {t('venue.flag_confirmation', { defaultValue: 'Noted \u2014 the more players who flag this club, the sooner we reach out to them.' })}
            </p>
          ) : (
            <button
              onClick={handleFlagVenue}
              disabled={flagging}
              className="w-full rounded-xl border border-dashed border-court-100 bg-court-50 text-court-700 font-semibold py-2.5 text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <MapPin size={16} />
              {t('venue.flag_interest', { defaultValue: 'I play here \u2014 let them know about Padel Players' })}
            </button>
          )}
        </div>
      )}

      {/*
        Outreach sheet for a venue we hold no booking route for. It already
        offers both a forwardable message and a QR for the desk — the two modes
        this screen was missing.
      */}
      <AskVenueSheet
        open={showAskVenue}
        onClose={() => setShowAskVenue(false)}
        venueName={venue.venue_name ?? t('venue.this_venue')}
        city={venue.city}
        email={venue.email}
      />


      {/* 4. Courts — hidden for coaches */}
      {!isCoach && <section className="px-5 mt-6">
        <h2 className="text-base font-semibold text-ink mb-3">
          {t('courts.section_title')}{totalCourts > 0 && <span className="font-normal text-ink-2"> · {totalCourts}</span>}
        </h2>
        {totalCourts > 0 ? (
          <>
            {splitReconciles && (
              <div className="grid grid-cols-3 gap-2">
                {(venue.indoor_courts ?? 0) > 0 && (
                  <div className="rounded-xl bg-surface border border-hairline p-3 text-center">
                    <div className="text-xl">{'\u{1F3E0}'}</div>
                    <div className="text-sm font-medium mt-1">{t('venue.n_indoor', { count: venue.indoor_courts! })}</div>
                  </div>
                )}
                {(venue.outdoor_courts ?? 0) > 0 && (
                  <div className="rounded-xl bg-surface border border-hairline p-3 text-center">
                    <div className="text-xl">{'\u2600\uFE0F'}</div>
                    <div className="text-sm font-medium mt-1">{t('venue.n_outdoor', { count: venue.outdoor_courts! })}</div>
                  </div>
                )}
                {(venue.covered_courts ?? 0) > 0 && (
                  <div className="rounded-xl bg-surface border border-hairline p-3 text-center">
                    <div className="text-xl">{'\u26FA'}</div>
                    <div className="text-sm font-medium mt-1">{t('venue.n_covered', { count: venue.covered_courts! })}</div>
                  </div>
                )}
              </div>
            )}
            {surfaceType && (
              <p className="text-sm text-ink-2 mt-2">
                {t('venue.surface', { type: surfaceType.replace(/_/g, ' ') })}
              </p>
            )}
            {(venue.singles_courts ?? 0) > 0 && (
              <p className="text-sm text-court mt-1">{t('venue.singles_available')}</p>
            )}
            {(venue.panoramic_courts ?? 0) > 0 && (
              <p className="text-sm text-court mt-1">{t('venue.n_panoramic', { count: venue.panoramic_courts! })}</p>
            )}
          </>
        ) : (
          <WaitingOnInfo text={t('courts.courts_waiting')} />
        )}
      </section>}

      {/* Prices — real amounts where the venue has them, nothing where it doesn't. */}
      {(peakPrice || offpeakPrice) && (
        <section className="px-5 mt-6">
          <h2 className="text-base font-semibold text-ink mb-3">{t('venue.typical_price')}</h2>
          <div className="grid grid-cols-2 gap-2">
            {offpeakPrice && (
              <div className="rounded-xl bg-surface border border-hairline p-3">
                <div className="text-xs text-ink-2">{t('venue.off_peak')}</div>
                <div className="text-base font-semibold text-ink mt-0.5">{offpeakPrice}</div>
              </div>
            )}
            {peakPrice && (
              <div className="rounded-xl bg-surface border border-hairline p-3">
                <div className="text-xs text-ink-2">{t('venue.peak')}</div>
                <div className="text-base font-semibold text-ink mt-0.5">{peakPrice}</div>
              </div>
            )}
          </div>
          <p className="text-xs text-ink-2 mt-2">
            {t('venue.price_disclaimer')}
          </p>
        </section>
      )}

      {/* Classes & coaching — bookable sessions run by the venue's coaches */}
      {classes.length > 0 && (
        <section className="px-5 mt-6">
          <h2 className="text-base font-semibold text-ink mb-3">{t('venue.classes_coaching')}</h2>
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
                      {format(new Date(c.start_at), 'EEE d MMM · HH:mm', { locale })} · {c.coachName ?? t('venue.coach_fallback')}
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
                      <span className="text-ink-2">{c.mine ? t('venue.class_youre_booked') : full ? t('venue.class_full') : t('venue.class_spots_left', { count: spots })}</span>
                    </p>
                  </div>
                  {c.mine ? (
                    <span className="text-[12px] font-semibold text-court flex-shrink-0">{t('venue.booked_check')}</span>
                  ) : (
                    <button
                      disabled={full || bookClass.isPending}
                      onClick={() => bookClass.mutate(c.id)}
                      className="h-8 px-3 rounded-lg bg-court text-white text-[12px] font-semibold disabled:opacity-40 flex-shrink-0 active:scale-95 transition-transform"
                    >
                      {t('venue.book')}
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
          <h2 className="text-base font-semibold text-ink mb-3">{t('venue.tournaments')}</h2>
          <div className="space-y-2">
            {tournaments.map((tn: any) => (
              <button key={tn.id} onClick={() => navigate(`/compete/leagues/${tn.id}`)}
                className="w-full flex items-center gap-3 rounded-xl bg-surface border border-hairline p-3 text-left active:scale-[0.98] transition-transform">
                <div className="w-10 h-10 rounded-lg bg-warn-100 flex items-center justify-center flex-shrink-0 text-lg">{'\u{1F3C6}'}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{tn.name}</p>
                  <p className="text-xs text-ink-2 truncate">
                    {tn.tournament_start && format(new Date(tn.tournament_start), 'EEE d MMM · HH:mm', { locale })}
                    {tn.max_participants
                      ? ` · ${t('venue.tournament_players_of', { count: tn.participants, max: tn.max_participants })}`
                      : ` · ${t('venue.tournament_players', { count: tn.participants })}`}
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
        <h2 className="text-base font-semibold text-ink mb-3">{t('venue.opening_hours')}</h2>
        {!hoursConfirmed ? (
          <WaitingOnInfo text={t('venue.hours_not_confirmed')} />
        ) : (
          <div className="space-y-1">
            {DAY_ORDER.map((dayKey) => {
              const hours = (venue.opening_hours as any)?.[dayKey]
              const isToday = DAY_NAMES[new Date().getDay()] === dayKey
              const dayLabel = format(new Date(2024, 0, 1 + DAY_ORDER.indexOf(dayKey)), 'EEEE', { locale })
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
                        {openStatus.isOpen ? t('venue.open_now') : t('venue.closed')}
                      </span>
                    )}
                  </span>
                  <span className={cn(isToday ? 'text-court-700' : 'text-ink-2')}>
                    {hours ? `${hours.open} - ${hours.close}` : t('venue.closed')}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/*
        6. Facilities

        Previously this section rendered only when the near-empty `facilities`
        column was populated — 14 venues out of 6,099 — and then drew a
        greyed-out tile for every facility the venue had not listed. Both halves
        were wrong: it hid data held in the boolean columns and in `amenities`,
        and for the handful it did render it asserted the ABSENCE of the rest
        off the back of `DEFAULT false`.

        Now: present facilities only, drawn from all three columns, and an
        explicit "not confirmed" line where we hold nothing — the same honesty
        the Opening Hours and About sections already use.
      */}
      <section className="px-5 mt-6">
        <h2 className="text-base font-semibold text-ink mb-3">{t('venue.facilities')}</h2>
        {facilityKeys.length === 0 && amenityChips.length === 0 ? (
          <WaitingOnInfo text={t('venue.facilities_not_confirmed')} />
        ) : (
          <>
            {facilityKeys.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {facilityKeys.map((key) => {
                  const f = FACILITY_MAP[key]
                  return (
                    <div key={key} className="rounded-xl border border-hairline bg-surface p-3 text-center text-sm">
                      <div className="text-lg">{f.icon}</div>
                      <div className="mt-1 text-xs">{t(`venue.facility_${key}`)}</div>
                    </div>
                  )
                })}
              </div>
            )}
            {amenityChips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {amenityChips.map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-court-100 bg-court-50 px-2.5 py-1 text-[12px] text-court-700"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* 7. About */}
      <section className="px-5 mt-6">
        <h2 className="text-base font-semibold text-ink mb-2">{t('venue.about')}</h2>
        {venue.description
          ? <p className="text-sm text-ink-2 leading-relaxed">{venue.description}</p>
          : <WaitingOnInfo />}
        {/*
          `membership_required` is a BOOLEAN. Interpolating it into a string
          rendered the literal text "Members only \u2014 true" on every members-only
          venue. `membership_note` is the text column that carries the actual
          condition ("David Lloyd membership required") and was never read.

          Fix class: root-cause \u2014 the wrong column was being printed, and the
          right one existed. Suppressing the suffix would have been the patch.
        */}
        {venue.is_members_only && (
          <div className="mt-3 rounded-xl bg-warn-50 border border-warn p-3 text-sm text-warn">
            {t('venue.members_only')}{venue.membership_note?.trim() ? ` \u2014 ${venue.membership_note.trim()}` : ''}
          </div>
        )}
      </section>

      {/* 8. Rate this venue */}
      {hasPlayed && userId && (
        <section className="px-5 mt-6">
          <h2 className="text-base font-semibold text-ink mb-3">{t('venue.rate_venue')}</h2>
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
            placeholder={t('venue.review_placeholder')}
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
              ? t('venue.submitting')
              : existingRating
                ? t('venue.update_review')
                : t('venue.submit_review')}
          </button>
        </section>
      )}

      {/* 9. Reviews */}
      {ratings.length > 0 && (
        <section className="px-5 mt-6">
          <h2 className="text-base font-semibold text-ink mb-3">{t('venue.what_players_say')}</h2>
          <div className="space-y-3">
            {ratings.map((r: any) => (
              <div key={r.id} className="rounded-xl bg-surface border border-hairline p-4">
                <div className="flex items-center gap-2 mb-2">
                  <PlayerAvatar
                    name={r.profiles?.name ?? t('venue.player_fallback')}
                    avatarUrl={r.profiles?.avatar_url}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {r.profiles?.name ?? t('venue.player_fallback')}
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
          <h2 className="text-base font-semibold text-ink mb-3">{t('venue.nearby_venues')}</h2>
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
                    <span className={cn('text-xs', confirmedCourtCount(v) != null ? 'text-ink-2' : 'text-ink-3')}>
                      {confirmedCourtCount(v) != null
                        ? t('courts.n_courts', { count: confirmedCourtCount(v) })
                        : t('courts.courts_unconfirmed')}
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
      {(venue.phone || venue.whatsapp_number || venue.email || venue.instagram || venue.website) && (
        <section className="px-5 mt-6 mb-6">
          <h2 className="text-base font-semibold text-ink mb-3">{t('venue.contact')}</h2>
          <div className="space-y-2">
            {venue.whatsapp_number?.trim() && (
              <a
                href={`https://wa.me/${venue.whatsapp_number.replace(/[^\d]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl bg-surface border border-hairline p-3 text-sm text-ink-2"
              >
                <MessageCircle size={16} className="text-court shrink-0" />
                {t('venue.whatsapp')}
              </a>
            )}
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
