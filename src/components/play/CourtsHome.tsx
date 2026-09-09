import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Search, MapPin, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDistance } from '@/lib/travelUtils'
import { cn } from '@/lib/utils'

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
  id: string
  name: string
  city: string | null
  indoor: boolean
  courts: number | null
  distanceMiles: number | null
  pricePence: number | null
  bookable: boolean
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

function useVenuesNearby(lat: number | null, lng: number | null) {
  return useQuery<{ partner: Venue[]; others: Venue[]; total: number }>({
    queryKey: ['courts-home', lat, lng],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [{ data: bookable }, { data: nearby }, { count }] = await Promise.all([
        supabase
          .from('padel_venues')
          .select('venues_id, venue_name, city, indoor_courts, number_of_courts, latitude, longitude, price_pence, price_per_hour, ppa_bookable')
          .eq('ppa_bookable', true)
          .limit(20),
        supabase
          .from('padel_venues')
          .select('venues_id, venue_name, city, indoor_courts, number_of_courts, latitude, longitude, price_pence, price_per_hour, ppa_bookable')
          .not('ppa_bookable', 'is', true)
          .limit(200),
        supabase.from('padel_venues').select('venues_id', { count: 'exact', head: true }),
      ])

      const shape = (v: Record<string, unknown>): Venue => {
        const vLat = v.latitude != null ? Number(v.latitude) : null
        const vLng = v.longitude != null ? Number(v.longitude) : null
        return {
          id: v.venues_id as string,
          name: (v.venue_name as string) ?? '—',
          city: (v.city as string) ?? null,
          indoor: ((v.indoor_courts as number) ?? 0) > 0,
          courts: (v.number_of_courts as number) ?? null,
          distanceMiles:
            lat != null && lng != null && vLat != null && vLng != null
              ? haversineMiles(lat, lng, vLat, vLng)
              : null,
          pricePence: (v.price_pence as number) ?? ((v.price_per_hour as number) ?? null),
          bookable: v.ppa_bookable === true,
        }
      }

      const byDistance = (a: Venue, b: Venue) =>
        (a.distanceMiles ?? Number.POSITIVE_INFINITY) - (b.distanceMiles ?? Number.POSITIVE_INFINITY)

      return {
        partner: (bookable ?? []).map(shape).sort(byDistance).slice(0, 3),
        others: (nearby ?? []).map(shape).sort(byDistance).slice(0, 4),
        total: count ?? 0,
      }
    },
  })
}

export interface CourtsHomeProps {
  /** Player's coordinates, when the profile has them. */
  lat: number | null
  lng: number | null
  query: string
  onQueryChange: (v: string) => void
  onUseLocation: () => void
  onPickVenue: (venueId: string) => void
  /** Times the venue has free today, if the caller has already loaded them. */
  slotsByVenue?: Record<string, Array<{ time: string; available: boolean }>>
}

export function CourtsHome({
  lat, lng, query, onQueryChange, onUseLocation, onPickVenue, slotsByVenue = {},
}: CourtsHomeProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { data } = useVenuesNearby(lat, lng)

  const partner = data?.partner ?? []
  const others = data?.others ?? []
  const total = data?.total ?? 0

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
            aria-label={t('courts.use_my_location')}
            className="flex-shrink-0"
          >
            <MapPin className="h-[18px] w-[18px] text-court" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* ── Book instantly — the venues that pay ── */}
      {!query.trim() && partner.length > 0 && (
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
                onClick={() => onPickVenue(v.id)}
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
      {!query.trim() && others.length > 0 && (
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
                  {[v.distanceMiles != null ? formatDistance(v.distanceMiles) : v.city, t('courts.not_on_ppa')]
                    .filter(Boolean).join(' · ')}
                </span>
              </button>
              <button
                onClick={() => navigate(`/venues/${v.id}`)}
                className="min-h-[44px] flex-shrink-0 whitespace-nowrap rounded-control bg-surface px-3 py-2.5 text-[12px] font-bold leading-[15px] text-ink-2"
              >
                {t('courts.ask_them')}
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

export default CourtsHome
