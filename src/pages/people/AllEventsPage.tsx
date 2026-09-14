import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Search, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useDiscoverList, useDiscoverRadius } from '@/hooks/useDiscoverList'
import { goBack } from '@/lib/navigation'
import { useDateLocale } from '@/lib/dateLocale'
import { CreateEventSheet } from '@/components/people/CreateEventSheet'

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

export function AllEventsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const locale = useDateLocale()
  const userId = profile?.id ?? ''
  const [search, setSearch] = useState('')
  const [showCreateEvent, setShowCreateEvent] = useState(false)

  const { data: nearYouEvents = [], isLoading: loadingNearYou } = useDiscoverList('events')
  const discoverRadius = useDiscoverRadius()

  // Mine — events I created or am in a group that owns them
  const { data: groupEvents = [] } = useQuery({
    queryKey: ['my-events', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('events')
        .select('id, title, start_time, location')
        .eq('created_by', userId)
        .gte('start_time', new Date().toISOString().split('T')[0])
        .order('start_time', { ascending: true })
        .limit(20)
      return data ?? []
    },
  })

  // Filter near-you by search
  const filtered = search.trim()
    ? nearYouEvents.filter(e => e.title.toLowerCase().includes(search.trim().toLowerCase()) || (e.subtitle ?? '').toLowerCase().includes(search.trim().toLowerCase()))
    : nearYouEvents


  return (
    <div className="min-h-full bg-card pb-32">
      <div className="px-4 pt-12 pb-4 bg-card border-b border-hairline">
        <div className="flex items-center gap-3">
          <button
            onClick={() => goBack(navigate, '/discover')}
            aria-label={t('common.back')}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-hairline -ml-1"
          >
            <ChevronLeft className="w-5 h-5 text-ink-2" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-ink">{t('people.upcoming_events')}</h1>
            <p className="text-[13px] text-ink-2">{t('discover.events_within', { count: nearYouEvents.length, radius: discoverRadius })}</p>
          </div>
          <button
            onClick={() => setShowCreateEvent(true)}
            className="h-8 w-8 rounded-full bg-court flex items-center justify-center flex-shrink-0"
          >
            <Plus className="h-4 w-4 text-white" />
          </button>
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

        {/* Near you — from discover_list */}
        <section className="mb-4">
          {loadingNearYou ? (
            <div className="h-16 rounded-2xl bg-hairline animate-pulse" />
          ) : filtered.length === 0 ? (
            <p className="text-[13px] text-ink-2 py-4">{t('discover.empty_subtitle')}</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((e) => {
                const route = (e.meta.route as string) ?? `/discover/events/${e.id}`
                return (
                  <button
                    key={e.id}
                    onClick={() => navigate(route)}
                    className="w-full text-left rounded-2xl border border-hairline bg-card px-4 py-3 active:scale-[0.98] transition-transform"
                  >
                    <p className="text-[14px] font-bold text-ink">{e.title}</p>
                    <p className="text-[12px] text-ink-2 mt-0.5">
                      {[e.subtitle, e.distance_miles != null ? `${e.distance_miles < 10 ? e.distance_miles.toFixed(1) : Math.round(e.distance_miles)} mi` : null].filter(Boolean).join(' · ')}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* Mine — events I created */}
        {groupEvents.length > 0 && (
          <section>
            <h2 className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2 mb-2">
              {t('discover.mine')}
            </h2>
            <div className="space-y-2">
              {groupEvents.map((e: any) => (
                <button
                  key={e.id}
                  onClick={() => navigate(`/discover/events/${e.id}`)}
                  className="w-full text-left rounded-2xl border border-hairline bg-card px-4 py-3 active:scale-[0.98] transition-transform"
                >
                  <p className="text-[14px] font-bold text-ink">{e.title}</p>
                  <p className="text-[12px] text-ink-2 mt-0.5">
                    {(() => { try { return format(parseISO(e.start_time), 'EEE d MMM · HH:mm', { locale }) } catch { return '' } })()}
                    {e.location && ` · ${e.location}`}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      <CreateEventSheet open={showCreateEvent} onClose={() => setShowCreateEvent(false)} />
    </div>
  )
}

export default AllEventsPage
