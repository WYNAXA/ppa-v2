import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, MapPin, Star, ExternalLink, Phone, Mail, Globe } from 'lucide-react'
import { format } from 'date-fns'
import { useDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'
import { calculateDistance } from '@/lib/travelUtils'

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
  const isOpen = nowMinutes >= openMin && nowMinutes < closeMin
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

function renderStars(rating: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <Star
      key={i}
      size={14}
      className={cn(
        i < Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-gray-300',
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

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: venue, isLoading } = useQuery({
    queryKey: ['venue-detail', venueId],
    enabled: !!venueId,
    queryFn: async () => {
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

  const { data: nearbyVenues = [] } = useQuery({
    queryKey: ['nearby-venues', venueId, venue?.latitude, venue?.longitude],
    enabled: !!venue?.latitude && !!venue?.longitude,
    queryFn: async () => {
      const { data } = await supabase
        .from('padel_venues')
        .select('venue_id, venue_name, city, indoor_courts, outdoor_courts, rating, ppa_bookable, photos')
        .neq('venue_id', venueId!)
        .limit(10)
      return (data ?? [])
        .sort((a: any, b: any) => {
          const dA = a.latitude && a.longitude
            ? calculateDistance(venue!.latitude, venue!.longitude, a.latitude, a.longitude)
            : Infinity
          const dB = b.latitude && b.longitude
            ? calculateDistance(venue!.latitude, venue!.longitude, b.latitude, b.longitude)
            : Infinity
          return dA - dB
        })
        .slice(0, 3)
    },
  })

  // ── Mutations ────────────────────────────────────────────────────────────

  const submitRating = useMutation({
    mutationFn: async ({ rating, review }: { rating: number; review: string }) => {
      await supabase.from('venue_ratings').upsert(
        { venue_id: venueId!, user_id: userId!, rating, review },
        { onConflict: 'venue_id,user_id' },
      )
      const { data: agg } = await supabase
        .from('venue_ratings')
        .select('rating')
        .eq('venue_id', venueId!)
      if (agg) {
        const avg = agg.reduce((s, r) => s + r.rating, 0) / agg.length
        await supabase
          .from('padel_venues')
          .update({ rating: Math.round(avg * 100) / 100, review_count: agg.length })
          .eq('venue_id', venueId!)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venue-detail', venueId] })
      queryClient.invalidateQueries({ queryKey: ['venue-ratings', venueId] })
      queryClient.invalidateQueries({ queryKey: ['venue-user-rating', venueId, userId] })
    },
  })

  // ── Derived values ───────────────────────────────────────────────────────

  const totalCourts = (venue?.indoor_courts ?? 0) + (venue?.outdoor_courts ?? 0) + (venue?.covered_courts ?? 0)
  const openStatus = venue?.opening_hours ? getOpenStatus(venue.opening_hours as any) : null
  const pricingLabel = venue?.pricing_tier ? '\u00A3'.repeat(venue.pricing_tier) : null
  const venueFacilities = (venue?.facilities as string[] | null) ?? []

  // ── Loading / error states ───────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-500 border-t-transparent" />
      </div>
    )
  }

  if (!venue) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 px-6 text-center">
        <p className="text-gray-500">Venue not found</p>
        <button onClick={() => navigate(-1)} className="text-teal-600 font-medium">
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
        {venue.photos?.[0] ? (
          <img
            src={(venue.photos as string[])[0]}
            alt={venue.venue_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-teal-700 to-teal-500" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow"
        >
          <ChevronLeft size={20} className="text-gray-800" />
        </button>
        <div className="absolute bottom-4 left-5 right-5">
          <h1 className="text-xl font-bold text-white leading-tight">{venue.venue_name}</h1>
          <div className="flex items-center gap-1 mt-1 text-white/80 text-sm">
            <MapPin size={14} />
            <span>{[venue.city, venue.postcode].filter(Boolean).join(' \u00B7 ')}</span>
          </div>
          <div className="flex gap-2 mt-2">
            {venue.ppa_bookable && (
              <span className="text-xs font-medium bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                Book via PPA
              </span>
            )}
            {venue.is_verified && (
              <span className="text-xs font-medium bg-blue-500 text-white px-2 py-0.5 rounded-full">
                Verified \u2713
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Quick info chips */}
      <div className="flex gap-2 px-5 mt-3 overflow-x-auto scrollbar-hide">
        {totalCourts > 0 && (
          <div className="shrink-0 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-sm">
            {'\u{1F3BE}'} {totalCourts} courts
          </div>
        )}
        {openStatus && (
          <div className={cn(
            'shrink-0 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-sm',
            !openStatus.isOpen && 'text-red-600',
          )}>
            {'\u{1F550}'} {openStatus.todayHours
              ? (openStatus.isOpen ? `Open until ${openStatus.todayHours.close}` : 'Closed')
              : 'Closed'}
          </div>
        )}
        {pricingLabel && (
          <div className="shrink-0 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-sm">
            {'\u{1F4B7}'} {pricingLabel}
          </div>
        )}
        {venue.rating && venue.rating > 0 && (
          <div className="shrink-0 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-sm">
            {'\u2B50'} {venue.rating}
          </div>
        )}
      </div>

      {/* 3. Book / Directions */}
      <div className="flex gap-3 px-5 mt-4">
        {venue.ppa_bookable ? (
          <button
            onClick={() => navigate(`/play/book-court?venue_id=${venueId}`)}
            className="flex-1 rounded-xl bg-teal-600 text-white font-semibold py-3 text-sm active:scale-[0.98] transition-transform"
          >
            Book via PPA
          </button>
        ) : venue.booking_url?.trim() ? (
          <button
            onClick={() => window.open(venue.booking_url!, '_blank')}
            className="flex-1 rounded-xl bg-teal-600 text-white font-semibold py-3 text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
          >
            Book via {venue.booking_platform ?? 'website'}
            <ExternalLink size={14} />
          </button>
        ) : venue.website?.trim() ? (
          <button
            onClick={() => window.open(venue.website!, '_blank')}
            className="flex-1 rounded-xl bg-teal-600 text-white font-semibold py-3 text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
          >
            Visit venue website
            <ExternalLink size={14} />
          </button>
        ) : venue.phone?.trim() ? (
          <a
            href={`tel:${venue.phone}`}
            className="flex-1 rounded-xl bg-gray-200 text-gray-800 font-semibold py-3 text-sm text-center active:scale-[0.98] transition-transform"
          >
            Call venue
          </a>
        ) : null}
        <button
          onClick={() => window.open(googleMapsUrl(venue.latitude, venue.longitude, venue.full_address), '_blank')}
          className="flex-1 rounded-xl bg-gray-100 text-gray-800 font-semibold py-3 text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
        >
          <MapPin size={16} /> Directions
        </button>
      </div>

      {/* 4. Courts */}
      {totalCourts > 0 && (
        <section className="px-5 mt-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Courts</h2>
          <div className="grid grid-cols-3 gap-2">
            {venue.indoor_courts > 0 && (
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
                <div className="text-xl">{'\u{1F3E0}'}</div>
                <div className="text-sm font-medium mt-1">{venue.indoor_courts} Indoor</div>
              </div>
            )}
            {venue.outdoor_courts > 0 && (
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
                <div className="text-xl">{'\u2600\uFE0F'}</div>
                <div className="text-sm font-medium mt-1">{venue.outdoor_courts} Outdoor</div>
              </div>
            )}
            {venue.covered_courts > 0 && (
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
                <div className="text-xl">{'\u26FA'}</div>
                <div className="text-sm font-medium mt-1">{venue.covered_courts} Covered</div>
              </div>
            )}
          </div>
          {venue.surface_type && (
            <p className="text-sm text-gray-500 mt-2">
              Surface: <span className="capitalize">{venue.surface_type.replace(/_/g, ' ')}</span>
            </p>
          )}
          {venue.singles_courts > 0 && (
            <p className="text-sm text-teal-600 mt-1">Singles courts available</p>
          )}
        </section>
      )}

      {/* 5. Opening Hours */}
      {venue.opening_hours && (
        <section className="px-5 mt-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Opening Hours</h2>
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
                    isToday ? 'bg-teal-50 font-medium' : '',
                  )}
                >
                  <span className={cn(isToday ? 'text-teal-700' : 'text-gray-700')}>
                    {dayLabel}
                    {isToday && openStatus && (
                      <span className={cn(
                        'ml-2 text-xs px-1.5 py-0.5 rounded-full',
                        openStatus.isOpen
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-600',
                      )}>
                        {openStatus.isOpen ? 'Open now' : 'Closed'}
                      </span>
                    )}
                  </span>
                  <span className={cn(isToday ? 'text-teal-700' : 'text-gray-500')}>
                    {hours ? `${hours.open} - ${hours.close}` : 'Closed'}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 6. Facilities */}
      {venueFacilities.length > 0 && (
        <section className="px-5 mt-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Facilities</h2>
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
                      ? 'bg-gray-50 border-gray-100'
                      : 'bg-gray-50/50 border-gray-50 opacity-40',
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
      {venue.description && (
        <section className="px-5 mt-6">
          <h2 className="text-base font-semibold text-gray-900 mb-2">About</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{venue.description}</p>
          {venue.is_members_only && (
            <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              Members only {venue.membership_required ? `\u2014 ${venue.membership_required}` : ''}
            </div>
          )}
        </section>
      )}

      {/* 8. Rate this venue */}
      {hasPlayed && userId && (
        <section className="px-5 mt-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Rate this venue</h2>
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
                      ? 'fill-teal-500 text-teal-500'
                      : 'text-gray-300',
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
            className="w-full rounded-xl border border-gray-200 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
          />
          <button
            disabled={userRating === 0 || submitRating.isPending}
            onClick={() => submitRating.mutate({ rating: userRating, review: userReview })}
            className={cn(
              'mt-2 w-full rounded-xl py-3 text-sm font-semibold transition-colors',
              userRating > 0
                ? 'bg-teal-600 text-white active:scale-[0.98]'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed',
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
          <h2 className="text-base font-semibold text-gray-900 mb-3">What players say</h2>
          <div className="space-y-3">
            {ratings.map((r: any) => (
              <div key={r.id} className="rounded-xl bg-gray-50 border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <PlayerAvatar
                    name={r.profiles?.name ?? 'Player'}
                    avatarUrl={r.profiles?.avatar_url}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {r.profiles?.name ?? 'Player'}
                    </p>
                    <div className="flex items-center gap-0.5">{renderStars(r.rating)}</div>
                  </div>
                  <span className="text-xs text-gray-400">
                    {format(new Date(r.created_at), 'd MMM yyyy', { locale })}
                  </span>
                </div>
                {r.review && <p className="text-sm text-gray-600">{r.review}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 10. Nearby Venues */}
      {nearbyVenues.length > 0 && (
        <section className="px-5 mt-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Nearby Venues</h2>
          <div className="space-y-2">
            {nearbyVenues.map((v: any) => (
              <button
                key={v.venue_id}
                onClick={() => navigate(`/venues/${v.venue_id}`)}
                className="w-full flex items-center gap-3 rounded-xl bg-gray-50 border border-gray-100 p-3 text-left active:scale-[0.98] transition-transform"
              >
                <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-teal-100">
                  {v.photos?.[0] ? (
                    <img
                      src={(v.photos as string[])[0]}
                      alt={v.venue_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-teal-200 to-teal-400 flex items-center justify-center text-white text-lg">
                      {'\u{1F3BE}'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{v.venue_name}</p>
                  <p className="text-xs text-gray-500">{v.city}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500">
                      {(v.indoor_courts ?? 0) + (v.outdoor_courts ?? 0)} courts
                    </span>
                    {v.ppa_bookable && (
                      <span className="text-[10px] font-medium bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                        PPA
                      </span>
                    )}
                    {v.rating > 0 && (
                      <span className="text-xs text-gray-500 flex items-center gap-0.5">
                        <Star size={10} className="fill-amber-400 text-amber-400" /> {v.rating}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronLeft size={16} className="text-gray-300 rotate-180 shrink-0" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 11. Contact */}
      {(venue.phone || venue.email || venue.instagram || venue.website) && (
        <section className="px-5 mt-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Contact</h2>
          <div className="space-y-2">
            {venue.phone && (
              <a
                href={`tel:${venue.phone}`}
                className="flex items-center gap-3 rounded-xl bg-gray-50 border border-gray-100 p-3 text-sm text-gray-700"
              >
                <Phone size={16} className="text-teal-600 shrink-0" />
                {venue.phone}
              </a>
            )}
            {venue.email && (
              <a
                href={`mailto:${venue.email}`}
                className="flex items-center gap-3 rounded-xl bg-gray-50 border border-gray-100 p-3 text-sm text-gray-700"
              >
                <Mail size={16} className="text-teal-600 shrink-0" />
                {venue.email}
              </a>
            )}
            {venue.instagram && (
              <a
                href={`https://instagram.com/${venue.instagram.replace(/^@/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl bg-gray-50 border border-gray-100 p-3 text-sm text-gray-700"
              >
                <Globe size={16} className="text-teal-600 shrink-0" />
                @{venue.instagram.replace(/^@/, '')}
              </a>
            )}
            {venue.website && (
              <a
                href={venue.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl bg-gray-50 border border-gray-100 p-3 text-sm text-gray-700"
              >
                <ExternalLink size={16} className="text-teal-600 shrink-0" />
                {venue.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            )}
          </div>
        </section>
      )}
    </motion.div>
  )
}
