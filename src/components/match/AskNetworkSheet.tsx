import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Search } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useDateLocale } from '@/lib/dateLocale'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PlayerAvatar } from '@/components/shared/PlayerAvatar'
import { cn } from '@/lib/utils'

interface AskNetworkSheetProps {
  open: boolean
  onClose: () => void
  matchId: string
  groupId: string | null
  matchDateTime: string
  currentPlayerIds: string[]
  onSent: () => void
}

interface PersonProfile {
  id: string
  name: string
  avatar_url: string | null
  internal_ranking: number | null
  source: 'connection' | 'group'
}

interface ExistingInvitation {
  invitee_id: string
  status: string
}

export function AskNetworkSheet({ open, onClose, matchId, groupId, matchDateTime, currentPlayerIds, onSent }: AskNetworkSheetProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const locale = useDateLocale()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'connections' | 'group'>('all')

  const expiryDate = useMemo(() => {
    try { const d = new Date(matchDateTime); d.setHours(d.getHours() - 24); return d } catch { return null }
  }, [matchDateTime])
  const expiryLabel = expiryDate ? format(expiryDate, "EEE d MMM 'at' HH:mm", { locale }) : ''

  // Fetch connections
  const { data: connections = [] } = useQuery<PersonProfile[]>({
    queryKey: ['network-connections', user?.id],
    enabled: open && !!user?.id,
    queryFn: async () => {
      const [{ data: out }, { data: inc }] = await Promise.all([
        supabase.from('player_connections').select('connected_user_id').eq('user_id', user!.id).eq('status', 'accepted'),
        supabase.from('player_connections').select('user_id').eq('connected_user_id', user!.id).eq('status', 'accepted'),
      ])
      const ids = [...new Set([...(out ?? []).map(r => r.connected_user_id), ...(inc ?? []).map(r => r.user_id)])]
        .filter(id => !currentPlayerIds.includes(id))
      if (ids.length === 0) return []
      const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url, internal_ranking').in('id', ids)
      return (profiles ?? []).map((p: any) => ({ ...p, source: 'connection' as const }))
    },
  })

  // Fetch group members (approved only, not ringers — ringers covered by AskRingersSheet)
  const { data: groupMembers = [] } = useQuery<PersonProfile[]>({
    queryKey: ['network-group-members', groupId],
    enabled: open && !!groupId,
    queryFn: async () => {
      const { data: members } = await supabase
        .from('group_members').select('user_id')
        .eq('group_id', groupId!).eq('status', 'approved')
      if (!members?.length) return []
      const ids = members.map(m => m.user_id).filter(id => !currentPlayerIds.includes(id) && id !== user?.id)
      if (ids.length === 0) return []
      const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url, internal_ranking').in('id', ids)
      return (profiles ?? []).map((p: any) => ({ ...p, source: 'group' as const }))
    },
  })

  // Existing invitations for this match
  const { data: existingInvitations = [] } = useQuery<ExistingInvitation[]>({
    queryKey: ['match-invitations', matchId],
    enabled: open && !!matchId,
    queryFn: async () => {
      const { data } = await supabase.from('match_invitations').select('invitee_id, status').eq('match_id', matchId)
      return (data ?? []) as ExistingInvitation[]
    },
  })

  // Combine + dedupe + filter
  const people = useMemo(() => {
    const map = new Map<string, PersonProfile>()
    for (const p of connections) map.set(p.id, p)
    for (const p of groupMembers) if (!map.has(p.id)) map.set(p.id, p)
    let list = Array.from(map.values())
    if (filter === 'connections') list = list.filter(p => connections.some(c => c.id === p.id))
    if (filter === 'group') list = list.filter(p => groupMembers.some(g => g.id === p.id))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q))
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [connections, groupMembers, filter, search])

  const getInvitationStatus = (id: string) => existingInvitations.find(i => i.invitee_id === id)?.status ?? null

  function toggleSelect(id: string) {
    setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  const sendMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected)
      if (ids.length === 0) return
      const { error } = await supabase.rpc('send_match_invitations', { p_match_id: matchId, p_invitee_ids: ids })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match-invitations', matchId] })
      setSelected(new Set())
      toast.success('Invitations sent')
      onSent()
      onClose()
    },
    onError: (err: any) => {
      console.error('Send invitations failed:', err)
      toast.error(err?.message ?? 'Failed to send. Try again.')
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
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0"><div className="h-1 w-10 rounded-full bg-gray-200" /></div>
            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
              <h2 className="text-[15px] font-bold text-gray-900">Invite someone to play</h2>
              <button onClick={onClose} className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="px-5 pb-6 overflow-y-auto flex-1" style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}>
              {expiryLabel && <p className="text-[12px] text-gray-400 mb-3">Replies needed by {expiryLabel}</p>}

              {/* Search */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name..." style={{ fontSize: '16px' }}
                  className="w-full rounded-xl border border-gray-200 pl-9 pr-4 py-2.5 outline-none focus:border-blue-500"
                />
              </div>

              {/* Filter chips */}
              <div className="flex gap-2 mb-3">
                {([
                  { key: 'all' as const, label: 'All' },
                  { key: 'connections' as const, label: 'Connections' },
                  ...(groupId ? [{ key: 'group' as const, label: 'Group' }] : []),
                ]).map(f => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className={cn('rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors',
                      filter === f.key ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 text-gray-500'
                    )}>{f.label}</button>
                ))}
              </div>

              {people.length === 0 ? (
                <p className="text-[13px] text-gray-400 text-center py-6">No one found</p>
              ) : (
                <>
                <div className="flex items-center justify-between px-1 mb-2">
                  <p className="text-[11px] text-gray-500">{people.length} {people.length === 1 ? 'person' : 'people'}</p>
                  {people.filter(p => !getInvitationStatus(p.id)).length > 0 && (
                    <button
                      onClick={() => {
                        const selectable = people.filter(p => !getInvitationStatus(p.id))
                        const allSelected = selectable.every(p => selected.has(p.id))
                        if (allSelected) {
                          const next = new Set(selected)
                          selectable.forEach(p => next.delete(p.id))
                          setSelected(next)
                        } else {
                          const next = new Set(selected)
                          selectable.forEach(p => next.add(p.id))
                          setSelected(next)
                        }
                      }}
                      className="text-[12px] font-semibold text-blue-600"
                    >
                      {people.filter(p => !getInvitationStatus(p.id)).every(p => selected.has(p.id)) ? 'Deselect all' : 'Select all'}
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {people.map(person => {
                    const status = getInvitationStatus(person.id)
                    const isSelectable = !status
                    const isSelected = selected.has(person.id)
                    return (
                      <div key={person.id} className={cn(
                        'flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors',
                        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white'
                      )}>
                        {isSelectable && (
                          <button onClick={() => toggleSelect(person.id)}
                            className={cn('h-5 w-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                              isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                            )}>
                            {isSelected && <Check className="h-3 w-3 text-white" />}
                          </button>
                        )}
                        <PlayerAvatar name={person.name} avatarUrl={person.avatar_url} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-gray-800 truncate">{person.name}</p>
                          <p className="text-[11px] text-gray-400">
                            {person.internal_ranking ?? '—'} ELO
                            <span className="ml-1.5 text-[10px] text-gray-300">
                              {person.source === 'connection' ? 'Connection' : 'Group'}
                            </span>
                          </p>
                        </div>
                        {status && (
                          <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5 flex-shrink-0',
                            status === 'accepted' ? 'bg-green-50 text-green-700 border border-green-100' :
                            status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                            status === 'declined' ? 'bg-red-50 text-red-500 border border-red-100' :
                            'bg-gray-100 text-gray-400'
                          )}>
                            {status === 'accepted' ? 'Available' : status === 'pending' ? 'Waiting' : status === 'declined' ? "Can't play" : 'Filled'}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
                </>
              )}

              {selected.size > 0 && (
                <button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}
                  className="w-full mt-4 rounded-2xl bg-blue-600 py-3.5 text-[14px] font-bold text-white disabled:opacity-50">
                  {sendMutation.isPending ? 'Sending\u2026' : `Send to ${selected.size} player${selected.size > 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
