import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Plus, Zap, MapPin, Search, Trophy, GraduationCap, Bell, ClipboardCheck, ArrowRight,
} from 'lucide-react'
import { CreateMatchSheet } from '@/components/play/CreateMatchSheet'

/**
 * The destination of the centre nav action.
 *
 * WHY A SHEET AND NOT A TAB
 *   Every one of these is a *verb*. The old /play tab mixed six verbs with two
 *   feeds (What's on, the week view) and made the player choose a place before
 *   choosing an action. A sheet costs one tap from anywhere in the app instead
 *   of a tab slot, which is what freed the slot for Courts — the booking engine,
 *   which is the part that earns money.
 *
 *   /play still exists and still holds the feeds; `sheet_all` links to it.
 */

type Action = {
  key: string
  icon: typeof Plus
  /** i18n key under `play.` */
  labelKey: string
  onSelect: (go: (path: string) => void, openCreate: () => void) => void
}

const PRIMARY: Action = {
  key: 'create',
  icon: Plus,
  labelKey: 'create_match',
  onSelect: (_go, openCreate) => openCreate(),
}

const ACTIONS: Action[] = [
  { key: 'find',    icon: Zap,            labelKey: 'find_my_game',  onSelect: (go) => go('/play/availability') },
  { key: 'book',    icon: MapPin,         labelKey: 'book_court',    onSelect: (go) => go('/play/book-court') },
  { key: 'join',    icon: Search,         labelKey: 'join_match',    onSelect: (go) => go('/open-matches') },
  { key: 'result',  icon: ClipboardCheck, labelKey: 'record_result', onSelect: (go) => go('/play') },
  { key: 'leagues', icon: Trophy,         labelKey: 'leagues',       onSelect: (go) => go('/leagues') },
  { key: 'coach',   icon: GraduationCap,  labelKey: 'find_coach',    onSelect: (go) => go('/coaches') },
]

export function PlaySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)

  // Escape closes, and the page behind must not scroll while the sheet is up.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const go = (path: string) => { onClose(); navigate(path) }
  const openCreate = () => { onClose(); setCreateOpen(true) }

  const sheet = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[55] bg-ink/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.play')}
            className="fixed bottom-0 left-0 right-0 z-[60] rounded-t-[26px] bg-card"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
          >
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-1 w-10 rounded-pill bg-hairline" />
            </div>

            <div className="mx-auto w-full max-w-lg px-5 pb-2 pt-2">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">
                {t('nav.play')}
              </p>

              {/* Primary. One ball-yellow element per surface — this is it. */}
              <button
                onClick={() => PRIMARY.onSelect(go, openCreate)}
                className="flex w-full items-center justify-between rounded-panel bg-court px-5 py-4 text-left transition-colors active:bg-court-700"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-ball">
                    <Plus className="h-5 w-5 text-court" strokeWidth={2.6} />
                  </span>
                  <span className="text-[17px] font-extrabold text-white">
                    {t(`play.${PRIMARY.labelKey}`)}
                  </span>
                </span>
                <ArrowRight className="h-5 w-5 text-white/70" />
              </button>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {ACTIONS.map((a) => {
                  const Icon = a.icon
                  return (
                    <button
                      key={a.key}
                      onClick={() => a.onSelect(go, openCreate)}
                      className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-card border border-hairline bg-card px-2 py-3 transition-colors hover:bg-court-50 active:bg-court-50"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-control bg-court-50">
                        <Icon className="h-[18px] w-[18px] text-court" strokeWidth={2} />
                      </span>
                      <span className="text-center text-[11px] font-semibold leading-tight text-ink-2">
                        {t(`play.${a.labelKey}`)}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <button
                  onClick={() => go('/play/waitlist')}
                  className="flex min-h-[44px] items-center gap-1.5 text-[13px] font-semibold text-ink-2 transition-colors hover:text-court"
                >
                  <Bell className="h-4 w-4" />
                  {t('play.my_waitlist')}
                </button>
                <button
                  onClick={() => go('/play')}
                  className="flex min-h-[44px] items-center gap-1 text-[13px] font-semibold text-court"
                >
                  {t('play.sheet_all')}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return (
    <>
      {createPortal(sheet, document.body)}
      <CreateMatchSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  )
}

export default PlaySheet
