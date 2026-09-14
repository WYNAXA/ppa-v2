import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import type { Locale } from 'date-fns'
import { Search, ChevronRight, Clock, Tag, ExternalLink, Plus } from 'lucide-react'
import { useDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { money } from '@/lib/money'
import { openUrl } from '@/lib/openUrl'
import { DirectoryGrid } from '@/components/people/DirectoryGrid'

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
  external_link?: string | null
}

type DiscoverCounts = {
  venues: number
  players: number
  coaching: number
  groups: number
  leagues: number
  events: number
  open_games: number
  lat: number | null
  lng: number | null
  radius_miles: number
}

const KIND_LABELS: Record<string, string> = {
  open_match: 'discover.kind_game',
  event: 'discover.kind_event',
  venue_event: 'discover.kind_event',
  league: 'discover.kind_league',
  coaching: 'discover.kind_coaching',
}

const RADIUS_OPTIONS = [10, 25, 50, 100] as const

// ── Shared scope: one lat/lng/radius for both queries ────────────────────────

function useDiscoverScope(profileLat: number | null, profileLng: number | null) {
  const [radiusIdx, setRadiusIdx] = useState(1) // default 25 mi
  const radius = RADIUS_OPTIONS[radiusIdx]
  const cycleRadius = () => setRadiusIdx((i) => (i + 1) % RADIUS_OPTIONS.length)
  // Both queries pass the same coordinates. When null, the RPCs fall back to
  // the viewer's profiles.latitude — same behaviour, same result.
  return { lat: profileLat, lng: profileLng, radius, cycleRadius }
}

// ── Counts from one RPC ──────────────────────────────────────────────────────

function useDiscoverCounts(lat: number | null, lng: number | null, radius: number) {
  return useQuery<DiscoverCounts | null>({
    queryKey: ['discover-counts', lat, lng, radius],
    staleTime: 60_000,
    queryFn: async () => {
      const args: Record<string, unknown> = { p_radius_miles: radius }
      if (lat != null && lng != null) { args.p_lat = lat; args.p_lng = lng }
      const { data, error } = await supabase.rpc('discover_counts', args)
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return row ?? null
    },
  })
}

// ── Feed ─────────────────────────────────────────────────────────────────────

