import { useNavigate, useLocation } from 'react-router-dom'
import { Home, Users, MapPin, User } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/**
 * The centre action mark — a padel racket meeting the ball. Drawn rather than
 * iconified because this is the one piece of chrome that is unmistakably ours:
 * a generic "+" here would make the app indistinguishable from every other
 * booking app in the store.
 *
 * WHY A SINGLE RACKET AND NOT THE CROSSED PAIR
 *   The crossed-racket mark chosen on the design canvas was judged at ~150px.
 *   Rendered at its real size — 32px inside a 62px button — the two heads fuse
 *   into a heart silhouette, which in an app reads as "favourite", i.e. the
 *   opposite of a primary action. One racket with the ball off its face keeps
 *   the head, the throat and the handle all legible at 32px. Screenshots of
 *   both at true size are in the redesign notes.
 */
function PlayMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g
        fill="none"
        stroke="var(--color-ball)"
        strokeWidth="1.95"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <ellipse cx="10" cy="9.8" rx="4.9" ry="5.9" transform="rotate(-22 10 9.8)" />
        <path d="M12.5 15 15.1 20.6" />
      </g>
      <circle cx="18" cy="6.6" r="2.5" fill="var(--color-ball)" />
    </svg>
  )
}

const ACTIVE = 'var(--color-court)'
const ACTIVE_BG = 'color-mix(in srgb, var(--color-court) 9%, transparent)'

type NavItem = {
  icon: typeof Home
  /** i18n key under `nav.` */
  key: string
  path: string
  /**
   * Every route that should light this tab. Compete and Leagues hang off `you`
   * because Compete lost its own tab in the redesign but is still a live route
   * reached from the Play sheet, from Today, and from league deep links — a tab
   * bar with nothing lit is worse than an approximate match.
   */
  activePaths: string[]
}

/**
 * Labels come from the pages themselves. The canvas called these "Players" and
 * "Me"; the pages are titled Community and You, in eight languages. A tab bar
 * that names a screen differently from the screen makes the app feel like two
 * products stitched together, so the pages win.
 */
const LEFT: NavItem[] = [
  { icon: Home,  key: 'today',     path: '/home',      activePaths: ['/home'] },
  { icon: Users, key: 'community', path: '/community', activePaths: ['/community', '/players'] },
]

const RIGHT: NavItem[] = [
  { icon: MapPin, key: 'courts', path: '/play/book-court', activePaths: ['/play/book-court', '/play/waitlist', '/venues', '/coaches'] },
  { icon: User,   key: 'you',    path: '/you',             activePaths: ['/you', '/compete', '/leagues'] },
]

export function BottomNav({ onPlayClick }: { onPlayClick: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()

  const isActive = (item: NavItem) =>
    item.activePaths.some(
      (p) => location.pathname === p || location.pathname.startsWith(p + '/')
    )

  const Tab = ({ item }: { item: NavItem }) => {
    const Icon = item.icon
    const active = isActive(item)
    return (
      <motion.button
        onClick={() => navigate(item.path)}
        whileTap={{ scale: 0.88 }}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-control px-1 py-2 transition-colors touch-manipulation',
          active ? '' : 'text-ink-2 hover:bg-court-50 hover:text-ink'
        )}
        style={active ? { backgroundColor: ACTIVE_BG } : undefined}
      >
        <Icon
          className="h-5 w-5"
          style={{ color: active ? ACTIVE : undefined }}
          strokeWidth={active ? 2.5 : 1.8}
        />
        <span
          className="text-[11px] font-medium leading-none"
          style={{ color: active ? ACTIVE : undefined }}
        >
          {t(`nav.${item.key}`)}
        </span>
      </motion.button>
    )
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
    >
      <motion.nav
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.05 }}
        className="w-full max-w-sm rounded-panel border border-hairline bg-card/95 px-2 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.10)] backdrop-blur-xl"
      >
        <div className="grid grid-cols-5 items-end gap-1">
          {LEFT.map((item) => (
            <Tab key={item.path} item={item} />
          ))}

          {/* Centre action. Raised out of the bar so it reads as "do a thing"
              rather than "go to a place" — it opens a sheet, it is not a tab. */}
          <div className="flex justify-center">
            <motion.button
              onClick={onPlayClick}
              whileTap={{ scale: 0.9 }}
              aria-label={t('nav.play')}
              aria-haspopup="dialog"
              className="-mt-7 flex h-[62px] w-[62px] items-center justify-center rounded-pill bg-court shadow-[0_6px_18px_rgba(15,93,84,0.38)] ring-4 ring-card transition-colors active:bg-court-700"
            >
              <PlayMark />
            </motion.button>
          </div>

          {RIGHT.map((item) => (
            <Tab key={item.path} item={item} />
          ))}
        </div>
      </motion.nav>
    </div>
  )
}
