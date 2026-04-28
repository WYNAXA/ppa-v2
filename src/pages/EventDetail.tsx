import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, MapPin, Clock, Calendar } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

type RsvpStatus = 'going' | 'interested' | 'not_going'

interface EventDetail {
  id: string
  title: string
  description: string | null
  start_time: string
  end_time: string | null
  location: string | null
  event_type: string | null
  status: string
  group_id: string
  created_by: string
}

function useEvent(id: string) {
  return useQuery({
    queryKey: ['event', id],
    enabled: !!id,
    queryFn: async (): Promise<EventDetail | null> => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, description, start_time, end_time, location, event_type, status, group_id, created_by')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
  })
}

interface Attendee {
  user_id: string
  status: RsvpStatus
  profile: { name: string; avatar_url: string | null } | null
}

function useAttendees(eventId: string) {
  return useQuery({
    queryKey: ['event-attendees', eventId],
    enabled: !!eventId,
    queryFn: async (): Promise<Attendee[]> => {
      const { data } = await supabase
        .from('event_attendees')
        .select('user_id, status')
        .eq('event_id', eventId)
      if (!data || data.length === 0) return []
      const ids = data.map((r) => r.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', ids)
      return data.map((r) => ({
        ...r,
        status: r.status as RsvpStatus,
        profile: profiles?.find((p) => p.id === r.user_id) ?? null,
      }))
    },
  })
}

function useMyRsvp(eventId: string, userId: string) {
  return useQuery({
    queryKey: ['event-rsvp', eventId, userId],
    enabled: !!eventId && !!userId,
    queryFn: async (): Promise<RsvpStatus | null> => {
      const { data } = await supabase
        .from('event_attendees')
        .select('status')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .maybeSingle()
      return (data?.status as RsvpStatus) ?? null
    },
  })
}

const RSVP_OPTIONS: { label: string; value: RsvpStatus; activeClass: string; inactiveClass: string }[] = [
  {
    label: 'Going',
    value: 'going',
    activeClass: 'bg-[#009688] text-white border-[#009688]',
    inactiveClass: 'bg-white text-gray-600 border border-gray-200',
  },
  {
    label: 'Interested',
    value: 'interested',
    activeClass: 'bg-blue-500 text-white border-blue-500',
    inactiveClass: 'bg-white text-gray-600 border border-gray-200',
  },
  {
    label: "Can't make it",
    value: 'not_going',
    activeClass: 'bg-gray-500 text-white border-gray-500',
    inactiveClass: 'bg-white text-gray-600 border border-gray-200',
  },
]

export function EventDetailPage() {
  const { id = '' }  = useParams<{ id: string }>()
  const navigate      = useNavigate()
  const { user }      = useAuth()
  const userId        = user?.id ?? ''
  const queryClient   = useQueryClient()

  const { data: event, isLoading }     = useEvent(id)
  const { data: myRsvp }               = useMyRsvp(id, userId)
  const { data: attendees = [] }       = useAttendees(id)

  const rsvpMutation = useMutation({
    mutationFn: async (status: RsvpStatus) => {
      if (!userId || !id) return
      const { error } = await supabase
        .from('event_attendees')
        .upsert({ event_id: id, user_id: userId, status }, { onConflict: 'event_id,user_id' })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-rsvp', id, userId] })
      queryClient.invalidateQueries({ queryKey: ['event-attendees', id] })
    },
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <p className="text-[14px] font-semibold text-gray-500">Event not found</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-[13px] text-teal-600 font-semibold">Go back</button>
      </div>
    )
  }

  const goingCount      = attendees.filter((a) => a.status === 'going').length
  const interestedCount = attendees.filter((a) => a.status === 'interested').length

  const ev = event
  function addToCalendar() {
    try {
      const start = new Date(ev.start_time)
      const end   = ev.end_time ? new Date(ev.end_time) : new Date(start.getTime() + 3600_000)
      const fmt   = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
      const url   = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.title)}&dates=${fmt(start)}/${fmt(end)}${ev.location ? `&location=${encodeURIComponent(ev.location)}` : ''}${ev.description ? `&details=${encodeURIComponent(ev.description)}` : ''}`
      window.open(url, '_blank')
    } catch { /* ignore */ }
  }

  const formattedStart = (() => {
    try { return format(parseISO(event.start_time), 'EEEE, d MMMM yyyy') } catch { return event.start_time }
  })()
  const formattedTime = (() => {
    try { return format(parseISO(event.start_time), 'HH:mm') } catch { return '' }
  })()
  const formattedEnd = event.end_time
    ? (() => { try { return format(parseISO(event.end_time), 'HH:mm') } catch { return '' } })()
    : null

  return (
    <div className="min-h-full bg-white pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-14 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
        >
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-bold text-gray-900 leading-tight truncate">{event.title}</h1>
        </div>
        <button
          onClick={addToCalendar}
          className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
          title="Add to calendar"
        >
          <Calendar className="h-4 w-4 text-gray-600" />
        </button>
      </div>

      {/* Meta card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-5 mb-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-2.5"
      >
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <p className="text-[13px] text-gray-700 font-medium">{formattedStart}</p>
        </div>
        {formattedTime && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <p className="text-[13px] text-gray-700">
              {formattedTime}{formattedEnd ? ` – ${formattedEnd}` : ''}
            </p>
          </div>
        )}
        {event.location && (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <p className="text-[13px] text-gray-700 truncate">{event.location}</p>
          </div>
        )}
        {event.event_type && (
          <span className="inline-flex items-center rounded-full bg-teal-50 border border-teal-100 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700 capitalize">
            {event.event_type}
          </span>
        )}
      </motion.div>

      {/* Description */}
      {event.description && (
        <div className="mx-5 mb-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-2">About</p>
          <p className="text-[13px] text-gray-700 leading-relaxed">{event.description}</p>
        </div>
      )}

      {/* RSVP */}
      <div className="mx-5">
        <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-3">Your response</p>
        {myRsvp && (
          <p className="text-[12px] text-teal-600 font-medium mb-2">
            You responded · tap to change
          </p>
        )}
        <div className="grid grid-cols-3 gap-2">
          {RSVP_OPTIONS.map(({ label, value, activeClass, inactiveClass }) => (
            <button
              key={value}
              onClick={() => rsvpMutation.mutate(value)}
              disabled={rsvpMutation.isPending}
              className={cn(
                'rounded-xl py-3 text-[12px] font-bold transition-all active:scale-95',
                myRsvp === value ? activeClass : inactiveClass,
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {rsvpMutation.isError && (
          <p className="text-[12px] text-red-500 text-center mt-2">Failed to save. Try again.</p>
        )}
      </div>

      {/* Attendees */}
      {attendees.length > 0 && (
        <div className="mx-5 mt-5">
          <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-3">
            Who's coming
          </p>
          <div className="flex gap-4 mb-3">
            <span className="text-[13px] text-gray-700">
              <span className="font-bold text-[#009688]">{goingCount}</span> going
            </span>
            {interestedCount > 0 && (
              <span className="text-[13px] text-gray-700">
                <span className="font-bold text-blue-500">{interestedCount}</span> interested
              </span>
            )}
          </div>
          <div className="space-y-2">
            {attendees.filter((a) => a.status !== 'not_going').map((a) => (
              <div key={a.user_id} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-[12px] font-bold text-gray-500 flex-shrink-0">
                  {(a.profile?.name ?? '?').charAt(0).toUpperCase()}
                </div>
                <span className="text-[13px] text-gray-700 flex-1">{a.profile?.name ?? 'Unknown'}</span>
                <span className={`text-[11px] font-semibold ${a.status === 'going' ? 'text-[#009688]' : 'text-blue-500'}`}>
                  {a.status === 'going' ? 'Going' : 'Interested'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
