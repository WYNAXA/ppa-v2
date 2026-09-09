import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Plus, Bell, Check, ChevronRight, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { CreateMatchSheet } from '@/components/play/CreateMatchSheet'

/**
 * "Get a game" — the destination of the centre nav action, built to
 * `Play.dc.html` from the design canvas.
 *
 * WHY IT IS A RANKED LIST AND NOT A GRID OF TILES
 *   The board's subtitle is the whole argument: *four ways in, start at the
 *   top*. Find my game is the one that does the work — it reads every player's
 *   diary, and the household calendar, and builds the match — so it gets a full
 *   court-green card and the ball accent. The other three are one-line rows in
 *   descending order of effort. A six-tile grid would have made all six look
 *   equally good, which is exactly the decision the player needs help with.
 *
 * /play still exists and still holds the feeds.
 */

/** Open matches inside the player's ELO band — the badge on row two. */
function useOpenMatchCount(userId: string, elo: number | null | undefined, enabled: boolean) {
  return useQuery<number>({
    queryKey: ['play-sheet-open-count', userId, elo],
    enabled: enabled && !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('matches')
        .select('id, player_ids, open_elo_min, open_elo_max')
        .eq('is_open', true)
        .gte('match_date', today)
        .limit(50)
      return (data ?? []).filter((m) => {
        if (((m.player_ids as string[]) ?? []).includes(userId)) return false
        if (elo == null) return true
        if (m.open_elo_min != null && elo < m.open_elo_min) return false
        if (m.open_elo_max != null && elo > m.open_elo_max) return false
        return true
      }).length
    },
  })
}

/** How many court waitlists the player is sitting on — the sheet's footer. */
function useWaitlistCount(userId: string, enabled: boolean) {
  return useQuery<number>({
    queryKey: ['play-sheet-waitlists', userId],
    enabled: enabled && !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from('slot_waitlist')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'waiting')
      return count ?? 0
    },
  })
}

export function PlaySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user, profile } = useAuth()
  const userId = user?.id ?? ''
  const [createOpen, setCreateOpen] = useState(false)

  const { data: openCount = 0 } = useOpenMatchCount(userId, profile?.internal_ranking, open)
  const { data: waitlists = 0 } = useWaitlistCount(userId, open)

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

  const rows = [
    {
      key: 'create',
      icon: <Plus className="h-[19px] w-[19px]" strokeWidth={2.2} />,
      title: t('play.create_match'),
      sub: t('play.sheet_create_sub'),
      badge: null as number | null,
      onSelect: () => { onClose(); setCreateOpen(true) },
    },
    {
      key: 'open',
      icon: (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18" /><path d="M12 3a9 9 0 0 0 0 18" />
        </svg>
      ),
      title: t('play.sheet_open_title'),
      sub: t('play.sheet_open_sub', { count: openCount }),
      badge: openCount > 0 ? openCount : null,
      onSelect: () => go('/open-matches'),
    },
    {
      key: 'book',
      icon: <Calendar className="h-[19px] w-[19px]" strokeWidth={2.2} />,
      title: t('play.sheet_book_title'),
      sub: t('play.sheet_book_sub'),
      badge: null,
      onSelect: () => go('/play/book-court'),
    },
  ]

  const sheet = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[55] bg-ink/[0.84]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('play.sheet_title')}
            className="fixed bottom-0 left-0 right-0 z-[60] max-h-[92vh] overflow-y-auto rounded-t-[26px] bg-surface"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
          >
            <div className="mx-auto flex w-full max-w-lg flex-col gap-[18px] px-5 pt-2.5">
              <div className="h-1 w-10 self-center rounded-pill bg-[#D7DDD9]" />

              <div className="flex flex-col gap-[3px]">
                <h2 className="text-[24px] font-extrabold leading-7 tracking-[-0.01em] text-ink">
                  {t('play.sheet_title')}
                </h2>
                <p className="text-[15px] leading-5 text-ink-2">{t('play.sheet_sub')}</p>
              </div>

              {/* ── Primary: Find my game ── */}
              <div className="flex flex-col gap-3.5 rounded-panel bg-court p-[18px]">
                <div className="flex items-start gap-[13px]">
                  <span className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-card bg-ball">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12h4l2.5-7 5 14L17 12h4" />
                    </svg>
                  </span>
                  <span className="flex flex-grow flex-col gap-[3px]">
                    <span className="text-[19px] font-bold leading-[23px] text-white">
                      {t('play.find_my_game')}
                    </span>
                    <span className="text-[13px] leading-[19px] text-court-100">
                      {t('play.sheet_find_sub')}
                    </span>
                  </span>
                </div>

                <div className="flex items-center gap-2 rounded-card bg-white/10 px-3 py-2.5">
                  <Check className="h-4 w-4 flex-shrink-0 text-ball" strokeWidth={2.4} />
                  <span className="text-[13px] font-medium leading-[17px] text-court-100">
                    {t('play.sheet_no_clashes')}
                  </span>
                </div>

                <button
                  onClick={() => go('/play/availability')}
                  className="min-h-[44px] rounded-card bg-white py-3.5 text-center text-[15px] font-bold leading-[18px] text-ink"
                >
                  {t('play.sheet_share_availability')}
                </button>
              </div>

              {/* ── Secondary, in descending order of effort ── */}
              <div className="flex flex-col gap-2">
                {rows.map((r) => (
                  <button
                    key={r.key}
                    onClick={r.onSelect}
                    className="flex items-center gap-[13px] rounded-[14px] border border-hairline bg-card p-3.5 text-left transition-transform active:scale-[0.99]"
                  >
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[11px] bg-court-50 text-court">
                      {r.icon}
                    </span>
                    <span className="flex min-w-0 flex-grow flex-col gap-px">
                      <span className="text-[15px] font-semibold leading-5 text-ink">{r.title}</span>
                      <span className="num truncate text-[13px] leading-[17px] text-ink-2">{r.sub}</span>
                    </span>
                    {r.badge != null ? (
                      <span className="num flex-shrink-0 rounded-pill bg-ball px-2 py-1 text-[11px] font-bold leading-[14px] text-ink">
                        {r.badge}
                      </span>
                    ) : (
                      <ChevronRight className="h-[18px] w-[18px] flex-shrink-0 text-ink-3" strokeWidth={2.4} />
                    )}
                  </button>
                ))}
              </div>

              {waitlists > 0 && (
                <button
                  onClick={() => go('/play/waitlist')}
                  className="flex min-h-[44px] items-center justify-center gap-[7px] pt-0.5"
                >
                  <Bell className="h-[15px] w-[15px] text-ink-2" strokeWidth={2.2} />
                  <span className="text-[13px] font-semibold leading-[17px] text-ink-2">
                    {t('play.sheet_on_waitlists', { count: waitlists })}
                  </span>
                </button>
              )}
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
