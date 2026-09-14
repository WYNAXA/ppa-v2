import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, GraduationCap, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useDiscoverList, useDiscoverRadius } from '@/hooks/useDiscoverList'
import { formatDistance } from '@/lib/travelUtils'
import { goBack } from '@/lib/navigation'
import { openUrl } from '@/lib/openUrl'

/**
 * §3.3 Coaching — tile's number, rendered.
 *
 * Fix class (a) for §0.5: meta.venue_type discriminates coach from club.
 * Not (c) — the data was in the payload and ignored.
 * Fix class (a) for §0.6: heading is t('discover.tile_coaching'), not
 * hardcoded "Coaches".
 */

type Filter = 'all' | 'coaches' | 'clubs'

export function CoachesPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { t } = useTranslation()
  const userId = profile?.id ?? ''
  const radius = useDiscoverRadius()

  const { data: nearYou = [], isLoading } = useDiscoverList('coaching')
  const [filter, setFilter] = useState<Filter>('all')

  // My booked sessions — Waiting on you.
  const { data: myBookings = [] } = useQuery({
    queryKey: ['my-coaching-bookings', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('coaching_bookings')
        .select('session_id, coaching_sessions(id, title, start_at, coach_user_id)')
        .eq('player_id', userId)
        .eq('status', 'booked')
      if (!data || data.length === 0) return []
      const coachIds = [...new Set(data.map((b: any) => b.coaching_sessions?.coach_user_id).filter(Boolean))]
      const { data: profs } = coachIds.length
        ? await supabase.from('profiles').select('id, name').in('id', coachIds)
        : { data: [] }
      const nameMap = new Map((profs ?? []).map((p: any) => [p.id, p.name]))
      return data
        .filter((b: any) => b.coaching_sessions)
        .map((b: any) => ({
          sessionId: b.coaching_sessions.id as string,
          title: b.coaching_sessions.title as string,
          startAt: b.coaching_sessions.start_at as string,
          coachName: nameMap.get(b.coaching_sessions.coach_user_id) ?? t('venue.coach_fallback'),
        }))
    },
  })

  const coachCount = nearYou.filter(r => r.meta.venue_type === 'coach').length
  const clubCount = nearYou.filter(r => r.meta.venue_type !== 'coach').length

  const filtered = useMemo(() => {
    if (filter === 'coaches') return nearYou.filter(r => r.meta.venue_type === 'coach')
    if (filter === 'clubs') return nearYou.filter(r => r.meta.venue_type !== 'coach')
    return nearYou
  }, [nearYou, filter])

  // Hero — fallback chain per §3.3.
  const hero = useMemo(() => {
    const coach = filtered.find(r => r.meta.venue_type === 'coach')
    if (coach) {
      return { row: coach, eyebrow: t('people.badge_coach'), isCoach: true }
    }
    const club = filtered[0]
    if (club) {
      const bookingUrl = (club.meta.booking_url as string)?.trim() || null
      const platform = club.meta.booking_platform as string | null
      return {
        row: club,
        eyebrow: t('discover.hero_lessons_here'),
        isCoach: false,
        bookingUrl,
        ctaLabel: bookingUrl ? t('courts.books_via', { platform: platform ?? t('venue.website_fallback') }) : t('discover.action_view'),
      }
    }
    return null
  }, [filtered, t])

  const heroId = hero?.row.id
  const listRows = filtered.filter(r => r.id !== heroId)
  const listCoaches = listRows.filter(r => r.meta.venue_type === 'coach')
  const listClubs = listRows.filter(r => r.meta.venue_type !== 'coach')

  // Header subtitle.
  const headerSub = coachCount > 0 && clubCount > 0
    ? t('discover.coaching_within_split', { coaches: coachCount, clubs: clubCount, radius })
    : t('discover.coaching_within', { count: nearYou.length, radius })

  return (
    <div className="min-h-screen bg-card pb-24">
      {/* Header */}
      <div className="px-5 pt-14 pb-3 flex items-center gap-3">
        <button onClick={() => goBack(navigate, '/discover')} className="h-9 w-9 rounded-full bg-hairline flex items-center justify-center flex-shrink-0">
          <ChevronLeft className="h-5 w-5 text-ink-2" />
        </button>
        <div className="flex-1">
          <h1 className="text-[22px] font-bold text-ink leading-tight">{t('discover.tile_coaching')}</h1>
          <p className="text-[13px] text-ink-2">{headerSub}</p>
        </div>
      </div>

      <div className="px-5 space-y-4">
        {/* Waiting on you — booked sessions */}
        {myBookings.length > 0 && (
          <section>
            <p className="mb-2 text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
              {t('discover.your_sessions')}
            </p>
            <div className="space-y-2">
              {myBookings.map((b: any) => (
                <div key={b.sessionId} className="rounded-card border border-hairline bg-card p-3">
                  <p className="text-[13px] font-semibold text-ink">{b.title}</p>
                  <p className="text-[11px] text-ink-2">{b.coachName} · {new Date(b.startAt).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Chips */}
        <div className="flex gap-2">
          {([
            { id: 'all' as Filter, label: t('discover.filter_all') },
            { id: 'coaches' as Filter, label: t('discover.filter_coaches') },
            { id: 'clubs' as Filter, label: t('discover.filter_clubs') },
          ]).map(c => (
            <button key={c.id} onClick={() => setFilter(c.id)}
              className={`rounded-pill border px-3 py-1.5 text-[12px] font-semibold transition-colors ${filter === c.id ? 'bg-court text-white border-court' : 'bg-card text-ink-2 border-hairline'}`}>
              {c.label}
            </button>
          ))}
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-2">
            {[0,1,2].map(i => <div key={i} className="h-16 rounded-xl bg-hairline animate-pulse" />)}
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
              {[hero.row.subtitle, hero.row.distance_miles != null ? formatDistance(hero.row.distance_miles) : null].filter(Boolean).join(' · ')}
            </p>
            <button
              onClick={() => {
                if (!hero.isCoach && (hero as any).bookingUrl) openUrl((hero as any).bookingUrl)
                else navigate(`/venues/${hero.row.id}`)
              }}
              className="mt-3 flex h-11 w-full items-center justify-center rounded-control bg-ball text-[14px] font-extrabold leading-[18px] text-ink"
            >
              {hero.isCoach ? t('discover.action_view') : (hero as any).ctaLabel ?? t('discover.action_view')}
            </button>
          </div>
        )}

        {/* List — grouped by venue_type */}
        {!isLoading && (
          <div className="space-y-4">
            {listCoaches.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
                  {t('discover.group_coaches', { count: listCoaches.length })}
                </p>
                <div className="space-y-2">
                  {listCoaches.map(c => (
                    <button key={c.id} onClick={() => navigate(`/venues/${c.id}`)}
                      className="w-full flex items-center gap-3 rounded-2xl border border-hairline bg-card p-3 text-left active:scale-[0.99] transition-transform">
                      <div className="h-10 w-10 rounded-full bg-court-50 flex items-center justify-center flex-shrink-0">
                        <GraduationCap className="h-5 w-5 text-court" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-ink truncate">{c.title}</p>
                        <p className="text-[12px] text-ink-2 truncate">
                          {[c.subtitle, c.distance_miles != null ? formatDistance(c.distance_miles) : null].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-ink-3 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {listClubs.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
                  {t('discover.group_clubs_lessons', { count: listClubs.length })}
                </p>
                <div className="space-y-2">
                  {listClubs.map(c => (
                    <button key={c.id} onClick={() => navigate(`/venues/${c.id}`)}
                      className="w-full flex items-center gap-3 rounded-2xl border border-hairline bg-card p-3 text-left active:scale-[0.99] transition-transform">
                      <div className="h-10 w-10 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
                        <Building2 className="h-5 w-5 text-ink-2" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-ink truncate">{c.title}</p>
                        <p className="text-[12px] text-ink-2 truncate">
                          {[c.subtitle, c.distance_miles != null ? formatDistance(c.distance_miles) : null].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-ink-3 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!isLoading && nearYou.length === 0 && (
          <div className="px-5 py-16 text-center">
            <div className="h-14 w-14 rounded-full bg-court-50 flex items-center justify-center mx-auto mb-3">
              <GraduationCap className="h-7 w-7 text-court" />
            </div>
            <p className="text-[14px] font-semibold text-ink-2">{t('discover.empty_subtitle')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
