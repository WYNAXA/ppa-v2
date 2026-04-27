import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, UserPlus } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'

interface PlayerResult {
  id: string
  name: string
  avatar_url: string | null
  playtomic_level: number | null
  ranking_points: number | null
}

interface InvitePlayerSheetProps {
  open: boolean
  onClose: () => void
  matchId: string
  currentPlayerIds: string[]
}

function useDebounce<T>(value: T, delay: number) {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return dv
}

export function InvitePlayerSheet({ open, onClose, matchId, currentPlayerIds }: InvitePlayerSheetProps) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<PlayerResult[]>([])
  const [searching, setSearching] = useState(false)
  const debouncedQuery = useDebounce(query, 300)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]) }
  }, [open])

  useEffect(() => {
    if (debouncedQuery.length < 2) { setResults([]); return }
    setSearching(true)
    const excluded = currentPlayerIds.length > 0 ? currentPlayerIds : ['00000000-0000-0000-0000-000000000000']
    supabase
      .from('profiles')
      .select('id, name, avatar_url, playtomic_level, ranking_points')
      .ilike('name', `%${debouncedQuery}%`)
      .not('id', 'in', `(${excluded.join(',')})`)
      .limit(10)
      .then(({ data }) => {
        setResults(data ?? [])
        setSearching(false)
      })
  }, [debouncedQuery, currentPlayerIds])

  const inviteMutation = useMutation({
    mutationFn: async (player: PlayerResult) => {
      const { error } = await supabase
        .from('matches')
        .update({ player_ids: [...currentPlayerIds, player.id] })
        .eq('id', matchId)
      if (error) throw error

      await supabase.from('notifications').insert({
        user_id: player.id,
        type: 'match_created',
        title: 'Match invitation',
        message: 'You have been invited to a padel match',
        related_id: matchId,
        read: false,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] })
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      onClose()
    },
  })

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[55] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-3xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="h-4 w-4 text-gray-600" />
              </button>
              <h2 className="text-[15px] font-bold text-gray-900">Invite Player</h2>
              <div className="w-9" />
            </div>

            <div
              className="px-5 overflow-y-auto"
              style={{ paddingBottom: 'calc(48px + env(safe-area-inset-bottom))', maxHeight: '75vh' }}
            >
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name…"
                  autoFocus
                  className="w-full rounded-xl border border-gray-200 pl-9 pr-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              {searching && (
                <div className="flex justify-center py-6">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
                </div>
              )}

              {inviteMutation.isError && (
                <p className="text-[12px] text-red-500 text-center mb-3">Failed to invite player. Try again.</p>
              )}

              {results.length > 0 && (
                <div className="space-y-1">
                  {results.map((player) => (
                    <button
                      key={player.id}
                      onClick={() => inviteMutation.mutate(player)}
                      disabled={inviteMutation.isPending}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
                    >
                      <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-800 truncate">{player.name}</p>
                        {player.ranking_points != null && (
                          <p className="text-[11px] text-gray-400">{player.ranking_points} pts</p>
                        )}
                      </div>
                      <UserPlus className="h-4 w-4 text-[#009688] flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {!searching && debouncedQuery.length >= 2 && results.length === 0 && (
                <div className="py-10 text-center">
                  <p className="text-[13px] text-gray-400">No players found for "{debouncedQuery}"</p>
                </div>
              )}

              {query.length < 2 && !searching && (
                <div className="py-10 text-center">
                  <p className="text-[13px] text-gray-400">Type a name to search players</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
