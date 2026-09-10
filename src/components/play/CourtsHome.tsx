import { useMemo, useState, useCallback, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Search, MapPin, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDistance } from '@/lib/travelUtils'
import { cn } from '@/lib/utils'
import { AskVenueSheet } from '@/components/play/AskVenueSheet'

// Leaflet is ~150KB and most sessions never open the map, so it loads on demand.
const VenueMap = lazy(() => import('@/components/VenueMap'))

/**
 * Courts — the landing state of the booking flow, built to `Courts.dc.html`.
 *
 * THE POINT OF THE ORDER
 *   Partner venues sit first, alone, under a ball-yellow PPA VENUE chip, with
 *   real slots and the per-player split — because a court booked here is the
 *   only thing in the app that earns money. Everything else in the directory is
 *   below the fold under "Also near you", and each of those rows is an
 *   acquisition prompt ("Ask them"), not a dead end.
 *
 *   The split line matters more than the hourly price: nobody books a court
 *   alone, and "£6 each" is the number that actually gets a yes in the group
 *   chat.
 */

type Venue = {
  /** padel_venues.venue_id — the key VenueDetail resolves. */
  id: string
  /** What the booking flow matches on; falls back to venue_id. */
  bookingId: string
  /** "Playtomic", "Own", … — who the venue actually books through today. */
  platform: string | null
  name: string
  city: string | null
  indoor: boolean
  /** Has at least one court that is not indoor. Not simply !indoor — a venue
      can have both, and the filters have to let it match either chip. */
  outdoor: boolean
  lat: number | null
  lng: number | null
  courts: number | null
  distanceMiles: number | null
  pricePence: number | null
  bookable: boolean
  /**
   * Already with Padel Players — claimed, onboarded, or live. Distinct from
   * `bookable`, which only says whether you can book *through the app today*.
   * See `useVenuesNearby` for why the two are not the same question.
   */
  onPpa: boolean
}

const KM_PER_MILE = 1.609344

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371 / KM_PER_MILE
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/**
 * Venues near the player, split into partners and the rest.
 *
 * WHY "CLAIMED" IS ITS OWN QUESTION
 *   UAT: *"make sure if it is claimed then it does not show."* Correct, and it
 *   was happening: three venues with active managers — Preggio Padel, Roshni's
 *   Padel Venue and Bristol Padel Test — sat in "Also near you" with an
 *   "Ask them" button, inviting their own managers to join a platform they are
 *   already on. Two more (Bandeja Padel Club, Filton Padel) are onboarded with a
 *   plan tier and were doing the same.
 *
 *   Root cause: the list knew one fact, `ppa_bookable`, and used it to answer
 *   two questions. `ppa_bookable` means *you can book here in the app today*. It
 *   does not mean *this venue is with us* — a venue is claimed and onboarded
 *   well before its booking goes live, and all five above are exactly that.
 *
 *   The signal is the presence of a `venues` row: that table is the Hub side of
 *   a venue and only exists once one has been onboarded. Deliberately NOT
 *   `venue_users` — its RLS lets a player read only their own rows, so querying
 *   it from the app returns empty for everyone and every venue would silently
 *   look unclaimed. `venues` is `Public can read venues`. A `venues_id` that
 *   points at nothing is treated as unclaimed, so the check is the row coming
 *   back rather than the column being non-null.
 */
