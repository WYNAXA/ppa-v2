import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ExternalLink, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useMyPlayedVenues } from '@/hooks/useSocial'
import { useDiscoverList, useDiscoverRadius } from '@/hooks/useDiscoverList'
import { openUrl } from '@/lib/openUrl'
import { formatDistance } from '@/lib/travelUtils'
import { goBack } from '@/lib/navigation'
import { isNamedPlatform } from '@/lib/venueTier'

/**
 * §3.1 Clubs page — tile's number, rendered.
 *
 * Fix class for every change below: (a) root-cause.
 * §0.2: meta.courts replaces 4 undefined keys. Not (c) — the badge wasn't
 * being hidden; the key didn't exist.
 */

type Filter = 'all' | 'bookable' | 'coaching'

export function VenuesPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const userId = profile?.id ?? ''
  const radius = useDiscoverRadius()

  const { data: nearYou = [], isLoading } = useDiscoverList('venues')
  const { data: playedVenues = [] } = useMyPlayedVenues(userId)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  // IDs in the counted list — used to compute the outside-radius strip.
  const nearYouIds = useMemo(() => new Set(nearYou.map(v => v.id)), [nearYou])
  const playedIds = useMemo(() => new Set(playedVenues.map(v => v.venue_id)), [playedVenues])

  // Outside-radius strip: played venues NOT in the counted list.
  const playedElsewhere = useMemo(
    () => playedVenues.filter(v => !nearYouIds.has(v.venue_id)),
    [playedVenues, nearYouIds],
  )

  // Filtered + searched rows.
  const filtered = useMemo(() => {
    let rows = nearYou
    if (filter === 'bookable') rows = rows.filter(v => v.meta.ppa_bookable === true)
    if (filter === 'coaching') rows = rows.filter(v => v.meta.coaching === true)
    const q = search.trim().toLowerCase()
    if (q) rows = rows.filter(v => v.title.toLowerCase().includes(q))
    return rows
  }, [nearYou, filter, search])

  // Sort: ppa_bookable first, then distance.
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => {
      const aPpa = a.meta.ppa_bookable === true ? 0 : 1
      const bPpa = b.meta.ppa_bookable === true ? 0 : 1
      if (aPpa !== bPpa) return aPpa - bPpa
      return (a.distance_miles ?? Infinity) - (b.distance_miles ?? Infinity)
    }),
    [filtered],
  )

  // Hero — fallback chain per §3.1.
  const hero = useMemo(() => {
    const ppa = sorted.find(v => v.meta.ppa_bookable === true)
    if (ppa) return { row: ppa, eyebrow: t('courts.ppa_venue'), ball: true, cta: t('courts.book_here'), dest: `/play/book-court?venue_id=${ppa.id}` }
    const withBooking = sorted.find(v => (v.meta.booking_url as string)?.trim())
    if (withBooking) {
      const bp = withBooking.meta.booking_platform as string | null
      return { row: withBooking, eyebrow: t('discover.hero_nearest_club'), ball: true, cta: isNamedPlatform(bp) ? t('courts.books_via', { platform: bp }) : t('venue.visit_website', { defaultValue: 'Visit their website' }), dest: '', url: withBooking.meta.booking_url as string }
    }
    const nearest = sorted[0]
    if (nearest) return { row: nearest, eyebrow: t('discover.hero_nearest_club'), ball: true, cta: t('discover.action_view'), dest: `/venues/${nearest.id}` }
    return null
  }, [sorted, t])

  const heroId = hero?.row.id
  const listRows = sorted.filter(v => v.id !== heroId)

  return (
    <div className="min-h-full bg-surface pb-32">
      {/* Header */}
      <div className="px-4 pt-12 pb-4 bg-card border-b border-hairline">
        <div className="flex items-center gap-3">
          <button onClick={() => goBack(navigate, '/discover')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-hairline -ml-1">
            <ChevronLeft className="w-5 h-5 text-ink-2" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-ink">{t('discover.tile_clubs')}</h1>
            <p className="text-[13px] text-ink-2">{t('courts.clubs_within', { count: nearYou.length, radius })}</p>
          </div>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-2" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('courts.search_placeholder')}
            style={{ fontSize: '16px' }}
            className="w-full rounded-xl border border-hairline pl-9 pr-4 py-2.5 outline-none focus:border-court focus:ring-2 focus:ring-court/20"
          />
        </div>

        {/* Chips */}
        <div className="flex gap-2">
          {([
            { id: 'all' as Filter, label: t('discover.filter_all') },
            { id: 'bookable' as Filter, label: t('courts.filter_bookable') },
            { id: 'coaching' as Filter, label: t('discover.filter_clubs') },
          ]).map(c => (
            <button key={c.id} onClick={() => setFilter(c.id)}
              className={`rounded-pill border px-3 py-1.5 text-[12px] font-semibold transition-colors ${filter === c.id ? 'bg-court text-white border-court' : 'bg-card text-ink-2 border-hairline'}`}>
              {c.label}
            </button>
          ))}
        </div>

        {/* Outside-radius strip */}
        {playedElsewhere.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-3">{t('discover.played_before')}</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {playedElsewhere.map(v => (
                <button key={v.venue_id} onClick={() => navigate(`/venues/${v.venue_id}`)}
                  className="flex-shrink-0 rounded-pill border border-hairline bg-card px-3 py-1.5 text-[12px] font-semibold text-ink-2">
                  {v.venue_name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-2">
            {[0,1,2].map(i => <div key={i} className="h-16 rounded-[16px] bg-hairline animate-pulse" />)}
          </div>
        )}

        {/* Hero */}
        {!isLoading && hero && (
          <div className="rounded-panel bg-ink p-4">
            <span className="rounded-pill bg-court-50 px-2 py-[3px] text-[11px] font-bold leading-[14px] tracking-[0.05em] text-court-700">
              {hero.eyebrow}
            </span>
            <p className="mt-2 text-[24px] font-extrabold leading-[26px] text-white">{hero.row.title}</p>
            <p className="num mt-1 text-[13px] leading-[18px] text-white/70">
              {[hero.row.subtitle, hero.row.distance_miles != null ? formatDistance(hero.row.distance_miles) : null, hero.row.meta.courts != null ? t('courts.n_courts', { count: hero.row.meta.courts as number }) : null].filter(Boolean).join(' · ')}
            </p>
            <button
              onClick={() => hero.url ? openUrl(hero.url) : navigate(hero.dest)}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-control bg-ball text-[14px] font-extrabold leading-[18px] text-ink"
            >
              {hero.cta}
              {hero.url && <ExternalLink className="h-4 w-4" />}
            </button>
          </div>
        )}

        {/* List */}
        {!isLoading && listRows.length > 0 && (
          <div className="space-y-2">
            {listRows.map(v => {
              const courts = v.meta.courts as number | null
              const bookingUrl = (v.meta.booking_url as string)?.trim() || null
              const platform = v.meta.booking_platform as string | null
              const ppa = v.meta.ppa_bookable === true
              const played = playedIds.has(v.id)

              const meta = [
                v.subtitle,
                v.distance_miles != null ? formatDistance(v.distance_miles) : null,
                courts != null ? t('courts.n_courts', { count: courts }) : null,
              ].filter(Boolean).join(' · ')

              return (
                <div key={v.id} className={`flex items-center gap-3 rounded-[16px] border bg-card p-3.5 ${ppa ? 'border-court' : 'border-hairline'}`}>
                  <button onClick={() => navigate(`/venues/${v.id}`)} className="flex min-w-0 flex-grow flex-col gap-0.5 text-left">
                    <span className="truncate text-[15px] font-semibold leading-[19px] text-ink">
                      {v.title}
                      {played && <span className="ml-1.5 text-[11px] font-bold text-court">{t('discover.badge_played_here')}</span>}
                    </span>
                    <span className="num truncate text-[12px] leading-4 text-ink-2">{meta}</span>
                  </button>
                  {ppa ? (
                    <button onClick={() => navigate(`/play/book-court?venue_id=${v.id}`)}
                      className="flex-shrink-0 whitespace-nowrap rounded-control bg-court px-3 py-2.5 text-[12px] font-bold text-white">
                      {t('courts.book_here')}
                    </button>
                  ) : bookingUrl ? (
                    <button onClick={() => openUrl(bookingUrl)}
                      className="flex-shrink-0 whitespace-nowrap flex items-center gap-1 rounded-control border border-hairline bg-card px-3 py-2.5 text-[12px] font-bold text-ink-2">
                      {isNamedPlatform(platform) ? t('courts.books_via', { platform }) : t('venue.visit_website', { defaultValue: 'Visit their website' })} <ExternalLink className="h-3 w-3" />
                    </button>
                  ) : (
                    <ChevronRight className="h-4 w-4 text-ink-3 flex-shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Empty after filter */}
        {!isLoading && nearYou.length > 0 && filtered.length === 0 && (
          <p className="text-center text-[13px] text-ink-2 py-8">{t('courts.filter_none_match')}</p>
        )}
      </div>
    </div>
  )
}
