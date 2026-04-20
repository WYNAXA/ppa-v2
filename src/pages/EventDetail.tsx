import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, MapPin, Clock, Calendar } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'

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

export function EventDetailPage() {
  const { id = '' }  = useParams<{ id: string }>()
  const navigate      = useNavigate()

  const { data: event, isLoading } = useEvent(id)

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
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Going',        color: 'bg-[#009688] text-white' },
            { label: 'Interested',   color: 'bg-blue-50 text-blue-600 border border-blue-100' },
            { label: "Can't make it", color: 'bg-gray-100 text-gray-600' },
          ].map(({ label, color }) => (
            <button
              key={label}
              className={`rounded-xl py-3 text-[12px] font-bold transition-all active:scale-95 ${color}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