function useVenuesNearby(lat: number | null, lng: number | null) {
  return useQuery<{ partner: Venue[]; others: Venue[]; total: number }>({
    queryKey: ['courts-home', lat, lng],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [{ data: bookable }, { data: nearby }, { count }] = await Promise.all([
        supabase
          .from('padel_venues')
          .select('venue_id, venues_id, venue_name, city, indoor_courts, number_of_courts, latitude, longitude, price_pence, price_per_hour, ppa_bookable, booking_platform, booking_url')
          .eq('ppa_bookable', true)
          .limit(20),
        supabase
          .from('padel_venues')
          .select('venue_id, venues_id, venue_name, city, indoor_courts, number_of_courts, latitude, longitude, price_pence, price_per_hour, ppa_bookable, booking_platform, booking_url')
          .not('ppa_bookable', 'is', true)
          .limit(200),
        supabase.from('padel_venues').select('venues_id', { count: 'exact', head: true }),
      ])

      // Which of these are already on Padel Players. Only a handful of the
      // 6,099 directory rows carry a `venues_id` at all, so this is one small
      // `in` rather than a join across the directory.
      const linkedIds = [...new Set(
        [...(bookable ?? []), ...(nearby ?? [])]
          .map((v) => (v as Record<string, unknown>).venues_id as string | null)
          .filter((id): id is string => !!id),
      )]
      const onPpaIds = new Set<string>()
      if (linkedIds.length > 0) {
        const { data: hubVenues } = await supabase.from('venues').select('id').in('id', linkedIds)
        for (const row of hubVenues ?? []) onPpaIds.add(row.id as string)
      }

      const shape = (v: Record<string, unknown>): Venue => {
        const vLat = v.latitude != null ? Number(v.latitude) : null
        const vLng = v.longitude != null ? Number(v.longitude) : null
        return {
          id: v.venue_id as string,
          bookingId: (v.venues_id as string) ?? (v.venue_id as string),
          platform: (v.booking_platform as string) || null,
          name: (v.venue_name as string) ?? '—',
          city: (v.city as string) ?? null,
          indoor: ((v.indoor_courts as number) ?? 0) > 0,
          outdoor: ((v.number_of_courts as number) ?? 0) > ((v.indoor_courts as number) ?? 0),
          lat: vLat,
          lng: vLng,
          courts: (v.number_of_courts as number) ?? null,
          distanceMiles:
            lat != null && lng != null && vLat != null && vLng != null
              ? haversineMiles(lat, lng, vLat, vLng)
              : null,
          pricePence: (v.price_pence as number) ?? ((v.price_per_hour as number) ?? null),
          bookable: v.ppa_bookable === true,
          onPpa: v.ppa_bookable === true || (!!v.venues_id && onPpaIds.has(v.venues_id as string)),
        }
      }

      const byDistance = (a: Venue, b: Venue) =>
        (a.distanceMiles ?? Number.POSITIVE_INFINITY) - (b.distanceMiles ?? Number.POSITIVE_INFINITY)

      // Sorted but NOT sliced. The caller filters first and slices after —
      // slicing here would mean the indoor filter only ever searched the three
      // rows that happened to be nearest, which is a filter that lies.
      return {
        partner: (bookable ?? []).map(shape).sort(byDistance),
        others: (nearby ?? []).map(shape).sort(byDistance),
        total: count ?? 0,
      }
    },
  })
}

/** Stable empty list — see the note where it is used. */
const NO_VENUES: Venue[] = []

export interface CourtsHomeProps {
  /** Player's coordinates, when the profile has them. */
  lat: number | null
  lng: number | null
  query: string
  onQueryChange: (v: string) => void
  onUseLocation: () => void
  /** True while the browser is resolving the player's position. The duplicate
      list this component absorbed had a spinner for this; the location button
      here had none, so a tap looked like nothing happening. */
  locating?: boolean
  onPickVenue: (venueId: string) => void
  /** Times the venue has free today, if the caller has already loaded them. */
  slotsByVenue?: Record<string, Array<{ time: string; available: boolean }>>
}

