import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useMyPlayedVenues } from '@/hooks/useSocial'
import { useDiscoverList } from '@/hooks/useDiscoverList'
import { openUrl } from '@/lib/openUrl'
import { formatDistance } from '@/lib/travelUtils'
import { confirmedCourtCount } from '@/lib/venueRows'

export function VenuesPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const userId = profile?.id ?? ''

  const { data: nearYou = [], isLoading } = useDiscoverList('venues')
  const { data: recentlyPlayed = [] } = useMyPlayedVenues(userId)

  // Split: partner venues (ppa_bookable) first, then the rest.
  const partners = nearYou.filter(v => v.meta.ppa_bookable === true)
  const others = nearYou.filter(v => v.meta.ppa_bookable !== true)

  return (
    <div className="min-h-full bg-surface pb-32">
      <div className="px-4 pt-12 pb-4 bg-card border-b border-hairline">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/discover')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-hairline -ml-1">
            <ChevronLeft className="w-5 h-5 text-ink-2" />
          </button>
          <h1 className="text-xl font-bold text-ink flex-1">{t('discover.tile_clubs')}</h1>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-4">
        {/* Recently played — compact horizontal strip */}
        {recentlyPlayed.length > 0 && (
          <section>
            <h2 className="mb-2 text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
              {t('discover.mine')}
            </h2>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {recentlyPlayed.map((v) => (
                <button
                  key={v.venue_id}
                  onClick={() => navigate(`/venues/${v.venue_id}`)}
                  className="flex-shrink-0 rounded-pill border border-hairline bg-card px-3 py-1.5 text-[12px] font-semibold text-ink-2"
                >
                  {v.venue_name}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Near you */}
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
            {t('discover.near_you')} · {nearYou.length}
          </h2>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-court border-t-transparent" />
            </div>
          )}

          {!isLoading && nearYou.length === 0 && (
            <div className="rounded-card border border-dashed border-hairline p-5 text-center">
              <p className="text-[13px] font-semibold text-ink-2">
                {t('discover.empty_subtitle')}
              </p>
            </div>
          )}

          {/* Partners first */}
          {partners.length > 0 && (
            <div className="space-y-2 mb-3">
              {partners.map((v) => (
                <VenueRow key={v.id} row={v} navigate={navigate} t={t} partner />
              ))}
            </div>
          )}

          {/* Others */}
          {others.length > 0 && (
            <div className="space-y-2">
              {others.map((v) => (
                <VenueRow key={v.id} row={v} navigate={navigate} t={t} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function VenueRow({ row, navigate, t, partner }: {
  row: { id: string; title: string; subtitle: string | null; distance_miles: number | null; meta: Record<string, unknown> }
  navigate: (to: string) => void
  t: (k: string, o?: Record<string, unknown>) => string
  partner?: boolean
}) {
  const courts = confirmedCourtCount({
    indoor_courts: row.meta.indoor_courts as number | null,
    outdoor_courts: row.meta.outdoor_courts as number | null,
    covered_courts: row.meta.covered_courts as number | null,
    number_of_courts: row.meta.number_of_courts as number | null,
  })
  const bookingUrl = row.meta.booking_url as string | null
  const platform = row.meta.booking_platform as string | null

  const meta = [
    row.subtitle,
    row.distance_miles != null ? formatDistance(row.distance_miles) : null,
    courts != null ? t('courts.n_courts', { count: courts }) : t('courts.courts_unconfirmed'),
  ].filter(Boolean).join(' · ')

  return (
    <div className={`flex items-center gap-3 rounded-[16px] border bg-card p-3.5 ${partner ? 'border-court' : 'border-hairline'}`}>
      <button
        onClick={() => navigate(`/venues/${row.id}`)}
        className="flex min-w-0 flex-grow flex-col gap-0.5 text-left"
      >
        <span className="truncate text-[15px] font-semibold leading-[19px] text-ink">{row.title}</span>
        <span className="num truncate text-[12px] leading-4 text-ink-2">{meta}</span>
      </button>
      {partner ? (
        <button
          onClick={() => navigate(`/play/book-court?venue_id=${row.id}`)}
          className="flex-shrink-0 whitespace-nowrap rounded-control bg-court px-3 py-2.5 text-[12px] font-bold text-white"
        >
          {t('courts.book_here')}
        </button>
      ) : bookingUrl?.trim() ? (
        <button
          onClick={() => openUrl(bookingUrl!)}
          className="flex-shrink-0 whitespace-nowrap flex items-center gap-1 rounded-control bg-surface px-3 py-2.5 text-[12px] font-bold text-ink-2"
        >
          {platform ?? t('venue.visit_website')} <ExternalLink className="h-3 w-3" />
        </button>
      ) : (
        <ChevronRight className="h-4 w-4 text-ink-3 flex-shrink-0" />
      )}
    </div>
  )
}
