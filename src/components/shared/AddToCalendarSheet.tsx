import { motion, AnimatePresence } from 'framer-motion'
import { X, Calendar, Download } from 'lucide-react'

export interface CalendarEvent {
  title: string
  start: Date
  end: Date
  location: string
}

interface AddToCalendarSheetProps {
  open: boolean
  onClose: () => void
  event: CalendarEvent
}

function formatISOCompact(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function downloadIcs(event: CalendarEvent) {
  const startStr = formatISOCompact(event.start)
  const endStr   = formatISOCompact(event.end)
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PPA//PadelPlayersApp//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:${event.title}`,
    `LOCATION:${event.location}`,
    `UID:${Date.now()}@ppa`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'padel-match.ics'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function AddToCalendarSheet({ open, onClose, event }: AddToCalendarSheetProps) {
  const startISO = formatISOCompact(event.start)
  const endISO   = formatISOCompact(event.end)

  const googleUrl  = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${startISO}/${endISO}&location=${encodeURIComponent(event.location)}`
  const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(event.title)}&startdt=${event.start.toISOString()}&enddt=${event.end.toISOString()}&location=${encodeURIComponent(event.location)}`

  const options = [
    {
      label:       'Google Calendar',
      description: 'Opens in a new tab',
      icon:        <Calendar className="h-4 w-4 text-blue-600" />,
      bg:          'bg-blue-50',
      action:      () => { window.open(googleUrl, '_blank'); onClose() },
    },
    {
      label:       'Apple Calendar',
      description: 'Downloads .ics file',
      icon:        <Download className="h-4 w-4 text-gray-600" />,
      bg:          'bg-gray-100',
      action:      () => { downloadIcs(event); onClose() },
    },
    {
      label:       'Outlook',
      description: 'Opens in a new tab',
      icon:        <Calendar className="h-4 w-4 text-blue-800" />,
      bg:          'bg-blue-50',
      action:      () => { window.open(outlookUrl, '_blank'); onClose() },
    },
  ]

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[55] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="h-4 w-4 text-gray-600" />
              </button>
              <h2 className="text-[15px] font-bold text-gray-900">Add to Calendar</h2>
              <div className="w-9" />
            </div>

            <div className="px-5 pb-4">
              <div className="mb-4 rounded-2xl bg-gray-50 border border-gray-100 p-3">
                <p className="text-[12px] font-semibold text-gray-700 truncate">{event.title}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {event.start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                  {' · '}
                  {event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
                {event.location && (
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">{event.location}</p>
                )}
              </div>

              <div className="space-y-2">
                {options.map(({ label, description, icon, bg, action }) => (
                  <button
                    key={label}
                    onClick={action}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <div className={`h-9 w-9 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                      {icon}
                    </div>
                    <div className="text-left">
                      <p className="text-[13px] font-semibold text-gray-800">{label}</p>
                      <p className="text-[11px] text-gray-400">{description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
