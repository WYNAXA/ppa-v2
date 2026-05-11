import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Shuffle, Play } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { PAIRINGS, pairingToTeams, findPairingIndex } from '@/lib/predictions'
import type { Match, Profile } from '@/lib/types'

interface PlayAnotherSheetProps {
  open: boolean
  onClose: () => void
  match: Match
  players: Profile[]
  currentUserId: string
}

export function PlayAnotherSheet({ open, onClose, match, players, currentUserId }: PlayAnotherSheetProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const playerIds = match.player_ids ?? []

  const savedIndex = findPairingIndex(
    playerIds,
    match.team1_player_ids ?? null,
    match.team2_player_ids ?? null,
  )
  const [pairingIndex, setPairingIndex] = useState(savedIndex)

  const { team1, team2 } = pairingToTeams(playerIds, pairingIndex)
  const team1Players = team1.map(id => players.find(p => p.id === id)).filter(Boolean) as Profile[]
  const team2Players = team2.map(id => players.find(p => p.id === id)).filter(Boolean) as Profile[]

  function handleSwitch() {
    setPairingIndex(prev => (prev + 1) % PAIRINGS.length)
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .insert({
          match_date: match.match_date,
          match_time: match.match_time,
          match_type: match.match_type,
          status: 'scheduled',
          player_ids: [...team1, ...team2],
          team1_player_ids: team1,
          team2_player_ids: team2,
          group_id: match.group_id ?? null,
          booked_venue_name: match.booked_venue_name ?? null,
          created_by: currentUserId,
          created_manually: true,
          context_type: 'open' as const,
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['play-matches'] })
      onClose()
      navigate(`/matches/${newId}`)
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
              <h2 className="text-[15px] font-bold text-gray-900">Play Another</h2>
              <div className="w-9" />
            </div>
            <div className="px-5 pb-6" style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}>
              <p className="text-[12px] text-gray-400 mb-4 text-center">Same players, same venue. Rearrange teams if you like.</p>

              {/* Team 1 */}
              <div className="rounded-xl bg-teal-50 border border-teal-100 p-3 mb-2">
                <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wide mb-2">Team 1</p>
                <div className="flex gap-3">
                  {team1Players.map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                      <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size="sm" />
                      <span className="text-[13px] font-medium text-gray-800">{p.name?.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Team 2 */}
              <div className="rounded-xl bg-orange-50 border border-orange-100 p-3 mb-4">
                <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wide mb-2">Team 2</p>
                <div className="flex gap-3">
                  {team2Players.map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                      <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} size="sm" />
                      <span className="text-[13px] font-medium text-gray-800">{p.name?.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Switch teams */}
              <button
                onClick={handleSwitch}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600 mb-4"
              >
                <Shuffle className="h-4 w-4" />
                Switch teams
              </button>

              {/* Create */}
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {createMutation.isPending ? 'Creating\u2026' : 'Start Match'}
              </button>

              {createMutation.isError && (
                <p className="text-[12px] text-red-500 text-center mt-2">Failed to create match. Try again.</p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
