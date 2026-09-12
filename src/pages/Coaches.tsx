import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, GraduationCap, ExternalLink, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
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
interface DirectoryCoach {
  venue_id: string
  venue_name: string
  city: string | null
  website: string | null
  booking_url: string | null
  instagram: string | null
  distanceMiles: number | null
}

interface CoachCard {
  id: string
  name: string
  avatar_url: string | null
  headline: string | null
  specialties: string[]
  upcoming: number
  venues: string[]
}

export function CoachesPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const lat = profile?.latitude ?? null
  const lng = profile?.longitude ?? null

  const { data: coaches = [], isLoading } = useQuery<CoachCard[]>({
    queryKey: ['coaches-directory'],
    queryFn: async () => {
      const [{ data: profiles }, { data: sessions }] = await Promise.all([
        supabase.from('coach_profiles').select('user_id, headline, specialties'),
        supabase
          .from('coaching_sessions')
          .select('coach_user_id, venue_id, start_at')
          .eq('status', 'scheduled')
          .gte('start_at', new Date().toISOString()),
      ])

      const upcomingByCoach = new Map<string, { count: number; venueIds: Set<string> }>()
      for (const s of (sessions ?? []) as any[]) {
        const e = upcomingByCoach.get(s.coach_user_id) ?? { count: 0, venueIds: new Set<string>() }
        e.count++; e.venueIds.add(s.venue_id); upcomingByCoach.set(s.coach_user_id, e)
      }

      const profMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]))
      const allCoachIds = [...new Set([...profMap.keys(), ...upcomingByCoach.keys()])] as string[]
      if (!allCoachIds.length) return []

      const allVenueIds = [...new Set((sessions ?? []).map((s: any) => s.venue_id))]
      const [{ data: names }, { data: venues }] = await Promise.all([
        supabase.from('profiles').select('id, name, avatar_url').in('id', allCoachIds),
        allVenueIds.length
          ? supabase.from('padel_venues').select('venues_id, venue_name').in('venues_id', allVenueIds)
          : Promise.resolve({ data: [] as any[] }),
      ])
      const nameMap = new Map((names ?? []).map((n: any) => [n.id, n]))
      const vmap = new Map((venues ?? []).map((v: any) => [v.venues_id, v.venue_name]))

      return allCoachIds
        .map((id): CoachCard => {
          const up = upcomingByCoach.get(id)
          return {
            id,
            name: nameMap.get(id)?.name ?? 'Coach',
            avatar_url: nameMap.get(id)?.avatar_url ?? null,
            headline: profMap.get(id)?.headline ?? null,
            specialties: (profMap.get(id)?.specialties ?? []) as string[],
            upcoming: up?.count ?? 0,
            venues: up ? ([...up.venueIds].map((vid) => vmap.get(vid)).filter(Boolean) as string[]) : [],
          }
        })
        .sort((a, b) => b.upcoming - a.upcoming)
    },
  })

  const { data: directory = [] } = useQuery<DirectoryCoach[]>({
    queryKey: ['coaches-directory-listings', lat, lng],
    queryFn: async () => {
      const hasLocation = lat != null && lng != null
      // venues_near takes p_venue_type, so the same RPC that powers venue
      // discovery serves coaches — which is why it was parameterised rather
      // than hardcoded to 'club'.
      if (hasLocation) {
        const { data, error } = await supabase.rpc('venues_near', {
          p_lat: lat,
          p_lng: lng,
          p_radius_miles: 60,
          p_limit: 40,
          p_venue_type: 'coach',
        })
        if (error) throw error
        return ((data ?? []) as Record<string, unknown>[]).map((v) => ({
          venue_id: v.venue_id as string,
          venue_name: (v.venue_name as string) ?? 'Coach',
          city: (v.city as string) ?? null,
          website: null,
          booking_url: (v.booking_url as string) || null,
          instagram: null,
          distanceMiles: v.distance_miles != null ? Number(v.distance_miles) : null,
        }))
      }
      // No coordinates means no "near", so list them unordered rather than
      // pretending to a distance we cannot compute.
      const { data, error } = await supabase
        .from('discoverable_venues')
        .select('venue_id, venue_name, city, website, booking_url, instagram')
        .eq('venue_type', 'coach')
        .limit(40)
      if (error) throw error
      return (data ?? []).map((v) => ({
        venue_id: v.venue_id as string,
        venue_name: v.venue_name ?? 'Coach',
        city: v.city ?? null,
        website: v.website ?? null,
        booking_url: v.booking_url || null,
        instagram: v.instagram ?? null,
        distanceMiles: null,
      })) as DirectoryCoach[]
    },
  })

  const nothingAtAll = coaches.length === 0 && directory.length === 0

  return (
    <div className="min-h-screen bg-card pb-24">
      <div className="px-5 pt-14 pb-3 flex items-center gap-3">
        <button onClick={() => goBack(navigate, '/play')} className="h-9 w-9 rounded-full bg-hairline flex items-center justify-center flex-shrink-0">
          <ChevronLeft className="h-5 w-5 text-ink-2" />
        </button>
        <div>
          <h1 className="text-[22px] font-bold text-ink leading-tight">Coaches</h1>
          <p className="text-[13px] text-ink-2">Find a coach and book a session</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="h-7 w-7 rounded-full border-2 border-court border-t-transparent animate-spin" /></div>
      ) : nothingAtAll ? (
        <div className="px-5 py-16 text-center">
          <div className="h-14 w-14 rounded-full bg-court-50 flex items-center justify-center mx-auto mb-3"><GraduationCap className="h-7 w-7 text-court" /></div>
          <p className="text-[14px] font-semibold text-ink-2">No coaches yet</p>
          <p className="text-[13px] text-ink-2 mt-1 max-w-xs mx-auto">Coaches appear here once venues add them and they schedule sessions.</p>
        </div>
      ) : (
        <div className="px-5 space-y-2">
          {coaches.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(`/coaches/${c.id}`)}
              className="w-full flex items-center gap-3 rounded-2xl border border-hairline bg-card p-3 text-left hover:border-court-100 hover:bg-court-50/20 active:scale-[0.99] transition-all"
            >
              <PlayerAvatar name={c.name} avatarUrl={c.avatar_url} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-ink truncate">{c.name}</p>
                {c.headline && <p className="text-[12px] text-court truncate">{c.headline}</p>}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {c.upcoming > 0 && <span className="text-[11px] font-semibold text-court">{c.upcoming} upcoming</span>}
                  {c.venues.length > 0 && <span className="text-[11px] text-ink-2 truncate">{c.venues.slice(0, 2).join(' · ')}</span>}
                </div>
                {c.specialties.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {c.specialties.slice(0, 3).map((sp) => (
                      <span key={sp} className="text-[11px] leading-none px-1.5 py-1 rounded-full bg-court-50 text-court-700 border border-court-100">{sp}</span>
                    ))}
                  </div>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-ink-3 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {directory.length > 0 && (
        <section className="px-5 mt-6">
          <h2 className="text-[13px] font-bold text-ink-2 uppercase tracking-wide mb-1">
            Coaching in the directory
          </h2>
          <p className="text-[12px] text-ink-2 mb-3">
            Not on Padel Players yet — contact them directly.
          </p>
          <div className="space-y-2">
            {directory.map((c) => {
              const link = c.booking_url || c.website || c.instagram
              return (
                <div
                  key={c.venue_id}
                  className="flex items-center gap-3 rounded-2xl border border-hairline bg-card p-3"
                >
                  <div className="h-10 w-10 rounded-full bg-court-50 flex items-center justify-center flex-shrink-0">
                    <GraduationCap className="h-5 w-5 text-court" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-ink truncate">{c.venue_name}</p>
                    <p className="text-[12px] text-ink-2 truncate">
                      {[c.city, c.distanceMiles != null ? formatDistance(c.distanceMiles) : null]
                        .filter(Boolean)
                        .join(' · ') || 'Location unknown'}
                    </p>
                  </div>
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-shrink-0 rounded-xl bg-hairline px-3 py-2 text-[12px] font-semibold text-ink flex items-center gap-1.5"
                    >
                      Contact <ExternalLink size={12} />
                    </a>
                  ) : (
                    <span className="flex-shrink-0 text-[11px] text-ink-3 flex items-center gap-1">
                      <MapPin size={11} /> no contact listed
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
