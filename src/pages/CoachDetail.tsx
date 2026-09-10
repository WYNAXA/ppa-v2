import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, MapPin, Award, GraduationCap } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'

const CUR: Record<string, string> = { GBP: '£', EUR: '€', USD: '$', SEK: 'kr', AUD: '$', CAD: '$' }
function sym(c?: string | null): string { return CUR[c ?? 'GBP'] ?? (c ? `${c} ` : '£') }

export function CoachDetailPage() {
  const { coachId = '' } = useParams<{ coachId: string }>()
  const navigate = useNavigate()
  const { session } = useAuth()
  const userId = session?.user?.id ?? ''
  const locale = useDateLocale()
  const qc = useQueryClient()

  const { data: coach, isLoading } = useQuery({
    queryKey: ['coach', coachId],
    enabled: !!coachId,
    queryFn: async () => {
      const [{ data: prof }, { data: cp }] = await Promise.all([
        supabase.from('profiles').select('id, name, avatar_url').eq('id', coachId).maybeSingle(),
        supabase.from('coach_profiles').select('headline, bio, specialties, years_experience').eq('user_id', coachId).maybeSingle(),
      ])
      if (!prof) return null
      return { ...prof, ...(cp ?? {}) } as {
        id: string; name: string; avatar_url: string | null
        headline?: string | null; bio?: string | null; specialties?: string[] | null; years_experience?: number | null
      }
    },
  })

  const { data: sessions = [] } = useQuery({
    queryKey: ['coach-sessions', coachId, userId],
    enabled: !!coachId,
    queryFn: async () => {
      const { data: list } = await supabase
        .from('coaching_sessions')
        .select('id, venue_id, title, session_type, start_at, capacity, price_pence, currency')
        .eq('coach_user_id', coachId)
        .eq('status', 'scheduled')
        .gte('start_at', new Date().toISOString())
        .order('start_at')
        .limit(30)
      const rows = list ?? []
      if (!rows.length) return []
      const ids = rows.map((s: any) => s.id)
      const venueIds = [...new Set(rows.map((s: any) => s.venue_id))]
      const [{ data: bks }, { data: venues }] = await Promise.all([
        supabase.from('coaching_bookings').select('session_id, player_id').in('session_id', ids).eq('status', 'booked'),
        supabase.from('padel_venues').select('venues_id, venue_name, city').in('venues_id', venueIds),
      ])
      const counts = new Map<string, number>(); const mine = new Set<string>()
      for (const b of bks ?? []) { counts.set(b.session_id, (counts.get(b.session_id) ?? 0) + 1); if (b.player_id === userId) mine.add(b.session_id) }
      const vmap = new Map((venues ?? []).map((v: any) => [v.venues_id, v]))
      return rows.map((s: any) => ({ ...s, booked: counts.get(s.id) ?? 0, mine: mine.has(s.id), venue: vmap.get(s.venue_id) ?? null }))
    },
  })

  const bookClass = useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await supabase.rpc('book_class', { p_session_id: sessionId })
      if (error) throw error
      return data as { status: string }
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['coach-sessions', coachId, userId] })
      switch (res?.status) {
        case 'booked': toast.success('You’re booked in — see you on court!'); break
        case 'already_booked': toast('You’re already booked in.'); break
        case 'full': toast.error('Sorry — that session just filled up.'); break
        case 'past': toast.error('That session has already started.'); break
        default: toast.error('That session is no longer available.')
      }
    },
    onError: () => toast.error('Couldn’t book that session — please try again.'),
  })

  const venueNames = [...new Set((sessions as any[]).map((s) => s.venue?.venue_name).filter(Boolean))] as string[]

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-white"><div className="h-7 w-7 rounded-full border-2 border-court border-t-transparent animate-spin" /></div>
  }
  if (!coach) {
    return (
      <div className="min-h-screen bg-white">
        <div className="px-5 pt-14"><button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-hairline flex items-center justify-center"><ChevronLeft className="h-5 w-5 text-ink-2" /></button></div>
        <p className="text-center text-[14px] text-ink-2 mt-10">Coach not found.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white pb-16">
      {/* Header */}
      <div className="px-5 pt-14 pb-4">
        <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-hairline flex items-center justify-center mb-4"><ChevronLeft className="h-5 w-5 text-ink-2" /></button>
        <div className="flex items-center gap-4">
          <PlayerAvatar name={coach.name} avatarUrl={coach.avatar_url} size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <GraduationCap className="h-4 w-4 text-court" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-court">Coach</span>
            </div>
            <h1 className="text-[22px] font-bold text-ink leading-tight truncate">{coach.name}</h1>
            {coach.headline && <p className="text-[13px] text-court font-medium">{coach.headline}</p>}
          </div>
        </div>

        {(coach.years_experience != null || venueNames.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[12px] text-ink-2">
            {coach.years_experience != null && <span className="flex items-center gap-1"><Award className="h-3.5 w-3.5 text-ink-2" />{coach.years_experience}+ yrs experience</span>}
            {venueNames.length > 0 && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-ink-2" />{venueNames.join(' · ')}</span>}
          </div>
        )}

        {Array.isArray(coach.specialties) && coach.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {coach.specialties.map((sp) => (
              <span key={sp} className="text-[11px] font-medium px-2 py-1 rounded-full bg-court-50 text-court-700 border border-court-100">{sp}</span>
            ))}
          </div>
        )}

        {coach.bio && <p className="text-[14px] text-ink-2 leading-relaxed mt-4">{coach.bio}</p>}
      </div>

      {/* Upcoming sessions */}
      <section className="px-5 mt-2">
        <h2 className="text-base font-semibold text-ink mb-3">Upcoming sessions</h2>
        {sessions.length === 0 ? (
          <div className="rounded-xl bg-surface border border-hairline p-6 text-center">
            <p className="text-[13px] text-ink-2">No sessions scheduled right now — check back soon.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(sessions as any[]).map((c) => {
              const full = c.booked >= c.capacity
              const spots = Math.max(0, c.capacity - c.booked)
              return (
                <div key={c.id} className="rounded-xl bg-surface border border-hairline p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-court-100 flex items-center justify-center flex-shrink-0 text-lg">{'\u{1F3BE}'}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{c.title}</p>
                    <p className="text-xs text-ink-2 truncate">
                      {format(new Date(c.start_at), 'EEE d MMM · HH:mm', { locale })}
                      {c.venue?.venue_name && ` · ${c.venue.venue_name}`}
                    </p>
                    <p className="text-[11px] mt-0.5">
                      {c.price_pence != null && <span className="font-semibold text-ink-2">{sym(c.currency)}{(c.price_pence / 100).toFixed(2)}</span>}
                      {c.price_pence != null && <span className="text-ink-3"> · </span>}
                      <span className="text-ink-2">{c.mine ? 'You’re booked' : full ? 'Full' : `${spots} spot${spots === 1 ? '' : 's'} left`}</span>
                    </p>
                  </div>
                  {c.mine ? (
                    <span className="text-[12px] font-semibold text-court flex-shrink-0">Booked ✓</span>
                  ) : (
                    <button
                      disabled={full || bookClass.isPending}
                      onClick={() => bookClass.mutate(c.id)}
                      className="h-8 px-3 rounded-lg bg-court text-white text-[12px] font-semibold disabled:opacity-40 flex-shrink-0 active:scale-95 transition-transform"
                    >
                      Book
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
