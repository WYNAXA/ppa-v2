import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { PEER_VOTE_CATEGORIES } from '@/lib/achievements'
import { cn } from '@/lib/utils'

interface PeerVotingSheetProps {
  open: boolean
  onClose: () => void
  matchId: string
  players: Array<{ id: string; name: string; avatar_url?: string | null }>
  currentUserId: string
}

export function PeerVotingSheet({ open, onClose, matchId, players, currentUserId }: PeerVotingSheetProps) {
  const [votes, setVotes] = useState<Record<string, string>>({})
  const queryClient = useQueryClient()

  const otherPlayers = players.filter((p) => p.id !== currentUserId)

  const submitMutation = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(votes).map(([category, voted_for]) => ({
        match_id: matchId,
        voter_id: currentUserId,
        voted_for,
        category,
      }))
      if (rows.length === 0) return
      const { error } = await supabase.from('match_peer_votes').insert(rows)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['achievements'] })
      queryClient.invalidateQueries({ queryKey: ['peer-votes', matchId] })
      onClose()
    },
  })

  function toggleVote(category: string, playerId: string) {
    setVotes((prev) => {
      if (prev[category] === playerId) {
        const next = { ...prev }
        delete next[category]
        return next
      }
      return { ...prev, [category]: playerId }
    })
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[65] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl max-h-[85vh] flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="px-5 pt-2 pb-4 text-center flex-shrink-0">
              <h2 className="text-[16px] font-bold text-gray-900">Rate your teammates 🎾</h2>
              <p className="text-[13px] text-gray-500 mt-1">Who stood out today?</p>
            </div>

            {/* Categories */}
            <div className="overflow-y-auto flex-1 px-5 pb-4" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
              {PEER_VOTE_CATEGORIES.map((cat) => (
                <div key={cat.id} className="mb-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{cat.emoji}</span>
                    <div>
                      <p className="text-[13px] font-bold text-gray-800">{cat.name}</p>
                      <p className="text-[11px] text-gray-400">{cat.desc}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {otherPlayers.map((player) => (
                      <button
                        key={player.id}
                        onClick={() => toggleVote(cat.id, player.id)}
                        className={cn(
                          'flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all border-2',
                          votes[cat.id] === player.id
                            ? 'border-[#009688] bg-teal-50'
                            : 'border-transparent bg-gray-50 hover:bg-gray-100'
                        )}
                      >
                        <div className={cn(
                          'rounded-full transition-shadow',
                          votes[cat.id] === player.id && 'ring-2 ring-[#009688] ring-offset-1'
                        )}>
                          <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} size="sm" />
                        </div>
                        <span className="text-[11px] font-medium text-gray-700 truncate max-w-[64px]">
                          {player.name?.split(' ')[0] ?? 'Player'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Submit */}
              <button
                onClick={() => submitMutation.mutate()}
                disabled={Object.keys(votes).length === 0 || submitMutation.isPending}
                className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40 mt-2"
              >
                {submitMutation.isPending ? 'Submitting...' : 'Submit Votes'}
              </button>

              {submitMutation.isError && (
                <p className="text-[12px] text-red-500 text-center mt-2">Failed to submit votes. Try again.</p>
              )}

              {/* Skip */}
              <button
                onClick={onClose}
                className="w-full py-3 text-[13px] text-gray-400 hover:text-gray-600 transition-colors mt-1"
              >
                Skip voting
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
