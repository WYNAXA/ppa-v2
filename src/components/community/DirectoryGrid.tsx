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
  /** Where tapping goes. Sections that live on this page scroll instead. */
  to?: string
  scrollTo?: React.RefObject<HTMLElement | null>
}

export interface DirectoryGridProps {
  counts: DirectoryCounts
  refs: {
    groups: React.RefObject<HTMLElement | null>
    players: React.RefObject<HTMLElement | null>
    coaches: React.RefObject<HTMLElement | null>
    venues: React.RefObject<HTMLElement | null>
    events: React.RefObject<HTMLElement | null>
  }
}

export function DirectoryGrid({ counts, refs }: DirectoryGridProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const tiles: Tile[] = [
    { key: 'groups',  icon: Users,          scrollTo: refs.groups },
    { key: 'players', icon: UserPlus,       scrollTo: refs.players },
    { key: 'coaches', icon: GraduationCap,  to: '/coaches' },
    // Courts is a whole tab — the tile is a shortcut to it, not a scroll.
    { key: 'venues',  icon: MapPin,         to: '/play/book-court' },
    { key: 'events',  icon: CalendarDays,   scrollTo: refs.events },
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
              onClick={() =>
                tile.to
                  ? navigate(tile.to)
                  : tile.scrollTo?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className={cn(
                'flex min-h-[86px] flex-col justify-between rounded-card border border-hairline bg-card p-3 text-left transition-colors active:bg-court-50',
                wide && 'col-span-2',
              )}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-control bg-court-50">
                <Icon className="h-4 w-4 text-court" strokeWidth={2.1} />
              </span>
              <span className="flex items-baseline gap-1.5">
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
