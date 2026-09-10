import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Users, UserPlus, GraduationCap, MapPin, CalendarDays, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The Community directory — five things you can go and find.
 *
 * WHY IT REPLACED THE CHIP ROW
 *   These five were a row of emoji chips that scrolled a page. UAT: "the tags
 *   like groups, players, coaches, venues and events seem more important — they
 *   should be more prominent, and for search." They are the reason the tab
 *   exists, so they get real estate and a count each: a count is the difference
 *   between a label and a reason to tap.
 *
 *   Search sits above them because it is the fastest route into any of the
 *   five, and it was previously buried on Today.
 */

export type DirectoryCounts = Partial<Record<'groups' | 'players' | 'coaches' | 'venues' | 'events', number>>

type Tile = {
  key: keyof DirectoryCounts
  icon: typeof Users
  /** Where tapping goes. Every tile navigates — three of them used to scroll
      to a section further down Community instead, so the same control did two
      different things with nothing to tell them apart. */
  to: string
}

export interface DirectoryGridProps {
  counts: DirectoryCounts
}

/**
 * A padel court, in plan, to scale (20m x 10m).
 *
 * WHY PLAN AND NOT PERSPECTIVE
 *   A perspective court cropped by a card edge is a handful of diagonal lines —
 *   at 100px nobody reads it as a court. Plan view carries the two features
 *   that identify padel specifically: the enclosed box, and the net across the
 *   middle with service boxes either side. Drawn complete rather than cropped,
 *   because a whole small object reads and a fragment of a large one does not.
 *
 *   Service lines sit 3m from each back wall, which is where they actually are.
 */
function CourtPlan({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 100"
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Playing surface */}
      <rect x="2" y="2" width="196" height="96" rx="4" fill="var(--color-court-50)" />

      <g stroke="var(--color-court)" strokeLinecap="round">
        {/* Enclosure */}
        <rect x="2" y="2" width="196" height="96" rx="4" strokeWidth="3" opacity="0.55" />
        {/* Service lines, 3m in from each back wall */}
        <path d="M32 2V98M168 2v96" strokeWidth="2" opacity="0.4" />
        {/* Centre service line, between service line and net only */}
        <path d="M32 50h68M100 50h68" strokeWidth="2" opacity="0.4" />
        {/* Net */}
        <path d="M100 2v96" strokeWidth="3.5" opacity="0.8" />
      </g>

      {/* Net posts, so the heavy line reads as a net and not a fold */}
      <circle cx="100" cy="2" r="4" fill="var(--color-court)" opacity="0.8" />
      <circle cx="100" cy="98" r="4" fill="var(--color-court)" opacity="0.8" />

      {/* Ball in play */}
      <circle cx="140" cy="32" r="6" fill="var(--color-ball)" stroke="var(--color-court)" strokeWidth="1.5" />
    </svg>
  )
}

export function DirectoryGrid({ counts }: DirectoryGridProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const tiles: Tile[] = [
    // Every tile navigates. Three of them used to scroll to a section further
    // down Community instead, so the same control did two different things with
    // nothing to tell them apart. Groups and Players already had fuller pages
    // than their inline sections; Events needed one built.
    { key: 'groups',  icon: Users,          to: '/community/groups' },
    { key: 'players', icon: UserPlus,       to: '/community/players' },
    { key: 'coaches', icon: GraduationCap,  to: '/coaches' },
    // Courts is a whole tab — the tile is a shortcut to it, not a scroll.
    { key: 'venues',  icon: MapPin,         to: '/play/book-court' },
    { key: 'events',  icon: CalendarDays,   to: '/community/events' },
  ]

  const fmt = new Intl.NumberFormat()

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => navigate('/search')}
        className="flex h-12 w-full items-center gap-2.5 rounded-control border border-hairline bg-card px-4 text-left transition-transform active:scale-[0.99]"
      >
        <Search className="h-4 w-4 flex-shrink-0 text-ink-2" strokeWidth={2} />
        <span className="truncate text-[13px] text-ink-2">{t('community.search_all')}</span>
      </button>

      <div className="grid grid-cols-3 gap-2">
        {tiles.map((tile, i) => {
          const Icon = tile.icon
          const n = counts[tile.key]
          // Courts spans two columns on the second row: 6,099 venues is the
          // biggest number on the page and the tab that earns money.
          const wide = i === 3
          return (
            <button
              key={tile.key}
              onClick={() => navigate(tile.to)}
              className={cn(
                'relative flex min-h-[86px] flex-col justify-between overflow-hidden rounded-card border border-hairline bg-card p-3 text-left transition-colors active:bg-court-50',
                wide && 'col-span-2',
              )}
            >
              {wide && <CourtPlan className="pointer-events-none absolute right-3 top-1/2 h-[54px] w-[108px] -translate-y-1/2" />}

              <span className="relative flex h-8 w-8 items-center justify-center rounded-control bg-court-50">
                <Icon className="h-4 w-4 text-court" strokeWidth={2.1} />
              </span>
              <span className="relative flex items-baseline gap-1.5">
                {n != null && (
                  <span className="num text-[17px] font-extrabold leading-5 text-ink">{fmt.format(n)}</span>
                )}
                <span className="truncate text-[12px] font-semibold leading-4 text-ink-2">
                  {t(`community.nav_${tile.key}`)}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default DirectoryGrid
