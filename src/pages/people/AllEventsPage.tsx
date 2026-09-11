import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Search, MapPin, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useDateLocale } from '@/lib/dateLocale'
import { discoverVenueEvents, type DiscoverableEvent } from '@/lib/venueEvents'
import { formatMoney, money } from '@/lib/money'
import { formatDistance } from '@/lib/travelUtils'
import { cn } from '@/lib/utils'

/**
 * Every event a player can get to, from both places they come from.
 *
 * WHY THIS PAGE EXISTS
 *   The Community directory had five tiles and two behaviours: Coaches and
 *   Venues navigated to a page, Groups, Players and Events scrolled to a
 *   section further down the same page. Nothing told you which you would get.
 *   Groups and Players already had full pages to point at; Events did not, so
 *   it was the one tile blocking a consistent rule.
 *
 * WHY IT IS NOT JUST THE OLD SECTION WITHOUT ITS LIMIT
 *   The Community section queried `events` — group and official events — only.
 *   At the time of writing there were **zero** upcoming rows in that table and
 *   **eleven** upcoming venue-event occurrences, so the section was empty while
 *   the app held real events it never showed here. Venue events had a detail
 *   route and a discovery helper, and no way in from Community.
 *
 *   So this lists both, in one time-ordered stream, because a player looking
 *   for something to enter does not care which of our two tables it came from.
 */

type Row =
  | { kind: 'group'; id: string; at: string; title: string; where: string | null; pricePence: number | null; currency: string | null; official: boolean }
  | { kind: 'venue'; id: string; at: string; title: string; where: string | null; priceLabel: string | null; spots: string | null; distanceMiles: number | null }

