import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, User, Users, MapPin, Calendar, Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'

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
    color: 'bg-teal-50 text-[#009688]',
    label: 'Players',
    navFn: () => '/you',
  },
  group: {
    icon:  <Users className="h-4 w-4" />,
    color: 'bg-blue-50 text-blue-600',
    label: 'Groups',
    navFn: (id) => `/community/groups/${id}`,
  },
  venue: {
    icon:  <MapPin className="h-4 w-4" />,
    color: 'bg-orange-50 text-orange-500',
    label: 'Venues',
    navFn: () => '/play',
  },
  match: {
    icon:  <Calendar className="h-4 w-4" />,
    color: 'bg-gray-100 text-gray-500',
    label: 'Matches',
    navFn: (id) => `/matches/${id}`,
  },
  league: {
    icon:  <Trophy className="h-4 w-4" />,
    color: 'bg-amber-50 text-amber-500',
    label: 'Leagues',
    navFn: (id) => `/compete/leagues/${id}`,
  },
}

async function runSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

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
    supabase
      .from('padel_venues')
      .select('venue_id, venue_name, city')
      .ilike('venue_name', `%${q}%`)
      .limit(4),
    supabase
      .from('matches')
      .select('id, match_date, booked_venue_name, match_type')
      .or(`match_date.ilike.%${q}%,booked_venue_name.ilike.%${q}%`)
      .limit(4),
    supabase
      .from('leagues')
      .select('id, name, season')
      .ilike('name', `%${q}%`)
      .limit(4),
  ])

  const results: SearchResult[] = []

  for (const p of players.data ?? []) {
    results.push({ id: p.id, label: p.name, sublabel: p.city ?? 'Player', type: 'player', avatarUrl: p.avatar_url, avatarName: p.name })
  }
  for (const g of groups.data ?? []) {
    results.push({ id: g.id, label: g.name, sublabel: g.city ?? 'Group', type: 'group' })
  }
  for (const v of venues.data ?? []) {
    results.push({ id: v.venue_id, label: v.venue_name, sublabel: v.city ?? 'Venue', type: 'venue' })
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
    results.push({ id: l.id, label: l.name, sublabel: l.season ?? 'League', type: 'league' })
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
      className="fixed inset-0 z-50 bg-white flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Search bar */}
      <div className="flex items-center gap-3 px-5 pt-14 pb-3 border-b border-gray-100">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players, groups, venues…"
            className="w-full rounded-xl border border-gray-200 pl-9 pr-9 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]) }}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          )}
        </div>
        <button
          onClick={() => navigate(-1)}
          className="text-[13px] font-semibold text-[#009688]"
        >
          Cancel
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {searching && (
          <div className="flex justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
          </div>
        )}

        {!searching && query.length >= 2 && !hasResults && (
          <div className="py-16 text-center px-8">
            <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Search className="h-6 w-6 text-gray-300" />
            </div>
            <p className="text-[14px] font-semibold text-gray-500">No results for "{query}"</p>
            <p className="text-[12px] text-gray-400 mt-1">Try a different name or keyword</p>
          </div>
        )}

        {!searching && query.length < 2 && (
          <div className="py-16 text-center px-8">
            <p className="text-[14px] text-gray-400">Search players, groups, venues, leagues, and matches</p>
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
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">{meta.label}</p>
                    <div className="space-y-1">
                      {items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleTap(item)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left"
                        >
                          {item.avatarName ? (
                            <PlayerAvatar name={item.avatarName} avatarUrl={item.avatarUrl} size="sm" />
                          ) : (
                            <div className={cn('h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0', meta.color)}>
                              {meta.icon}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-gray-800 truncate">{item.label}</p>
                            {item.sublabel && (
                              <p className="text-[11px] text-gray-400 truncate">{item.sublabel}</p>
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