export function CourtsHome({
  lat, lng, query, onQueryChange, onUseLocation, locating = false, onPickVenue, slotsByVenue = {},
}: CourtsHomeProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [asking, setAsking] = useState<Venue | null>(null)
  const [view, setView] = useState<'list' | 'map'>('list')
  const [filters, setFilters] = useState({ indoor: false, outdoor: false, bookable: false })
  const toggleFilter = (k: keyof typeof filters) => setFilters((f) => ({ ...f, [k]: !f[k] }))
  const clearFilters = () => setFilters({ indoor: false, outdoor: false, bookable: false })
  const anyFilter = filters.indoor || filters.outdoor || filters.bookable

  const { data } = useVenuesNearby(lat, lng)

  // NO_VENUES is a module-level constant, not a fresh []. A new empty array on
  // every render changes the identity of every memo below it, so the filtering
  // would re-run on each keystroke in the search box for no reason.
  const allPartner = data?.partner ?? NO_VENUES
  const allOthers = data?.others ?? NO_VENUES
  const total = data?.total ?? 0

  // Filter the whole sorted list, then take the top few. The other order — the
  // one this code used to have implicitly — filters a three-row window and
  // calls the empty result "no courts match".
  const match = useCallback(
    (v: Venue) => {
      if (filters.bookable && !v.bookable) return false
      if (filters.indoor || filters.outdoor) {
        if (!((filters.indoor && v.indoor) || (filters.outdoor && v.outdoor))) return false
      }
      return true
    },
    [filters],
  )
  const partner = useMemo(() => allPartner.filter(match).slice(0, 3), [allPartner, match])
  const others  = useMemo(() => allOthers.filter(match).slice(0, 4),  [allOthers, match])

  // The map shows everything that survived the filters, not just the rows the
  // list had room for — that is the reason to open a map at all.
  const mapVenues = useMemo(
    () => [...allPartner, ...allOthers].filter(match).filter((v) => v.lat != null && v.lng != null),
    [allPartner, allOthers, match],
  )

  const hasAnyVenue = allPartner.length + allOthers.length > 0
  const nothingMatches = hasAnyVenue && partner.length === 0 && others.length === 0

  const money = useMemo(
    () => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }),
    [],
  )

  const meta = (v: Venue) =>
    [
      v.city,
      v.indoor ? t('courts.indoor') : t('courts.outdoor'),
      v.courts != null ? t('courts.n_courts', { count: v.courts }) : null,
      v.distanceMiles != null ? formatDistance(v.distanceMiles) : null,
    ].filter(Boolean).join(' · ')

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header + search ── */}
      <div className="flex flex-col gap-3">
        <h1 className="text-[32px] font-extrabold leading-[34px] tracking-[-0.02em] text-ink">
          {t('nav.courts')}
        </h1>
        <div className="flex items-center gap-2.5 rounded-card border border-hairline bg-card px-3.5 py-3">
          <Search className="h-[18px] w-[18px] flex-shrink-0 text-ink-2" strokeWidth={2} />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t('courts.search_placeholder')}
            className="min-w-0 flex-grow bg-transparent text-[15px] leading-5 text-ink outline-none placeholder:text-ink-3"
          />
          <button
            onClick={onUseLocation}
            disabled={locating}
            aria-label={t('courts.use_my_location')}
            aria-busy={locating}
            className="flex-shrink-0 disabled:opacity-60"
          >
            {locating ? (
              <span className="block h-[18px] w-[18px] animate-spin rounded-full border-2 border-court border-t-transparent" />
            ) : (
              <MapPin className="h-[18px] w-[18px] text-court" strokeWidth={2} />
            )}
          </button>
        </div>
      </div>

      {/* ── Filters and view, one row ──
          Ported from the duplicate that lived on the Community tab. Chips left
          because they are used often; the view toggle right because it is used
          once. Both hidden while searching by name: a text query already IS the
          filter, and a map of one result is not a map.

          The row WRAPS rather than scrolls. As a horizontal scroller it cut the
          third chip in half at 390px, which reads as a broken layout rather
          than as something you can swipe — and the longer translations
          ("Reservar en la app") make that worse, not better. */}
      {!query.trim() && hasAnyVenue && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {([
              { key: 'indoor',   label: t('courts.filter_indoor') },
              { key: 'outdoor',  label: t('courts.filter_outdoor') },
              { key: 'bookable', label: t('courts.filter_bookable') },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => toggleFilter(key)}
                aria-pressed={filters[key]}
                className={cn(
                  'min-h-[32px] flex-shrink-0 rounded-pill border px-3 py-1 text-[12px] font-semibold transition-colors active:scale-95',
                  filters[key] ? 'border-court bg-court text-on-brand' : 'border-hairline bg-card text-ink-2',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {lat != null && lng != null && (
            <div className="ml-auto flex flex-shrink-0 rounded-pill bg-hairline p-0.5">
              {(['list', 'map'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={cn(
                    'rounded-pill px-2.5 py-1 text-[11px] font-bold transition-colors',
                    view === v ? 'bg-card text-ink shadow-sm' : 'text-ink-2',
                  )}
                >
                  {v === 'list' ? t('courts.view_list') : t('courts.view_map')}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Nothing left after filtering. Says so, and offers the way back. */}
      {!query.trim() && nothingMatches && (
        <div className="rounded-card border border-dashed border-hairline bg-surface px-4 py-6 text-center">
          <p className="text-[13px] font-semibold text-ink-2">{t('courts.filter_none_match')}</p>
          {anyFilter && (
            <button
              onClick={clearFilters}
              className="mt-3 inline-flex min-h-[44px] items-center rounded-pill bg-court px-4 py-2 text-[13px] font-semibold text-on-brand active:scale-95"
            >
              {t('courts.filter_clear')}
            </button>
          )}
        </div>
      )}

      {/* ── Map ── */}
      {!query.trim() && view === 'map' && lat != null && lng != null && mapVenues.length > 0 && (
        <Suspense
          fallback={
            <div className="flex h-[360px] w-full items-center justify-center rounded-card border border-hairline bg-surface">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-court border-t-transparent" />
            </div>
          }
        >
          <VenueMap
            venues={mapVenues.map((v) => ({
              venue_id: v.id,
              venue_name: v.name,
              city: v.city,
              latitude: v.lat,
              longitude: v.lng,
              distance_miles: v.distanceMiles,
            }))}
            center={{ lat, lng }}
            onSelect={(id) => navigate(`/venues/${id}`)}
          />
        </Suspense>
      )}

      {/* ── Book instantly — the venues that pay ── */}
      {!query.trim() && view === 'list' && partner.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
              {t('courts.book_instantly')}
            </h2>
            <span className="rounded-pill bg-ball px-2 py-[3px] text-[11px] font-extrabold leading-[14px] tracking-[0.03em] text-ink">
              {t('courts.ppa_venue')}
            </span>
          </div>

          {partner.map((v) => {
            const slots = slotsByVenue[v.id] ?? []
            const perPlayer = v.pricePence != null ? Math.round(v.pricePence / 4) : null
            return (
              <button
                key={v.id}
                onClick={() => onPickVenue(v.bookingId)}
                className="flex flex-col gap-3.5 rounded-panel border-[1.5px] border-court bg-card p-4 text-left"
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex min-w-0 flex-col gap-[3px]">
                    <p className="truncate text-[17px] font-bold leading-[21px] text-ink">{v.name}</p>
                    <p className="num truncate text-[13px] leading-[18px] text-ink-2">{meta(v)}</p>
                  </div>
                  {v.pricePence != null && (
                    <div className="flex-shrink-0 text-right">
                      <p className="num text-[17px] font-bold leading-5 text-ink">
                        {money.format(v.pricePence / 100)}
                      </p>
                      <p className="text-[11px] leading-[14px] text-ink-2">{t('courts.per_hour')}</p>
                    </div>
                  )}
                </div>

                {slots.length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5">
                    {slots.slice(0, 4).map((s) => (
                      <span
                        key={s.time}
                        className={cn(
                          'num rounded-control border py-2.5 text-center text-[13px] leading-4',
                          s.available
                            ? 'border-court-100 bg-court-50 font-bold text-court'
                            : 'border-hairline bg-surface font-semibold text-ink-3 line-through',
                        )}
                      >
                        {s.time}
                      </span>
                    ))}
                  </div>
                )}

                {perPlayer != null && (
                  <div className="flex items-center gap-2.5 rounded-[11px] bg-surface px-3 py-2.5">
                    <Users className="h-4 w-4 flex-shrink-0 text-court" strokeWidth={2.3} />
                    <p className="flex-grow text-[12px] leading-4 text-ink-2">
                      {t('courts.split_four')}{' '}
                      <span className="num font-bold text-ink">
                        {t('courts.each', { amount: money.format(perPlayer / 100) })}
                      </span>
                    </p>
                  </div>
                )}
              </button>
            )
          })}
        </section>
      )}

      {/* ── Also near you — the directory, as an acquisition loop ── */}
      {!query.trim() && view === 'list' && others.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
              {t('courts.also_near_you')}
            </h2>
            <p className="num text-[12px] font-semibold leading-[15px] text-ink-2">
              {t('courts.n_venues', { count: total })}
            </p>
          </div>

          {others.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-3 rounded-[16px] border border-hairline bg-card p-3.5"
            >
              <button
                onClick={() => navigate(`/venues/${v.id}`)}
                className="flex min-w-0 flex-grow flex-col gap-0.5 text-left"
              >
                <span className="truncate text-[15px] font-semibold leading-[19px] text-ink">{v.name}</span>
                <span className="num truncate text-[12px] leading-4 text-ink-2">
                  {[
                    v.distanceMiles != null ? formatDistance(v.distanceMiles) : v.city,
                    v.onPpa
                      ? t('courts.booking_coming_soon')
                      : v.platform && v.platform !== 'Own'
                        ? t('courts.books_via', { platform: v.platform })
                        : v.platform === 'Own'
                          ? t('courts.books_direct')
                          : t('courts.not_on_ppa'),
                  ].filter(Boolean).join(' · ')}
                </span>
              </button>
              {/* "Ask them" used to call the same `navigate` as the row beside
                  it — a control that named an action and performed a
                  navigation. It now opens the message, and it is not offered at
                  all to a venue that is already with us: asking a club's own
                  manager to join is worse than showing nothing. */}
              {v.onPpa ? (
                <span className="flex-shrink-0 whitespace-nowrap rounded-pill bg-court-100 px-2.5 py-1 text-[11px] font-bold leading-[14px] text-court-700">
                  {t('courts.on_ppa')}
                </span>
              ) : (
                <button
                  onClick={() => setAsking(v)}
                  className="min-h-[44px] flex-shrink-0 whitespace-nowrap rounded-control bg-surface px-3 py-2.5 text-[12px] font-bold leading-[15px] text-ink-2"
                >
                  {t('courts.ask_them')}
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      <AskVenueSheet
        open={!!asking}
        onClose={() => setAsking(null)}
        venueName={asking?.name ?? ''}
        city={asking?.city ?? null}
      />
    </div>
  )
}

export default CourtsHome
