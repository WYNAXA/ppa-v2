import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { MatchCard, type MatchCardData } from '@/components/shared/MatchCard'
import { cn } from '@/lib/utils'

type Tab = 'upcoming' | 'past' | 'open'

const TABS: { id: Tab; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past',     label: 'Past' },
  { id: 'open',     label: 'Open' },
]

async function fetchPlayerProfiles(playerIds: string[]) {
  if (playerIds.length === 0) return []
  const { data } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .in('id', playerIds)
  return data ?? []
}

function useMatches(tab: Tab, userId: string) {
  return useQuery({
    queryKey: ['matches', tab, userId],
    queryFn: async (): Promise<MatchCardData[]> => {
      const today = format(new Date(), 'yyyy-MM-dd')

      let query = supabase.from('matches').select('*')

      if (tab === 'upcoming') {
        query = query
          .contains('player_ids', [userId])
          .not('status', 'in', '("completed","cancelled","suggested")')
          .gte('match_date', today)
          .order('match_date', { ascending: true })
      } else if (tab === 'past') {
        query = query
          .contains('player_ids', [userId])
          .or(`status.eq.completed,match_date.lt.${today}`)
          .order('match_date', { ascending: false })
      } else {
        query = query
          .eq('status', 'open')
          .gte('match_date', today)
          .order('match_date', { ascending: true })
      }

      const { data: matches, error } = await query.limit(50)
      if (error) throw error
      if (!matches || matches.length === 0) return []

      // Filter open tab: exclude matches user is already in
      const filteredMatches = tab === 'open'
        ? matches.filter((m) => !m.player_ids?.includes(userId))
        : matches

      // Fetch all player profiles in one call
      const allPlayerIds = [...new Set(filteredMatches.flatMap((m) => m.player_ids ?? []))]
      const profiles = await fetchPlayerProfiles(allPlayerIds)

      return filteredMatches.map((m) => ({
        id: m.id,
        match_date: m.match_date,
        match_time: m.match_time,
        booked_venue_name: m.booked_venue_name,
        player_ids: m.player_ids ?? [],
        match_type: m.match_type,
        status: m.status,
        players: profiles.filter((p) => m.player_ids?.includes(p.id)),
      }))
    },
    enabled: !!userId,
  })
}

function EmptyState({ tab }: { tab: Tab }) {
  const messages: Record<Tab, { title: string; sub: string }> = {
    upcoming: { title: 'No upcoming matches', sub: 'Head to Play to schedule one' },
    past:     { title: 'No past matches yet', sub: 'Your match history will appear here' },
    open:     { title: 'No open matches', sub: 'Check back later or create your own' },
  }
  const { title, sub } = messages[tab]
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
      <p className="text-[15px] font-semibold text-gray-500 mb-1">{title}</p>
      <p className="text-[13px] text-gray-400">{sub}</p>
    </div>
  )
}

export function MatchesPage() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('upcoming')

  const userId = profile?.id ?? ''
  const { data: matches = [], isLoading } = useMatches(activeTab, userId)

  return (
    <div className="min-h-full bg-white">
      {/* Header */}
      <div className="px-5 pt-14 pb-3">
        <h1 className="text-[22px] font-bold text-gray-900">Matches</h1>
      </div>

      {/* Tab switcher */}
      <div className="px-5 mb-4">
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 rounded-lg py-2 text-[13px] font-semibold transition-colors',
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="px-5"
        >
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
            </div>
          ) : matches.length === 0 ? (
            <EmptyState tab={activeTab} />
          ) : (
            <div className="flex flex-col gap-2.5">
              {matches.map((match, i) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  currentUserId={userId}
                  action={activeTab === 'open' ? 'join' : 'view'}
                  index={i}
                />
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
