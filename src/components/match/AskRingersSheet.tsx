import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'

interface AskRingersSheetProps {
  open: boolean
  onClose: () => void
  matchId: string
  groupId: string | null
  matchDateTime: string
  currentPlayerIds: string[]
  onSent: () => void
}

interface RingerProfile {
  id: string
  name: string
  avatar_url: string | null
  internal_ranking: number | null
}

interface RingerRequest {
  ringer_id: string
  status: string
}

export function AskRingersSheet({ open, onClose, matchId, groupId, matchDateTime, currentPlayerIds, onSent }: AskRingersSheetProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const expiryDate = useMemo(() => {
    try {
      const d = new Date(matchDateTime)
      d.setHours(d.getHours() - 24)
      return d
    } catch { return null }
  }, [matchDateTime])

  const expiryLabel = expiryDate ? format(expiryDate, "EEE d MMM 'at' HH:mm") : ''

  // Fetch group ringers
  const { data: ringers = [] } = useQuery<RingerProfile[]>({
    queryKey: ['group-ringers', groupId],
    enabled: open && !!groupId,
    queryFn: async () => {
      const { data: members } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId!)
        .eq('status', 'ringer')
      if (!members?.length) return []
      const ids = members.map(m => m.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, internal_ranking')
        .in('id', ids)
      return (profiles ?? []) as RingerProfile[]
    },
  })

  // Fetch existing requests for this match
  const { data: existingRequests = [] } = useQuery<RingerRequest[]>({
    queryKey: ['ringer-requests', matchId],
    enabled: open && !!matchId,
    queryFn: async () => {
      const { data } = await supabase
        .from('ringer_requests')
        .select('ringer_id, status')
        .eq('match_id', matchId)
      return (data ?? []) as RingerRequest[]
    },
  })

  // Compute team avg ELO for sorting
  const { data: playerProfiles = [] } = useQuery({
    queryKey: ['match-player-elos', currentPlayerIds.join(',')],
    enabled: open && currentPlayerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('internal_ranking')
        .in('id', currentPlayerIds)
      return data ?? []
    },
  })

  const teamAvg = useMemo(() => {
    const ratings = playerProfiles.filter(p => p.internal_ranking != null).map(p => p.internal_ranking!)
    return ratings.length > 0 ? Math.round(ratings.reduce((s, r) => s + r, 0) / ratings.length) : 1300
  }, [playerProfiles])

  // Sort ringers by ELO closeness to team avg
  const sortedRingers = useMemo(() => {
    return [...ringers].sort((a, b) => {
      const da = Math.abs((a.internal_ranking ?? 1300) - teamAvg)
      const db = Math.abs((b.internal_ranking ?? 1300) - teamAvg)
      return da - db
    })
  }, [ringers, teamAvg])

  const getRequestStatus = (ringerId: string) => existingRequests.find(r => r.ringer_id === ringerId)?.status ?? null

  const canSelect = (ringerId: string) => {
    const status = getRequestStatus(ringerId)
    return !status || status === 'pending' // Can't re-select declined/expired/filled
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    const selectable = sortedRingers.filter(r => canSelect(r.id) && !getRequestStatus(r.id))
    setSelected(new Set(selectable.map(r => r.id)))
  }

  const sendMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected)
      if (ids.length === 0) return
      const { error } = await supabase.rpc('send_ringer_requests', {
        p_match_id: matchId,
        p_ringer_ids: ids,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ringer-requests', matchId] })
      setSelected(new Set())
      onSent()
      onClose()
    },
  })

  const selectableCount = sortedRingers.filter(r => canSelect(r.id) && !getRequestStatus(r.id)).length

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
              <h2 className="text-[15px] font-bold text-gray-900">{t('ask_ringers_title')}</h2>
              <button onClick={onClose} className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="px-5 pb-6 overflow-y-auto flex-1" style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}>
              {expiryLabel && (
                <p className="text-[12px] text-gray-400 mb-3">{t('ask_ringers_subtitle', { expiry: expiryLabel })}</p>
              )}

              {sortedRingers.length === 0 ? (
                <p className="text-[13px] text-gray-500 text-center py-6">{t('ask_ringers_no_ringers')}</p>
              ) : (
                <>
                  {selectableCount > 1 && (
                    <button onClick={selectAll} className="text-[12px] text-[#009688] font-semibold mb-3">
                      {t('ask_ringers_select_all')}
                    </button>
                  )}

                  <div className="space-y-2">
                    {sortedRingers.map((ringer, idx) => {
                      const status = getRequestStatus(ringer.id)
                      const isSelectable = !status
                      const isSelected = selected.has(ringer.id)
                      const eloDelta = (ringer.internal_ranking ?? 1300) - teamAvg

                      return (
                        <div key={ringer.id} className={cn(
                          'flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors',
                          isSelected ? 'border-[#009688] bg-teal-50' : 'border-gray-100 bg-white'
                        )}>
                          {isSelectable && (
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
                            <p className="text-[13px] font-semibold text-gray-800 truncate">
                              {ringer.name}
                              {idx === 0 && !status && (
                                <span className="ml-1.5 text-[10px] font-bold text-teal-600 bg-teal-50 border border-teal-100 rounded-full px-1.5 py-0.5">
                                  {t('ringer_responses_suggested')}
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              {ringer.internal_ranking ?? '—'} ELO
                              {eloDelta !== 0 && ` (${eloDelta > 0 ? '+' : ''}${eloDelta} from avg)`}
                            </p>
                          </div>
                          {status && (
                            <span className={cn(
                              'text-[10px] font-bold rounded-full px-2 py-0.5 flex-shrink-0',
                              status === 'accepted' ? 'bg-green-50 text-green-700 border border-green-100' :
                              status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                              status === 'declined' ? 'bg-red-50 text-red-500 border border-red-100' :
                              'bg-gray-100 text-gray-400'
                            )}>
                              {status === 'accepted' ? t('ringer_status_accepted') :
                               status === 'pending' ? t('ringer_status_pending') :
                               status === 'declined' ? t('ringer_status_declined') :
                               status === 'expired' ? t('ringer_status_expired') :
                               t('ringer_status_filled')}
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
                      {sendMutation.isPending ? 'Sending\u2026' : t('ask_ringers_send_btn', { count: selected.size })}
                    </button>
                  )}

                  {sendMutation.isError && (
                    <p className="text-[12px] text-red-500 text-center mt-2">Failed to send. Try again.</p>
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
