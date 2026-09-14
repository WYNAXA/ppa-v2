import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import type { Locale } from 'date-fns'
import { Search, ChevronRight, Clock, Tag, MapPin, ExternalLink } from 'lucide-react'
import { useDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useMyGroups, useMyConnections, useMyPlayedVenues, useMyCoachBookings } from '@/hooks/useSocial'
import { money } from '@/lib/money'
import { DirectoryGrid } from '@/components/people/DirectoryGrid'
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

const KIND_LABELS: Record<string, string> = {
  open_match: 'discover.kind_game',
  event: 'discover.kind_event',
  venue_event: 'discover.kind_event',
  league: 'discover.kind_league',
  coaching: 'discover.kind_coaching',
}

const RADIUS_OPTIONS = [25, 50, 100] as const

// ── Feed query ───────────────────────────────────────────────────────────────

function useDiscoverFeed(lat: number | null, lng: number | null, radius: number) {
  return useQuery<FeedRow[]>({
    queryKey: ['discover-feed', lat, lng, radius],
    staleTime: 60_000,
    queryFn: async () => {
      const args: Record<string, unknown> = { p_radius_miles: radius, p_limit: 50 }
      if (lat != null && lng != null) { args.p_lat = lat; args.p_lng = lng }
      const { data, error } = await supabase.rpc('discover_feed', args)
      if (error) throw error
      return (data ?? []) as FeedRow[]
    },
  })
}

// ── Mine counts ──────────────────────────────────────────────────────────────

function useMineCounts(userId: string) {
  const { data: groups = [] } = useMyGroups(userId)
  const { data: connections } = useMyConnections(userId)
  const { data: playedVenues = [] } = useMyPlayedVenues(userId)
  const { data: coachBookings = [] } = useMyCoachBookings(userId)

  const { data: leagueCount = 0 } = useQuery<number>({
    queryKey: ['my-league-count', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { count } = await supabase
        .from('league_members').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('status', 'active')
      return count ?? 0
    },
  })

  const { data: eventCount = 0 } = useQuery<number>({
    queryKey: ['discover-event-count', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from('events').select('id', { count: 'exact', head: true })
        .gte('start_time', new Date().toISOString())
      return count ?? 0
    },
  })

  // Every count is a real number. 0 means zero, not "hide the number".
  // DirectoryGrid's `n != null` guard renders the number when present.
  return {
    groups: groups.filter(g => g.memberStatus === 'approved').length,
    players: connections?.accepted.size ?? 0,
    coaches: coachBookings.length,
    venues: playedVenues.length,
    leagues: leagueCount,
    events: eventCount,
  }
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
    case 'event': return `/discover/events/${row.id}`
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
  const userId = profile?.id ?? ''

  const lat = profile?.latitude ?? null
  const lng = profile?.longitude ?? null
  const city = profile?.city ?? null

  const [radiusIdx, setRadiusIdx] = useState(0)
  const radius = RADIUS_OPTIONS[radiusIdx]
  const [showCreateEvent, setShowCreateEvent] = useState(false)

  const { data: feed = [], isLoading } = useDiscoverFeed(lat, lng, radius)
  const counts = useMineCounts(userId)
  const days = useMemo(() => groupByDay(feed), [feed])

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

      <div className="flex flex-col gap-6 px-5">
        {/* ── Directory grid — mine counts ── */}
        <DirectoryGrid counts={counts} />

        {/* ── Near you — the feed ── */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
              {t('discover.near_you')}
            </h2>
            <div className="h-px flex-grow bg-hairline" />
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-court border-t-transparent" />
            </div>
          )}

          {!isLoading && [...days.entries()].map(([day, rows]) => (
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

          {/* ── Empty state ── */}
          {!isLoading && feed.length < 3 && (
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
        </section>
      </div>

      <CreateEventSheet open={showCreateEvent} onClose={() => setShowCreateEvent(false)} />
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
      onClick={() => dest && dest !== '#' && navigate(dest)}
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