function useDiscoverFeed(lat: number | null, lng: number | null, radius: number, enabled: boolean) {
  return useQuery<FeedRow[]>({
    queryKey: ['discover-feed', lat, lng, radius],
    staleTime: 60_000,
    enabled,
    queryFn: async () => {
      const args: Record<string, unknown> = { p_radius_miles: radius, p_limit: 50 }
      if (lat != null && lng != null) { args.p_lat = lat; args.p_lng = lng }
      const { data, error } = await supabase.rpc('discover_feed', args)
      if (error) throw error
      return (data ?? []) as FeedRow[]
    },
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
    case 'event': return (row as any).external_link?.trim() ? '' : `/discover/events/${row.id}`
    case 'venue_event': return `/play/events/${row.id}`
    case 'league': return `/compete/leagues/${row.id}`
    case 'coaching': return row.venue_id ? `/venues/${row.venue_id}` : '#'
    default: return '#'
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function DiscoverPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const locale = useDateLocale()
  const { profile } = useAuth()

  const profileLat = profile?.latitude ?? null
  const profileLng = profile?.longitude ?? null
  const city = profile?.city ?? null

  const scope = useDiscoverScope(profileLat, profileLng)
  const { data: counts, isLoading: loadingCounts } = useDiscoverCounts(scope.lat, scope.lng, scope.radius)

  // The RPC returns lat: null when it has no point. That means the viewer has
  // no coordinates and every count is zero — not because nothing exists, but
  // because there is no centre to measure from.
  const hasLocation = counts?.lat != null
  const feedEnabled = hasLocation && !loadingCounts

  const { data: feed = [], isLoading: loadingFeed } = useDiscoverFeed(scope.lat, scope.lng, scope.radius, feedEnabled)
  const days = useMemo(() => groupByDay(feed), [feed])
  const firstFeedRow = feed[0] ?? null

  return (
    <div className="min-h-full bg-surface pb-32">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-14">
        <h1 className="text-[32px] font-extrabold leading-[34px] tracking-[-0.02em] text-ink">
          {t('discover.title')}
        </h1>
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

      <div className="flex flex-col gap-6 px-5">
        {/* ── C0: No location ── */}
        {!loadingCounts && !hasLocation && (
          <div className="rounded-panel bg-ink p-4">
            <p className="text-[24px] font-extrabold leading-[26px] text-white">
              {t('discover.no_location_title')}
            </p>
            <p className="mt-2 text-[13px] leading-[18px] text-[#8C9A95]">
              {t('discover.no_location_body')}
            </p>
            <button
              onClick={() => navigate('/you')}
              className="mt-3 flex h-11 w-full items-center justify-center rounded-control bg-ball text-[14px] font-extrabold leading-[18px] text-ink"
            >
              {t('discover.no_location_cta')}
            </button>
          </div>
        )}

        {/* ── C3: Hero (only when we have a location) ── */}
        {hasLocation && counts && (
          <DiscoverHero
            counts={counts}
            firstFeedRow={firstFeedRow}
            city={city}
            radius={scope.radius}
            onCycleRadius={scope.cycleRadius}
            t={t}
            locale={locale}
            navigate={navigate}
          />
        )}

        {/* ── Grid (only when we have a location) ── */}
        {hasLocation && counts && (
          <section>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
                {t('discover.near_you')}
              </h2>
              <span className="text-[11px] font-semibold text-ink-3">
                {t('discover.within_radius', { miles: scope.radius })}
              </span>
            </div>
            <DirectoryGrid counts={{
              venues: counts.venues,
              players: counts.players,
              coaches: counts.coaching,
              groups: counts.groups,
              leagues: counts.leagues,
              events: counts.events,
            }} />
          </section>
        )}

        {/* ── Feed (only when we have a location) ── */}
        {hasLocation && (
          <section>
            {loadingFeed && (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-court border-t-transparent" />
              </div>
            )}

            {!loadingFeed && [...days.entries()].map(([day, rows]) => (
              <div key={day} className="mb-4">
                <p className="mb-2 text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
                  {(() => {
                    try { return format(parseISO(day), 'EEEE d MMMM', { locale }) }
                    catch { return day }
                  })()}
                </p>
                <div className="flex flex-col gap-2.5">
                  {rows.map((row) => (
                    <FeedCard key={`${row.kind}-${row.id}`} row={row} t={t} locale={locale} navigate={navigate} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ── C4: Floor ── */}
        {hasLocation && !loadingCounts && scope.radius < 100 && (
          <div className="flex items-center gap-3 py-2">
            <div className="h-px flex-grow border-t border-dashed border-hairline" />
            <button
              onClick={() => {
                // Jump to 100 mi — the only radius that moves the numbers.
                const idx = RADIUS_OPTIONS.indexOf(100)
                if (idx >= 0) for (let i = 0; i <= idx; i++) scope.cycleRadius()
              }}
              className="text-[12px] font-semibold text-ink-2"
            >
              {t('discover.radius_widen', { miles: 100 })}
            </button>
            <div className="h-px flex-grow border-t border-dashed border-hairline" />
          </div>
        )}

        {/* Loading */}
        {loadingCounts && (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-court border-t-transparent" />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function DiscoverHero({
  counts, firstFeedRow, city, radius, onCycleRadius, t, locale, navigate,
}: {
  counts: DiscoverCounts
  firstFeedRow: FeedRow | null
  city: string | null
  radius: number
  onCycleRadius: () => void
  t: (k: string, o?: Record<string, unknown>) => string
  locale: Locale
  navigate: (to: string) => void
}) {
  const hasContent = firstFeedRow != null

  return (
    <div className="rounded-panel bg-ink p-4">
      {/* Scope row */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-semibold text-white/70">
          {city ?? t('discover.near_you')}
        </span>
        <button
          onClick={onCycleRadius}
          className="rounded-pill bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/70"
        >
          {radius} mi ⌄
        </button>
      </div>

      {hasContent ? (
        /* State A — something is on */
        <HeroStateA row={firstFeedRow!} t={t} locale={locale} navigate={navigate} />
      ) : (
        /* State B — nothing is on */
        <HeroStateB counts={counts} radius={radius} t={t} navigate={navigate} />
      )}
    </div>
  )
}

function HeroStateA({ row, t, locale, navigate }: {
  row: FeedRow
  t: (k: string, o?: Record<string, unknown>) => string
  locale: Locale
  navigate: (to: string) => void
}) {
  const kindKey = KIND_LABELS[row.kind]
  const venueLine = [
    row.venue_name,
    row.distance_miles != null
      ? `${row.distance_miles < 10 ? row.distance_miles.toFixed(1) : Math.round(row.distance_miles)} mi`
      : null,
  ].filter(Boolean).join(' · ')
  const timeLine = (() => { try { return format(parseISO(row.starts_at), 'HH:mm', { locale }) } catch { return null } })()
  const priceLine = row.price_pence != null && row.currency ? money(row.price_pence, row.currency) : null
  const meta = [venueLine, timeLine, priceLine].filter(Boolean).join(' · ')

  const externalLink = (row as any).external_link?.trim() as string | undefined
  const dest = cardDestination(row)

  function handleAction() {
    if (externalLink) { openUrl(externalLink); return }
    if (dest && dest !== '#') navigate(dest)
  }

  return (
    <>
      <span className="rounded-pill bg-court-50 px-2 py-[3px] text-[11px] font-bold leading-[14px] tracking-[0.05em] text-court-700">
        {kindKey ? t(kindKey) : row.kind}
      </span>
      <p className="mt-2 text-[24px] font-extrabold leading-[26px] text-white">{row.title}</p>
      {meta && <p className="num mt-1 text-[13px] leading-[18px] text-white/70">{meta}</p>}
      <button
        onClick={handleAction}
        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-control bg-ball text-[14px] font-extrabold leading-[18px] text-ink"
      >
        {externalLink ? t('discover.hero_get_tickets') : t('discover.action_view')}
        {externalLink && <ExternalLink className="h-4 w-4" />}
      </button>
    </>
  )
}

function HeroStateB({ counts, radius, t, navigate }: {
  counts: DiscoverCounts
  radius: number
  t: (k: string, o?: Record<string, unknown>) => string
  navigate: (to: string) => void
}) {
  return (
    <>
      <span className="rounded-pill bg-white/10 px-2 py-[3px] text-[11px] font-bold leading-[14px] text-white/50">
        {t('discover.hero_open_games', { count: counts.open_games })}
      </span>
      <p className="mt-2 text-[24px] font-extrabold leading-[26px] text-white">
        {t('discover.hero_be_first_title')}
      </p>
      <p className="mt-1 text-[13px] leading-[18px] text-[#8C9A95]">
        {t('discover.hero_be_first_body', { count: counts.players, miles: radius })}
      </p>
      <button
        onClick={() => navigate('/play')}
        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-control bg-ball text-[14px] font-extrabold leading-[18px] text-ink"
      >
        <Plus className="h-4 w-4" />
        {t('discover.hero_put_up_a_game')}
      </button>
      <button
        onClick={() => navigate('/play/book-court')}
        className="mt-2 flex h-10 w-full items-center justify-center rounded-control border border-[#2A3833] text-[13px] font-semibold leading-[18px] text-white"
      >
        {t('discover.hero_book_a_court')}
      </button>
    </>
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
  const externalLink = (row as any).external_link?.trim() as string | undefined

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

  function handleTap() {
    if (externalLink) { openUrl(externalLink); return }
    if (dest && dest !== '#') navigate(dest)
  }

  return (
    <button
      onClick={handleTap}
      className="flex w-full flex-col overflow-hidden rounded-card border border-hairline bg-card text-left transition-transform active:scale-[0.99]"
    >
      <div className="flex flex-col gap-2 p-3.5">
        <div className="flex items-center gap-2">
          <span className="rounded-pill bg-court-50 px-2 py-[3px] text-[11px] font-bold leading-[14px] tracking-[0.05em] text-court-700">
            {kindKey ? t(kindKey) : row.kind}
          </span>
        </div>

        <p className="text-[19px] font-bold leading-[23px] tracking-[-0.01em] text-ink">
          {row.title}
        </p>

        {venueLine && (
          <p className="num text-[13px] leading-[18px] text-ink-2">{venueLine}</p>
        )}

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

      <div className="flex items-center justify-between border-t border-hairline bg-surface px-3.5 py-[11px]">
        <span className="text-[12px] leading-4 text-ink-3">
          {row.subtitle ?? ''}
        </span>
        <span className="flex items-center gap-1 text-[13px] font-bold leading-[18px] text-court-700">
          {externalLink ? t('discover.hero_get_tickets') : row.kind === 'open_match' ? t('discover.action_join') : t('discover.action_view')}
          {externalLink ? (
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
