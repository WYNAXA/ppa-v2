import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, GraduationCap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useDiscoverList } from '@/hooks/useDiscoverList'
import { formatDistance } from '@/lib/travelUtils'
import { goBack } from '@/lib/navigation'

/**
 * A coach from the DIRECTORY — a `padel_venues` row classified
 * `venue_type = 'coach'`, with no Padel Players account behind it.
 *
 * These were previously indistinguishable from venues, so "PadelwithPeter
 * Coaching" (0 courts) appeared in the venue list while this page showed
 * "No coaches yet" — which it did for every user in every country, because
 * `coach_profiles` is empty and always has been. The 20 coaches existed; they
 * were just filed as places.
 *
 * They are not bookable and deliberately carry no claim button yet: the only
 * claim path today is `claim_venue`, which would make a coach the OWNER of a
 * synthetic venue row rather than a coach. That needs its own flow.
 */
export function CoachesPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { t } = useTranslation()

  const { data: nearYou = [], isLoading: loadingNearYou } = useDiscoverList('coaching')



  // Mine — sessions the player has booked
  const userId = profile?.id ?? ''
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


  return (
    <div className="min-h-screen bg-card pb-24">
      <div className="px-5 pt-14 pb-3 flex items-center gap-3">
        <button onClick={() => goBack(navigate, '/play')} className="h-9 w-9 rounded-full bg-hairline flex items-center justify-center flex-shrink-0">
          <ChevronLeft className="h-5 w-5 text-ink-2" />
        </button>
        <div>
          <h1 className="text-[22px] font-bold text-ink leading-tight">Coaches</h1>
          <p className="text-[13px] text-ink-2">{t('discover.coaches_subtitle')}</p>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-4">
        {/* Mine — booked sessions. Omitted when empty. */}
        {myBookings.length > 0 && (
          <section>
            <h2 className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2 mb-2">
              {t('discover.mine')}
            </h2>
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

        {/* Near you */}
        <section>
          <h2 className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2 mb-2">
            {t('discover.near_you')} · {nearYou.length}
          </h2>
          {loadingNearYou ? (
            <div className="flex items-center justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-court border-t-transparent" /></div>
          ) : nearYou.length === 0 ? (
            <div className="rounded-card border border-dashed border-hairline p-5 text-center">
              <p className="text-[13px] font-semibold text-ink-2">{t('discover.empty_subtitle')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {nearYou.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/venues/${c.id}`)}
                  className="w-full flex items-center gap-3 rounded-2xl border border-hairline bg-card p-3 text-left active:scale-[0.99] transition-transform"
                >
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
          )}
        </section>
      </div>
    </div>
  )
}
