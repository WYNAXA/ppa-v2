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

/** Detect iOS standalone mode (home-screen PWA / wrapped app). */
function isIOSStandalone(): boolean {
  return (
    ('standalone' in navigator && (navigator as any).standalone === true) ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

/** Navigate to a URL via a real anchor click — iOS standalone honours this
 *  where it swallows window.open(). */
function openUrl(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/** Build the .ics content string for an event. */
function buildIcs(event: CalendarEvent): string {
  const startStr = formatISOCompact(event.start)
  const endStr   = formatISOCompact(event.end)
  return [
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
}

/** Download/open an .ics file. On iOS standalone the anchor-download attribute
 *  is ignored, so we open a data URI instead — iOS hands it to the Calendar app. */
function downloadIcs(event: CalendarEvent) {
  const ics = buildIcs(event)

  if (isIOSStandalone()) {
    // data URI approach: iOS recognises text/calendar and offers "Add to Calendar"
    const encoded = encodeURIComponent(ics)
    openUrl(`data:text/calendar;charset=utf-8,${encoded}`)
    return
  }

  // Normal browser: blob download
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

  const iosStandalone = isIOSStandalone()

  // On iOS standalone, all three options use .ics — iOS handles it natively and
  // offers to add to whichever calendar the user has configured (Apple, Google, etc.).
  // On a normal browser, Google/Outlook open their web UIs directly.
  const options = [
    {
      label:       'Google Calendar',
      description: iosStandalone ? 'Adds via device calendar' : 'Opens in a new tab',
      icon:        <Calendar className="h-4 w-4 text-blue-600" />,
      bg:          'bg-blue-50',
      action:      () => { iosStandalone ? downloadIcs(event) : openUrl(googleUrl); onClose() },
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
      description: iosStandalone ? 'Adds via device calendar' : 'Opens in a new tab',
      icon:        <Calendar className="h-4 w-4 text-blue-800" />,
      bg:          'bg-blue-50',
      action:      () => { iosStandalone ? downloadIcs(event) : openUrl(outlookUrl); onClose() },
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
