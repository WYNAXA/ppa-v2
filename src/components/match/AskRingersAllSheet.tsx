/**
 * Ask ringers for ALL matches needing a ringer in one action.
 * Reuses the same ringer picker UI pattern as AskRingersSheet,
 * then calls send_ringer_requests (the existing RPC) once per match.
 * The RPC is idempotent (ON CONFLICT DO NOTHING) — no double invites.
 */

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'

interface Match {
  id: string
  match_date: string
  match_time: string | null
  player_ids: string[]
}

interface Props {
  open: boolean
  onClose: () => void
  matches: Match[]     // all matches needing ringers
  groupId: string
  onSent: () => void
}

interface RingerProfile {
  id: string
  name: string
  avatar_url: string | null
  internal_ranking: number | null
}

export function AskRingersAllSheet({ open, onClose, matches, groupId, onSent }: Props) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // All player IDs across all matches (to exclude from ringer pool)
  const allPlayerIds = useMemo(() => {
    const ids = new Set<string>()
    for (const m of matches) {
      for (const pid of m.player_ids ?? []) ids.add(pid)
    }
    return Array.from(ids)
  }, [matches])

  // Fetch user's group IDs for cross-group ringer pool (same as AskRingersSheet)
  const { data: myGroupIds = [] } = useQuery({
    queryKey: ['my-groups-for-ringers', user?.id],
    enabled: open && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user!.id)
        .eq('status', 'approved')
      return (data ?? []).map((m: any) => m.group_id as string)
    },
  })

  const allGroupIds = useMemo(() => {
    const set = new Set<string>(myGroupIds)
    set.add(groupId)
    return Array.from(set)
  }, [myGroupIds, groupId])

  // Fetch ringers (same query as AskRingersSheet)
  const { data: ringers = [] } = useQuery<RingerProfile[]>({
    queryKey: ['ringers-multi-group-all', allGroupIds.join(','), allPlayerIds.join(',')],
    enabled: open && allGroupIds.length > 0,
    queryFn: async () => {
      const { data: members } = await supabase
        .from('group_members')
        .select('user_id')
        .in('group_id', allGroupIds)
        .eq('status', 'ringer')
      if (!members?.length) return []
      const uniqueIds = Array.from(new Set(members.map(m => m.user_id)))
        .filter((id: string) => !allPlayerIds.includes(id))
      if (uniqueIds.length === 0) return []
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, internal_ranking')
        .in('id', uniqueIds)
      return (profiles ?? []) as RingerProfile[]
    },
  })

  // Fetch existing requests for ALL matches (to show status)
  const matchIds = matches.map(m => m.id)
  const { data: existingRequests = [] } = useQuery({
    queryKey: ['ringer-requests-all', matchIds.join(',')],
    enabled: open && matchIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('ringer_requests')
        .select('match_id, ringer_id, status')
        .in('match_id', matchIds)
      return data ?? []
    },
  })

  // A ringer is "already asked for all" if they have a request for EVERY match
  const getAlreadyAskedCount = (ringerId: string) =>
    existingRequests.filter((r: any) => r.ringer_id === ringerId).length

  const sortedRingers = useMemo(() => {
    return [...ringers].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [ringers])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Send: call send_ringer_requests for EACH match with the selected ringers.
  // The RPC uses ON CONFLICT (match_id, ringer_id) DO NOTHING — idempotent.
  const sendMutation = useMutation({
    mutationFn: async () => {
      const ringerIds = Array.from(selected)
      if (ringerIds.length === 0) return

      const results = await Promise.allSettled(
        matches.map(m =>
          supabase.rpc('send_ringer_requests', {
            p_match_id: m.id,
            p_ringer_ids: ringerIds,
          })
        )
      )

      const failures = results.filter(r => r.status === 'rejected')
      if (failures.length > 0) {
        throw new Error(`${failures.length}/${matches.length} requests failed`)
      }
    },
    onSuccess: () => {
      for (const mid of matchIds) {
        queryClient.invalidateQueries({ queryKey: ['ringer-requests', mid] })
      }
      queryClient.invalidateQueries({ queryKey: ['ringer-requests-all'] })
      setSelected(new Set())
      toast.success(`Ringer requests sent for ${matches.length} match${matches.length !== 1 ? 'es' : ''}`)
      onSent()
      onClose()
    },
  })

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-[60] bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl max-h-[85vh] flex flex-col"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
              <div>
                <h2 className="text-[15px] font-bold text-gray-900">Ask ringers for all matches</h2>
                <p className="text-[11px] text-gray-400">{matches.length} match{matches.length !== 1 ? 'es' : ''} need players</p>
              </div>
              <button onClick={onClose} className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="px-5 pb-6 overflow-y-auto flex-1" style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}>
              {sortedRingers.length === 0 ? (
                <p className="text-[13px] text-gray-500 text-center py-6">No ringers available</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {sortedRingers.map((ringer) => {
                      const askedCount = getAlreadyAskedCount(ringer.id)
                      const allAsked = askedCount === matches.length
                      const isSelected = selected.has(ringer.id)

                      return (
                        <div key={ringer.id} className={cn(
                          'flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors',
                          allAsked ? 'border-gray-100 bg-gray-50 opacity-60' :
                          isSelected ? 'border-[#009688] bg-teal-50' : 'border-gray-100 bg-white'
                        )}>
                          {!allAsked && (
                            <button
                              onClick={() => toggleSelect(ringer.id)}
                              className={cn(
                                'h-5 w-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                                isSelected ? 'bg-[#009688] border-[#009688]' : 'border-gray-300'
                              )}
                            >
                              {isSelected && <Check className="h-3 w-3 text-white" />}
                            </button>
                          )}
                          <PlayerAvatar name={ringer.name} avatarUrl={ringer.avatar_url} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-gray-800 truncate">{ringer.name}</p>
                            <p className="text-[11px] text-gray-400">
                              {ringer.internal_ranking ?? '—'} ELO
                            </p>
                          </div>
                          {askedCount > 0 && (
                            <span className="text-[10px] font-bold rounded-full px-2 py-0.5 flex-shrink-0 bg-amber-50 text-amber-700 border border-amber-100">
                              Asked {askedCount}/{matches.length}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {selected.size > 0 && (
                    <button
                      onClick={() => sendMutation.mutate()}
                      disabled={sendMutation.isPending}
                      className="w-full mt-4 rounded-2xl bg-[#009688] py-3.5 text-[14px] font-bold text-white disabled:opacity-50"
                    >
                      {sendMutation.isPending
                        ? 'Sending...'
                        : `Ask ${selected.size} ringer${selected.size !== 1 ? 's' : ''} for ${matches.length} match${matches.length !== 1 ? 'es' : ''}`}
                    </button>
                  )}

                  {sendMutation.isError && (
                    <p className="text-[12px] text-red-500 text-center mt-2">Some requests failed. Try again.</p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
