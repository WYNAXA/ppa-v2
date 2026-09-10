import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, GraduationCap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { goBack } from '@/lib/navigation'

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

  return (
    <div className="min-h-screen bg-white pb-24">
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
      ) : coaches.length === 0 ? (
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
              className="w-full flex items-center gap-3 rounded-2xl border border-hairline bg-white p-3 text-left hover:border-court-100 hover:bg-court-50/20 active:scale-[0.99] transition-all"
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
    </div>
  )
}
