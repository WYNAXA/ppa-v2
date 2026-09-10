import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { format, addDays } from 'date-fns'
import { X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useDateLocale, getDateLocale } from '@/lib/dateLocale'
import { cn } from '@/lib/utils'

/**
 * "Put it out there" — I'm free, is anyone about?
 *
 * WHY THIS IS AN OPEN MATCH AND NOT A NEW KIND OF THING
 *   UAT: *"if one player is open to a match, they could put it out there and
 *   other connections might see it."*
 *
 *   A broadcast is an open match with a time window, one player and no court
 *   yet. `matches` already carries `window_start`, `window_end`,
 *   `duration_minutes`, `court_requirement`, `is_open` and the ELO band, so
 *   this needs no new table — and it inherits the join flow, the Open Matches
 *   page and the ELO filter for free. A parallel "availability broadcast"
 *   system beside the open-match system would have been two things to keep in
 *   step forever.
 *
 * WHY A WINDOW AND NOT A TIME
 *   Nobody is free at exactly 19:30. They are free after work until bedtime.
 *   Asking for a precise time forces a guess that the first replier then has to
 *   negotiate away. The window is the honest unit, and the match settles inside
 *   it once a second player is in.
 *
 * WHY THE CALENDAR IS NOT HERE
 *   A calendar gap says when you *could* play, never when you *want* to. This
 *   sheet is a button someone pressed today, which is the strongest signal of
 *   intent the app can get. See DESIGN.md.
 */

const WINDOWS = [
  { key: 'morning',   label: 'Morning',       start: '08:00', end: '12:00' },
  { key: 'afternoon', label: 'Afternoon',     start: '12:00', end: '17:00' },
  { key: 'evening',   label: 'Evening',       start: '17:00', end: '22:00' },
  { key: 'anytime',   label: 'Any time',      start: '08:00', end: '22:00' },
] as const

type WindowKey = typeof WINDOWS[number]['key']

/** How far out you can say you are free. Beyond a fortnight it is a plan, not an offer. */
const HORIZON_DAYS = 14

/**
 * The form lives in its own component so that it mounts when the sheet opens
 * and unmounts when it closes. That is what resets it — no effect reaching in
 * to clear four pieces of state on a boolean transition, which is both a lint
 * error and a real source of stale-render bugs.
 */