export function AllEventsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const locale = useDateLocale()
  const userId = profile?.id ?? ''
  const [search, setSearch] = useState('')

  const { data: groupEvents = [], isLoading: loadingGroup } = useQuery({
    queryKey: ['all-events-group', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from('group_members').select('group_id').eq('user_id', userId).eq('status', 'approved')
      const groupIds = (memberships ?? []).map((m) => m.group_id as string)

      const filters = ['is_official.eq.true', `created_by.eq.${userId}`]
      if (groupIds.length > 0) filters.push(`group_id.in.(${groupIds.join(',')})`)

      const { data } = await supabase
        .from('events')
        .select('id, title, start_time, location, entry_fee_pence, currency, is_official')
        .gte('start_time', new Date().toISOString().split('T')[0])
        .or(filters.join(','))
        .order('start_time', { ascending: true })
        .limit(100)
      return data ?? []
    },
  })

  const { data: venueEvents = [], isLoading: loadingVenue } = useQuery<DiscoverableEvent[]>({
    queryKey: ['all-events-venue', profile?.latitude, profile?.longitude],
    queryFn: () => discoverVenueEvents(profile?.latitude ?? null, profile?.longitude ?? null),
  })

  const rows = useMemo<Row[]>(() => {
    const g: Row[] = groupEvents.map((e) => ({
      kind: 'group',
      id: e.id as string,
      at: e.start_time as string,
      title: e.title as string,
      where: (e.location as string) ?? null,
      pricePence: (e.entry_fee_pence as number) ?? null,
      currency: (e.currency as string) ?? null,
      official: e.is_official === true,
    }))
    const v: Row[] = venueEvents.map((e) => ({
      kind: 'venue',
      id: e.occurrence_id,
      at: e.starts_at,
      title: e.event_name,
      where: [e.venue_name, e.venue_city].filter(Boolean).join(' · ') || null,
      priceLabel:
        e.price_per_player != null && e.price_per_player > 0
          ? formatMoney(e.price_per_player, e.currency)
          : null,
      spots:
        e.capacity != null ? `${Math.max(0, e.capacity - e.spots_taken)} of ${e.capacity} left` : null,
      distanceMiles: e.distance_miles,
    }))
    const all = [...g, ...v].sort((a, b) => a.at.localeCompare(b.at))
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter((r) => r.title.toLowerCase().includes(q) || (r.where ?? '').toLowerCase().includes(q))
  }, [groupEvents, venueEvents, search])

  const loading = loadingGroup || loadingVenue

  return (
    <div className="min-h-full bg-card pb-32">
      <div className="px-4 pt-12 pb-4 bg-card border-b border-hairline">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/people')}
            aria-label={t('common.back')}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-hairline -ml-1"
          >
            <ChevronLeft className="w-5 h-5 text-ink-2" />
          </button>
          <h1 className="text-xl font-bold text-ink">{t('people.upcoming_events')}</h1>
          {rows.length > 0 && (
            <span className="num ml-auto text-[12px] text-ink-2">{rows.length}</span>
          )}
        </div>
      </div>

      <div className="px-5 pt-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-2" />
          <input
            id="all-events-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('people.search_events')}
            style={{ fontSize: '16px' }}
            className="w-full rounded-xl border border-hairline pl-9 pr-4 py-2.5 outline-none focus:border-court focus:ring-2 focus:ring-court/20"
          />
        </div>

        <div className="space-y-2">
          {loading ? (
            <p className="text-center text-[13px] text-ink-2 py-8">{t('common.loading')}</p>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline p-6 text-center">
              <p className="text-[13px] font-semibold text-ink-2">{t('people.no_upcoming_events')}</p>
              <p className="text-[12px] text-ink-2 mt-1">{t('people.events_empty_hint')}</p>
            </div>
          ) : (
            rows.map((r) => (
              <button
                key={`${r.kind}-${r.id}`}
                onClick={() =>
                  navigate(r.kind === 'group' ? `/people/events/${r.id}` : `/play/events/${r.id}`)
                }
                className={cn(
                  'w-full text-left rounded-2xl border px-4 py-3 active:scale-[0.98] transition-transform',
                  r.kind === 'group' && r.official
                    ? 'border-court-100 bg-court-50/30'
                    : 'border-hairline bg-card',
                )}
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {r.kind === 'group' && r.official && (
                    <span className="text-[11px] font-bold text-court bg-court-50 rounded-full px-2 py-0.5">
                      {t('people.badge_official')}
                    </span>
                  )}
                  {r.kind === 'venue' && (
                    <span className="text-[11px] font-bold text-court-700 bg-court-100 rounded-full px-2 py-0.5">
                      {t('people.badge_at_a_venue')}
                    </span>
                  )}
                  {r.kind === 'group' ? (
                    (r.pricePence ?? 0) > 0 ? (
                      <span className="num text-[11px] font-semibold text-ink-2">
                        {money(r.pricePence, r.currency)}
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-court">{t('people.badge_free')}</span>
                    )
                  ) : r.priceLabel ? (
                    <span className="num text-[11px] font-semibold text-ink-2">{r.priceLabel}</span>
                  ) : (
                    <span className="text-[11px] font-semibold text-court">{t('people.badge_free')}</span>
                  )}
                </div>

                <p className="text-[14px] font-bold text-ink">{r.title}</p>

                <p className="num text-[12px] text-ink-2 mt-0.5">
                  {(() => {
                    try { return format(parseISO(r.at), 'EEE d MMM · HH:mm', { locale }) } catch { return r.at }
                  })()}
                  {r.where && ` · ${r.where}`}
                </p>

                {r.kind === 'venue' && (r.spots || r.distanceMiles != null) && (
                  <div className="flex items-center gap-3 mt-1.5">
                    {r.spots && (
                      <span className="num flex items-center gap-1 text-[11px] text-ink-2">
                        <Users className="h-3 w-3" />
                        {r.spots}
                      </span>
                    )}
                    {r.distanceMiles != null && (
                      <span className="num flex items-center gap-1 text-[11px] font-semibold text-court">
                        <MapPin className="h-3 w-3" />
                        {formatDistance(r.distanceMiles)}
                      </span>
                    )}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default AllEventsPage
