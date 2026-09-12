import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, User, Users, MapPin, Calendar, Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { EmptyState } from '@/components/shared/EmptyState'
import { cn } from '@/lib/utils'
import { goBack } from '@/lib/navigation'

interface SearchResult {
  id: string
  label: string
  sublabel?: string
  type: 'player' | 'group' | 'venue' | 'match' | 'league'
  avatarUrl?: string | null
  avatarName?: string
}

function useDebounce<T>(value: T, delay: number) {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return dv
}

const TYPE_META: Record<SearchResult['type'], {
  icon: React.ReactNode
  color: string
  label: string
  navFn: (id: string) => string
}> = {
  player: {
    icon:  <User className="h-4 w-4" />,
    color: 'bg-court-50 text-court',
    label: 'Players',
    navFn: (id) => `/players/${id}`,
  },
  group: {
    icon:  <Users className="h-4 w-4" />,
    color: 'bg-surface text-ink-2',
    label: 'Groups',
    navFn: (id) => `/people/groups/${id}`,
  },
  venue: {
    icon:  <MapPin className="h-4 w-4" />,
    color: 'bg-warn-50 text-warn',
    label: 'Venues',
    navFn: (id) => `/venues/${id}`,
  },
  match: {
    icon:  <Calendar className="h-4 w-4" />,
    color: 'bg-hairline text-ink-2',
    label: 'Matches',
    navFn: (id) => `/matches/${id}`,
  },
  league: {
    icon:  <Trophy className="h-4 w-4" />,
    color: 'bg-warn-50 text-warn',
    label: 'Leagues',
    navFn: (id) => `/compete/leagues/${id}`,
  },
}

async function runSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  /**
   * PostgREST parses `or=(...)` as a comma-separated list, so a comma, paren or
   * dot in the user's text would split the filter into garbage clauses. Strip
   * them before interpolating. `%` and `_` are ilike wildcards — harmless here
   * (a user typing `%` gets a broader match, not an error) but we drop them so
   * search stays predictable.
   */
  const safe = q.replace(/[,().%_\\]/g, ' ').replace(/\s+/g, ' ').trim()
  if (safe.length < 2) return []

  const [players, groups, venues, matches, leagues] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name, avatar_url, city')
      .ilike('name', `%${q}%`)
      .limit(4),
    supabase
      .from('groups')
      .select('id, name, city')
      .ilike('name', `%${q}%`)
      .limit(4),
    /**
     * Venues were matched on `venue_name` only, so "BS1" returned nothing and
     * "Bristol" found 10 of the 19 venues in the Bristol area — the ones lucky
     * enough to carry the city in their name. Match the place fields too.
     *
     * Postcode lives in BOTH `postcode` and `postal_code` and the two disagree
     * on a lot of rows; until that is consolidated we have to search both or we
     * miss roughly half the UK estate.
     */
    supabase
      .from('discoverable_venues')
      .select('venue_id, venue_name, city, postcode, postal_code')
      .eq('status', 'active')
      // Venue results are places. Coaches have their own section and their own
      // page; a coach in the venue list is the bug UAT reported.
      .eq('venue_type', 'club')
      .or(
        [
          `venue_name.ilike.%${safe}%`,
          `city.ilike.%${safe}%`,
          `postcode.ilike.${safe}%`,
          `postal_code.ilike.${safe}%`,
          `full_address.ilike.%${safe}%`,
        ].join(','),
      )
      .limit(6),
    supabase
      .from('matches')
      .select('id, match_date, booked_venue_name, match_type')
      .or(`match_date.ilike.%${q}%,booked_venue_name.ilike.%${q}%`)
      .limit(4),
    /**
     * `leagues.season` does not exist — the columns are `season_start` and
     * `season_end`. PostgREST rejected the whole select with a 400, the error
     * was swallowed by `leagues.data ?? []`, and leagues silently never
     * appeared in search results at all.
     */
    supabase
      .from('leagues')
      .select('id, name, city, status, season_start, season_end')
      .ilike('name', `%${safe}%`)
      .limit(4),
  ])

  // Surface what the swallowed `?? []` used to hide.
  for (const [label, res] of Object.entries({ players, groups, venues, matches, leagues })) {
    if (res.error) console.error(`[search] ${label} query failed:`, res.error)
  }

  const results: SearchResult[] = []

  for (const p of players.data ?? []) {
    results.push({ id: p.id, label: p.name, sublabel: p.city ?? 'Player', type: 'player', avatarUrl: p.avatar_url, avatarName: p.name })
  }
  for (const g of groups.data ?? []) {
    results.push({ id: g.id, label: g.name, sublabel: g.city ?? 'Group', type: 'group' })
  }
  for (const v of venues.data ?? []) {
    /**
     * discoverable_venues is a VIEW, and Postgres does not propagate NOT NULL
     * through a view — so every column, venue_id included, is typed nullable
     * even though the base table's primary key never is. Skip the impossible
     * row rather than asserting it away with `!`: a result with no id would
     * navigate to /venues/null.
     */
    if (!v.venue_id) continue
    // Show where it is, so a postcode search explains why the row matched.
    const place = [v.city, v.postcode ?? v.postal_code].filter(Boolean).join(' · ')
    results.push({
      id: v.venue_id,
      label: v.venue_name ?? 'Unnamed venue',
      sublabel: place || 'Venue',
      type: 'venue',
    })
  }
  for (const m of matches.data ?? []) {
    results.push({
      id:       m.id,
      label:    m.match_date,
      sublabel: m.booked_venue_name ?? m.match_type ?? 'Match',
      type:     'match',
    })
  }
  for (const l of leagues.data ?? []) {
    const year = l.season_start ? new Date(l.season_start).getFullYear() : null
    const sub = [l.city, year ? `${year} season` : null, l.status === 'active' ? null : l.status]
      .filter(Boolean)
      .join(' · ')
    results.push({ id: l.id, label: l.name, sublabel: sub || 'League', type: 'league' })
  }

  return results
}

