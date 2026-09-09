import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { format, addDays, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'

// Chrome-less booking widget, designed to be embedded in a venue's own website
// via <iframe src=".../embed/venue/{anchorVenueId}">. It shows live availability
// and routes every booking into the full PPA flow (opened in a new tab) — so the
// venue's site becomes a funnel into Padel Players. No auth needed to view.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const MAX_DAYS = 21
const DURATIONS = [60, 90, 120]

interface Venue {
  venue_name: string
  city: string | null
  ppa_bookable: boolean | null
  booking_url: string | null
  booking_platform: string | null
}
interface Slot { start_time: string; end_time?: string }

export function EmbedVenueBookingPage() {
  const { venueId = '' } = useParams<{ venueId: string }>() // anchor = venues.id
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://v2.padelplayersapp.com'

  const [venue, setVenue] = useState<Venue | null>(null)
  const [loadingVenue, setLoadingVenue] = useState(true)
  const [date, setDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [duration, setDuration] = useState(60)
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotsError, setSlotsError] = useState('')

  const dates = useMemo(() => Array.from({ length: MAX_DAYS }, (_, i) => addDays(new Date(), i + 1)), [])

  useEffect(() => {
    if (!venueId) { setLoadingVenue(false); return }
    let cancelled = false
    supabase
      .from('padel_venues')
      .select('venue_name, city, ppa_bookable, booking_url, booking_platform')
      .eq('venues_id', venueId)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) { setVenue((data as Venue) ?? null); setLoadingVenue(false) } })
    return () => { cancelled = true }
  }, [venueId])

  useEffect(() => {
    if (!venueId || !venue?.ppa_bookable) { setSlots([]); return }
    let cancelled = false
    setLoadingSlots(true); setSlotsError('')
    fetch(`${SUPABASE_URL}/functions/v1/get-court-availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ venue_id: venueId, date, duration_minutes: duration }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('unavailable'))))
      .then((json) => {
        if (cancelled) return
        const raw = (json.slots ?? json.availableSlots ?? []) as Slot[]
        setSlots(raw.map((s) => ({ start_time: s.start_time, end_time: s.end_time })))
        setLoadingSlots(false)
      })
      .catch(() => { if (!cancelled) { setSlotsError('Could not load availability — please try another day.'); setLoadingSlots(false) } })
    return () => { cancelled = true }
  }, [venueId, venue?.ppa_bookable, date, duration])

  function fmtSlot(t: string): string {
    try { return t.includes('T') ? format(parseISO(t), 'HH:mm') : t.slice(0, 5) } catch { return t }
  }
  function bookUrl(t?: string): string {
    const base = `${appOrigin}/play/book-court?venue=${venueId}&date=${date}`
    return t ? `${base}&time=${encodeURIComponent(t)}` : base
  }

  if (loadingVenue) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="h-7 w-7 rounded-full border-2 border-court border-t-transparent animate-spin" />
      </div>
    )
  }
  if (!venue) {
    return <div className="min-h-screen flex items-center justify-center bg-white text-[14px] text-gray-400">Venue not found.</div>
  }

  const external = !venue.ppa_bookable

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <p className="text-[11px] font-bold uppercase tracking-wide text-court">Book a court</p>
        <h1 className="text-[18px] font-bold leading-tight truncate">{venue.venue_name}</h1>
        {venue.city && <p className="text-[12px] text-gray-400">{venue.city}</p>}
      </div>

      {external ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-[14px] text-gray-600 max-w-xs">Reserve a court at {venue.venue_name}.</p>
          <a
            href={venue.booking_url ?? bookUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 px-6 rounded-xl bg-court text-white text-[14px] font-bold flex items-center"
          >
            {venue.booking_url ? `Book at ${venue.booking_platform ?? 'venue'}` : 'Find a court'}
          </a>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Date strip */}
          <div className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar">
            {dates.map((d) => {
              const ds = format(d, 'yyyy-MM-dd')
              const active = ds === date
              return (
                <button
                  key={ds}
                  onClick={() => setDate(ds)}
                  className={`flex-shrink-0 flex flex-col items-center rounded-xl border px-3 py-2 min-w-[52px] transition-colors ${active ? 'border-court bg-court text-white' : 'border-gray-200 bg-white text-gray-700'}`}
                >
                  <span className="text-[10px] font-semibold uppercase opacity-80">{format(d, 'EEE')}</span>
                  <span className="text-[16px] font-bold leading-tight">{format(d, 'd')}</span>
                  <span className="text-[9px] opacity-70">{format(d, 'MMM')}</span>
                </button>
              )
            })}
          </div>

          {/* Duration */}
          <div className="flex gap-2 px-4 pb-2">
            {DURATIONS.map((dur) => (
              <button
                key={dur}
                onClick={() => setDuration(dur)}
                className={`flex-1 rounded-lg py-2 text-[12px] font-semibold border transition-colors ${duration === dur ? 'bg-court text-white border-court' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                {dur} min
              </button>
            ))}
          </div>

          {/* Slots */}
          <div className="px-4 py-3">
            {loadingSlots ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-6 w-6 rounded-full border-2 border-court border-t-transparent animate-spin" />
              </div>
            ) : slotsError ? (
              <p className="text-center text-[13px] text-red-500 py-8">{slotsError}</p>
            ) : slots.length === 0 ? (
              <p className="text-center text-[13px] text-gray-400 py-8">No availability for this day — try another date.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {slots.map((s, i) => (
                  <a
                    key={i}
                    href={bookUrl(s.start_time)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-gray-200 bg-white py-2.5 text-center text-[14px] font-semibold text-gray-800 hover:border-court hover:bg-court/[0.06] active:scale-95 transition-all"
                  >
                    {fmtSlot(s.start_time)}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <a
        href={appOrigin}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 py-2.5 border-t border-gray-100 text-[11px] font-medium text-gray-400 hover:text-gray-600"
      >
        Powered by <span className="font-bold text-court">Padel Players</span> 🎾
      </a>
    </div>
  )
}