function BroadcastForm({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const locale = useDateLocale()
  const queryClient = useQueryClient()

  const [dayOffset, setDayOffset] = useState(0)
  const [windowKey, setWindowKey] = useState<WindowKey>('evening')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const days = useMemo(
    () =>
      Array.from({ length: HORIZON_DAYS }, (_, i) => {
        const d = addDays(new Date(), i)
        return {
          offset: i,
          date: format(d, 'yyyy-MM-dd', { locale: getDateLocale() }),
          weekday: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(d, 'EEE', { locale }),
          dayNum: format(d, 'd', { locale }),
        }
      }),
    [locale],
  )

  // Escape closes, and the page behind must not scroll while the sheet is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const chosen = days[dayOffset]
  const win = WINDOWS.find((w) => w.key === windowKey)!

  async function submit() {
    if (!user?.id || !chosen) return
    setSaving(true)
    const { data, error } = await supabase
      .from('matches')
      .insert({
        match_date: chosen.date,
        // NOT NULL on the table. The window is the real answer; this is where
        // the match lands if nobody narrows it.
        match_time: win.start,
        window_start: win.start,
        window_end: win.end,
        duration_minutes: 90,
        player_ids: [user.id],
        created_by: user.id,
        opened_by: user.id,
        opened_at: new Date().toISOString(),
        is_open: true,
        // Connections only. The audience is enforced by RLS, not by the query
        // that reads it — see 20260910000002_match_visibility_means_something.
        open_audience: 'connections',
        court_requirement: 'needed',
        match_type: 'casual',
        context_type: 'open',
        // 'open' means "an offer nobody has answered yet". It keeps the
        // broadcast off its own author's Today as a phantom fixture, and
        // claim_open_match promotes it to 'scheduled' the moment a second
        // player joins. See 20260910000003.
        status: 'open',
        notes: note.trim() || null,
      })
      .select('id')
      .single()
    setSaving(false)

    if (error || !data) {
      toast.error(error?.message ?? 'Could not put it out there. Try again.')
      return
    }
    queryClient.invalidateQueries({ queryKey: ['open-matches'] })
    queryClient.invalidateQueries({ queryKey: ['matches'] })
    queryClient.invalidateQueries({ queryKey: ['play-sheet-open-count'] })
    toast.success('Your connections can see it now')
    onClose()
    navigate(`/matches/${data.id}`)
  }

  return (
        <>
          <motion.div
            className="fixed inset-0 z-[55] bg-scrim"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Put it out there"
            className="fixed bottom-0 left-0 right-0 z-[60] max-h-[92vh] overflow-y-auto rounded-t-[26px] bg-surface"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose() }}
          >
            <div className="mx-auto flex w-full max-w-lg flex-col gap-[18px] px-5 pt-2.5">
              <div className="-mt-2.5 flex cursor-grab justify-center py-2.5 active:cursor-grabbing">
                <div className="h-1 w-10 rounded-pill bg-[#D7DDD9]" />
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-[3px]">
                  <h2 className="text-[24px] font-extrabold leading-7 tracking-[-0.01em] text-ink">
                    Put it out there
                  </h2>
                  <p className="text-[15px] leading-5 text-ink-2">
                    Say when you're free. Your connections see it.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-pill bg-hairline"
                >
                  <X className="h-4 w-4 text-ink-2" />
                </button>
              </div>

              {/* ── Which day ── */}
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
                  Which day
                </p>
                <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
                  {days.map((d) => {
                    const on = d.offset === dayOffset
                    return (
                      <button
                        key={d.date}
                        onClick={() => setDayOffset(d.offset)}
                        aria-pressed={on}
                        className={cn(
                          'flex min-h-[62px] w-[62px] flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-card border transition-colors',
                          on ? 'border-court bg-court text-white' : 'border-hairline bg-card text-ink',
                        )}
                      >
                        <span className={cn('text-[11px] font-semibold leading-[14px]', on ? 'text-court-100' : 'text-ink-2')}>
                          {d.weekday}
                        </span>
                        <span className="num text-[17px] font-bold leading-[21px]">{d.dayNum}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ── Which window ── */}
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2">
                  When, roughly
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {WINDOWS.map((w) => {
                    const on = w.key === windowKey
                    return (
                      <button
                        key={w.key}
                        onClick={() => setWindowKey(w.key)}
                        aria-pressed={on}
                        className={cn(
                          'flex min-h-[56px] flex-col items-start justify-center gap-0.5 rounded-card border px-3.5 transition-colors',
                          on ? 'border-court bg-court-50' : 'border-hairline bg-card',
                        )}
                      >
                        <span className={cn('text-[14px] font-bold leading-[18px]', on ? 'text-court-700' : 'text-ink')}>
                          {w.label}
                        </span>
                        <span className="num text-[12px] leading-[15px] text-ink-2">
                          {w.start.slice(0, 5)}–{w.end.slice(0, 5)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ── Optional note ── */}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="put-it-out-there-note"
                  className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-2"
                >
                  Anything to add
                </label>
                <input
                  id="put-it-out-there-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 120))}
                  placeholder="Happy to drive · anywhere south Bristol"
                  className="min-h-[48px] rounded-card border border-hairline bg-card px-3.5 text-[15px] text-ink placeholder:text-ink-3 focus:border-court focus:outline-none"
                />
              </div>

              <button
                onClick={submit}
                disabled={saving}
                className="flex min-h-[52px] items-center justify-center gap-2 rounded-card bg-court text-[16px] font-bold leading-5 text-white transition-transform active:scale-[0.99] disabled:opacity-50"
              >
                {saving ? 'Putting it out…' : (
                  <>
                    <Check className="h-[18px] w-[18px]" strokeWidth={2.4} />
                    {chosen?.weekday} {win.label.toLowerCase()} — put it out there
                  </>
                )}
              </button>

              <p className="pb-1 text-center text-[12px] leading-[16px] text-ink-3">
                Only players you're connected to can see this. It stops showing
                once the day has passed.
              </p>
            </div>
          </motion.div>
        </>
  )
}

export function PutItOutThereSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return createPortal(
    <AnimatePresence>{open && <BroadcastForm onClose={onClose} />}</AnimatePresence>,
    document.body,
  )
}

export default PutItOutThereSheet
