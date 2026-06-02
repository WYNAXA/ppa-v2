import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const otherPlayers = players.filter((p) => p.id !== currentUserId)

  // Step 5: Fetch existing votes for this user + match (persistence check)
  const { data: existingVotes, isLoading: loadingVotes } = useQuery({
    queryKey: ['my-peer-votes', matchId, currentUserId],
    enabled: open && !!matchId && !!currentUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_peer_votes')
        .select('vote_category, voted_for_id')
        .eq('match_id', matchId)
        .eq('voter_id', currentUserId)
      if (error) throw error
      return data ?? []
    },
  })

  const hasVoted = (existingVotes?.length ?? 0) > 0

  // Derive saved votes as a map for read-only display
  const savedVotes = useMemo(() => {
    if (!existingVotes || existingVotes.length === 0) return null
    const map: Record<string, string> = {}
    for (const v of existingVotes) {
      map[v.vote_category] = v.voted_for_id
    }
    return map
  }, [existingVotes])

  // Draft votes for the form (only used when hasVoted is false)
  const [draftVotes, setDraftVotes] = useState<Record<string, string>>({})

  // The votes to display — saved if voted, draft if not
  const displayVotes = savedVotes ?? draftVotes

  // Step 5: Upsert with onConflict for safe re-submission
  const submitMutation = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(draftVotes).map(([vote_category, votedForId]) => ({
        match_id: matchId,
        voter_id: currentUserId,
        voted_for_id: votedForId,
        vote_category,
      }))
      if (rows.length === 0) return
      const { error } = await supabase
        .from('match_peer_votes')
        .upsert(rows, { onConflict: 'match_id,voter_id,vote_category' })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['achievements'] })
      queryClient.invalidateQueries({ queryKey: ['peer-votes', matchId] })
      queryClient.invalidateQueries({ queryKey: ['my-peer-votes', matchId, currentUserId] })
      setDraftVotes({})
      onClose()
    },
  })

  function toggleVote(category: string, playerId: string) {
    setDraftVotes((prev) => {
      if (prev[category] === playerId) {
        const next = { ...prev }
        delete next[category]
        return next
      }
      return { ...prev, [category]: playerId }
    })
  }

  function handleClose() {
    setDraftVotes({})
    onClose()
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
            onClick={handleClose}
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
              <h2 className="text-[16px] font-bold text-gray-900">
                {hasVoted ? t('peer_voting.your_votes') : t('peer_voting.rate_teammates')}
              </h2>
              <p className="text-[13px] text-gray-500 mt-1">
                {hasVoted ? t('peer_voting.already_voted') : t('peer_voting.who_stood_out')}
              </p>
            </div>

            {/* Loading */}
            {loadingVotes ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
              </div>
            ) : (
              /* Categories */
              <div className="overflow-y-auto flex-1 px-5 pb-4" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
                {PEER_VOTE_CATEGORIES.map((cat) => (
                  <div key={cat.id} className="mb-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{cat.emoji}</span>
                      <div>
                        <p className="text-[13px] font-bold text-gray-800">{t(`peer_voting.${cat.id}_name`, { defaultValue: cat.name })}</p>
                        <p className="text-[11px] text-gray-400">{t(`peer_voting.${cat.id}_desc`, { defaultValue: cat.desc })}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {otherPlayers.map((player) => (
                        <button
                          key={player.id}
                          onClick={hasVoted ? undefined : () => toggleVote(cat.id, player.id)}
                          disabled={hasVoted}
                          className={cn(
                            'flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all border-2',
                            displayVotes[cat.id] === player.id
                              ? 'border-[#009688] bg-teal-50'
                              : 'border-transparent bg-gray-50',
                            !hasVoted && displayVotes[cat.id] !== player.id && 'hover:bg-gray-100',
                            hasVoted && 'cursor-default',
                          )}
                        >
                          <div className={cn(
                            'rounded-full transition-shadow',
                            displayVotes[cat.id] === player.id && 'ring-2 ring-[#009688] ring-offset-1'
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

                {/* Submit (only if not yet voted) */}
                {!hasVoted && (
                  <>
                    <button
                      onClick={() => submitMutation.mutate()}
                      disabled={Object.keys(draftVotes).length === 0 || submitMutation.isPending}
                      className="w-full rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-40 mt-2"
                    >
                      {submitMutation.isPending ? t('peer_voting.submitting') : t('peer_voting.submit_votes')}
                    </button>

                    {submitMutation.isError && (
                      <p className="text-[12px] text-red-500 text-center mt-2">{t('peer_voting.submit_failed')}</p>
                    )}
                  </>
                )}

                {/* Close / Skip */}
                <button
                  onClick={handleClose}
                  className="w-full py-3 text-[13px] text-gray-400 hover:text-gray-600 transition-colors mt-1"
                >
                  {hasVoted ? t('peer_voting.close') : t('peer_voting.skip_voting')}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
