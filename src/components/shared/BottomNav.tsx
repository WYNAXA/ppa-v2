import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/**
 * Bottom navigation — built to `Main.dc.html` from the design canvas.
 *
 * Geometry, colours and icons come from the artboard rather than being
 * approximated: 64px bar, 20px radius, hairline border, and the 62px centre
 * action sitting 14px proud of the bar on an `ink` fill with a 4px `surface`
 * ring. The icon paths are the artboard's own — lucide's house, users and pin
 * are each a touch heavier and read as a different set.
 */

const ICON = {
  today: (
    <>
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </>
  ),
  community: (
    <>
      <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
      <circle cx="10" cy="8" r="3.5" />
      <path d="M19 20v-1.5a3.5 3.5 0 0 0-2.5-3.35" />
      <path d="M15 4.6a3.5 3.5 0 0 1 0 6.8" />
    </>
  ),
  courts: (
    <>
      <path d="M12 21s7-5.2 7-10.4A7 7 0 0 0 5 10.6C5 15.8 12 21 12 21z" />
      <circle cx="12" cy="10.4" r="2.6" />
    </>
  ),
  me: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
} as const

/**
 * The centre mark, as signed off on the canvas: two crossed rackets meeting at
 * the ball, in `ball` on `ink`.
 */
function PlayMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g transform="translate(12,12) scale(1.85) translate(-12,-9.4)">
        <g
          fill="none"
          stroke="var(--color-ball)"
          strokeWidth="0.62"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7.8 13.4C9.5 13.9 11.5 13.2 13.2 11.6C15.4 9.6 17.06 7.8 17.06 6.4C17.06 5.1 16 4.5 14.9 4.5C13.7 4.5 12.4 5.4 12 6.4" />
          <path d="M16.2 13.4C14.5 13.9 12.5 13.2 10.8 11.6C8.6 9.6 6.94 7.8 6.94 6.4C6.94 5.1 8 4.5 9.1 4.5C10.3 4.5 11.6 5.4 12 6.4" />
        </g>
        <circle cx="14.25" cy="9.05" r="1.34" fill="var(--color-ball)" />
      </g>
    </svg>
  )
}

type NavItem = {
  /** i18n key under `nav.` */
  key: keyof typeof ICON
  path: string
  /**
   * Every route that lights this tab.
   *
   * Leagues and Compete now hang off Community, which is where they are
   * actually reached from. They previously hung off `me` — a tab you could not
   * reach them from — because the redesign dropped Compete's tab and left
   * `/leagues` routed but unlinked. It was reachable only by deep link.
   */
  activePaths: string[]
}

/**
 * The left tab is `/people` on the router but reads as "Community": it holds
 * players, groups, events AND leagues, and "People" described only the first of
 * those. The ROUTE is deliberately unchanged — shared links to
 * `/people/groups/:id` are already out in the wild and renaming the path would
 * break them. Renaming the URL is a separate change that needs redirects.
 */
const LEFT: NavItem[] = [
  { key: 'today', path: '/home', activePaths: ['/home'] },
  {
    key: 'community',
    path: '/people',
    activePaths: ['/people', '/players', '/leagues', '/compete'],
  },
]

const RIGHT: NavItem[] = [
  { key: 'courts', path: '/play/book-court', activePaths: ['/play/book-court', '/play/waitlist', '/venues', '/coaches'] },
  { key: 'me',     path: '/you',             activePaths: ['/you'] },
]

function Tab({
  item, active, onSelect, label,
}: {
  item: NavItem
  active: boolean
  onSelect: () => void
  label: string
}) {
  return (
    <motion.button
      onClick={onSelect}
      whileTap={{ scale: 0.9 }}
      aria-current={active ? 'page' : undefined}
      className="flex h-full min-h-[44px] touch-manipulation flex-col items-center justify-center gap-1"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? 'var(--color-court)' : 'currentColor'}
        strokeWidth={active ? 2.3 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={active ? '' : 'text-ink-2'}
        aria-hidden="true"
      >
        {ICON[item.key]}
      </svg>
      {/* The board specifies ink-3 for inactive labels. At 11px that is 3.6:1 —
          under the AA floor — so inactive labels use ink-2. It is the one place
          this file departs from the artboard. */}
      <span
        className={cn(
          'text-[11px] leading-3',
          active ? 'font-bold text-court' : 'font-semibold text-ink-2',
        )}
      >
        {label}
      </span>
    </motion.button>
  )
}

export function BottomNav({ onPlayClick }: { onPlayClick: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()

  const isActive = (item: NavItem) =>
    item.activePaths.some(
      (p) => location.pathname === p || location.pathname.startsWith(p + '/')
    )

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 px-3"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.05 }}
        className="relative mx-auto w-full max-w-sm"
      >
        <div className="grid h-16 grid-cols-5 items-center rounded-[20px] border border-hairline bg-card shadow-[0_6px_24px_rgba(11,21,18,0.09)]">
          {LEFT.map((item) => (
            <Tab key={item.path} item={item} active={isActive(item)} label={t(`nav.${item.key}`)} onSelect={() => navigate(item.path)} />
          ))}
          <div aria-hidden="true" />
          {RIGHT.map((item) => (
            <Tab key={item.path} item={item} active={isActive(item)} label={t(`nav.${item.key}`)} onSelect={() => navigate(item.path)} />
          ))}
        </div>

        {/* Centre action. It opens a sheet — a verb, not a destination — which
            is why it sits proud of the bar and carries no label. */}
        <motion.button
          onClick={onPlayClick}
          whileTap={{ scale: 0.92 }}
          aria-label={t('nav.play')}
          aria-haspopup="dialog"
          className="absolute -top-3.5 left-1/2 flex h-[62px] w-[62px] -translate-x-1/2 items-center justify-center rounded-pill border-4 border-surface bg-ink shadow-[0_8px_22px_rgba(11,21,18,0.28)]"
        >
          <PlayMark />
        </motion.button>
      </motion.div>
    </div>
  )
}