function groupBy(items: SearchResult[]): Record<SearchResult['type'], SearchResult[]> {
  const out: Record<SearchResult['type'], SearchResult[]> = {
    player: [], group: [], venue: [], match: [], league: [],
  }
  for (const item of items) {
    out[item.type].push(item)
  }
  return out
}

export function SearchPage() {
  const navigate   = useNavigate()
  const inputRef   = useRef<HTMLInputElement>(null)
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (debouncedQuery.length < 2) { setResults([]); return }
    setSearching(true)
    runSearch(debouncedQuery).then((r) => {
      setResults(r)
      setSearching(false)
    })
  }, [debouncedQuery])

  const grouped = groupBy(results)
  const orderedTypes: SearchResult['type'][] = ['player', 'group', 'venue', 'league', 'match']
  const hasResults = results.length > 0

  function handleTap(item: SearchResult) {
    const navFn = TYPE_META[item.type].navFn
    navigate(navFn(item.id))
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-card flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Search bar */}
      <div className="flex items-center gap-3 px-5 pt-14 pb-3 border-b border-hairline">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-2" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players, groups, venues…"
            className="w-full rounded-xl border border-hairline pl-9 pr-9 py-2.5 text-sm outline-none focus:border-court focus:ring-2 focus:ring-court/20"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]) }}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-ink-2" />
            </button>
          )}
        </div>
        <button
          onClick={() => goBack(navigate, '/home')}
          className="text-[13px] font-semibold text-court"
        >
          Cancel
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {searching && (
          <div className="flex justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-court border-t-transparent" />
          </div>
        )}

        {!searching && query.length >= 2 && !hasResults && (
          <EmptyState
            icon={<Search className="h-8 w-8" />}
            title={`No results for "${query}"`}
            subtitle="Try a different name or keyword"
          />
        )}

        {!searching && query.length < 2 && (
          <div className="py-16 text-center px-8">
            <p className="text-[14px] text-ink-2">Search players, groups, venues, leagues, and matches</p>
          </div>
        )}

        <AnimatePresence>
          {hasResults && !searching && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-5 py-3 space-y-5"
            >
              {orderedTypes.map((type) => {
                const items = grouped[type]
                if (!items.length) return null
                const meta = TYPE_META[type]
                return (
                  <div key={type}>
                    <p className="text-[11px] font-bold text-ink-2 uppercase tracking-wide mb-2">{meta.label}</p>
                    <div className="space-y-1">
                      {items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleTap(item)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface transition-colors text-left"
                        >
                          {item.avatarName ? (
                            <PlayerAvatar name={item.avatarName} avatarUrl={item.avatarUrl} size="sm" />
                          ) : (
                            <div className={cn('h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0', meta.color)}>
                              {meta.icon}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-ink truncate">{item.label}</p>
                            {item.sublabel && (
                              <p className="text-[11px] text-ink-2 truncate">{item.sublabel}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
