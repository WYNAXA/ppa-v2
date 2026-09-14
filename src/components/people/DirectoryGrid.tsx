import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Users, UserPlus, GraduationCap, MapPin, CalendarDays, Trophy } from 'lucide-react'

/**
 * The Community directory — six things you can go and find.
 *
 * WHY IT REPLACED THE CHIP ROW
 *   These were a row of emoji chips that scrolled a page. UAT: "the tags like
 *   groups, players, coaches, venues and events seem more important — they
 *   should be more prominent, and for search." They are the reason the tab
 *   exists, so they get real estate and a count each: a count is the difference
 *   between a label and a reason to tap.
 *
 *   Search sits above them because it is the fastest route into any of them,
 *   and it was previously buried on Today.
 *
 * WHY LEAGUES IS ONE OF THEM
 *   UAT, twice. First: *"its not easy to find the league im in or to start
 *   one"*. Then, after the first attempt: *"instead of putting it under
 *   community in the same buttons as Groups, Players, Coaches, venues and
 *   events you put it below in my leagues. so it means i still cant easily
 *   access or see them or create one."*
 *
 *   That first fix added a full-width "My leagues" row BELOW this grid, which
 *   is a second place to look rather than a fix: if the things you come here to
 *   find are laid out as tiles, another thing in a different shape underneath
 *   is still hidden. Leagues is one of the things you come here to find, so it
 *   is a tile.
 *
 * WHY THE COURT DRAWING WENT
 *   Venues used to span two columns to carry a plan-view court illustration,
 *   forcing a 3 + (2+1) layout. UAT: *"lose the court icon in venues and it
 *   will easily fit as 6, 3 on each row."* Right call — the illustration was
 *   decoration occupying a grid slot, and the slot is worth more than the
 *   picture.
 *
 *   Row 1 is people (groups, players, coaches). Row 2 is where and what you
 *   play (venues, leagues, events). Leagues sits beside Venues because that is
 *   where UAT asked for it: *"it should be leagues beside it"*.
 */

export type DirectoryCounts =
  Partial<Record<'groups' | 'players' | 'coaches' | 'venues' | 'leagues' | 'events', number>>

type Tile = {
  key: keyof DirectoryCounts
  icon: typeof Users
  to: string
  /** i18n key for the tile label. */
  labelKey: string
}

export interface DirectoryGridProps {
  counts: DirectoryCounts
  /** Current radius from the Discover tab, appended as ?r= to tile links. */
  radius?: number
}

export function DirectoryGrid({ counts, radius }: DirectoryGridProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const tiles: Tile[] = [
    { key: 'venues',  icon: MapPin,        to: '/discover/venues',  labelKey: 'discover.tile_clubs' },
    { key: 'players', icon: UserPlus,      to: '/discover/players', labelKey: 'discover.tile_players' },
    { key: 'coaches', icon: GraduationCap, to: '/coaches',          labelKey: 'discover.tile_coaching' },
    { key: 'groups',  icon: Users,         to: '/discover/groups',  labelKey: 'discover.tile_groups' },
    { key: 'leagues', icon: Trophy,        to: '/leagues',          labelKey: 'discover.tile_leagues' },
    { key: 'events',  icon: CalendarDays,  to: '/discover/events',  labelKey: 'discover.tile_events' },
  ]

  const fmt = new Intl.NumberFormat()

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => {
          const Icon = tile.icon
          const n = counts[tile.key]
          return (
            <button
              key={tile.key}
              onClick={() => navigate(radius ? `${tile.to}${tile.to.includes('?') ? '&' : '?'}r=${radius}` : tile.to)}
              className="flex min-h-[86px] flex-col justify-between overflow-hidden rounded-card border border-hairline bg-card p-3 text-left transition-colors active:bg-court-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-control bg-court-50">
                <Icon className="h-4 w-4 text-court" strokeWidth={2.1} />
              </span>
              <span className="flex items-baseline gap-1.5">
                {n != null && (
                  <span className={`num text-[17px] font-extrabold leading-5 ${n === 0 ? 'text-ink-4' : 'text-ink'}`}>{fmt.format(n)}</span>
                )}
                <span className="truncate text-[12px] font-semibold leading-4 text-ink-2">
                  {t(tile.labelKey)}
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
