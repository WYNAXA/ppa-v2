import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import type { Locale } from 'date-fns'
import {
  Search, ChevronRight, Clock, Tag, MapPin, ExternalLink,
} from 'lucide-react'
import { useDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { money } from '@/lib/money'
import { cn } from '@/lib/utils'
import { CreateEventSheet } from '@/components/people/CreateEventSheet'

// ── Types ────────────────────────────────────────────────────────────────────

type FeedRow = {
  kind: string
  id: string
  title: string
  subtitle: string | null
  starts_at: string
  venue_id: string | null
  venue_name: string | null
  latitude: number | null
  longitude: number | null
  distance_miles: number | null
  price_pence: number | null
  currency: string | null
  spots_left: number | null
}

type FilterId = 'all' | 'games' | 'events' | 'leagues' | 'coaching'

const FILTERS: Array<{ id: FilterId; kinds: string[] | null }> = [
  { id: 'all',      kinds: null },
  { id: 'games',    kinds: ['open_match'] },
  { id: 'events',   kinds: ['event', 'venue_event'] },
  { id: 'leagues',  kinds: ['league'] },
  { id: 'coaching', kinds: ['coaching'] },
]

const RADIUS_OPTIONS = [25, 50, 100] as const

const KIND_LABELS: Record<string, string> = {
  open_match: 'discover.kind_game',
  event: 'discover.kind_event',
  venue_event: 'discover.kind_event',
  league: 'discover.kind_league',
  coaching: 'discover.kind_coaching',
}

// ── Feed query ───────────────────────────────────────────────────────────────

function useDiscoverFeed(lat: number | null, lng: number | null, radius: number) {
  return useQuery<FeedRow[]>({
    queryKey: ['discover-feed', lat, lng, radius],
    staleTime: 60_000,
    queryFn: async () => {
      const args: Record<string, unknown> = { p_radius_miles: radius, p_limit: 50 }
      if (lat != null && lng != null) {
        args.p_lat = lat
        args.p_lng = lng
      }
      const { data, error } = await supabase.rpc('discover_feed', args)
      if (error) throw error
      return (data ?? []) as FeedRow[]
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByDay(rows: FeedRow[]): Map<string, FeedRow[]> {
  const groups = new Map<string, FeedRow[]>()
  for (const row of rows) {
    const day = row.starts_at?.split('T')[0] ?? ''
    if (!groups.has(day)) groups.set(day, [])
    groups.get(day)!.push(row)
  }
  return groups
}

function cardDestination(row: FeedRow): string {
  switch (row.kind) {
    case 'open_match': return `/matches/${row.id}`
    case 'event': return '' // handled inline — external link or detail
    case 'venue_event': return `/play/events/${row.id}`
    case 'league': return `/compete/leagues/${row.id}`
    case 'coaching': return row.venue_id ? `/venues/${row.venue_id}` : '#'
    default: return '#'
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function DiscoverPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const locale = useDateLocale()
  const { profile } = useAuth()

  const lat = profile?.latitude ?? null
  const lng = profile?.longitude ?? null
  const city = profile?.city ?? null

  const initialFilter = (searchParams.get('filter') as FilterId) || 'all'
  const [filter, setFilter] = useState<FilterId>(initialFilter)
  const [radiusIdx, setRadiusIdx] = useState(0)
  const radius = RADIUS_OPTIONS[radiusIdx]
  const [showCreateEvent, setShowCreateEvent] = useState(false)

  const { data: feed = [], isLoading } = useDiscoverFeed(lat, lng, radius)

  // Filter counts — computed from feed, not a second query.
  const counts = useMemo(() => {
    const c: Record<FilterId, number> = { all: feed.length, games: 0, events: 0, leagues: 0, coaching: 0 }
    for (const row of feed) {
      if (row.kind === 'open_match') c.games++
      else if (row.kind === 'event' || row.kind === 'venue_event') c.events++
      else if (row.kind === 'league') c.leagues++
      else if (row.kind === 'coaching') c.coaching++
    }
    return c
  }, [feed])

  const filtered = useMemo(() => {
    const spec = FILTERS.find((f) => f.id === filter)
    if (!spec?.kinds) return feed
    return feed.filter((r) => spec.kinds!.includes(r.kind))
  }, [feed, filter])

  const days = useMemo(() => groupByDay(filtered), [filtered])

  const cycleRadius = () => setRadiusIdx((i) => (i + 1) % RADIUS_OPTIONS.length)

  return (
    <div className="min-h-full bg-surface pb-32">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-14">
        <h1 className="text-[32px] font-extrabold leading-[34px] tracking-[-0.02em] text-ink">
          {t('discover.title')}
        </h1>
        <button
          onClick={cycleRadius}
          className="flex h-8 items-center gap-1.5 rounded-pill border border-hairline bg-card px-3"
        >
          <MapPin className="h-3.5 w-3.5 text-ink-2" strokeWidth={2} />
          <span className="text-[12px] font-semibold leading-4 text-ink-2">
            {city ? `${city} · ${radius} mi` : `${radius} mi`}
          </span>
        </button>
      </div>

      {/* ── Search ── */}
      <div className="px-5 pb-3">
        <button
          onClick={() => navigate('/search')}
          className="flex h-11 w-full items-center gap-2.5 rounded-control border border-hairline bg-card px-4"
        >
          <Search className="h-[18px] w-[18px] text-ink-3" strokeWidth={2} />
          <span className="text-[13px] leading-[18px] text-ink-3">{t('discover.search_placeholder')}</span>
        </button>
      </div>

      {/* ── Filter row ── */}
      <div className="flex gap-[7px] overflow-x-auto px-5 pb-4 scrollbar-hide">
        {FILTERS.map((f) => {
          const active = filter === f.id
          const count = counts[f.id]
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'flex h-[34px] flex-shrink-0 items-center gap-1.5 rounded-pill px-3 text-[13px] font-semibold leading-[18px] transition-colors',
                active
                  ? 'bg-ink text-white'
                  : 'border border-hairline bg-card text-ink-2',
              )}
            >
              {t(`discover.filter_${f.id}`)}
              <span className={cn('text-[13px] font-bold', active ? 'text-white/70' : count > 0 ? 'text-court' : 'text-ink-4')}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-4 px-5">
        {/* ── Loading ── */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-court border-t-transparent" />
          </div>
        )}

        {/* ── Day groups ── */}
        {!isLoading && [...days.entries()].map(([day, rows]) => (
          <section key={day}>
            <div className="flex items-center gap-3 mb-2.5">
              <h2 className="flex-shrink-0 text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
                {(() => {
                  try { return format(parseISO(day), 'EEEE d MMMM', { locale }) }
                  catch { return day }
                })()}
              </h2>
              <div className="h-px flex-grow bg-hairline" />
            </div>

            <div className="flex flex-col gap-2.5">
              {rows.map((row) => (
                <FeedCard key={`${row.kind}-${row.id}`} row={row} t={t} locale={locale} navigate={navigate} />
              ))}
            </div>
          </section>
        ))}

        {/* ── Empty state ── */}
        {!isLoading && filtered.length < 3 && (
          <div className="rounded-panel bg-ink p-4">
            <p className="text-[15px] font-bold leading-5 text-white">
              {t('discover.empty_title', { radius })}
            </p>
            <p className="mt-1 text-[13px] leading-[18px] text-[#8C9A95]">
              {t('discover.empty_subtitle')}
            </p>
            <button
              onClick={() => navigate('/play')}
              className="mt-3 flex h-11 w-full items-center justify-center rounded-control bg-ball text-[14px] font-extrabold leading-[18px] text-ink"
            >
              {t('discover.put_up_game')}
            </button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => navigate('/leagues')}
                className="flex h-10 items-center justify-center rounded-control border border-[#2A3833] text-[13px] font-semibold leading-[18px] text-white"
              >
                {t('discover.start_league')}
              </button>
              <button
                onClick={() => setShowCreateEvent(true)}
                className="flex h-10 items-center justify-center rounded-control border border-[#2A3833] text-[13px] font-semibold leading-[18px] text-white"
              >
                {t('discover.create_event')}
              </button>
            </div>
          </div>
        )}

        {/* ── Browse row ── */}
        {!isLoading && (
          <section className="mt-2">
            <h2 className="mb-2.5 text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
              {t('discover.browse')}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {([
                { label: t('discover.browse_groups'),  to: '/discover/groups' },
                { label: t('discover.browse_players'), to: '/discover/players' },
                { label: t('discover.browse_coaches'), to: '/discover/coaches' },
                { label: t('discover.browse_venues'),  to: '/play/book-court' },
              ]).map((item) => (
                <button
                  key={item.to}
                  onClick={() => navigate(item.to)}
                  className="flex h-11 items-center justify-between rounded-card border border-hairline bg-card px-3"
                >
                  <span className="text-[13px] font-semibold text-ink-2">{item.label}</span>
                  <ChevronRight className="h-4 w-4 text-ink-3" />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <CreateEventSheet
        open={showCreateEvent}
        onClose={() => setShowCreateEvent(false)}
      />
    </div>
  )
}

// ── Feed card ────────────────────────────────────────────────────────────────

function FeedCard({
  row, t, locale, navigate,
}: {
  row: FeedRow
  t: (k: string, o?: Record<string, unknown>) => string
  locale: Locale
  navigate: (to: string) => void
}) {
  const dest = cardDestination(row)

  const venueLine = [
    row.venue_name,
    row.distance_miles != null
      ? `${row.distance_miles < 10 ? row.distance_miles.toFixed(1) : Math.round(row.distance_miles)} mi`
      : null,
  ].filter(Boolean).join(' · ')

  const timeLine = (() => {
    try { return format(parseISO(row.starts_at), 'HH:mm', { locale }) }
    catch { return null }
  })()

  const priceLine = row.price_pence != null && row.currency
    ? money(row.price_pence, row.currency)
    : null

  const kindKey = KIND_LABELS[row.kind]

  return (
    <button
      onClick={() => dest && navigate(dest)}
      className="flex w-full flex-col overflow-hidden rounded-card border border-hairline bg-card text-left transition-transform active:scale-[0.99]"
    >
      <div className="flex flex-col gap-2 p-3.5">
        {/* Badge row */}
        <div className="flex items-center gap-2">
          <span className="rounded-pill bg-court-50 px-2 py-[3px] text-[11px] font-bold leading-[14px] tracking-[0.05em] text-court-700">
            {kindKey ? t(kindKey) : row.kind}
          </span>
        </div>

        {/* Title */}
        <p className="text-[19px] font-bold leading-[23px] tracking-[-0.01em] text-ink">
          {row.title}
        </p>

        {/* Venue + distance */}
        {venueLine && (
          <p className="text-[13px] leading-[18px] text-ink-2">{venueLine}</p>
        )}

        {/* Time + price */}
        {(timeLine || priceLine) && (
          <div className="flex items-center gap-3 text-[13px] leading-[18px] text-ink-2">
            {timeLine && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" strokeWidth={2} />
                {timeLine}
              </span>
            )}
            {priceLine && (
              <span className="flex items-center gap-1">
                <Tag className="h-3.5 w-3.5" strokeWidth={2} />
                {priceLine}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-hairline bg-surface px-3.5 py-[11px]">
        <span className="text-[12px] leading-4 text-ink-3">
          {row.subtitle ?? ''}
        </span>
        <span className="flex items-center gap-1 text-[13px] font-bold leading-[18px] text-court-700">
          {row.kind === 'open_match' ? t('discover.action_join') : t('discover.action_view')}
          {row.kind === 'event' ? (
            <ExternalLink className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
      </div>
    </button>
  )
}

export default DiscoverPage
