import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, MapPin, Clock, Bell, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { useDateLocale } from '@/lib/dateLocale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { goBack } from '@/lib/navigation'

interface Entry {
  id: string
  venue_id: string
  date: string
  start_time: string
  duration_minutes: number | null
  venue: { venue_name: string; city: string | null } | null
}

export function WaitlistPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const userId = session?.user?.id ?? ''
  const locale = useDateLocale()
  const qc = useQueryClient()

  const { data: entries = [], isLoading } = useQuery<Entry[]>({
    queryKey: ['my-waitlist', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('slot_waitlist')
        .select('id, venue_id, date, start_time, duration_minutes')
        .eq('user_id', userId)
        .eq('status', 'waiting')
        .order('date')
        .order('start_time')
      const rows = (data ?? []) as any[]
      if (!rows.length) return []
      const venueIds = [...new Set(rows.map((r) => r.venue_id))]
      const { data: venues } = await supabase
        .from('padel_venues')
        .select('venues_id, venue_name, city')
        .in('venues_id', venueIds)
      const vmap = new Map((venues ?? []).map((v: any) => [v.venues_id, v]))
      return rows.map((r) => ({ ...r, venue: vmap.get(r.venue_id) ?? null }))
    },
  })

  const leave = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('slot_waitlist').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-waitlist', userId] })
      toast.success('Removed from the waitlist.')
    },
    onError: () => toast.error('Could not remove — please try again.'),
  })

  function fmtTime(t: string): string {
    try { return t.length >= 5 ? t.slice(0, 5) : t } catch { return t }
  }
  function fmtDate(d: string): string {
    try { return format(parseISO(d), 'EEE d MMM', { locale }) } catch { return d }
  }

  return (
    <div className="min-h-screen bg-white pb-24">
      <div className="px-5 pt-14 pb-3 flex items-center gap-3">
        <button onClick={() => goBack(navigate, '/play')} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 leading-tight">My waitlist</h1>
          <p className="text-[13px] text-gray-400">Slots you're waiting on — we'll notify you if one frees up</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="h-7 w-7 rounded-full border-2 border-court border-t-transparent animate-spin" /></div>
      ) : entries.length === 0 ? (
        <div className="px-5 py-16 text-center">
          <div className="h-14 w-14 rounded-full bg-teal-50 flex items-center justify-center mx-auto mb-3"><Bell className="h-7 w-7 text-court" /></div>
          <p className="text-[14px] font-semibold text-gray-700">You're not on any waitlists</p>
          <p className="text-[13px] text-gray-400 mt-1 max-w-xs mx-auto">When a slot is full, join its waitlist while booking — we'll ping you the moment a court opens up.</p>
          <button onClick={() => navigate('/play/book-court')} className="mt-4 h-10 px-5 rounded-xl bg-court text-white text-[13px] font-semibold">Book a court</button>
        </div>
      ) : (
        <div className="px-5 space-y-2">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3.5">
              <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0"><Bell className="h-5 w-5 text-court" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-gray-900 truncate">{e.venue?.venue_name ?? 'Venue'}</p>
                <div className="flex items-center gap-2 mt-0.5 text-[12px] text-gray-500 flex-wrap">
                  <span>{fmtDate(e.date)} · {fmtTime(e.start_time)}</span>
                  {e.duration_minutes && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{e.duration_minutes} min</span>}
                  {e.venue?.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{e.venue.city}</span>}
                </div>
              </div>
              <button
                onClick={() => leave.mutate(e.id)}
                disabled={leave.isPending}
                className="h-8 px-3 rounded-lg border border-gray-200 text-gray-600 text-[12px] font-semibold flex items-center gap-1 hover:bg-gray-50 disabled:opacity-50 flex-shrink-0"
              >
                <X className="h-3.5 w-3.5" /> Leave
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
